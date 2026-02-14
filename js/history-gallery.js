/**
 * 文件浏览器 - 浏览 easy-use 目录下的文件和文件夹
 * 支持两种视图模式：目录浏览模式 / 无限浏览模式
 */

// ==================== 全局状态 ====================

// 目录浏览模式状态
let currentPath = ''; // 当前目录路径（相对于 easy-use）
let currentImages = []; // 当前目录下的图片列表
let currentPreviewIndex = -1; // 当前预览的图片索引
let currentPromptInfo = null; // 当前图片的 prompt 信息
let isInfoPopupOpen = false; // 信息弹窗是否打开
let isFolderSectionCollapsed = false; // 目录区域是否收起

// 视图模式状态
let currentViewMode = 'folder'; // 'folder' | 'infinite'

// 无限浏览模式状态
let infiniteImages = []; // 无限浏览的所有图片
let infiniteOffset = 0; // 当前加载偏移量
let infiniteLimit = 50; // 每次加载数量
let isInfiniteLoading = false; // 是否正在加载
let hasMoreInfiniteImages = true; // 是否还有更多图片
let infiniteScrollObserver = null; // 无限滚动观察器
let infiniteTotalCount = 0; // 图片总数

/**
 * 切换目录区域的展开/收起状态
 */
function toggleFolderSection() {
    const folderGrid = document.getElementById('folderGrid');
    const folderEmptyState = document.getElementById('folderEmptyState');
    const toggleIcon = document.getElementById('folderToggleIcon');
    
    isFolderSectionCollapsed = !isFolderSectionCollapsed;
    
    if (isFolderSectionCollapsed) {
        // 收起
        folderGrid.classList.add('hidden');
        folderEmptyState.classList.add('hidden');
        toggleIcon.style.transform = 'rotate(-90deg)';
    } else {
        // 展开
        folderGrid.classList.remove('hidden');
        // 只有在有目录时才显示空状态
        const folderCount = document.getElementById('folderCount').textContent;
        if (folderCount === '0 个目录' || folderCount === '加载中...') {
            folderEmptyState.classList.remove('hidden');
        }
        toggleIcon.style.transform = 'rotate(0deg)';
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化视图模式
    initViewMode();
    
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
    
    // 初始化无限滚动
    initInfiniteScroll();
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
    
    // 渲染目录列表 - 响应式网格布局
    folderGrid.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            ${folders.map(folder => `
                <div class="folder-chip cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200 group"
                     onclick="navigateToFolder('${folder.path}')">
                    <svg class="w-4 h-4 text-primary-500 group-hover:scale-110 transition-transform flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                    </svg>
                    <span class="text-sm font-medium text-slate-700 dark:text-slate-300 truncate" title="${folder.name}">${folder.name}</span>
                </div>
            `).join('')}
        </div>
    `;
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
    // 根据当前视图模式决定刷新哪个视图
    if (currentViewMode === 'infinite') {
        await refreshInfiniteView();
        showToast('刷新成功');
        return;
    }
    
    // 目录浏览模式刷新
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
 * 复制文本到剪贴板（兼容移动端）
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 是否复制成功
 */
async function copyToClipboard(text) {
    if (!text) return false;

    // 尝试使用现代 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.log('Clipboard API 失败，尝试降级方案:', err);
        }
    }

    // 降级方案：使用 execCommand
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        return successful;
    } catch (err) {
        console.error('execCommand 复制失败:', err);
        return false;
    }
}

/**
 * 从弹窗复制提示词
 */
async function copyPromptFromPopup() {
    if (currentPromptInfo && currentPromptInfo.prompt) {
        const success = await copyToClipboard(currentPromptInfo.prompt);
        if (success) {
            showToast('提示词已复制');
        } else {
            showToast('复制失败，请手动复制', 'error');
        }
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
        case 'v':
        case 'V':
            // V 键切换视图模式
            toggleViewMode();
            break;
    }
});


// ==================== 视图切换功能 ====================

/**
 * 初始化视图模式
 */
function initViewMode() {
    const savedMode = localStorage.getItem('viewMode');
    if (savedMode === 'infinite') {
        currentViewMode = 'infinite';
        // 页面加载时不自动切换，保持默认目录视图
        // 用户点击按钮后才切换
    }
    updateViewToggleUI();
}

/**
 * 切换视图模式
 */
function toggleViewMode() {
    if (currentViewMode === 'folder') {
        switchToInfiniteMode();
    } else {
        switchToFolderMode();
    }
}

/**
 * 切换到目录浏览模式
 */
function switchToFolderMode() {
    currentViewMode = 'folder';
    localStorage.setItem('viewMode', 'folder');
    
    // 隐藏无限浏览容器，显示目录浏览容器
    document.getElementById('infiniteViewContainer').classList.add('hidden');
    document.getElementById('folderViewContainer').classList.remove('hidden');
    
    // 恢复面包屑显示
    document.getElementById('breadcrumbContainer').closest('div').classList.remove('hidden');
    
    updateViewToggleUI();
    showToast('已切换到目录浏览模式');
}

/**
 * 切换到无限浏览模式
 */
async function switchToInfiniteMode() {
    currentViewMode = 'infinite';
    localStorage.setItem('viewMode', 'infinite');
    
    // 隐藏目录浏览容器，显示无限浏览容器
    document.getElementById('folderViewContainer').classList.add('hidden');
    document.getElementById('infiniteViewContainer').classList.remove('hidden');
    
    // 隐藏面包屑（无限浏览不需要面包屑）
    document.getElementById('breadcrumbContainer').closest('div').classList.add('hidden');
    
    updateViewToggleUI();
    
    // 如果还没有加载过数据，开始加载
    if (infiniteImages.length === 0 && !isInfiniteLoading) {
        await loadInfiniteImages();
    }
}

/**
 * 更新视图切换按钮的UI
 */
function updateViewToggleUI() {
    const folderIcon = document.getElementById('folderViewIcon');
    const infiniteIcon = document.getElementById('infiniteViewIcon');
    const viewModeText = document.getElementById('viewModeText');
    const viewToggleBtn = document.getElementById('viewToggleBtn');
    
    if (currentViewMode === 'folder') {
        folderIcon.classList.remove('hidden');
        infiniteIcon.classList.add('hidden');
        viewModeText.textContent = '目录';
        viewToggleBtn.title = '点击切换到无限浏览模式';
    } else {
        folderIcon.classList.add('hidden');
        infiniteIcon.classList.remove('hidden');
        viewModeText.textContent = '无限';
        viewToggleBtn.title = '点击切换到目录浏览模式';
    }
}

// ==================== 无限浏览模式 ====================

/**
 * 初始化无限滚动
 */
function initInfiniteScroll() {
    const trigger = document.getElementById('infiniteScrollTrigger');
    if (!trigger) return;
    
    infiniteScrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isInfiniteLoading && hasMoreInfiniteImages && currentViewMode === 'infinite') {
                loadInfiniteImages();
            }
        });
    }, {
        rootMargin: '100px' // 提前100px开始加载
    });
    
    infiniteScrollObserver.observe(trigger);
}

/**
 * 加载无限浏览图片
 */
async function loadInfiniteImages() {
    if (isInfiniteLoading || !hasMoreInfiniteImages) return;
    
    isInfiniteLoading = true;
    showInfiniteLoading(true);
    
    try {
        const response = await fetch(`/api/infinite-images?limit=${infiniteLimit}&offset=${infiniteOffset}`);
        if (!response.ok) throw new Error('获取图片列表失败');
        
        const data = await response.json();
        const newImages = data.files || [];
        
        if (newImages.length > 0) {
            // 格式化图片数据
            const formattedImages = newImages.map(img => ({
                name: img.name,
                path: img.path,
                fullPath: img.fullPath,
                size: img.size,
                mtime: img.mtime
            }));
            
            infiniteImages.push(...formattedImages);
            infiniteOffset += newImages.length;
            hasMoreInfiniteImages = data.hasMore;
            
            // 渲染新加载的图片
            renderInfiniteImages(formattedImages, infiniteOffset === newImages.length);
            
            // 更新总数
            if (infiniteTotalCount === 0) {
                updateInfiniteTotalCount();
            }
        } else {
            hasMoreInfiniteImages = false;
            showInfiniteEndMessage();
        }
        
        // 如果是第一次加载且没有数据，显示空状态
        if (infiniteOffset === 0 && newImages.length === 0) {
            showInfiniteEmptyState();
        }
        
    } catch (error) {
        console.error('[无限浏览] 加载图片失败:', error);
        showToast('加载图片失败', 'error');
    } finally {
        isInfiniteLoading = false;
        showInfiniteLoading(false);
    }
}

/**
 * 渲染无限浏览图片
 * @param {Array} images - 图片数组
 * @param {boolean} isFirstBatch - 是否是第一批数据
 */
function renderInfiniteImages(images, isFirstBatch) {
    const grid = document.getElementById('infiniteImageGrid');
    const emptyState = document.getElementById('infiniteEmptyState');
    
    if (isFirstBatch) {
        grid.innerHTML = '';
        emptyState.classList.add('hidden');
    }
    
    const html = images.map((file, index) => {
        const actualIndex = infiniteOffset - images.length + index;
        return `
            <div class="group relative aspect-square rounded-xl overflow-hidden cursor-pointer card-hover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 img-skeleton"
                 onclick="openInfinitePreview(${actualIndex})">
                <img data-src="${file.fullPath}" 
                     alt="${file.name}"
                     class="lazy-image w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                     loading="lazy"
                     onload="this.parentElement.classList.remove('img-skeleton')"
                     onerror="this.parentElement.classList.remove('img-skeleton'); this.parentElement.innerHTML='<div class=\'w-full h-full flex items-center justify-center text-slate-400\'><span class=\'text-xs\'>加载失败</span></div>'">
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div class="absolute bottom-0 left-0 right-0 p-3">
                        <p class="text-white text-xs truncate">${file.name}</p>
                        <p class="text-white/70 text-xs">${formatFileSize(file.size)} · ${formatDate(file.mtime)}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    grid.insertAdjacentHTML('beforeend', html);
    
    // 为新添加的图片添加懒加载观察
    const newImages = grid.querySelectorAll('.lazy-image:not([data-observed])');
    newImages.forEach(img => {
        img.setAttribute('data-observed', 'true');
        if (imageLazyObserver) {
            imageLazyObserver.observe(img);
        }
    });
}

/**
 * 显示/隐藏加载动画
 */
function showInfiniteLoading(show) {
    const trigger = document.getElementById('infiniteScrollTrigger');
    if (show) {
        trigger.classList.remove('hidden');
    } else if (!hasMoreInfiniteImages) {
        trigger.classList.add('hidden');
    }
}

/**
 * 显示空状态
 */
function showInfiniteEmptyState() {
    document.getElementById('infiniteEmptyState').classList.remove('hidden');
    document.getElementById('infiniteScrollTrigger').classList.add('hidden');
    document.getElementById('infiniteEndMessage').classList.add('hidden');
}

/**
 * 显示结束消息
 */
function showInfiniteEndMessage() {
    document.getElementById('infiniteScrollTrigger').classList.add('hidden');
    if (infiniteImages.length > 0) {
        document.getElementById('infiniteEndMessage').classList.remove('hidden');
    }
}

/**
 * 更新图片总数显示
 */
async function updateInfiniteTotalCount() {
    try {
        const response = await fetch('/api/images-count');
        if (!response.ok) throw new Error('获取数量失败');
        
        const data = await response.json();
        infiniteTotalCount = data.count;
        document.getElementById('infiniteTotalCount').textContent = `共 ${infiniteTotalCount} 张`;
    } catch (error) {
        console.error('[无限浏览] 获取总数失败:', error);
        document.getElementById('infiniteTotalCount').textContent = '数量未知';
    }
}

/**
 * 打开无限浏览模式下的全屏预览
 * @param {number} index - 图片索引
 */
function openInfinitePreview(index) {
    currentPreviewIndex = index;
    const preview = document.getElementById('fullPreview');
    const img = document.getElementById('previewImg');
    
    // 使用无限浏览的图片列表
    currentImages = infiniteImages;
    
    img.src = infiniteImages[index].fullPath;
    preview.classList.remove('hidden');
    
    // 禁止背景滚动
    document.body.style.overflow = 'hidden';
    
    // 更新导航按钮状态
    updateNavButtons();
    
    // 预解析图片信息
    preloadImageInfo(infiniteImages[index].fullPath);
}

/**
 * 刷新无限浏览数据
 */
async function refreshInfiniteView() {
    // 重置状态
    infiniteImages = [];
    infiniteOffset = 0;
    hasMoreInfiniteImages = true;
    infiniteTotalCount = 0;
    
    // 清空网格
    document.getElementById('infiniteImageGrid').innerHTML = '';
    document.getElementById('infiniteEndMessage').classList.add('hidden');
    
    // 重新加载
    await loadInfiniteImages();
    
    // 触发后台扫描更新数据库
    fetch('/api/scan-images', { method: 'POST' }).catch(() => {});
}
