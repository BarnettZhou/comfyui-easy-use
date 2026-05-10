/**
 * 文件浏览器 - 浏览 easy-use 目录下的文件
 * 只保留无限浏览模式，通过 switch 切换"日期导航"和"目录导航"
 */

// ==================== 全局状态 ====================

// 无限浏览模式状态
let infiniteImages = []; // 无限浏览的所有图片
let infiniteOffset = 0; // 当前加载偏移量
let infiniteLimit = 50; // 每次加载数量
let isInfiniteLoading = false; // 是否正在加载
let hasMoreInfiniteImages = true; // 是否还有更多图片
let infiniteScrollObserver = null; // 无限滚动观察器
let infiniteTotalCount = 0; // 图片总数
let baseOffset = 0; // 当前 infiniteImages[0] 对应的真实列表偏移量

// 预览状态
let currentPreviewIndex = -1; // 当前预览的图片索引
let currentImages = []; // 当前预览使用的图片列表
let currentPromptInfo = null; // 当前图片的 prompt 信息
let isInfoPopupOpen = false; // 信息弹窗是否打开
let currentWorkflowText = null; // 当前图片的原始工作流 JSON
let currentImageExtraInfo = { folder: '-', time: '-' }; // 当前图片的额外信息

// 目录筛选状态
let folderFilterEnabled = false; // 是否开启目录筛选
let currentFilterFolder = null; // 当前选中的目录
let savedInfiniteScrollY = 0; // 离开无限模式时保存的滚动位置

// 日期分组数据
let dateGroups = []; // [{ date: '2026-02-14', count: 10, startIndex: 0 }, ...]

// 全局图片懒加载观察器
let imageLazyObserver = null;

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
    await initServerConfig();
    
    // 加载无限浏览数据
    loadInfiniteImages();
    loadDateNav();
    
    // 初始化无限滚动
    initInfiniteScroll();
    
    // 点击遮罩关闭预览
    document.getElementById('fullPreview').addEventListener('click', function(event) {
        if (event.target === this) {
            closePreview();
        }
    });
});

// ==================== 目录筛选功能 ====================

/**
 * 切换"查看目录"开关
 */
function toggleFolderFilter() {
    folderFilterEnabled = !folderFilterEnabled;
    
    const switchTrack = document.getElementById('switchTrack');
    const switchKnob = document.getElementById('switchKnob');
    const switchText = document.getElementById('switchText');
    const leftNavTitleText = document.getElementById('leftNavTitleText');
    const mobileNavTitleText = document.getElementById('mobileNavTitleText');
    const breadcrumbContainer = document.getElementById('breadcrumbContainer');
    const breadcrumbText = document.getElementById('breadcrumbText');
    const sectionTitle = document.getElementById('sectionTitle');
    
    if (folderFilterEnabled) {
        // 开启目录筛选
        if (switchTrack) {
            switchTrack.classList.remove('bg-slate-200', 'dark:bg-slate-700');
            switchTrack.classList.add('bg-primary-600');
        }
        if (switchKnob) {
            switchKnob.classList.add('translate-x-3');
        }
        if (switchText) {
            switchText.textContent = '查看目录';
            switchText.classList.add('text-primary-600', 'dark:text-primary-400');
            switchText.classList.remove('text-slate-500', 'dark:text-slate-400');
        }
        
        // 切换导航标题
        if (leftNavTitleText) leftNavTitleText.textContent = '目录导航';
        if (mobileNavTitleText) mobileNavTitleText.textContent = '目录导航';
        
        // 加载目录列表到导航
        loadFolderNav();
        
        // 如果已经有选中的目录，保持筛选状态
        if (currentFilterFolder) {
            filterByFolder(currentFilterFolder);
        }
    } else {
        // 关闭目录筛选，恢复无限滚动
        if (switchTrack) {
            switchTrack.classList.add('bg-slate-200', 'dark:bg-slate-700');
            switchTrack.classList.remove('bg-primary-600');
        }
        if (switchKnob) {
            switchKnob.classList.remove('translate-x-3');
        }
        if (switchText) {
            switchText.textContent = '查看目录';
            switchText.classList.remove('text-primary-600', 'dark:text-primary-400');
            switchText.classList.add('text-slate-500', 'dark:text-slate-400');
        }
        
        // 恢复导航标题
        if (leftNavTitleText) leftNavTitleText.textContent = '日期导航';
        if (mobileNavTitleText) mobileNavTitleText.textContent = '日期导航';
        
        // 恢复日期导航
        renderDateNav();
        
        // 返回全部图片
        backToAllImages();
    }
}

/**
 * 加载目录列表到左侧导航
 */
