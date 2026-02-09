/**
 * 文件浏览器 - 浏览 easy-use 目录下的文件和文件夹
 */

// 全局状态
let currentPath = ''; // 当前目录路径（相对于 easy-use）
let currentImages = []; // 当前目录下的图片列表
let currentPreviewIndex = -1; // 当前预览的图片索引
let currentPromptInfo = null; // 当前图片的 prompt 信息
let isInfoPopupOpen = false; // 信息弹窗是否打开

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 同时加载根目录的目录结构和图片
    Promise.all([
        loadStructure(),
        loadRootImages()
    ]);

    // 添加点击遮罩关闭预览功能
    document.getElementById('fullPreview').addEventListener('click', function(event) {
        // 检查点击的目标是否是遮罩本身（而不是里面的按钮或图片）
        if (event.target === this) {
            closePreview();
        }
    });
});

/**
 * 加载目录结构
 * @param {string} dirPath - 目录路径，默认为空（根目录）
 */
async function loadStructure(dirPath = '') {
    try {
        showLoading(true);
        const url = dirPath ? `/api/easy-use/structure/${dirPath}` : '/api/easy-use/structure/';
        const response = await fetch(url);
        if (!response.ok) throw new Error('获取目录结构失败');
        
        const data = await response.json();
        renderStructure(data.structure);
    } catch (error) {
        console.error('加载目录结构失败:', error);
        showToast('加载目录结构失败', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 渲染目录结构
 * @param {Array} structure - 目录结构数组
 */
function renderStructure(structure) {
    const folderGrid = document.getElementById('folderGrid');
    const folderEmptyState = document.getElementById('folderEmptyState');
    const folderCount = document.getElementById('folderCount');
    
    // 过滤出目录
    const folders = structure.filter(item => item.type === 'directory');
    
    // 更新目录计数
    folderCount.textContent = `${folders.length} 个目录`;
    
    if (folders.length === 0) {
        folderGrid.innerHTML = '';
        folderEmptyState.classList.remove('hidden');
        return;
    }
    
    folderEmptyState.classList.add('hidden');
    
    // 渲染目录卡片
    folderGrid.innerHTML = folders.map(folder => `
        <div class="folder-card cursor-pointer rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-center card-hover"
             onclick="navigateToFolder('${folder.path}')">
            <div class="w-16 h-16 mx-auto mb-3 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <svg class="w-8 h-8 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                </svg>
            </div>
            <p class="text-sm font-medium text-slate-700 dark:text-slate-300 truncate" title="${folder.name}">${folder.name}</p>
        </div>
    `).join('');
}



/**
 * 导航到指定目录
 * @param {string} folderPath - 目录路径
 */
async function navigateToFolder(folderPath) {
    currentPath = folderPath;
    updateBreadcrumb();
    
    // 始终显示目录区域和图片区域
    document.getElementById('folderSection').classList.remove('hidden');
    
    // 同时加载子目录和图片
    await Promise.all([
        loadStructure(folderPath),
        loadImages(folderPath)
    ]);
}

/**
 * 返回根目录
 */
function navigateToRoot() {
    currentPath = '';
    currentImages = [];
    currentPreviewIndex = -1;
    
    // 显示目录区域
    document.getElementById('folderSection').classList.remove('hidden');
    
    updateBreadcrumb();
    loadStructure();
    loadRootImages();
}

/**
 * 加载根目录下的图片
 */
async function loadRootImages() {
    try {
        showLoading(true);
        const response = await fetch('/api/easy-use/images/');
        if (!response.ok) throw new Error('获取图片列表失败');
        
        const data = await response.json();
        renderImages(data.files);
    } catch (error) {
        console.error('加载图片失败:', error);
        showToast('加载图片失败', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 更新面包屑导航
 */
function updateBreadcrumb() {
    const container = document.getElementById('breadcrumbContainer');
    
    if (!currentPath) {
        container.innerHTML = '';
        return;
    }
    
    const parts = currentPath.split('/');
    let html = '';
    let accumulatedPath = '';
    
    parts.forEach((part, index) => {
        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
        const isLast = index === parts.length - 1;
        
        if (isLast) {
            html += `<span class="breadcrumb-item font-medium text-slate-800 dark:text-slate-200">${part}</span>`;
        } else {
            html += `<span class="breadcrumb-item"><button onclick="navigateToFolder('${accumulatedPath}')" class="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">${part}</button></span>`;
        }
    });
    
    container.innerHTML = html;
}

/**
 * 加载指定目录下的图片
 * @param {string} dirPath - 目录路径
 */
async function loadImages(dirPath) {
    try {
        showLoading(true);
        const response = await fetch(`/api/easy-use/images/${dirPath}`);
        if (!response.ok) throw new Error('获取图片列表失败');
        
        const data = await response.json();
        renderImages(data.files);
    } catch (error) {
        console.error('加载图片失败:', error);
        showToast('加载图片失败', 'error');
    } finally {
        showLoading(false);
    }
}

// 全局图片懒加载观察器
let imageLazyObserver = null;

/**
 * 初始化图片懒加载观察器
 */
function initImageLazyObserver() {
    // 如果已存在，先断开
    if (imageLazyObserver) {
        imageLazyObserver.disconnect();
    }
    
    imageLazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const img = entry.target;
            if (entry.isIntersecting) {
                // 进入视口，加载真实图片
                const realSrc = img.getAttribute('data-src');
                if (realSrc && img.src !== realSrc) {
                    img.src = realSrc;
                }
            } else {
                // 离开视口，使用占位图（可选，用于内存优化）
                // 注意：这里不移除 src，因为浏览器原生 loading="lazy" 已经处理了大部分优化
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '50px' // 提前 50px 开始加载
    });
}

/**
 * 渲染图片列表
 * @param {Array} files - 图片文件数组
 */
function renderImages(files) {
    const imageGrid = document.getElementById('imageGrid');
    const imageEmptyState = document.getElementById('imageEmptyState');
    const imageCount = document.getElementById('imageCount');
    
    currentImages = files.map(file => ({
        ...file,
        fullPath: `/api/easy-use/files/${file.path}`
    }));
    
    // 更新图片计数
    imageCount.textContent = `${files.length} 张图片`;
    
    if (files.length === 0) {
        imageGrid.innerHTML = '';
        imageEmptyState.classList.remove('hidden');
        return;
    }
    
    imageEmptyState.classList.add('hidden');
    
    // 初始化懒加载观察器
    initImageLazyObserver();
    
    // 渲染图片卡片
    imageGrid.innerHTML = files.map((file, index) => `
        <div class="group relative aspect-square rounded-xl overflow-hidden cursor-pointer card-hover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 img-skeleton"
             onclick="openPreview(${index})">
            <img data-src="/api/easy-use/files/${file.path}" 
                 alt="${file.name}"
                 class="lazy-image w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                 loading="lazy"
                 onload="this.parentElement.classList.remove('img-skeleton')"
                 onerror="this.parentElement.classList.remove('img-skeleton'); this.parentElement.innerHTML='<div class=\\'w-full h-full flex items-center justify-center text-slate-400\\'><span class=\\'text-xs\\'>加载失败</span></div>'">
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div class="absolute bottom-0 left-0 right-0 p-3">
                    <p class="text-white text-xs truncate">${file.name}</p>
                    <p class="text-white/70 text-xs">${formatFileSize(file.size)} · ${formatDate(file.mtime)}</p>
                </div>
            </div>
        </div>
    `).join('');
    
    // 为所有懒加载图片添加观察
    const lazyImages = imageGrid.querySelectorAll('.lazy-image');
    lazyImages.forEach(img => {
        imageLazyObserver.observe(img);
    });
}

/**
 * 刷新当前视图
 */
async function refreshCurrentView() {
    if (currentPath) {
        await Promise.all([
            loadStructure(currentPath),
            loadImages(currentPath)
        ]);
    } else {
        await Promise.all([
            loadStructure(),
            loadRootImages()
        ]);
    }
    showToast('刷新成功');
}

/**
 * 打开全屏预览
 * @param {number} index - 图片索引
 */
async function openPreview(index) {
    currentPreviewIndex = index;
    const preview = document.getElementById('fullPreview');
    const img = document.getElementById('previewImg');
    
    img.src = currentImages[index].fullPath;
    preview.classList.remove('hidden');
    
    // 禁止背景滚动
    document.body.style.overflow = 'hidden';
    
    // 更新导航按钮状态
    updateNavButtons();
    
    // 预解析图片信息（但不显示）
    await preloadImageInfo(currentImages[index].fullPath);
}

/**
 * 关闭预览
 */
function closePreview() {
    const preview = document.getElementById('fullPreview');
    preview.classList.add('hidden');
    document.getElementById('previewImg').src = '';
    
    // 关闭信息弹窗（如果打开）
    closeInfoPopup();
    
    // 恢复背景滚动
    document.body.style.overflow = '';
    currentPreviewIndex = -1;
    currentPromptInfo = null;
}

/**
 * 显示上一张图片
 * @param {Event} event - 事件对象
 */
async function prevImage(event) {
    event.stopPropagation();
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        document.getElementById('previewImg').src = currentImages[currentPreviewIndex].fullPath;
        updateNavButtons();
        // 预加载新图片信息
        await preloadImageInfo(currentImages[currentPreviewIndex].fullPath);
        // 如果弹窗已打开，更新显示
        if (isInfoPopupOpen) {
            resetPopupInfo();
            await parseImageInfo(currentImages[currentPreviewIndex].fullPath);
        }
    }
}

/**
 * 显示下一张图片
 * @param {Event} event - 事件对象
 */
async function nextImage(event) {
    event.stopPropagation();
    if (currentPreviewIndex < currentImages.length - 1) {
        currentPreviewIndex++;
        document.getElementById('previewImg').src = currentImages[currentPreviewIndex].fullPath;
        updateNavButtons();
        // 预加载新图片信息
        await preloadImageInfo(currentImages[currentPreviewIndex].fullPath);
        // 如果弹窗已打开，更新显示
        if (isInfoPopupOpen) {
            resetPopupInfo();
            await parseImageInfo(currentImages[currentPreviewIndex].fullPath);
        }
    }
}

/**
 * 更新导航按钮状态
 */
function updateNavButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    prevBtn.style.opacity = currentPreviewIndex === 0 ? '0.3' : '0.7';
    prevBtn.style.cursor = currentPreviewIndex === 0 ? 'not-allowed' : 'pointer';
    
    nextBtn.style.opacity = currentPreviewIndex === currentImages.length - 1 ? '0.3' : '0.7';
    nextBtn.style.cursor = currentPreviewIndex === currentImages.length - 1 ? 'not-allowed' : 'pointer';
}

/**
 * 在新标签页打开图片
 */
function openInNewTab() {
    if (currentPreviewIndex >= 0 && currentPreviewIndex < currentImages.length) {
        window.open(currentImages[currentPreviewIndex].fullPath, '_blank');
    }
}

/**
 * 预加载图片信息（不显示）
 * @param {string} imageUrl - 图片 URL
 */
async function preloadImageInfo(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // 解析 PNG 获取 prompt 信息
        const promptData = extractPromptFromPNG(uint8Array);
        
        if (promptData) {
            currentPromptInfo = promptData;
        }
    } catch (error) {
        console.error('预加载图片信息失败:', error);
    }
}

/**
 * 切换信息弹窗显示
 */
function toggleInfoPopup() {
    if (isInfoPopupOpen) {
        closeInfoPopup();
    } else {
        openInfoPopup();
    }
}

/**
 * 打开信息弹窗
 */
function openInfoPopup() {
    const popup = document.getElementById('infoPopup');
    const overlay = document.getElementById('infoPopupOverlay');
    const content = document.getElementById('infoPopupContent');
    
    popup.classList.remove('hidden');
    isInfoPopupOpen = true;
    
    // 显示动画
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        content.classList.add('show');
    }, 10);
    
    // 重置并加载信息
    resetPopupInfo();
    if (currentImages[currentPreviewIndex]) {
        parseImageInfo(currentImages[currentPreviewIndex].fullPath);
    }
}

