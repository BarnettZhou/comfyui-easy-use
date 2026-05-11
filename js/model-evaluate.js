// ==================== 全局状态 ====================
let isEvaluating = false;
let shouldStop = false;
let selectedModels = new Set();
let modelViewMode = 'cover'; // 'cover' | 'tag'
let modelCoverSet = new Set();
let currentResults = []; // { modelValue, modelText, images: [{url, folder, time, filename}] }
let currentPreviewUrl = null;
let currentPreviewImageData = null;
let currentPromptInfo = null;
let isInfoPopupOpen = false;
let socket = null;
let hideProgressTimer = null;

// ==================== 初始化 ====================

async function initEvaluate() {
    await initServerConfig();
    await initOriginalWorkflow();
    initFormOptions();
    await loadModelCovers();
    renderModelCards();
    setupWebSocket();
}

async function loadModelCovers() {
    try {
        const res = await fetch('/api/model-covers');
        if (res.ok) {
            const data = await res.json();
            modelCoverSet = new Set(data.covers || []);
        }
    } catch (e) {
        console.error('获取封面列表失败:', e);
    }
}

async function initOriginalWorkflow() {
    try {
        const workflowResponse = await fetch('../original_workflow.json');
        originalWorkflow = await workflowResponse.json();
    } catch (error) {
        console.error('加载原始工作流失败:', error);
        showToast('加载原始工作流失败');
    }
}

function initFormOptions() {
    // VAE
    const vaeSelect = document.getElementById('vaeSelect');
    vaeSelect.innerHTML = '';
    config.vae_models.forEach(vae => {
        const option = document.createElement('option');
        option.value = typeof vae === 'string' ? vae : vae.value;
        option.textContent = typeof vae === 'string' ? vae : vae.text;
        vaeSelect.appendChild(option);
    });

    // 采样器
    const samplerSelect = document.getElementById('samplerSelect');
    samplerSelect.innerHTML = '';
    config.sampler_options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        samplerSelect.appendChild(option);
    });
}

// ==================== 模型卡片 ====================

function renderModelCards() {
    const container = document.getElementById('modelCardsContainer');
    container.innerHTML = '';

    // 根据模式调整容器样式
    if (modelViewMode === 'tag') {
        container.className = 'px-5 sm:px-6 py-5 flex flex-wrap gap-2';
    } else {
        container.className = 'px-5 sm:px-6 py-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4';
    }

    if (!config || !config.diffusion_models) return;

    config.diffusion_models.forEach(model => {
        const modelValue = typeof model === 'string' ? model : model.value;
        const modelText = typeof model === 'string' ? model : model.text;

        // 默认选中（仅在首次渲染时填充）
        if (!container.dataset.rendered) {
            selectedModels.add(modelValue);
        }

        if (modelViewMode === 'tag') {
            container.appendChild(createTagCard(modelValue, modelText));
        } else {
            container.appendChild(createCoverCard(modelValue, modelText));
        }
    });

    container.dataset.rendered = 'true';
}

function createCoverCard(modelValue, modelText) {
    const selected = selectedModels.has(modelValue);

    const card = document.createElement('div');
    card.className = `model-card relative rounded-xl overflow-hidden border-2 ${selected ? 'border-primary-500' : 'border-transparent'} bg-white dark:bg-slate-700 shadow-sm`;
    card.dataset.model = modelValue;
    card.onclick = () => toggleModelSelection(card, modelValue);

    // 选中标记
    const checkMark = document.createElement('div');
    checkMark.className = `absolute top-2 right-2 z-10 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center ${selected ? '' : 'hidden'}`;
    checkMark.innerHTML = `
        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
    `;
    card.appendChild(checkMark);

    // 封面区域
    const imgContainer = document.createElement('div');
    imgContainer.className = 'aspect-[3/4] bg-slate-100 dark:bg-slate-800 flex items-center justify-center';

    const coverBaseName = modelValue.replace(/\.safetensors$/i, '');
    const hasCover = modelCoverSet.has(coverBaseName);

    if (hasCover) {
        const coverUrl = `../model-covers/${encodeURIComponent(coverBaseName)}.png`;
        const img = document.createElement('img');
        img.src = coverUrl;
        img.loading = 'lazy';
        img.className = 'w-full h-full object-cover';
        imgContainer.appendChild(img);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'flex flex-col items-center justify-center text-slate-400 dark:text-slate-500';
        placeholder.innerHTML = `
            <svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            <span class="text-xs">暂无封面</span>
        `;
        imgContainer.appendChild(placeholder);
    }
    card.appendChild(imgContainer);

    // 名称
    const nameLabel = document.createElement('div');
    nameLabel.className = 'px-2 py-2 text-xs text-slate-700 dark:text-slate-300 text-center truncate font-medium';
    nameLabel.textContent = modelText;
    card.appendChild(nameLabel);

    return card;
}