async function loadFolderNav() {
    try {
        const response = await fetch('/api/easy-use/structure/');
        if (!response.ok) throw new Error('获取目录结构失败');
        
        const data = await response.json();
        const folders = (data.structure || []).filter(item => item.type === 'directory');
        renderFolderNav(folders);
        
        // 如果处于目录筛选模式且没有选中目录，自动选择最新（第一个）目录
        if (folderFilterEnabled && !currentFilterFolder && folders.length > 0) {
            filterByFolder(folders[0].path);
        }
    } catch (error) {
        console.error('加载目录列表失败:', error);
    }
}

/**
 * 渲染目录导航
 * @param {Array} folders - 目录数组
 */
function renderFolderNav(folders) {
    const navContainer = document.getElementById('infiniteDateNav');
    const mobileNavContainer = document.getElementById('mobileDateNav');
    
    // 按目录名称倒序排列（最新日期在前）
    folders.sort((a, b) => b.name.localeCompare(a.name));
    
    if (folders.length === 0) {
        const emptyHtml = `
            <div class="text-center py-8">
                <p class="text-slate-400 dark:text-slate-500 text-sm">暂无目录</p>
            </div>
        `;
        if (navContainer) navContainer.innerHTML = emptyHtml;
        if (mobileNavContainer) mobileNavContainer.innerHTML = emptyHtml;
        return;
    }
    
    const html = folders.map(folder => {
        const isActive = currentFilterFolder === folder.path;
        return `
            <button onclick="filterByFolder('${folder.path}'); closeMobileDateNav();"
                    class="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group flex items-center justify-between ${isActive ? 'date-nav-active' : ''}">
                <div class="flex items-center gap-2 min-w-0">
                    <svg class="w-4 h-4 text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                    </svg>
                    <span class="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors truncate">
                        ${folder.name}
                    </span>
                </div>
                <svg class="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
            </button>
        `;
    }).join('');
    
    if (navContainer) navContainer.innerHTML = html;
    if (mobileNavContainer) mobileNavContainer.innerHTML = html;
}

/**
 * 按目录筛选图片
 * @param {string} folderPath - 目录路径
 */