/**
 * 关闭信息弹窗
 */
function closeInfoPopup() {
    const popup = document.getElementById('infoPopup');
    const overlay = document.getElementById('infoPopupOverlay');
    const content = document.getElementById('infoPopupContent');
    
    overlay.classList.add('opacity-0');
    content.classList.remove('show');
    
    setTimeout(() => {
        popup.classList.add('hidden');
        isInfoPopupOpen = false;
    }, 300);
}

/**
 * 重置弹窗信息状态
 */
function resetPopupInfo() {
    document.getElementById('popupInfoLoading').classList.remove('hidden');
    document.getElementById('popupInfoContent').classList.add('hidden');
    document.getElementById('popupInfoEmpty').classList.add('hidden');
}

/**
 * 解析 PNG 图片中的 ComfyUI prompt 信息
 * @param {string} imageUrl - 图片 URL
 */
async function parseImageInfo(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // 解析 PNG 获取 prompt 信息
        const promptData = extractPromptFromPNG(uint8Array);
        
        if (promptData) {
            currentPromptInfo = promptData;
            displayPopupInfo(promptData);
        } else {
            showEmptyPopupInfo();
        }
    } catch (error) {
        console.error('解析图片信息失败:', error);
        showEmptyPopupInfo();
    }
}

/**
 * 在弹窗中显示图片信息
 * @param {Object} info - 图片信息对象
 */