function createTagCard(modelValue, modelText) {
    const selected = selectedModels.has(modelValue);

    const tag = document.createElement('div');
    tag.className = `model-card cursor-pointer select-none px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selected ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-500 text-primary-700 dark:text-primary-400' : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`;
    tag.dataset.model = modelValue;
    tag.onclick = () => toggleModelSelection(tag, modelValue);

    const inner = document.createElement('span');
    inner.className = 'flex items-center gap-1.5';
    inner.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full ${selected ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-500'}"></span>
        <span>${modelText}</span>
    `;
    tag.appendChild(inner);

    return tag;
}

function toggleModelSelection(card, modelValue) {
    const selected = !selectedModels.has(modelValue);
    if (selected) {
        selectedModels.add(modelValue);
    } else {
        selectedModels.delete(modelValue);
    }
    updateModelCardVisual(card, selected);
}

function updateModelCardVisual(card, selected) {
    if (modelViewMode === 'tag') {
        if (selected) {
            card.className = 'model-card cursor-pointer select-none px-3 py-1.5 rounded-full text-xs font-medium border transition-all bg-primary-100 dark:bg-primary-900/30 border-primary-500 text-primary-700 dark:text-primary-400';
            card.querySelector('.w-1\.5').className = 'w-1.5 h-1.5 rounded-full bg-primary-500';
        } else {
            card.className = 'model-card cursor-pointer select-none px-3 py-1.5 rounded-full text-xs font-medium border transition-all bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600';
            card.querySelector('.w-1\.5').className = 'w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-500';
        }
    } else {
        if (selected) {
            card.classList.remove('border-transparent');
            card.classList.add('border-primary-500');
            const mark = card.querySelector('.absolute.top-2');
            if (mark) mark.classList.remove('hidden');
        } else {
            card.classList.remove('border-primary-500');
            card.classList.add('border-transparent');
            const mark = card.querySelector('.absolute.top-2');
            if (mark) mark.classList.add('hidden');
        }
    }
}

function selectAllModels(select) {
    const cards = document.querySelectorAll('.model-card');
    cards.forEach(card => {
        const modelValue = card.dataset.model;
        if (select) {
            selectedModels.add(modelValue);
        } else {
            selectedModels.delete(modelValue);
        }
        updateModelCardVisual(card, select);
    });
}

function switchModelView(mode) {
    if (modelViewMode === mode) return;
    modelViewMode = mode;

    // 更新按钮样式
    const coverBtn = document.getElementById('viewModeCover');
    const tagBtn = document.getElementById('viewModeTag');

    if (mode === 'cover') {
        coverBtn.className = 'p-1.5 rounded-md bg-white dark:bg-slate-600 shadow-sm transition-all';
        coverBtn.querySelector('svg').className = 'w-4 h-4 text-primary-600 dark:text-primary-400';
        tagBtn.className = 'p-1.5 rounded-md transition-all';
        tagBtn.querySelector('svg').className = 'w-4 h-4 text-slate-400 dark:text-slate-500';
    } else {
        coverBtn.className = 'p-1.5 rounded-md transition-all';
        coverBtn.querySelector('svg').className = 'w-4 h-4 text-slate-400 dark:text-slate-500';
        tagBtn.className = 'p-1.5 rounded-md bg-white dark:bg-slate-600 shadow-sm transition-all';
        tagBtn.querySelector('svg').className = 'w-4 h-4 text-primary-600 dark:text-primary-400';
    }

    // 重新渲染
    renderModelCards();
}

// ==================== 表单控制 ====================

function setBatchCount(count) {
    document.getElementById('batchCount').value = count;
    document.querySelectorAll('.batch-btn').forEach(btn => {
        const btnCount = parseInt(btn.dataset.batch);
        if (btnCount === count) {
            btn.classList.remove('bg-slate-100', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-200', 'dark:hover:bg-slate-600');
            btn.classList.add('bg-primary-600', 'text-white');
        } else {
            btn.classList.add('bg-slate-100', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-200', 'dark:hover:bg-slate-600');
            btn.classList.remove('bg-primary-600', 'text-white');
        }
    });
}

function togglePromptHeight() {
    const textarea = document.getElementById('promptText');
    const toggleBtn = document.getElementById('promptToggleBtn');

    if (textarea.style.height === '400px') {
        textarea.style.height = '';
        textarea.setAttribute('rows', '3');
        toggleBtn.innerHTML = `
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
            </svg>
            <span>放大</span>
        `;
    } else {
        textarea.style.height = '400px';
        toggleBtn.innerHTML = `
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
            </svg>
            <span>缩小</span>
        `;
    }
}

// ==================== WebSocket 进度监听 ====================

function setupWebSocket() {
    const wsUrl = COMFYUI_SERVER.replace('http', 'ws') + '/ws?clientId=easy_eval_client';
    socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
            const msg = JSON.parse(event.data);

            if (msg.type === 'progress') {
                const { value, max } = msg.data;
                const percent = Math.round((value / max) * 100) + '%';
                document.getElementById('progressBar').style.width = percent;
                document.getElementById('progressText').innerText = percent;
            }

            if (msg.type === 'execution_start') {
                resetProgress();
            }

            if (msg.type === 'executing' && msg.data.node === null) {
                if (isEvaluating) return;
                if (hideProgressTimer) clearTimeout(hideProgressTimer);
                hideProgressTimer = setTimeout(() => {
                    document.getElementById('progressContainer').classList.add('hidden');
                }, 2000);
            }
        }
    };

    socket.onclose = () => setTimeout(setupWebSocket, 5000);
}

function resetProgress() {
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressText').innerText = '0%';
}

// ==================== 主生成逻辑 ====================

async function startEvaluation() {
    if (isEvaluating) return;

    // 验证
    const promptText = document.getElementById('promptText').value;
    if (!promptText.trim()) {
        showToast('请输入提示词后再生成');
        return;
    }

    if (selectedModels.size === 0) {
        showToast('请至少选择一个模型');
        return;
    }

    if (!originalWorkflow) {
        showToast('工作流未加载，请刷新页面');
        return;
    }

    isEvaluating = true;
    shouldStop = false;
    currentResults = [];

    // 清除之前可能存在的隐藏进度条定时器
    if (hideProgressTimer) {
        clearTimeout(hideProgressTimer);
        hideProgressTimer = null;
    }

    // 显示进度条
    document.getElementById('progressContainer').classList.remove('hidden');
    document.getElementById('cancelSection').classList.remove('hidden');
    document.getElementById('resultContainer').innerHTML = '';
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.classList.remove('hidden');
    resetProgress();

    const btn = document.getElementById('evaluateBtn');
    btn.disabled = true;
    btn.innerHTML = `
        <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>测评中...</span>
    `;

    const selectedModelsList = Array.from(selectedModels);
    const batchCount = parseInt(document.getElementById('batchCount').value);
    const vae = document.getElementById('vaeSelect').value;
    const [sampler, scheduler] = document.getElementById('samplerSelect').value.split(',');
    const [w, h] = document.getElementById('sizeSelect').value.split(',').map(Number);
    const steps = parseInt(document.getElementById('stepsSelect').value);
    const dateStr = new Date().toISOString().split('T')[0];

    // 记录任务参数
    const taskParams = {
        prompt: promptText,
        vae: vae,
        sampler: sampler,
        scheduler: scheduler,
        size: `${w}x${h}`,
        steps: steps,
        batchCount: batchCount
    };

    try {
        for (let mi = 0; mi < selectedModelsList.length; mi++) {
            if (shouldStop) break;

            const modelValue = selectedModelsList[mi];
            const modelItem = config.diffusion_models.find(m => (typeof m === 'string' ? m : m.value) === modelValue);
            const modelText = modelItem ? (typeof modelItem === 'string' ? modelItem : modelItem.text) : modelValue;

            // 初始化该模型的结果数组
            const modelResult = {
                modelValue: modelValue,
                modelText: modelText,
                images: []
            };
            currentResults.push(modelResult);

            // 渲染该模型的结果分组（占位）
            renderModelResultGroup(modelResult, true);

            // 更新进度显示
            document.getElementById('progressModelText').textContent = modelText;
            document.getElementById('progressModelIndex').textContent = `模型 ${mi + 1} / ${selectedModelsList.length}`;

            let seed = Math.floor(Math.random() * 1000000000000);

            for (let bi = 0; bi < batchCount; bi++) {
                if (shouldStop) break;

                document.getElementById('progressTaskIndex').textContent = `任务 ${bi + 1} / ${batchCount}`;

                // 构建工作流
                const p = JSON.parse(JSON.stringify(originalWorkflow));

                // 基础参数
                p['6'].inputs.text = promptText;
                p['5'].inputs.width = w;
                p['5'].inputs.height = h;
                p['3'].inputs.seed = seed;
                p['3'].inputs.sampler_name = sampler;
                p['3'].inputs.scheduler = scheduler;
                p['3'].inputs.steps = steps;
                p['3'].inputs.cfg = 1;

                // 模型和VAE
                p['34'].inputs.unet_name = modelValue;
                p['32'].inputs.vae_name = vae;

                // 删除放大相关节点
                delete p['38'];
                delete p['39'];
                delete p['40'];
                delete p['42'];

                // 删除LoRA
                delete p['44'];
                p['25'].inputs.shift = 3;
                p['25'].inputs.model = ['34', 0];

                // 文件前缀：model-evaluate/%date%/%model_name%/zit
                const prefix = `model-evaluate/${dateStr}/${modelValue.replace(/\.safetensors$/i, '')}/zit`;
                p['9'].inputs.filename_prefix = prefix;

                // 发送任务
                const res = await fetch(`${COMFYUI_SERVER}/prompt`, {
                    method: 'POST',
                    body: JSON.stringify({ prompt: p })
                });
                const data = await res.json();

                // 跟踪任务并获取图片
                const imageInfo = await trackTask(data.prompt_id);
                if (imageInfo) {
                    modelResult.images.push(imageInfo);
                    appendImageToGroup(modelResult, imageInfo);
                    updateResultCount();
                }

                seed += 1;
            }
        }

        // 保存任务汇总
        if (!shouldStop && currentResults.length > 0) {
            await saveEvaluateTask(taskParams, currentResults);
        }

        if (shouldStop) {
            showToast('测评已取消');
        } else {
            showToast('测评完成');
        }

    } catch (e) {
        console.error(e);
        showToast('任务发送失败，请检查控制台连接');
    } finally {
        isEvaluating = false;
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m6 0a2 2 0 002-2v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z"></path>
            </svg>
            <span>开始测评</span>
        `;
        document.getElementById('cancelSection').classList.add('hidden');

        if (hideProgressTimer) clearTimeout(hideProgressTimer);
        hideProgressTimer = setTimeout(() => {
            document.getElementById('progressContainer').classList.add('hidden');
            hideProgressTimer = null;
        }, 2000);
    }
}

