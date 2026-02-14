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
    if (event) event.stopPropagation();
    
    // 如果当前是最后一张且在无限浏览模式下，尝试加载更多
    if (currentPreviewIndex >= currentImages.length - 1) {
        if (currentViewMode === 'infinite' && hasMoreInfiniteImages && !isInfiniteLoading) {
            console.log('[预览] 到达当前队列末尾，加载更多图片...');
            await loadInfiniteImages();
            // 加载完成后，currentImages 引用会更新（infiniteImages 已添加新数据）
        }
    }
    
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
    
    // 下一张按钮状态
    const isLastImage = currentPreviewIndex === currentImages.length - 1;
    const canLoadMore = currentViewMode === 'infinite' && hasMoreInfiniteImages;
    
    if (isLastImage && canLoadMore) {
        // 无限浏览模式下还有更多图片可加载，显示可点击状态
        nextBtn.style.opacity = '0.7';
        nextBtn.style.cursor = 'pointer';
    } else {
        // 普通状态或没有更多图片
        nextBtn.style.opacity = isLastImage ? '0.3' : '0.7';
        nextBtn.style.cursor = isLastImage ? 'not-allowed' : 'pointer';
    }
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
            // 使用 nextImage 函数，支持自动加载更多
            nextImage(null);
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
        // 如果有保存的无限模式偏好，切换到无限模式
        // 注意：这里不调用 switchToInfiniteMode 避免加载数据
        // 只更新状态和UI，数据在用户实际需要时再加载
        currentViewMode = 'infinite';
        
        // 切换容器显示
        document.getElementById('folderViewContainer').classList.add('hidden');
        document.getElementById('infiniteViewContainer').classList.remove('hidden');
        document.getElementById('breadcrumbContainer').closest('div').classList.add('hidden');
        
        // 加载无限浏览数据
        if (infiniteImages.length === 0 && !isInfiniteLoading) {
            loadInfiniteImages();
        }
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

// 日期分组数据
let dateGroups = []; // [{ date: '2026-02-14', count: 10, startIndex: 0 }, ...]

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
    
    // 初始化移动端日期导航弹窗的滑动手势
    initMobileDateNavSwipe();
}

/**
 * 初始化移动端日期导航弹窗的滑动手势
 */
function initMobileDateNavSwipe() {
    const modal = document.getElementById('mobileDateNavModal');
    if (!modal) return;
    
    const content = modal.querySelector('.absolute.bottom-0');
    if (!content) return;
    
    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    
    content.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        content.style.transition = 'none';
    }, { passive: true });
    
    content.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        
        // 只允许向下滑动
        if (deltaY > 0) {
            content.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: true });
    
    content.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        
        const deltaY = currentY - startY;
        content.style.transition = 'transform 0.3s ease';
        
        // 如果下滑超过 100px，关闭弹窗
        if (deltaY > 100) {
            closeMobileDateNav();
            setTimeout(() => {
                content.style.transform = '';
            }, 300);
        } else {
            // 否则回弹
            content.style.transform = '';
        }
        
        startY = 0;
        currentY = 0;
    });
}

/**
 * 从路径中提取日期
 * @param {string} path - 图片路径，如 "2026-02-14/image_001.png"
 * @returns {string} 日期字符串
 */
function extractDateFromPath(path) {
    if (!path) return '';
    // 路径格式: 2026-02-14/image_001.png
    const match = path.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
}

/**
 * 从服务器加载日期列表
 */
async function loadDateNav() {
    try {
        const response = await fetch('/api/dates');
        if (!response.ok) throw new Error('获取日期列表失败');
        
        const data = await response.json();
        // 转换格式以兼容现有代码
        dateGroups = (data.dates || []).map((item) => ({
            date: item.date,
            count: item.count,
            startIndex: -1 // 初始值，后续通过 updateDateGroupStartIndices 计算
        }));
        
        // 立即计算一次 startIndex（如果图片已加载）
        updateDateGroupStartIndices();
        
        renderDateNav();
    } catch (error) {
        console.error('[日期导航] 加载日期列表失败:', error);
    }
}

/**
 * 更新日期分组的起始索引
 * 根据已加载的图片列表计算每个日期对应的起始位置
 */