function displayPopupInfo(info) {
    document.getElementById('popupInfoLoading').classList.add('hidden');
    document.getElementById('popupInfoContent').classList.remove('hidden');
    document.getElementById('popupInfoEmpty').classList.add('hidden');
    
    document.getElementById('popupInfoSize').textContent = info.size;
    document.getElementById('popupInfoModel').textContent = info.model;
    document.getElementById('popupInfoModel').title = info.model;
    document.getElementById('popupInfoSampler').textContent = info.sampler;
    document.getElementById('popupInfoScheduler').textContent = info.scheduler;
    document.getElementById('popupInfoSteps').textContent = info.steps;
    document.getElementById('popupInfoCfg').textContent = info.cfg;
    document.getElementById('popupInfoSeed').textContent = info.seed;
    document.getElementById('popupInfoSeed').title = info.seed;
    document.getElementById('popupInfoPrompt').textContent = info.prompt || '无提示词';
}

/**
 * 显示无信息状态
 */
function showEmptyPopupInfo() {
    document.getElementById('popupInfoLoading').classList.add('hidden');
    document.getElementById('popupInfoContent').classList.add('hidden');
    document.getElementById('popupInfoEmpty').classList.remove('hidden');
}

/**
 * 从弹窗复制提示词
 */
function copyPromptFromPopup() {
    if (currentPromptInfo && currentPromptInfo.prompt) {
        navigator.clipboard.writeText(currentPromptInfo.prompt).then(() => {
            showToast('提示词已复制');
        }).catch(err => {
            console.error('复制失败:', err);
            showToast('复制失败', 'error');
        });
    } else {
        showToast('没有可复制的提示词', 'error');
    }
}