function trackTask(id) {
    return new Promise((resolve) => {
        const timer = setInterval(async () => {
            try {
                const res = await fetch(`${COMFYUI_SERVER}/history/${id}`);
                const data = await res.json();
                if (data[id]) {
                    clearInterval(timer);

                    let timestamp = data[id].prompt[0];
                    let imageInfo = null;

                    try {
                        const outputs = data[id].outputs;
                        const firstNodeId = Object.keys(outputs)[0];
                        const firstImg = outputs[firstNodeId]?.images?.[0];
                        if (firstImg) {
                            const url = `${COMFYUI_SERVER}/view?filename=${encodeURIComponent(firstImg.filename)}&subfolder=${encodeURIComponent(firstImg.subfolder)}&type=${firstImg.type}`;
                            const folder = extractFolderFromSubfolder(firstImg.subfolder);

                            // 获取文件真实创建时间
                            try {
                                const infoRes = await fetch(`/api/file-info?subfolder=${encodeURIComponent(firstImg.subfolder)}&filename=${encodeURIComponent(firstImg.filename)}`);
                                if (infoRes.ok) {
                                    const info = await infoRes.json();
                                    if (info.mtime) {
                                        timestamp = new Date(info.mtime).getTime() / 1000;
                                    }
                                }
                            } catch (e) {
                                console.log('获取文件创建时间失败:', e);
                            }

                            const time = formatPopupTime(timestamp);
                            imageInfo = {
                                url: url,
                                folder: folder,
                                time: time,
                                filename: firstImg.filename,
                                subfolder: firstImg.subfolder
                            };
                        }
                    } catch (e) {
                        console.log('获取图片信息失败:', e);
                    }

                    resolve(imageInfo);
                }
            } catch (e) { }
        }, 1000);
    });
}

