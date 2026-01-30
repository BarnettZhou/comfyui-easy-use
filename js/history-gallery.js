/**
 * 文件浏览器 - 浏览 easy-use 目录下的文件和文件夹
 */

// 全局状态
let currentPath = ''; // 当前目录路径（相对于 easy-use）
let currentImages = []; // 当前目录下的图片列表
let currentPreviewIndex = -1; // 当前预览的图片索引

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadStructure();
});

/**
 * 加载目录结构
 */
async function loadStructure() {
    try {
        showLoading(true);
        const response = await fetch('/api/easy-use/structure');
        if (!response.ok) throw new Error('获取目录结构失败');
        
        const data = await response.json();
        renderStructure(data.structure);
        
        // 如果当前在根目录，也加载根目录下的图片
        if (!currentPath) {
            renderRootImages(data.structure);
        }
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
 * 渲染根目录下的图片
 * @param {Array} structure - 目录结构数组
 */
function renderRootImages(structure) {
    const imageGrid = document.getElementById('imageGrid');
    const imageEmptyState = document.getElementById('imageEmptyState');
    const imageCount = document.getElementById('imageCount');
    
    // 过滤出根目录下的图片文件
    const images = structure.filter(item => item.type === 'file');
    currentImages = images.map(img => ({
        ...img,
        fullPath: `/api/easy-use/files/${img.path}`
    }));
    
    // 更新图片计数
    imageCount.textContent = `${images.length} 张图片`;
    
    if (images.length === 0) {
        imageGrid.innerHTML = '';
        imageEmptyState.classList.remove('hidden');
        return;
    }
    
    imageEmptyState.classList.add('hidden');
    
    // 渲染图片卡片
    imageGrid.innerHTML = images.map((image, index) => `
        <div class="group relative aspect-square rounded-xl overflow-hidden cursor-pointer card-hover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
             onclick="openPreview(${index})">
            <img src="/api/easy-use/files/${image.path}" 
                 alt="${image.name}"
                 class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                 loading="lazy"
                 onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full flex items-center justify-center text-slate-400\\'><span class=\\'text-xs\\'>加载失败</span></div>'">
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div class="absolute bottom-0 left-0 right-0 p-3">
                    <p class="text-white text-xs truncate">${image.name}</p>
                    <p class="text-white/70 text-xs">${formatFileSize(image.size)}</p>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * 导航到指定目录
 * @param {string} path - 目录路径
 */
async function navigateToFolder(path) {
    currentPath = path;
    updateBreadcrumb();
    
    // 隐藏目录区域（进入子目录后只显示图片）
    document.getElementById('folderSection').classList.add('hidden');
    
    await loadImages(path);
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
        const response = await fetch(`/api/easy-use/images/${encodeURIComponent(dirPath)}`);
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
    
    // 渲染图片卡片
    imageGrid.innerHTML = files.map((file, index) => `
        <div class="group relative aspect-square rounded-xl overflow-hidden cursor-pointer card-hover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
             onclick="openPreview(${index})">
            <img src="/api/easy-use/files/${file.path}" 
                 alt="${file.name}"
                 class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                 loading="lazy"
                 onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full flex items-center justify-center text-slate-400\\'><span class=\\'text-xs\\'>加载失败</span></div>'">
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div class="absolute bottom-0 left-0 right-0 p-3">
                    <p class="text-white text-xs truncate">${file.name}</p>
                    <p class="text-white/70 text-xs">${formatFileSize(file.size)} · ${formatDate(file.mtime)}</p>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * 刷新当前视图
 */
async function refreshCurrentView() {
    if (currentPath) {
        await loadImages(currentPath);
    } else {
        await loadStructure();
    }
    showToast('刷新成功');
}

/**
 * 打开全屏预览
 * @param {number} index - 图片索引
 */
function openPreview(index) {
    currentPreviewIndex = index;
    const preview = document.getElementById('fullPreview');
    const img = document.getElementById('previewImg');
    
    img.src = currentImages[index].fullPath;
    preview.classList.remove('hidden');
    
    // 禁止背景滚动
    document.body.style.overflow = 'hidden';
    
    // 更新导航按钮状态
    updateNavButtons();
}

/**
 * 关闭预览
 */
function closePreview() {
    const preview = document.getElementById('fullPreview');
    preview.classList.add('hidden');
    document.getElementById('previewImg').src = '';
    
    // 恢复背景滚动
    document.body.style.overflow = '';
    currentPreviewIndex = -1;
}

/**
 * 显示上一张图片
 */
function prevImage() {
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        document.getElementById('previewImg').src = currentImages[currentPreviewIndex].fullPath;
        updateNavButtons();
    }
}

/**
 * 显示下一张图片
 */
function nextImage() {
    if (currentPreviewIndex < currentImages.length - 1) {
        currentPreviewIndex++;
        document.getElementById('previewImg').src = currentImages[currentPreviewIndex].fullPath;
        updateNavButtons();
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
    
    switch(e.key) {
        case 'Escape':
            closePreview();
            break;
        case 'ArrowLeft':
            prevImage();
            break;
        case 'ArrowRight':
            nextImage();
            break;
    }
});