async function filterByFolder(folderPath) {
    try {
        // 保存无限模式下的滚动位置，以便切回时恢复
        if (!folderFilterEnabled) {
            savedInfiniteScrollY = window.scrollY;
        }
        
        showLoading(true);
        
        const response = await fetch(`/api/easy-use/images/${folderPath}`);
        if (!response.ok) throw new Error('获取图片列表失败');
        
        const data = await response.json();
        const files = data.files || [];
        
        currentFilterFolder = folderPath;
        
        // 设置当前图片列表（用于预览导航）
        currentImages = files.map(file => ({
            ...file,
            fullPath: `/api/easy-use/files/${file.path}`
        }));
        
        // 更新面包屑
        const breadcrumbContainer = document.getElementById('breadcrumbContainer');
        const breadcrumbText = document.getElementById('breadcrumbText');
        const sectionTitle = document.getElementById('sectionTitle');
        
        if (breadcrumbContainer) breadcrumbContainer.classList.remove('hidden');
        if (breadcrumbText) breadcrumbText.textContent = folderPath;
        if (sectionTitle) sectionTitle.textContent = folderPath;
        
        // 禁用无限滚动
        if (infiniteScrollObserver) {
            infiniteScrollObserver.disconnect();
        }
        
        // 渲染筛选后的图片
        renderFilteredImages(files);
        
        // 更新总数显示
        const totalCountEl = document.getElementById('infiniteTotalCount');
        if (totalCountEl) totalCountEl.textContent = `${files.length} 张`;
        
        // 隐藏加载器和结束消息
        document.getElementById('infiniteScrollTrigger').classList.add('hidden');
        document.getElementById('infiniteEndMessage').classList.add('hidden');
        
        // 重新渲染目录导航以更新高亮
        loadFolderNav();
        
    } catch (error) {
        console.error('筛选目录图片失败:', error);
        showToast('加载目录图片失败', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 返回全部图片（无限滚动模式）
 */
function backToAllImages() {
    currentFilterFolder = null;
    currentImages = [];
    
    // 恢复面包屑
    const breadcrumbContainer = document.getElementById('breadcrumbContainer');
    const sectionTitle = document.getElementById('sectionTitle');
    
    if (breadcrumbContainer) breadcrumbContainer.classList.add('hidden');
    if (sectionTitle) sectionTitle.textContent = '全部图片';
    
    // 恢复无限滚动
    const trigger = document.getElementById('infiniteScrollTrigger');
    if (trigger && infiniteScrollObserver) {
        infiniteScrollObserver.observe(trigger);
    }
    
    // 重置并恢复无限浏览
    document.getElementById('infiniteImageGrid').innerHTML = '';
    
    // 重新渲染已加载的无限浏览图片
    if (infiniteImages.length > 0) {
        renderInfiniteImages(infiniteImages, true);
    }
    
    // 恢复总数显示
    if (infiniteTotalCount > 0) {
        document.getElementById('infiniteTotalCount').textContent = `共 ${infiniteTotalCount} 张`;
    }
    
    // 如果还有更多图片，显示加载触发器
    if (hasMoreInfiniteImages) {
        document.getElementById('infiniteScrollTrigger').classList.remove('hidden');
    }
    
    // 如果没有图片且未加载过，重新加载
    if (infiniteImages.length === 0 && !isInfiniteLoading) {
        loadInfiniteImages();
    }
    
    // 恢复之前的滚动位置，避免跳回最近日期
    if (savedInfiniteScrollY > 0) {
        requestAnimationFrame(() => {
            window.scrollTo(0, savedInfiniteScrollY);
        });
    }
}

/**
 * 渲染筛选后的图片（目录筛选模式）
 * @param {Array} files - 图片文件数组
 */
function renderFilteredImages(files) {
    const grid = document.getElementById('infiniteImageGrid');
    const emptyState = document.getElementById('infiniteEmptyState');
    
    grid.innerHTML = '';
    
    if (files.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // 初始化懒加载观察器
    initImageLazyObserver();
    
    const fragment = document.createDocumentFragment();
    
    files.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'group relative aspect-square rounded-xl overflow-hidden cursor-pointer border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 img-skeleton hover:border-primary-300 dark:hover:border-primary-700 transition-colors duration-200';
        card.onclick = () => openPreview(index);
        
        const img = document.createElement('img');
        img.setAttribute('data-src', `/api/easy-use/files/${file.path}`);
        img.alt = file.name;
        img.className = 'lazy-image w-full h-full object-cover';
        img.loading = 'lazy';
        img.onload = function() {
            card.classList.remove('img-skeleton');
        };
        img.onerror = function() {
            if (!img.getAttribute('src')) return;
            card.classList.remove('img-skeleton');
            card.innerHTML = '<div class="w-full h-full flex items-center justify-center text-slate-400"><span class="text-xs">加载失败</span></div>';
        };
        
        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200';
        overlay.innerHTML = `
            <div class="absolute bottom-0 left-0 right-0 p-3">
                <p class="text-white text-xs truncate">${file.name}</p>
                <p class="text-white/70 text-xs">${formatFileSize(file.size)} \u00b7 ${formatDate(file.mtime)}</p>
            </div>
        `;
        
        card.appendChild(img);
        card.appendChild(overlay);
        fragment.appendChild(card);
    });
    
    grid.appendChild(fragment);
    
    // 为所有懒加载图片添加观察
    const lazyImages = grid.querySelectorAll('.lazy-image');
    lazyImages.forEach(img => {
        if (imageLazyObserver) {
            imageLazyObserver.observe(img);
        }
    });
}


// ==================== 图片懒加载 ====================

/**
 * 初始化图片懒加载观察器
 */
function initImageLazyObserver() {
    if (imageLazyObserver) {
        imageLazyObserver.disconnect();
    }
    
    imageLazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const img = entry.target;
            const card = img.parentElement;
            const realSrc = img.getAttribute('data-src');
            
            if (entry.isIntersecting) {
                if (realSrc && (!img.src || img.src !== realSrc)) {
                    img.src = realSrc;
                }
            } else {
                if (img.src && img.src !== realSrc && realSrc) {
                    img.removeAttribute('src');
                    if (card && !card.classList.contains('img-skeleton')) {
                        card.classList.add('img-skeleton');
                    }
                }
            }
        });
    }, {
        threshold: 0,
        rootMargin: '500px 0px 500px 0px'
    });
}

// ==================== 刷新 ====================

/**
 * 刷新当前视图
 */
async function refreshCurrentView() {
    if (folderFilterEnabled && currentFilterFolder) {
        await filterByFolder(currentFilterFolder);
        showToast('刷新成功');
        return;
    }
    
    await refreshInfiniteView();
    showToast('刷新成功');
}

// ==================== 预览 ====================

/**
 * 打开全屏预览（通用，用于目录筛选模式）
 * @param {number} index - 图片索引
 */
function openPreview(index) {
    currentPreviewIndex = index;
    const preview = document.getElementById('fullPreview');
    const img = document.getElementById('previewImg');
    const file = currentImages[index];
    
    if (!file) return;
    
    img.src = file.fullPath;
    preview.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    updateNavButtons();
    
    currentImageExtraInfo = {
        folder: extractFolderFromPath(file.path),
        time: formatPopupTime(file.mtime)
    };
    
    preloadImageInfo(file.fullPath);
    preloadWorkflowInfo(file.fullPath);
}

/**
 * 关闭预览
 */