async function interruptEvaluation() {
    shouldStop = true;
    try {
        await fetch(`${COMFYUI_SERVER}/interrupt`, { method: 'POST' });
    } catch (e) {
        console.error('取消任务失败:', e);
    }
}

// ==================== 结果渲染 ====================

function renderModelResultGroup(modelResult, isEmpty = false) {
    const container = document.getElementById('resultContainer');

    // 查找是否已有该模型的分组
    let group = document.getElementById(`result-group-${escapeId(modelResult.modelValue)}`);
    if (group) {
        if (isEmpty) {
            group.querySelector('.model-images-grid').innerHTML = '';
        }
        return;
    }

    group = document.createElement('div');
    group.id = `result-group-${escapeId(modelResult.modelValue)}`;
    group.className = 'bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors duration-300';

    const header = document.createElement('div');
    header.className = 'px-5 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between';
    header.innerHTML = `
        <div class="flex items-center space-x-2 min-w-0">
            <div class="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                <svg class="w-3 h-3 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
                </svg>
            </div>
            <div class="flex flex-col min-w-0">
                <span class="font-semibold text-slate-700 dark:text-slate-300 text-sm truncate">${modelResult.modelText}</span>
                <span class="text-xs text-slate-400 dark:text-slate-500 truncate" title="${modelResult.modelValue}">${modelResult.modelValue}</span>
            </div>
        </div>
        <span class="model-image-count text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 flex-shrink-0 ml-2">0 张</span>
    `;
    group.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'model-images-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-5 sm:p-6';
    group.appendChild(grid);

    container.appendChild(group);
}