function updateDateGroupStartIndices() {
    if (dateGroups.length === 0 || infiniteImages.length === 0) return;
    
    // 重置所有 startIndex
    dateGroups.forEach(group => {
        group.startIndex = -1;
    });
    
    // 遍历所有已加载的图片，记录每个日期的第一个出现位置
    for (let i = 0; i < infiniteImages.length; i++) {
        const date = extractDateFromPath(infiniteImages[i].path);
        if (!date) continue;
        
        const group = dateGroups.find(g => g.date === date);
        if (group && group.startIndex === -1) {
            group.startIndex = i;
        }
    }
}

/**
 * 渲染日期导航
 */
function renderDateNav() {
    const navContainer = document.getElementById('infiniteDateNav');
    const mobileNavContainer = document.getElementById('mobileDateNav');
    
    if (dateGroups.length === 0) return;
    
    const html = dateGroups.map(group => `
        <button onclick="jumpToDate('${group.date}'); closeMobileDateNav();" 
                class="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group flex items-center justify-between">
            <div class="flex flex-col">
                <span class="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    ${formatDateForNav(group.date)}
                </span>
                <span class="text-xs text-slate-400 dark:text-slate-500">
                    ${group.count} 张图片
                </span>
            </div>
            <svg class="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
        </button>
    `).join('');
    
    if (navContainer) navContainer.innerHTML = html;
    if (mobileNavContainer) mobileNavContainer.innerHTML = html;
}

/**
 * 打开移动端日期导航弹窗
 */
function openMobileDateNav() {
    const modal = document.getElementById('mobileDateNavModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // 禁止背景滚动
    }
}

/**
 * 关闭移动端日期导航弹窗
 */
function closeMobileDateNav() {
    const modal = document.getElementById('mobileDateNavModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = ''; // 恢复背景滚动
    }
}

/**
 * 格式化日期用于导航显示
 * @param {string} dateStr - 日期字符串，如 "2026-02-14"
 * @returns {string} 格式化后的日期
 */
function formatDateForNav(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // 判断是否是今天/昨天
    if (dateStr === today.toISOString().split('T')[0]) {
        return '今天';
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
        return '昨天';
    }
    
    // 返回 "2月14日" 格式
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 跳转到指定日期的图片
 * @param {string} date - 日期字符串
 */
async function jumpToDate(date) {
    const group = dateGroups.find(g => g.date === date);
    if (!group) return;
    
    let targetIndex = group.startIndex;
    
    // 如果 startIndex 为 -1，说明该日期的图片还未加载
    // 需要通过 API 获取该日期的偏移量
    if (targetIndex === -1) {
        console.log(`[跳转] 日期 ${date} 尚未加载，正在获取偏移量...`);
        try {
            const response = await fetch(`/api/date-offset?date=${date}`);
            if (!response.ok) throw new Error('获取偏移量失败');
            
            const data = await response.json();
            targetIndex = data.offset;
            
            // 更新 group 的 startIndex，避免下次重复请求
            group.startIndex = targetIndex;
            
            console.log(`[跳转] 日期 ${date} 的偏移量为 ${targetIndex}`);
        } catch (error) {
            console.error('[跳转] 获取日期偏移量失败:', error);
            showToast('跳转到日期失败', 'error');
            return;
        }
    }
    
    const grid = document.getElementById('infiniteImageGrid');
    
    // 检查目标是否已经在当前加载的范围内
    const currentStartOffset = infiniteOffset - infiniteImages.length; // 当前已加载的起始位置
    const isInCurrentRange = targetIndex >= currentStartOffset && targetIndex < infiniteOffset;
    
    if (isInCurrentRange && grid.children[targetIndex - currentStartOffset]) {
        // 元素已存在，直接滚动
        const relativeIndex = targetIndex - currentStartOffset;
        const targetElement = grid.children[relativeIndex];
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // 高亮效果
        targetElement.classList.add('ring-2', 'ring-primary-500');
        setTimeout(() => {
            targetElement.classList.remove('ring-2', 'ring-primary-500');
        }, 2000);
    } else {
        // 如果元素不在当前视图中，重新加载从目标位置开始
        console.log(`[跳转] 重新加载从索引 ${targetIndex} 开始...`);
        const relativeIndex = await loadUntilIndex(targetIndex);
        
        const element = grid.children[relativeIndex];
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            element.classList.add('ring-2', 'ring-primary-500');
            setTimeout(() => {
                element.classList.remove('ring-2', 'ring-primary-500');
            }, 2000);
            showToast(`已跳转到 ${date}`, 'success');
        } else {
            console.error('[跳转] 加载后仍未找到目标元素');
            showToast('跳转到日期失败', 'error');
        }
    }
}