function closePreview() {
    const preview = document.getElementById('fullPreview');
    preview.classList.add('hidden');
    document.getElementById('previewImg').src = '';
    closeInfoPopup();
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
        await preloadImageInfo(currentImages[currentPreviewIndex].fullPath);
        await preloadWorkflowInfo(currentImages[currentPreviewIndex].fullPath);
        if (isInfoPopupOpen) {
            resetPopupInfo();
            const file = currentImages[currentPreviewIndex];
            if (file) {
                currentImageExtraInfo = {
                    folder: extractFolderFromPath(file.path),
                    time: formatPopupTime(file.mtime)
                };
            }
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
        if (!folderFilterEnabled && hasMoreInfiniteImages && !isInfiniteLoading) {
            console.log('[预览] 到达当前队列末尾，加载更多图片...');
            await loadInfiniteImages();
        }
    }
    
    if (currentPreviewIndex < currentImages.length - 1) {
        currentPreviewIndex++;
        document.getElementById('previewImg').src = currentImages[currentPreviewIndex].fullPath;
        updateNavButtons();
        await preloadImageInfo(currentImages[currentPreviewIndex].fullPath);
        await preloadWorkflowInfo(currentImages[currentPreviewIndex].fullPath);
        if (isInfoPopupOpen) {
            resetPopupInfo();
            const file = currentImages[currentPreviewIndex];
            if (file) {
                currentImageExtraInfo = {
                    folder: extractFolderFromPath(file.path),
                    time: formatPopupTime(file.mtime)
                };
            }
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
    
    const isLastImage = currentPreviewIndex === currentImages.length - 1;
    const canLoadMore = !folderFilterEnabled && hasMoreInfiniteImages;
    
    if (isLastImage && canLoadMore) {
        nextBtn.style.opacity = '0.7';
        nextBtn.style.cursor = 'pointer';
    } else {
        nextBtn.style.opacity = isLastImage ? '0.3' : '0.7';
        nextBtn.style.cursor = isLastImage ? 'not-allowed' : 'pointer';
    }
}

// ==================== 模型封面 ====================

/**
 * 将当前图片设为模型封面
 */
async function setAsModelCover() {
    const file = currentImages[currentPreviewIndex];
    if (!file) {
        showToast('未找到当前图片', 'error');
        return;
    }

    if (!currentPromptInfo || !currentPromptInfo.model || currentPromptInfo.model === '-') {
        try {
            await parseImageInfo(file.fullPath);
        } catch (e) {
            console.error('预加载图片信息失败:', e);
        }
    }

    if (!currentPromptInfo || !currentPromptInfo.model || currentPromptInfo.model === '-') {
        showToast('未能获取该图片使用的模型信息', 'error');
        return;
    }
    
    const modelName = currentPromptInfo.model;
    
    try {
        const response = await fetch('/api/set-model-cover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourcePath: `easy-use/${file.path}`,
                modelName: modelName
            })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            showToast(`已设为封面: ${data.coverName}`);
        } else {
            showToast(data.error || '设置封面失败', 'error');
        }
    } catch (error) {
        console.error('设置封面失败:', error);
        showToast('设置封面失败', 'error');
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
        const promptData = extractPromptFromPNG(uint8Array);
        
        if (promptData) {
            currentPromptInfo = promptData;
        }
    } catch (error) {
        console.error('预加载图片信息失败:', error);
    }
}

/**
 * 预加载图片工作流（不显示）
 * @param {string} imageUrl - 图片 URL
 */
async function preloadWorkflowInfo(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const promptData = extractPromptFromPNG(uint8Array);
        
        if (promptData && promptData._raw) {
            currentWorkflowText = promptData._raw;
        }
    } catch (error) {
        console.error('预加载工作流失败:', error);
    }
}

// ==================== 信息弹窗 ====================

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
    
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        content.classList.add('show');
    }, 10);
    
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
    document.getElementById('popupInfoSampler').textContent = info.sampler;
    document.getElementById('popupInfoScheduler').textContent = info.scheduler;
    document.getElementById('popupInfoSteps').textContent = info.steps;
    document.getElementById('popupInfoCfg').textContent = info.cfg;
    
    let displayVae = info.vae;
    if (config && config.vae_models && info.vae && info.vae !== '-') {
        const vaeItem = config.vae_models.find(v => v.value === info.vae);
        if (vaeItem) displayVae = vaeItem.text;
    }
    document.getElementById('popupInfoVae').textContent = displayVae;
    document.getElementById('popupInfoVae').title = info.vae;

    let displayModel = info.model;
    if (config && config.diffusion_models && info.model && info.model !== '-') {
        const modelItem = config.diffusion_models.find(m => m.value === info.model);
        if (modelItem) displayModel = modelItem.text;
    }
    document.getElementById('popupInfoModel').textContent = displayModel;
    document.getElementById('popupInfoModel').title = info.model;
    document.getElementById('popupInfoSeed').textContent = info.seed;
    document.getElementById('popupInfoSeed').title = info.seed;
    document.getElementById('popupInfoPrompt').textContent = info.prompt || '无提示词';
    
    document.getElementById('popupInfoFolder').textContent = currentImageExtraInfo.folder;
    document.getElementById('popupInfoFolder').title = currentImageExtraInfo.folder;
    document.getElementById('popupInfoTime').textContent = currentImageExtraInfo.time;
}

/**
 * 显示无信息状态
 */