function appendImageToGroup(modelResult, imageInfo) {
    const group = document.getElementById(`result-group-${escapeId(modelResult.modelValue)}`);
    if (!group) return;

    const grid = group.querySelector('.model-images-grid');

    const wrapper = document.createElement('div');
    wrapper.className = 'relative group animate-fade-in';

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 img-skeleton cursor-pointer';
    imgWrapper.onclick = () => openPreview(imageInfo);

    const img = document.createElement('img');
    img.src = imageInfo.url;
    img.loading = 'lazy';
    img.className = 'w-full h-full object-cover hover:scale-105 transition-transform duration-300';
    img.onload = function() {
        this.parentElement.classList.remove('img-skeleton');
    };

    imgWrapper.appendChild(img);
    wrapper.appendChild(imgWrapper);

    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl pointer-events-none';
    wrapper.appendChild(overlay);

    grid.appendChild(wrapper);

    // 隐藏 empty state
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.classList.add('hidden');

    // 更新计数
    const countEl = group.querySelector('.model-image-count');
    if (countEl) {
        countEl.textContent = `${modelResult.images.length} 张`;
    }
}

function updateResultCount() {
    const total = currentResults.reduce((sum, r) => sum + r.images.length, 0);
    document.getElementById('resultCount').textContent = `${total} 张`;
}