/**
 * 显示/隐藏加载状态
 * @param {boolean} show - 是否显示
 */
function showLoading(show) {
    const refreshIcon = document.getElementById('refreshIcon');
    const refreshIconStatic = document.getElementById('refreshIconStatic');
    
    if (show) {
        refreshIcon.classList.remove('hidden');
        refreshIconStatic.classList.add('hidden');
    } else {
        refreshIcon.classList.add('hidden');
        refreshIconStatic.classList.remove('hidden');
    }
}

/**
 * 显示 Toast 通知
 * @param {string} message - 消息内容
 * @param {string} type - 类型: success, error
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');
    
    toastMessage.textContent = message;
    
    // 设置图标
    if (type === 'error') {
        toastIcon.innerHTML = `<svg class="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
        toastIcon.className = 'w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0';
    } else {
        toastIcon.innerHTML = `<svg class="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
        toastIcon.className = 'w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0';
    }
    
    // 显示
    toast.classList.remove('translate-x-full', 'opacity-0');
    toast.classList.add('translate-x-0', 'opacity-100');
    
    // 3秒后隐藏
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        toast.classList.remove('translate-x-0', 'opacity-100');
    }, 3000);
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 格式化日期
 * @param {string} dateString - ISO日期字符串
 * @returns {string} 格式化后的日期
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    const preview = document.getElementById('fullPreview');
    if (preview.classList.contains('hidden')) return;
    
    // 如果弹窗打开，ESC 先关闭弹窗
    if (isInfoPopupOpen && e.key === 'Escape') {
        closeInfoPopup();
        return;
    }
    
    switch(e.key) {
        case 'Escape':
            closePreview();
            break;
        case 'ArrowLeft':
            if (currentPreviewIndex > 0) {
                currentPreviewIndex--;
                document.getElementById('previewImg').src = currentImages[currentPreviewIndex].fullPath;
                updateNavButtons();
                preloadImageInfo(currentImages[currentPreviewIndex].fullPath);
                if (isInfoPopupOpen) {
                    resetPopupInfo();
                    parseImageInfo(currentImages[currentPreviewIndex].fullPath);
                }
            }
            break;
        case 'ArrowRight':
            if (currentPreviewIndex < currentImages.length - 1) {
                currentPreviewIndex++;
                document.getElementById('previewImg').src = currentImages[currentPreviewIndex].fullPath;
                updateNavButtons();
                preloadImageInfo(currentImages[currentPreviewIndex].fullPath);
                if (isInfoPopupOpen) {
                    resetPopupInfo();
                    parseImageInfo(currentImages[currentPreviewIndex].fullPath);
                }
            }
            break;
        case 'i':
        case 'I':
            // I 键切换信息弹窗
            toggleInfoPopup();
            break;
    }
});
