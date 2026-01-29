// 全局状态控制
let historyImages = [];     // 存储历史图片URL数组
let historyImageData = [];  // 存储历史图片URL和任务ID的关联信息
let currentPreviewIndex = 0; // 当前预览图片的索引 
let currentTaskId = null;   // 当前预览图片的任务ID
let displayedTaskIds = new Set(); // 跟踪已显示的任务ID，用于优化历史记录加载
let historyPollingTimer = null; // 历史记录轮询定时器
let isAutoRefreshEnabled = false; // 自动刷新状态

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async function() {
    await initServerConfig();
    loadHistory();

    // 添加点击遮罩关闭预览功能
    const fullPreview = document.getElementById('fullPreview');
    fullPreview.addEventListener('click', function(event) {
        // 检查点击的目标是否是遮罩本身（而不是里面的按钮或图片）
        if (event.target === fullPreview) {
            closePreview();
        }
    });
});

// 加载历史记录
async function loadHistory() {
    if(!SERVER) {
        await initServerConfig();
    }

    const res = await fetch(`${SERVER}/history`);
    const data = await res.json();
    const gallery = document.getElementById('historyGallery');
    const newHistoryImages = []; // 存储新的历史图片URL
    const newHistoryImageData = []; // 存储新的历史图片数据

    // 遍历历史记录（倒序，最新的在前面）
    Object.entries(data).reverse().forEach(([taskId, item]) => {
        if(!item.outputs) return;
        
        // 获取图片信息（从prompt中提取）
        const prompt = item.prompt?.[2] || {};
        const width = prompt['5']?.inputs?.width || '-';
        const height = prompt['5']?.inputs?.height || '-';
        const model = prompt['34']?.inputs?.unet_name || '-';
        const samplerName = prompt['3']?.inputs?.sampler_name || '-';
        const scheduler = prompt['3']?.inputs?.scheduler || '-';
        const promptText = prompt['6']?.inputs?.text || '';
        
        for(let nid in item.outputs) {
            item.outputs[nid].images?.forEach(img => {
                // 【修复点】同样增加 encodeURIComponent
                const url = `${SERVER}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`;

                // 生成唯一标识，防止重复加载相同图片（包含taskId、节点ID和文件名）
                const imageKey = `${taskId}-${nid}-${img.filename}`;
                
                // 检查图片是否已经显示，如果没有则添加
                if (!displayedTaskIds.has(imageKey)) {
                    // 标记图片为已显示
                    displayedTaskIds.add(imageKey);
                    
                    // 创建外层容器 - 包含图片和信息
                    const container = document.createElement('div');
                    container.className = 'flex flex-col gap-2 animate-fade-in';
                    
                    // 创建图片包装器 - 1:1 比例
                    const imgWrapper = document.createElement('div');
                    imgWrapper.className = 'relative aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 group cursor-pointer card-hover';
                    
                    // 创建图片元素
                    const i = document.createElement('img');
                    i.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; // 空白占位图
                    i.setAttribute('data-src', url); // 存储真实图片URL
                    i.loading = 'lazy';
                    i.className = 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-300';
                    i.onclick = () => openPreview(url, taskId);

                    // 当图片进入视口时加载真实图片，离开视口时回收资源
                    const observer = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            const img = entry.target;
                            if (entry.isIntersecting) {
                                // 图片进入视口，加载真实图片
                                img.src = img.getAttribute('data-src');
                            } else {
                                // 图片离开视口，回收资源
                                img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
                            }
                        });
                    }, {
                        // 当图片50%进入视口时触发加载
                        threshold: 0.1
                    });

                    observer.observe(i);
                    
                    // 添加类型标签 - 使用新的样式
                    const isLargeImage = nid === '39' || nid === '42';
                    const labelText = isLargeImage ? '高清大图' : '预览草图';
                    const labelColor = isLargeImage 
                        ? 'bg-purple-500 dark:bg-purple-600' 
                        : 'bg-blue-500 dark:bg-blue-600';
                    
                    const label = document.createElement('span');
                    label.className = `absolute top-2 right-2 ${labelColor} text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm shadow-sm z-10 pointer-events-none`;
                    label.textContent = labelText;
                    
                    // 悬停遮罩效果
                    const overlay = document.createElement('div');
                    overlay.className = 'absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none';
                    
                    // 将元素添加到图片包装器
                    imgWrapper.appendChild(i);
                    imgWrapper.appendChild(label);
                    imgWrapper.appendChild(overlay);
                    
                    // 添加图片点击事件
                    imgWrapper.onclick = () => openPreview(url, taskId);
                    
                    // 将图片包装器添加到容器
                    container.appendChild(imgWrapper);
                    
                    // 创建信息展示区域
                    const infoDiv = document.createElement('div');
                    infoDiv.className = 'px-1 space-y-2 text-xs';
                    
                    // 提示词放第一行（限制2行）
                    if (promptText) {
                        const promptDiv = document.createElement('div');
                        promptDiv.className = 'text-slate-700 dark:text-slate-300 font-medium line-clamp-2 break-words leading-relaxed';
                        promptDiv.style.display = '-webkit-box';
                        promptDiv.style.webkitLineClamp = '2';
                        promptDiv.style.webkitBoxOrient = 'vertical';
                        promptDiv.style.overflow = 'hidden';
                        promptDiv.textContent = promptText;
                        infoDiv.appendChild(promptDiv);
                    }
                    
                    // 模型名称单独一行
                    const modelLine = document.createElement('div');
                    modelLine.className = 'text-slate-500 dark:text-slate-400 truncate';
                    modelLine.textContent = model;
                    infoDiv.appendChild(modelLine);
                    
                    // 尺寸、采样器、调度器使用标签形式一行展示
                    const tagsLine = document.createElement('div');
                    tagsLine.className = 'flex flex-wrap gap-1.5';
                    tagsLine.innerHTML = `
                        <span class="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-medium">${width}×${height}</span>
                        <span class="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-medium">${samplerName}</span>
                        <span class="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium">${scheduler}</span>
                    `;
                    infoDiv.appendChild(tagsLine);
                    
                    // 将信息区域添加到容器
                    container.appendChild(infoDiv);
                    
                    // 将容器添加到画廊
                    gallery.appendChild(container);
                    
                    // 将新图片数据存储起来
                    newHistoryImages.unshift(url); // 保持最新的在前面
                    newHistoryImageData.unshift({ url, taskId }); // 保持最新的在前面
                }
            });
        }
    });

    // 更新历史数组（保持最新的在前面）
    historyImages = [...newHistoryImages, ...historyImages];
    historyImageData = [...newHistoryImageData, ...historyImageData];
    
    // 更新图片计数
    updateImageCount();
}