function showEmptyPopupInfo() {
    document.getElementById('popupInfoLoading').classList.add('hidden');
    document.getElementById('popupInfoContent').classList.add('hidden');
    document.getElementById('popupInfoEmpty').classList.remove('hidden');
    document.getElementById('popupInfoFolder').textContent = currentImageExtraInfo.folder;
    document.getElementById('popupInfoTime').textContent = currentImageExtraInfo.time;
}

// ==================== 复制 ====================

/**
 * 复制文本到剪贴板（兼容移动端）
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 是否复制成功
 */
async function copyToClipboard(text) {
    if (!text) return false;

    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.log('Clipboard API 失败，尝试降级方案:', err);
        }
    }

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
 * 复制当前图片的 ComfyUI 工作流到剪贴板
 */
async function copyWorkflow() {
    if (currentWorkflowText) {
        const success = await copyToClipboard(currentWorkflowText);
        if (success) {
            showToast('工作流已复制');
        } else {
            showToast('复制失败，请手动复制', 'error');
        }
    } else {
        showToast('未能提取到工作流', 'error');
    }
}

// ==================== 加载状态 ====================

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

// ==================== Toast ====================

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
    
    if (type === 'error') {
        toastIcon.innerHTML = `<svg class="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
        toastIcon.className = 'w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0';
    } else {
        toastIcon.innerHTML = `<svg class="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
        toastIcon.className = 'w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0';
    }
    
    toast.classList.remove('translate-x-full', 'opacity-0');
    toast.classList.add('translate-x-0', 'opacity-100');
    
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        toast.classList.remove('translate-x-0', 'opacity-100');
    }, 3000);
}

// ==================== 格式化 ====================

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

/**
 * 格式化时间用于 popup 显示
 * @param {number|string} input - 时间戳（秒）或 ISO 日期字符串
 * @returns {string}
 */
function formatPopupTime(input) {
    if (!input || input === '-') return '-';
    let date;
    if (typeof input === 'number') {
        date = new Date(input * 1000);
    } else {
        date = new Date(input);
    }
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(/\//g, '-');
}

/**
 * 从路径提取所在目录（往上最近一级）
 * @param {string} path - 文件路径
 * @returns {string}
 */
function extractFolderFromPath(path) {
    if (!path) return '-';
    const parts = path.split('/').filter(p => p);
    return parts.length > 1 ? parts[parts.length - 2] : '-';
}

// ==================== 键盘快捷键 ====================

document.addEventListener('keydown', (e) => {
    const preview = document.getElementById('fullPreview');
    if (preview.classList.contains('hidden')) return;
    
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
                    const file = currentImages[currentPreviewIndex];
                    if (file) {
                        currentImageExtraInfo = {
                            folder: extractFolderFromPath(file.path),
                            time: formatPopupTime(file.mtime)
                        };
                    }
                    parseImageInfo(currentImages[currentPreviewIndex].fullPath);
                }
            }
            break;
        case 'ArrowRight':
            nextImage(null);
            break;
        case 'i':
        case 'I':
            toggleInfoPopup();
            break;
    }
});


// ==================== 无限浏览模式 ====================

/**
 * 初始化无限滚动
 */
function initInfiniteScroll() {
    const trigger = document.getElementById('infiniteScrollTrigger');
    if (!trigger) return;
    
    infiniteScrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isInfiniteLoading && hasMoreInfiniteImages && !folderFilterEnabled) {
                loadInfiniteImages();
            }
        });
    }, {
        rootMargin: '100px'
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
        
        if (deltaY > 0) {
            content.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: true });
    
    content.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        
        const deltaY = currentY - startY;
        content.style.transition = 'transform 0.3s ease';
        
        if (deltaY > 100) {
            closeMobileDateNav();
            setTimeout(() => {
                content.style.transform = '';
            }, 300);
        } else {
            content.style.transform = '';
        }
        
        startY = 0;
        currentY = 0;
    });
}

/**
 * 从路径中提取日期
 * @param {string} path - 图片路径
 * @returns {string} 日期字符串
 */
function extractDateFromPath(path) {
    if (!path) return '';
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
        dateGroups = (data.dates || []).map((item) => ({
            date: item.date,
            count: item.count,
            startIndex: -1
        }));
        
        updateDateGroupStartIndices();
        
        // 只有在非目录筛选模式下才渲染日期导航
        if (!folderFilterEnabled) {
            renderDateNav();
        }
    } catch (error) {
        console.error('[日期导航] 加载日期列表失败:', error);
    }
}

/**
 * 更新日期分组的起始索引
 */