/**
 * 加载图片直到指定索引
 * @param {number} targetIndex - 目标索引（相对于整个列表）
 * @returns {number} 目标元素在新列表中的索引（通常是 0）
 */
async function loadUntilIndex(targetIndex) {
    // 计算应该从哪个 offset 开始加载
    // 让目标图片出现在第一页，方便用户看到
    const startOffset = targetIndex;
    
    console.log(`[加载] 重置加载，目标索引: ${targetIndex}, 起始偏移: ${startOffset}`);
    
    // 清空当前列表，重新从 startOffset 加载
    infiniteImages = [];
    infiniteOffset = startOffset;
    hasMoreInfiniteImages = true;
    document.getElementById('infiniteImageGrid').innerHTML = '';
    
    // 加载一批图片（默认 limit 数量）
    // 这样目标图片会是列表中的第一个（索引 0）
    await loadInfiniteImages();
    
    // 如果还有更多，再加载一批确保有足够内容
    if (hasMoreInfiniteImages && infiniteImages.length < infiniteLimit) {
        await loadInfiniteImages();
    }
    
    // 更新日期起始索引
    updateDateGroupStartIndices();
    
    // 返回目标元素在新列表中的索引（总是 0，因为我们从目标位置开始加载）
    return 0;
}

/**
 * 回到顶部
 */
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 更新当前激活的日期导航项
 * 根据滚动位置自动高亮对应的日期
 */
function updateActiveDateNav() {
    if (dateGroups.length === 0 || currentViewMode !== 'infinite') return;
    
    const scrollTop = window.scrollY;
    const grid = document.getElementById('infiniteImageGrid');
    if (!grid) return;
    
    // 找到当前在视口中的图片
    const images = grid.querySelectorAll('.group');
    let activeDate = null;
    
    for (let i = 0; i < images.length; i++) {
        const rect = images[i].getBoundingClientRect();
        if (rect.top >= 100 && rect.top <= window.innerHeight / 2) {
            // 找到对应的日期
            const group = dateGroups.find(g => i >= g.startIndex && i < g.startIndex + g.count);
            if (group) {
                activeDate = group.date;
                break;
            }
        }
    }
    
    // 更新导航高亮
    if (activeDate) {
        document.querySelectorAll('#infiniteDateNav button').forEach(btn => {
            btn.classList.remove('date-nav-active');
            if (btn.getAttribute('onclick').includes(`'${activeDate}'`)) {
                btn.classList.add('date-nav-active');
            }
        });
    }
}

// 添加滚动监听（使用节流）
let scrollThrottleTimer = null;
window.addEventListener('scroll', () => {
    if (scrollThrottleTimer) return;
    scrollThrottleTimer = setTimeout(() => {
        updateActiveDateNav();
        scrollThrottleTimer = null;
    }, 200);
});

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
            
            // 首次加载时获取日期导航
            if (infiniteOffset === newImages.length) {
                loadDateNav();
            }
            
            // 更新总数
            if (infiniteTotalCount === 0) {
                updateInfiniteTotalCount();
            }
            
            // 更新日期的 startIndex（用于跳转）
            updateDateGroupStartIndices();
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
        // 第一批数据时初始化懒加载观察器
        initImageLazyObserver();
    }
    
    const html = images.map((file, index) => {
        // 使用在 infiniteImages 数组中的相对索引
        const relativeIndex = infiniteImages.length - images.length + index;
        return `
            <div class="group relative aspect-square rounded-xl overflow-hidden cursor-pointer card-hover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 img-skeleton"
                 onclick="openInfinitePreview(${relativeIndex})">
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
    // 安全检查
    if (index < 0 || index >= infiniteImages.length) {
        console.error(`[预览] 索引 ${index} 超出范围 (0-${infiniteImages.length - 1})`);
        return;
    }
    
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
    dateGroups = [];
    
    // 清空网格和导航
    document.getElementById('infiniteImageGrid').innerHTML = '';
    document.getElementById('infiniteDateNav').innerHTML = '';
    document.getElementById('infiniteEndMessage').classList.add('hidden');
    
    // 重新加载
    await loadInfiniteImages();
    
    // 触发后台扫描更新数据库
    fetch('/api/scan-images', { method: 'POST' }).catch(() => {});
}