// 更新图片计数显示
function updateImageCount() {
    const count = historyImages.length;
    const countElement = document.getElementById('imageCount');
    const emptyState = document.getElementById('emptyState');
    const gallery = document.getElementById('historyGallery');
    
    if (countElement) {
        countElement.textContent = `${count} 张图片`;
    }
    
    // 显示或隐藏空状态
    if (emptyState && gallery) {
        if (count === 0) {
            emptyState.classList.remove('hidden');
            gallery.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            gallery.classList.remove('hidden');
        }
    }
}

// 刷新历史记录
async function refreshHistory() {
    // 显示刷新图标
    const refreshIcon = document.getElementById('refreshIcon');
    const refreshIconStatic = document.getElementById('refreshIconStatic');
    const refreshBtn = document.getElementById('refreshBtn');
    
    if (refreshIcon) refreshIcon.classList.remove('hidden');
    if (refreshIconStatic) refreshIconStatic.classList.add('hidden');
    if (refreshBtn) refreshBtn.disabled = true;
    
    try {
        // 清空已显示图片键集合和历史数组
        displayedTaskIds.clear();
        historyImages = [];
        historyImageData = [];
        // 清空画廊
        const gallery = document.getElementById('historyGallery');
        if (gallery) gallery.innerHTML = "";
        // 重新加载所有历史记录
        await loadHistory();
        showToast('历史记录已刷新');
    } catch (error) {
        console.error('刷新历史记录失败:', error);
        showToast('刷新历史记录失败，请重试', 'error');
    } finally {
        // 隐藏刷新图标
        if (refreshIcon) refreshIcon.classList.add('hidden');
        if (refreshIconStatic) refreshIconStatic.classList.remove('hidden');
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

// 打开预览
function openPreview(url, taskId) {
    const previewImg = document.getElementById('previewImg');
    const fullPreview = document.getElementById('fullPreview');
    
    if (previewImg) previewImg.src = url;
    if (fullPreview) fullPreview.classList.remove('hidden');
    // 禁用body滚动
    document.body.style.overflow = 'hidden';

    // 查找当前图片在历史数组中的索引
    currentPreviewIndex = historyImages.indexOf(url);
    currentTaskId = taskId;

    // 显示导航按钮
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (prevBtn) prevBtn.classList.remove('hidden');
    if (nextBtn) nextBtn.classList.remove('hidden');
}

// 关闭预览
function closePreview() {
    const fullPreview = document.getElementById('fullPreview');
    if (fullPreview) fullPreview.classList.add('hidden');
    // 恢复body滚动
    document.body.style.overflow = '';
}

// 在新标签页打开图片
function openInNewTab() {
    const previewImg = document.getElementById('previewImg');
    if (previewImg && previewImg.src) {
        window.open(previewImg.src, '_blank');
    }
}

// 上一张图片（显示更旧的图片）
function prevImage() {
    const previewImg = document.getElementById('previewImg');
    if (currentPreviewIndex >= 0 && currentPreviewIndex < historyImages.length - 1) {
        currentPreviewIndex++;
        if (previewImg) previewImg.src = historyImages[currentPreviewIndex];
        // 更新当前任务ID
        if (historyImageData[currentPreviewIndex]) {
            currentTaskId = historyImageData[currentPreviewIndex].taskId;
        }
    }
}

// 下一张图片（显示更新的图片）
function nextImage() {
    const previewImg = document.getElementById('previewImg');
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        if (previewImg) previewImg.src = historyImages[currentPreviewIndex];
        // 更新当前任务ID
        if (historyImageData[currentPreviewIndex]) {
            currentTaskId = historyImageData[currentPreviewIndex].taskId;
        }
    }
}

// 键盘事件监听
document.addEventListener('keydown', function(e) {
    // 只有在预览模式打开时才响应键盘事件
    const fullPreview = document.getElementById('fullPreview');
    if (fullPreview && !fullPreview.classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') {
            prevImage(); // 左箭头显示更旧的图片
        } else if (e.key === 'ArrowRight') {
            nextImage(); // 右箭头显示更新的图片
        } else if (e.key === 'Escape') {
            closePreview();
        }
    }
});