function escapeId(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '_');
}

// ==================== 预览功能 ====================

function openPreview(imageInfo) {
    const preview = document.getElementById('fullPreview');
    const previewImg = document.getElementById('previewImg');

    previewImg.src = imageInfo.url;
    currentPreviewUrl = imageInfo.url;
    currentPreviewImageData = imageInfo;
    preview.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // 重置图片信息
    currentPromptInfo = null;
}

function closePreview() {
    document.getElementById('fullPreview').classList.add('hidden');
    document.body.style.overflow = '';
}

// ==================== 图片信息 Popup ====================

function toggleInfoPopup() {
    if (isInfoPopupOpen) {
        closeInfoPopup();
    } else {
        openInfoPopup();
    }
}

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
    if (currentPreviewUrl) {
        parseImageInfo(currentPreviewUrl);
    }
}

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

function resetPopupInfo() {
    document.getElementById('popupInfoLoading').classList.remove('hidden');
    document.getElementById('popupInfoContent').classList.add('hidden');
    document.getElementById('popupInfoEmpty').classList.add('hidden');
}

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
        const vaeItem = config.vae_models.find(v => (typeof v === 'string' ? v : v.value) === info.vae);
        if (vaeItem) displayVae = typeof vaeItem === 'string' ? vaeItem : vaeItem.text;
    }
    document.getElementById('popupInfoVae').textContent = displayVae;
    document.getElementById('popupInfoVae').title = info.vae;

    let displayModel = info.model;
    if (config && config.diffusion_models && info.model && info.model !== '-') {
        const modelItem = config.diffusion_models.find(m => (typeof m === 'string' ? m : m.value) === info.model);
        if (modelItem) displayModel = typeof modelItem === 'string' ? modelItem : modelItem.text;
    }
    document.getElementById('popupInfoModel').textContent = displayModel;
    document.getElementById('popupInfoModel').title = info.model;

    document.getElementById('popupInfoSeed').textContent = info.seed;
    document.getElementById('popupInfoSeed').title = info.seed;
    document.getElementById('popupInfoPrompt').textContent = info.prompt || '无提示词';

    // 额外信息
    const folder = currentPreviewImageData?.folder || '-';
    const time = currentPreviewImageData?.time || '-';
    document.getElementById('popupInfoFolder').textContent = folder;
    document.getElementById('popupInfoFolder').title = folder;
    document.getElementById('popupInfoTime').textContent = time;
}

function showEmptyPopupInfo() {
    document.getElementById('popupInfoLoading').classList.add('hidden');
    document.getElementById('popupInfoContent').classList.add('hidden');
    document.getElementById('popupInfoEmpty').classList.remove('hidden');

    const folder = currentPreviewImageData?.folder || '-';
    const time = currentPreviewImageData?.time || '-';
    document.getElementById('popupInfoFolder').textContent = folder;
    document.getElementById('popupInfoTime').textContent = time;
}

async function copyPromptFromPopup() {
    if (currentPromptInfo && currentPromptInfo.prompt) {
        const success = await copyToClipboard(currentPromptInfo.prompt);
        if (success) {
            showToast('提示词已复制');
        } else {
            showToast('复制失败，请手动复制');
        }
    } else {
        showToast('没有可复制的提示词');
    }
}

// ==================== 复制工作流 ====================

async function copyWorkflow() {
    if (!currentPreviewUrl) {
        showToast('未找到当前图片');
        return;
    }

    try {
        const response = await fetch(currentPreviewUrl);
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const promptData = extractPromptFromPNG(uint8Array);

        if (promptData && promptData._raw) {
            const success = await copyToClipboard(promptData._raw);
            if (success) {
                showToast('工作流已复制');
            } else {
                showToast('复制失败，请手动复制');
            }
        } else {
            showToast('未能解析到工作流信息');
        }
    } catch (error) {
        console.error('复制工作流失败:', error);
        showToast('复制工作流失败');
    }
}