function updateDateGroupStartIndices() {
    if (dateGroups.length === 0 || infiniteImages.length === 0) return;
    
    dateGroups.forEach(group => {
        group.startIndex = -1;
    });
    
    for (let i = 0; i < infiniteImages.length; i++) {
        const date = extractDateFromPath(infiniteImages[i].path);
        if (!date) continue;
        
        const group = dateGroups.find(g => g.date === date);
        if (group && group.startIndex === -1) {
            group.startIndex = baseOffset + i;
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
        document.body.style.overflow = 'hidden';
    }
}

/**
 * 关闭移动端日期导航弹窗
 */
function closeMobileDateNav() {
    const modal = document.getElementById('mobileDateNavModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

/**
 * 格式化日期用于导航显示
 * @param {string} dateStr - 日期字符串
 * @returns {string}
 */
function formatDateForNav(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateStr === today.toISOString().split('T')[0]) {
        return '今天';
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
        return '昨天';
    }
    
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 跳转到指定日期的图片
 * @param {string} date - 日期字符串
 */
async function jumpToDate(date) {
    if (isInfiniteLoading) {
        const start = Date.now();
        while (isInfiniteLoading && Date.now() - start < 5000) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (isInfiniteLoading) {
            showToast('正在加载中，请稍后再试', 'error');
            return;
        }
    }

    const group = dateGroups.find(g => g.date === date);
    if (!group) {
        console.warn(`[跳转] 未找到日期 ${date} 的导航分组`);
        return;
    }

    let targetIndex = group.startIndex;

    if (targetIndex === -1) {
        console.log(`[跳转] 日期 ${date} 尚未加载，正在获取偏移量...`);
        try {
            const response = await fetch(`/api/date-offset?date=${date}`);
            if (!response.ok) throw new Error('获取偏移量失败');

            const data = await response.json();
            targetIndex = data.offset;

            if (targetIndex < 0) {
                showToast('该日期暂无图片', 'error');
                return;
            }

            group.startIndex = targetIndex;
        } catch (error) {
            console.error('[跳转] 获取日期偏移量失败:', error);
            showToast('跳转到日期失败', 'error');
            return;
        }
    }

    const grid = document.getElementById('infiniteImageGrid');
    const isInCurrentRange = targetIndex >= baseOffset && targetIndex < baseOffset + infiniteOffset;

    if (isInCurrentRange && grid.children[targetIndex - baseOffset]) {
        const relativeIndex = targetIndex - baseOffset;
        const targetElement = grid.children[relativeIndex];

        const imgInCard = targetElement.querySelector('img');
        const imgSrc = imgInCard ? (imgInCard.getAttribute('data-src') || imgInCard.src) : '';
        const actualDate = extractDateFromPath(imgSrc);
        if (actualDate !== date) {
            console.warn(`[跳转] 快速路径验证失败：期望 ${date}，实际 ${actualDate}，改用 API 加载`);
            targetIndex = -1;
            group.startIndex = -1;
            return jumpToDate(date);
        }

        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        targetElement.classList.add('ring-2', 'ring-primary-500');
        setTimeout(() => {
            targetElement.classList.remove('ring-2', 'ring-primary-500');
        }, 2000);

        return;
    }

    const buffer = Math.floor(infiniteLimit * 0.8);
    const newBaseOffset = Math.max(0, targetIndex - buffer);
    console.log(`[跳转] 从偏移量 ${newBaseOffset} 加载，目标在相对索引 ${targetIndex - newBaseOffset}...`);

    infiniteImages = [];
    infiniteOffset = 0;
    baseOffset = newBaseOffset;
    hasMoreInfiniteImages = true;
    dateGroups.forEach(g => g.startIndex = -1);

    grid.innerHTML = '';
    document.getElementById('infiniteEndMessage').classList.add('hidden');

    await loadInfiniteImages();

    const targetRelativeIndex = targetIndex - newBaseOffset;
    const targetElement = grid.children[targetRelativeIndex];
    if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        targetElement.classList.add('ring-2', 'ring-primary-500');
        setTimeout(() => {
            targetElement.classList.remove('ring-2', 'ring-primary-500');
        }, 2000);
        showToast(`已跳转到 ${formatDateForNav(date)}`, 'success');
    } else if (grid.children[0]) {
        grid.children[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * 加载图片直到指定索引
 * @param {number} targetIndex - 目标索引
 * @returns {number}
 */
async function loadUntilIndex(targetIndex) {
    console.log(`[加载] 目标索引: ${targetIndex}, 当前已加载: ${baseOffset + infiniteOffset}`);
    
    if (targetIndex >= baseOffset && targetIndex < baseOffset + infiniteOffset) {
        return targetIndex - baseOffset;
    }
    
    if (!hasMoreInfiniteImages) {
        return -1;
    }
    
    while (targetIndex >= baseOffset + infiniteOffset && hasMoreInfiniteImages) {
        await loadInfiniteImages();
    }
    
    updateDateGroupStartIndices();
    
    return targetIndex < baseOffset + infiniteOffset ? targetIndex - baseOffset : -1;
}

/**
 * 更新当前激活的日期导航项
 */
function updateActiveDateNav() {
    if (dateGroups.length === 0 || folderFilterEnabled) return;
    
    const grid = document.getElementById('infiniteImageGrid');
    if (!grid || grid.children.length === 0) return;
    
    const gridStyle = window.getComputedStyle(grid);
    const colCount = gridStyle.gridTemplateColumns.split(' ').filter(c => c && c !== '0px').length || 2;
    const gap = parseInt(gridStyle.gap) || 16;
    const itemHeight = grid.clientWidth / colCount;
    const rowHeight = itemHeight + gap;
    
    const scrollTop = window.scrollY - grid.offsetTop + 120;
    const rowIndex = Math.max(0, Math.floor(scrollTop / rowHeight));
    const visibleIndex = Math.min(rowIndex * colCount, infiniteImages.length - 1);
    
    const realIndex = baseOffset + visibleIndex;
    const group = dateGroups.find(g => realIndex >= g.startIndex && (g.startIndex === -1 || realIndex < g.startIndex + g.count));
    if (group && group.startIndex !== -1) {
        document.querySelectorAll('#infiniteDateNav button').forEach(btn => {
            btn.classList.remove('date-nav-active');
            if (btn.getAttribute('onclick').includes(`'${group.date}'`)) {
                btn.classList.add('date-nav-active');
            }
        });
    }
}

// 滚动监听
let scrollThrottleTimer = null;
window.addEventListener('scroll', () => {
    if (scrollThrottleTimer) return;
    scrollThrottleTimer = setTimeout(() => {
        updateActiveDateNav();
        
        if (!folderFilterEnabled && window.scrollY < 500 && baseOffset > 0 && !isInfiniteLoading) {
            loadPreviousImages();
        }
        
        scrollThrottleTimer = null;
    }, 300);
}, { passive: true });

/**
 * 加载无限浏览图片
 */
async function loadInfiniteImages() {
    if (isInfiniteLoading || !hasMoreInfiniteImages) return;
    
    isInfiniteLoading = true;
    showInfiniteLoading(true);
    
    try {
        const response = await fetch(`/api/infinite-images?limit=${infiniteLimit}&offset=${baseOffset + infiniteOffset}`);
        if (!response.ok) throw new Error('获取图片列表失败');
        
        const data = await response.json();
        const newImages = data.files || [];
        
        if (newImages.length > 0) {
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
            
            // 只有在非目录筛选模式下才渲染
            if (!folderFilterEnabled) {
                renderInfiniteImages(formattedImages, infiniteImages.length === newImages.length);
            }
            
            if (infiniteImages.length === newImages.length) {
                loadDateNav();
            }
            
            if (infiniteTotalCount === 0) {
                updateInfiniteTotalCount();
            }
            
            updateDateGroupStartIndices();
        } else {
            hasMoreInfiniteImages = false;
            showInfiniteEndMessage();
        }
        
        if (infiniteImages.length === 0 && newImages.length === 0) {
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
 * 向上加载无限浏览图片
 */
async function loadPreviousImages() {
    if (isInfiniteLoading || baseOffset === 0) return;
    
    isInfiniteLoading = true;
    
    const grid = document.getElementById('infiniteImageGrid');
    let oldFirstChild = null;
    let oldRectTop = 0;
    if (grid && grid.firstElementChild) {
        oldFirstChild = grid.firstElementChild;
        oldRectTop = oldFirstChild.getBoundingClientRect().top;
    }
    
    try {
        const newBaseOffset = Math.max(0, baseOffset - infiniteLimit);
        const limit = baseOffset - newBaseOffset;
        
        const response = await fetch(`/api/infinite-images?limit=${limit}&offset=${newBaseOffset}`);
        if (!response.ok) throw new Error('获取图片列表失败');
        
        const data = await response.json();
        const newImages = data.files || [];
        
        if (newImages.length > 0) {
            const formattedImages = newImages.map(img => ({
                name: img.name,
                path: img.path,
                fullPath: img.fullPath,
                size: img.size,
                mtime: img.mtime
            }));
            
            infiniteImages.unshift(...formattedImages);
            baseOffset = newBaseOffset;
            infiniteOffset = infiniteImages.length;
            
            // 只有在非目录筛选模式下才渲染
            if (!folderFilterEnabled) {
                renderInfiniteImagesAtTop(formattedImages);
            }
            
            if (oldFirstChild) {
                const newRectTop = oldFirstChild.getBoundingClientRect().top;
                window.scrollBy(0, newRectTop - oldRectTop);
            }
            
            updateDateGroupStartIndices();
        }
        
    } catch (error) {
        console.error('[无限浏览] 向上加载失败:', error);
        showToast('加载更早图片失败', 'error');
    } finally {
        isInfiniteLoading = false;
    }
}

/**
 * 在 DOM 开头渲染无限浏览图片（用于向上加载）
 * @param {Array} images - 图片数组
 */
function renderInfiniteImagesAtTop(images) {
    const grid = document.getElementById('infiniteImageGrid');
    
    const fragment = document.createDocumentFragment();
    
    images.forEach((file, index) => {
        const relativeIndex = index;
        
        const card = document.createElement('div');
        card.className = 'group relative aspect-square rounded-xl overflow-hidden cursor-pointer border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 img-skeleton hover:border-primary-300 dark:hover:border-primary-700 transition-colors duration-200';
        card.onclick = () => openInfinitePreview(relativeIndex);
        
        const img = document.createElement('img');
        img.setAttribute('data-src', file.fullPath);
        img.alt = file.name;
        img.className = 'lazy-image w-full h-full object-cover';
        img.loading = 'lazy';
        img.onload = function() {
            card.classList.remove('img-skeleton');
        };
        img.onerror = function() {
            if (!img.getAttribute('src')) return;
            card.classList.remove('img-skeleton');
            card.innerHTML = '<div class="w-full h-full flex items-center justify-center text-slate-400"><span class="text-xs">加载失败</span></div>';
        };
        
        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200';
        overlay.innerHTML = `
            <div class="absolute bottom-0 left-0 right-0 p-3">
                <p class="text-white text-xs truncate">${file.name}</p>
                <p class="text-white/70 text-xs">${formatFileSize(file.size)} \u00b7 ${formatDate(file.mtime)}</p>
            </div>
        `;
        
        card.appendChild(img);
        card.appendChild(overlay);
        fragment.appendChild(card);
    });
    
    grid.insertBefore(fragment, grid.firstChild);
    
    // 更新所有已有 DOM 元素的 onclick 索引
    const existingCards = Array.from(grid.children).slice(images.length);
    existingCards.forEach((card, i) => {
        const newIndex = images.length + i;
        card.onclick = () => openInfinitePreview(newIndex);
    });
    
    // 为新添加的图片添加懒加载观察
    const newCards = Array.from(grid.children).slice(0, images.length);
    newCards.forEach(card => {
        const img = card.querySelector('.lazy-image');
        if (img && imageLazyObserver) {
            imageLazyObserver.observe(img);
        }
    });
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
        initImageLazyObserver();
    }
    
    const fragment = document.createDocumentFragment();
    
    images.forEach((file, index) => {
        const relativeIndex = infiniteImages.length - images.length + index;
        
        const card = document.createElement('div');
        card.className = 'group relative aspect-square rounded-xl overflow-hidden cursor-pointer border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 img-skeleton hover:border-primary-300 dark:hover:border-primary-700 transition-colors duration-200';
        card.onclick = () => openInfinitePreview(relativeIndex);
        
        const img = document.createElement('img');
        img.setAttribute('data-src', file.fullPath);
        img.alt = file.name;
        img.className = 'lazy-image w-full h-full object-cover';
        img.loading = 'lazy';
        img.onload = function() {
            card.classList.remove('img-skeleton');
        };
        img.onerror = function() {
            if (!img.getAttribute('src')) return;
            card.classList.remove('img-skeleton');
            card.innerHTML = '<div class="w-full h-full flex items-center justify-center text-slate-400"><span class="text-xs">加载失败</span></div>';
        };
        
        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200';
        overlay.innerHTML = `
            <div class="absolute bottom-0 left-0 right-0 p-3">
                <p class="text-white text-xs truncate">${file.name}</p>
                <p class="text-white/70 text-xs">${formatFileSize(file.size)} \u00b7 ${formatDate(file.mtime)}</p>
            </div>
        `;
        
        card.appendChild(img);
        card.appendChild(overlay);
        fragment.appendChild(card);
    });
    
    grid.appendChild(fragment);
    
    const newLazyImages = grid.querySelectorAll('.lazy-image');
    newLazyImages.forEach(img => {
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
async function openInfinitePreview(index) {
    if (index < 0 || index >= infiniteImages.length) {
        console.error(`[预览] 索引 ${index} 超出范围 (0-${infiniteImages.length - 1})`);
        return;
    }
    
    currentPreviewIndex = index;
    const preview = document.getElementById('fullPreview');
    const img = document.getElementById('previewImg');
    const file = infiniteImages[index];
    
    currentImages = infiniteImages;
    
    img.src = file.fullPath;
    preview.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    updateNavButtons();
    
    currentImageExtraInfo = {
        folder: extractFolderFromPath(file.path),
        time: formatPopupTime(file.mtime)
    };
    
    await preloadImageInfo(file.fullPath);
    await preloadWorkflowInfo(file.fullPath);
}

/**
 * 刷新无限浏览数据
 */
async function refreshInfiniteView() {
    infiniteImages = [];
    infiniteOffset = 0;
    baseOffset = 0;
    hasMoreInfiniteImages = true;
    infiniteTotalCount = 0;
    dateGroups = [];
    
    document.getElementById('infiniteImageGrid').innerHTML = '';
    document.getElementById('infiniteDateNav').innerHTML = '';
    document.getElementById('infiniteEndMessage').classList.add('hidden');
    
    await loadInfiniteImages();
    
    fetch('/api/scan-images', { method: 'POST' }).catch(() => {});
}