// 开始历史记录轮询
function startHistoryPolling() {
    // 如果已经有定时器在运行，先停止
    if (historyPollingTimer) {
        clearInterval(historyPollingTimer);
    }
    // 每3秒检查一次新任务
    historyPollingTimer = setInterval(loadHistory, 3000);
}

// 停止历史记录轮询
function stopHistoryPolling() {
    if (historyPollingTimer) {
        clearInterval(historyPollingTimer);
        historyPollingTimer = null;
    }
}

// 切换自动刷新状态
function toggleAutoRefresh() {
    isAutoRefreshEnabled = !isAutoRefreshEnabled;
    const statusElement = document.getElementById('autoRefreshStatus');
    const toggleButton = document.getElementById('autoRefreshToggle');
    const autoRefreshIcon = document.getElementById('autoRefreshIcon');
    
    if (isAutoRefreshEnabled) {
        // 开启自动刷新 - 使用新的样式
        if (statusElement) {
            statusElement.textContent = '开启';
            statusElement.className = 'text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
        }
        if (toggleButton) {
            toggleButton.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all duration-200 text-sm font-medium';
        }
        if (autoRefreshIcon) {
            autoRefreshIcon.classList.add('animate-spin');
            autoRefreshIcon.classList.remove('text-slate-600', 'dark:text-slate-400');
            autoRefreshIcon.classList.add('text-emerald-600', 'dark:text-emerald-400');
        }
        startHistoryPolling();
        showToast('已开启自动刷新');
    } else {
        // 关闭自动刷新 - 使用新的样式
        if (statusElement) {
            statusElement.textContent = '关闭';
            statusElement.className = 'text-xs px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400';
        }
        if (toggleButton) {
            toggleButton.className = 'flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 text-sm font-medium';
        }
        if (autoRefreshIcon) {
            autoRefreshIcon.classList.remove('animate-spin', 'text-emerald-600', 'dark:text-emerald-400');
            autoRefreshIcon.classList.add('text-slate-600', 'dark:text-slate-400');
        }
        stopHistoryPolling();
        showToast('已关闭自动刷新');
    }
}

// Toast通知函数 - 支持类型
function showToast(message, type = 'success', duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    // 设置消息内容
    if (toastMessage) toastMessage.textContent = message;
    
    // 根据类型设置图标
    if (toastIcon) {
        if (type === 'error') {
            toastIcon.className = 'w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0';
            toastIcon.innerHTML = '<svg class="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
        } else {
            toastIcon.className = 'w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0';
            toastIcon.innerHTML = '<svg class="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
        }
    }

    // 显示toast
    if (toast) {
        toast.classList.remove('translate-x-full', 'opacity-0');
        toast.classList.add('translate-x-0', 'opacity-100');
    }

    // 自动隐藏toast
    setTimeout(() => {
        if (toast) {
            toast.classList.remove('translate-x-0', 'opacity-100');
            toast.classList.add('translate-x-full', 'opacity-0');
        }
    }, duration);
}