// ==================== 设为模型封面 ====================

async function setAsModelCover() {
    if (!currentPreviewUrl) {
        showToast('未找到当前图片');
        return;
    }

    // 尝试获取图片中的模型信息
    if (!currentPromptInfo || !currentPromptInfo.model || currentPromptInfo.model === '-') {
        try {
            const response = await fetch(currentPreviewUrl);
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const promptData = extractPromptFromPNG(uint8Array);
            if (promptData) {
                currentPromptInfo = promptData;
            }
        } catch (e) {
            console.error('预加载图片信息失败:', e);
        }
    }

    if (!currentPromptInfo || !currentPromptInfo.model || currentPromptInfo.model === '-') {
        showToast('未能获取该图片使用的模型信息');
        return;
    }

    let sourcePath = '';
    try {
        const url = new URL(currentPreviewUrl);
        const filename = decodeURIComponent(url.searchParams.get('filename') || '');
        const subfolder = decodeURIComponent(url.searchParams.get('subfolder') || '');
        if (!filename) {
            showToast('无法解析图片路径');
            return;
        }
        sourcePath = subfolder ? `${subfolder}/${filename}` : filename;
    } catch (e) {
        showToast('无法解析图片路径');
        return;
    }

    const modelName = currentPromptInfo.model;

    try {
        const response = await fetch('/api/set-model-cover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath, modelName })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            showToast(`已设为封面: ${data.coverName}`);
        } else {
            showToast(data.error || '设置封面失败');
        }
    } catch (error) {
        console.error('设置封面失败:', error);
        showToast('设置封面失败');
    }
}

// ==================== 任务汇总保存 ====================

async function saveEvaluateTask(params, results) {
    try {
        // 构建汇总数据（前端不计算绝对路径，只传原始信息，后端处理）
        const taskData = {
            taskTime: new Date().toISOString(),
            params: params,
            models: results.map(r => ({
                modelValue: r.modelValue,
                modelText: r.modelText,
                images: r.images.map(img => ({
                    url: img.url,
                    subfolder: img.subfolder,
                    filename: img.filename
                }))
            }))
        };

        const response = await fetch('/api/save-evaluate-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskData })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            console.log('任务汇总已保存:', data.path);
        } else {
            console.error('保存任务汇总失败:', data.error);
        }
    } catch (error) {
        console.error('保存任务汇总失败:', error);
    }
}

// ==================== 工具函数 ====================

function formatPopupTime(input) {
    if (!input || input === '-') return '-';
    let date;
    if (typeof input === 'number') {
        date = new Date(input * 1000);
    } else {
        date = new Date(input);
    }
    if (isNaN(date.getTime()) || date.getFullYear() <= 1970) return '-';
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(/\//g, '-');
}

function extractFolderFromSubfolder(subfolder) {
    if (!subfolder) return '-';
    const parts = subfolder.split('/').filter(p => p);
    return parts.length > 0 ? parts[parts.length - 1] : '-';
}

async function copyToClipboard(text) {
    if (!text) return false;
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.log('Clipboard API 失败:', err);
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

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.classList.remove('translate-x-full', 'opacity-0');
    toast.classList.add('translate-x-0', 'opacity-100');
    setTimeout(() => {
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('translate-x-full', 'opacity-0');
    }, duration);
}


// ==================== 页面加载 ====================

document.addEventListener('DOMContentLoaded', initEvaluate);

// 键盘事件
document.addEventListener('keydown', function(e) {
    if (!document.getElementById('fullPreview').classList.contains('hidden')) {
        if (e.key === 'Escape') {
            closePreview();
        }
    }
});

// 点击预览遮罩关闭
document.addEventListener('DOMContentLoaded', function() {
    const fullPreview = document.getElementById('fullPreview');
    if (fullPreview) {
        fullPreview.addEventListener('click', function(e) {
            if (e.target === this) {
                closePreview();
            }
        });
    }
});
