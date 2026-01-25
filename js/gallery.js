// 全局状态控制
let historyImages = [];     // 存储历史图片URL数组
let historyImageData = [];  // 存储历史图片URL和任务ID的关联信息
let currentPreviewIndex = 0; // 当前预览图片的索引 
let currentTaskId = null;   // 当前预览图片的任务ID
let displayedTaskIds = new Set(); // 跟踪已显示的任务ID，用于优化历史记录加载
let historyPollingTimer = null; // 历史记录轮询定时器
let isAutoRefreshEnabled = false; // 自动刷新状态

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initServerConfig();
    
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
    const res = await fetch(`${SERVER}/history`);
    const data = await res.json();
    const gallery = document.getElementById('historyGallery');
    const newHistoryImages = []; // 存储新的历史图片URL
    const newHistoryImageData = []; // 存储新的历史图片数据

    // 遍历历史记录（倒序，最新的在前面）
    Object.entries(data).reverse().forEach(([taskId, item]) => {
        if(!item.outputs) return;
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
                    
                    // 创建图片容器
                    const imgWrapper = document.createElement('div');
                    imgWrapper.className = "relative w-full mb-2 animate-fade-in";
                    
                    // 创建新的图片元素
                    const i = document.createElement('img');
                    i.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; // 空白占位图
                    i.setAttribute('data-src', url); // 存储真实图片URL
                    i.loading = 'lazy';
                    i.className = "w-full rounded cursor-pointer border border-gray-600 hover:border-blue-500";
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
                    
                    // 添加类型标签
                    const isLargeImage = nid === '39' || nid === '42';
                    const labelText = isLargeImage ? '高清大图' : '预览草图';
                    const labelColor = isLargeImage ? 'bg-purple-600' : 'bg-blue-600';
                    
                    const label = document.createElement('span');
                    label.className = `absolute top-2 right-2 ${labelColor} text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10`;
                    label.textContent = labelText;
                    
                    // 将图片和标签添加到容器
                    imgWrapper.appendChild(i);
                    imgWrapper.appendChild(label);
                    
                    // 将图片添加到画廊
                    gallery.appendChild(imgWrapper);
                    
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
}

// 刷新历史记录
async function refreshHistory() {
    // 显示刷新图标
    const refreshIcon = document.getElementById('refreshIcon');
    const refreshBtn = document.getElementById('refreshBtn');
    refreshIcon.classList.remove('hidden');
    refreshBtn.disabled = true;
    
    try {
        // 清空已显示图片键集合和历史数组
        displayedTaskIds.clear();
        historyImages = [];
        historyImageData = [];
        // 清空画廊
        document.getElementById('historyGallery').innerHTML = "";
        // 重新加载所有历史记录
        await loadHistory();
        showToast('历史记录已刷新');
    } catch (error) {
        console.error('刷新历史记录失败:', error);
        showToast('刷新历史记录失败，请重试');
    } finally {
        // 隐藏刷新图标
        refreshIcon.classList.add('hidden');
        refreshBtn.disabled = false;
    }
}

// 打开预览
function openPreview(url, taskId) {
    document.getElementById('previewImg').src = url;
    document.getElementById('fullPreview').classList.remove('hidden');

    // 查找当前图片在历史数组中的索引
    currentPreviewIndex = historyImages.indexOf(url);
    currentTaskId = taskId;

    // 显示导航按钮
    document.getElementById('prevBtn').classList.remove('hidden');
    document.getElementById('nextBtn').classList.remove('hidden');
}

// 关闭预览
function closePreview() {
    document.getElementById('fullPreview').classList.add('hidden');
}

// 上一张图片（显示更旧的图片）
function prevImage() {
    if (currentPreviewIndex >= 0 && currentPreviewIndex < historyImages.length - 1) {
        currentPreviewIndex++;
        document.getElementById('previewImg').src = historyImages[currentPreviewIndex];
        // 更新当前任务ID
        if (historyImageData[currentPreviewIndex]) {
            currentTaskId = historyImageData[currentPreviewIndex].taskId;
        }
    }
}

// 下一张图片（显示更新的图片）
function nextImage() {
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        document.getElementById('previewImg').src = historyImages[currentPreviewIndex];
        // 更新当前任务ID
        if (historyImageData[currentPreviewIndex]) {
            currentTaskId = historyImageData[currentPreviewIndex].taskId;
        }
    }
}

// 键盘事件监听
document.addEventListener('keydown', function(e) {
    // 只有在预览模式打开时才响应键盘事件
    if (!document.getElementById('fullPreview').classList.contains('hidden')) {
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
    
    if (isAutoRefreshEnabled) {
        // 开启自动刷新
        statusElement.textContent = '开启';
        statusElement.className = 'ml-1 text-xs bg-green-500 px-2 py-0.5 rounded';
        toggleButton.className = 'text-lg bg-green-600 hover:bg-green-700 p-2 rounded flex items-center';
        startHistoryPolling();
        showToast('已开启自动刷新');
    } else {
        // 关闭自动刷新
        statusElement.textContent = '关闭';
        statusElement.className = 'ml-1 text-xs bg-red-500 px-2 py-0.5 rounded';
        toggleButton.className = 'text-lg bg-gray-600 hover:bg-gray-700 p-2 rounded flex items-center';
        stopHistoryPolling();
        showToast('已关闭自动刷新');
    }
}

// Toast通知函数
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    // 设置消息内容
    toastMessage.textContent = message;

    // 显示toast
    toast.classList.remove('translate-x-full', 'opacity-0');
    toast.classList.add('translate-x-0', 'opacity-100');

    // 自动隐藏toast
    setTimeout(() => {
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('translate-x-full', 'opacity-0');
    }, duration);
}