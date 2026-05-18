// 全局状态控制
let isGenerating = false;
let shouldStop = false;
let clearOnNextRender = false;
let hideProgressTimer = null; // 用于清除延迟隐藏进度条的定时器 
let historyImages = [];     // 存储历史图片URL数组
let historyImageData = [];  // 存储历史图片URL和任务ID的关联信息
let currentPreviewIndex = 0; // 当前预览图片的索引 
let currentTaskId = null;   // 当前预览图片的任务ID
let prefix; // 文件保存前缀全局变量
let currentImageExtraInfo = { folder: '-', time: '-' }; // 当前图片的额外信息（目录、时间）
let historyPollingTimer = null; // 历史记录轮询定时器
let displayedTaskIds = new Set(); // 跟踪已显示的任务ID，用于优化历史记录加载
let socket; // WebSocket 实例，用于监听进度更新

// 页面卸载时停止轮询
window.addEventListener('beforeunload', stopHistoryPolling);

// 初始化原始工作流
async function initOriginalWorkflow() {
    try {
        // 加载工作流模板（内置 Control 节点）
        const workflowResponse = await fetch('../config/workflow.json');
        originalWorkflow = await workflowResponse.json();
        console.log('工作流模板:', originalWorkflow);
    } catch (error) {
        console.error('加载原始工作流失败:', error);
        showToast('加载原始工作流失败，请检查服务器是否正常运行');
    }
}

// 初始化时加载配置
async function initConsole() {
    try {
        // 初始化模型下拉选项
        const modelSelect = document.getElementById('modelSelect');
        modelSelect.innerHTML = '';
        config.diffusion_models.forEach(model => {
            const option = document.createElement('option');
            if (typeof model === 'string') {
                option.value = model;
                option.textContent = model;
            } else {
                option.value = model.value;
                option.textContent = model.text;
            }
            modelSelect.appendChild(option);
        });

        // 初始化VAE下拉选项
        const vaeSelect = document.getElementById('vaeSelect');
        vaeSelect.innerHTML = '';
        config.vae_models.forEach(vae => {
            const option = document.createElement('option');
            if (typeof vae === 'string') {
                option.value = vae;
                option.textContent = vae;
            } else {
                option.value = vae.value;
                option.textContent = vae.text;
            }
            vaeSelect.appendChild(option);
        });

        // 初始化补丁模型下拉选项
        const patchSelect = document.getElementById('controlPatchModel');
        patchSelect.innerHTML = '';
        config.modal_patchs.forEach(patch => {
            const option = document.createElement('option');
            if (typeof patch === 'string') {
                option.value = patch;
                option.textContent = patch;
            } else {
                option.value = patch.value;
                option.textContent = patch.text;
            }
            patchSelect.appendChild(option);
        });

        // 初始化预处理类型下拉选项
        const preprocessorSelect = document.getElementById('controlPreprocessor');
        preprocessorSelect.innerHTML = '';
        config.preprocessors.forEach(pp => {
            const option = document.createElement('option');
            option.value = pp;
            option.textContent = pp;
            preprocessorSelect.appendChild(option);
        });

        // 初始化采样器组合下拉选项
        const samplerSelect = document.getElementById('samplerSelect');
        samplerSelect.innerHTML = '';
        config.sampler_options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.text;
            samplerSelect.appendChild(opt);
        });

        // 文件保存设置
        document.getElementById('filePrefix').value = config.prefix;

        // 初始化WebSocket连接
        setupWebSocket();

        // 初始化尺寸选项
        updateSizeOptions();

        console.log('配置加载成功');
    } catch (error) {
        console.error('加载配置文件失败:', error);
        alert('加载配置文件失败，请检查服务器是否正常运行');
    }
}

// 初始化 WebSocket 监听执行进度
function setupWebSocket() {
    const wsUrl = COMFYUI_SERVER.replace('http', 'ws') + '/ws?clientId=easy_gen_client';
    socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';

    socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
            const msg = JSON.parse(event.data);

            if (msg.type === 'progress') {
                const { value, max } = msg.data;
                const percent = Math.round((value / max) * 100) + '%';
                document.getElementById('progress1').style.width = percent;
                document.getElementById('progressText1').innerText = percent;
            }

            if (msg.type === 'execution_start') {
                resetProgress();
            }
        } else {
            // 二进制预览图片（ComfyUI 前 8 字节为头部，图片数据从第 9 字节开始）
            const imageData = event.data.slice(8);
            const blob = new Blob([imageData], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            const previewImg = document.getElementById('livePreview');
            const previewContainer = document.getElementById('livePreviewContainer');

            if (previewImg.dataset.lastUrl) {
                URL.revokeObjectURL(previewImg.dataset.lastUrl);
            }
            previewImg.dataset.lastUrl = url;
            previewImg.src = url;
            previewContainer.classList.remove('hidden');
        }
    };

    socket.onclose = () => setTimeout(setupWebSocket, 5000); // 掉线重连
}

function resetProgress(text = '0%') {
    document.getElementById('progress1').style.width = '0%';
    document.getElementById('progressText1').innerText = text;

    // 清空预览图
    const previewImg = document.getElementById('livePreview');
    const previewContainer = document.getElementById('livePreviewContainer');
    if (previewImg.dataset.lastUrl) {
        URL.revokeObjectURL(previewImg.dataset.lastUrl);
        delete previewImg.dataset.lastUrl;
    }
    previewImg.src = '';
    previewContainer.classList.add('hidden');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async function() {
    await initServerConfig();
    initOriginalWorkflow();
    initConsole();
    resetProgress('无任务');
});

// ========== 分辨率提示更新 ==========
function updateResHint() {
    // 图片放大已移除，此函数保留空实现以兼容现有调用
}

// 获取尺寸映射
function getSizeMap() {
    return config.size_map;
}

// 根据选择的比例更新尺寸选项
function updateSizeOptions() {
    const ratio = document.getElementById('ratioSelect').value;
    const sizeSelect = document.getElementById('sizeSelect');
    const customSizeInputs = document.getElementById('customSizeInputs');
    
    if (ratio === 'custom') {
        // 自定义大小：隐藏下拉框，显示输入框
        sizeSelect.classList.add('hidden');
        customSizeInputs.classList.remove('hidden');
        
        // 添加输入框事件监听
        const widthInput = document.getElementById('widthInput');
        const heightInput = document.getElementById('heightInput');
        
        widthInput.removeEventListener('input', updateResHint);
        heightInput.removeEventListener('input', updateResHint);
        
        widthInput.addEventListener('input', updateResHint);
        heightInput.addEventListener('input', updateResHint);
    } else {
        // 预设比例：显示下拉框，隐藏输入框
        sizeSelect.classList.remove('hidden');
        customSizeInputs.classList.add('hidden');

        sizeSelect.innerHTML = '';

        // 填充尺寸选项
        const sizeMap = getSizeMap();
        sizeMap[ratio].forEach(size => {
            const option = document.createElement('option');
            option.value = size.value;
            option.textContent = size.text;
            sizeSelect.appendChild(option);
        });
    }
    
    // 更新分辨率提示
    updateResHint();
}

// ========== 主生成逻辑 ==========
async function queuePrompt() {
    if (isGenerating) return; 

    // 验证提示词是否为空
    const promptText = document.getElementById('promptText').value;
    if (!promptText.trim()) {
        showToast('请输入提示词后再生成');
        return;
    }

    isGenerating = true;
    shouldStop = false;
    clearOnNextRender = true;
    
    // 清除之前可能存在的隐藏进度条定时器，防止旧任务的定时器影响新任务
    if (hideProgressTimer) {
        clearTimeout(hideProgressTimer);
        hideProgressTimer = null;
    }
    
    // 重置进度和预览
    resetProgress();
    
    const btn = document.getElementById('generateBtn');
    const originalText = btn.innerText;
    
    btn.disabled = true;
    btn.classList.remove('hover:bg-blue-700'); 

    try {
        const p = JSON.parse(JSON.stringify(originalWorkflow));
        const ratio = document.getElementById('ratioSelect').value;
        let w, h;
        
        if (ratio === 'custom') {
            // 自定义大小：从输入框获取值
            w = parseInt(document.getElementById('widthInput').value);
            h = parseInt(document.getElementById('heightInput').value);
            
            // 验证输入值
            if (!w || !h || w < 1 || h < 1 || w > 4096 || h > 4096) {
                showToast('请输入有效的宽高值（1-4096）');
                isGenerating = false;
                btn.disabled = false;
                btn.classList.add('hover:bg-blue-700');
                return;
            }
        } else {
            // 预设比例：从下拉框获取值
            const sizeValue = document.getElementById('sizeSelect').value;
            [w, h] = sizeValue ? sizeValue.split(',').map(Number) : [0, 0];
        }
        
        const [sampler, scheduler] = document.getElementById('samplerSelect').value.split(',');
        const seed = Math.floor(Math.random() * 1000000000000);
        const batchCount = parseInt(document.getElementById('batchCount').value);

        // 基础参数
        p["6"].inputs.text = document.getElementById('promptText').value;
        p["5"].inputs.width = w;
        p["5"].inputs.height = h;
        p["3"].inputs.seed = seed;
        p["3"].inputs.sampler_name = sampler;
        p["3"].inputs.scheduler = scheduler;
        p["3"].inputs.cfg = parseFloat(document.getElementById('cfgInput').value);
        p["3"].inputs.steps = parseInt(document.getElementById('stepsInput').value);
        
        // 模型和VAE参数
        p["34"].inputs.unet_name = document.getElementById('modelSelect').value;
        p["32"].inputs.vae_name = document.getElementById('vaeSelect').value;

        // Control 处理
        if (document.getElementById('controlEnable').checked) {
            // 设置 Control 参数（节点已存在于工作流模板中）
            p["35"].inputs.strength = parseFloat(document.getElementById('controlStrength').value);
            p["38"].inputs.preprocessor = document.getElementById('controlPreprocessor').value;
            p["38"].inputs.resolution = parseInt(document.getElementById('controlResolution').value);
            p["39"].inputs.image = document.getElementById('controlImagePath').value;
            p["41"].inputs.name = document.getElementById('controlPatchModel').value;
        } else {
            // 未启用 Control 时删除节点，恢复采样直连
            delete p["35"]; delete p["38"]; delete p["39"]; delete p["41"];
            p["3"].inputs.model = ["25", 0];
        }

        // 文件前缀处理
        prefix = document.getElementById('filePrefix').value || prefix;
        // 如果prefix中包含%date%，则替换为实际日期
        if (prefix.includes('%date%')) {
            const now = new Date();
            const date_str = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            prefix = prefix.replace(/%date%/g, date_str);
        }
        const filename_prefix = config.output_dir + "/" + prefix;
        p["9"].inputs.filename_prefix = filename_prefix;

        for(let i = 0; i < batchCount; i++) {
            if (shouldStop) break; 
            btn.innerText = `Running ${i + 1}/${batchCount}`;

            const res = await fetch(`${COMFYUI_SERVER}/prompt`, {
                method: 'POST',
                body: JSON.stringify({ prompt: p })
            });
            const data = await res.json();

            await trackTask(data.prompt_id);

            // 简单的种子递增，防止批量生成的图一模一样
            p["3"].inputs.seed += 1;
        }

    } catch (e) {
        console.error(e);
        alert("任务发送失败，请检查控制台连接");
    } finally {
        isGenerating = false;
        btn.disabled = false;
        btn.innerText = originalText;
        btn.classList.add('hover:bg-blue-700');
        
        // 面板常显，任务结束后显示"任务已结束"
        document.getElementById('progressText1').innerText = '任务已结束';
    }
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
    if (isNaN(date.getTime()) || date.getFullYear() <= 1970) return '-';
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(/\//g, '-');
}

/**
 * 从 subfolder 提取所在目录（最近一级）
 * @param {string} subfolder
 * @returns {string}
 */
function extractFolderFromSubfolder(subfolder) {
    if (!subfolder) return '-';
    const parts = subfolder.split('/').filter(p => p);
    return parts.length > 0 ? parts[parts.length - 1] : '-';
}

function trackTask(id) {
    return new Promise((resolve) => {
        const timer = setInterval(async () => {
            try {
                const res = await fetch(`${COMFYUI_SERVER}/history/${id}`);
                const data = await res.json();
                if(data[id]) {
                    clearInterval(timer);
                    
                    const outputs = data[id].outputs;
                    
                    // 尝试从文件系统获取真实的创建时间，替代不稳定的 prompt[0]
                    let timestamp = data[id].prompt[0];
                    try {
                        const firstNodeId = Object.keys(outputs)[0];
                        const firstImg = outputs[firstNodeId]?.images?.[0];
                        if (firstImg) {
                            const infoRes = await fetch(`/api/file-info?subfolder=${encodeURIComponent(firstImg.subfolder)}&filename=${encodeURIComponent(firstImg.filename)}`);
                            if (infoRes.ok) {
                                const info = await infoRes.json();
                                if (info.mtime) {
                                    timestamp = new Date(info.mtime).getTime() / 1000;
                                }
                            }
                        }
                    } catch (e) {
                        console.log('获取文件创建时间失败，fallback 到 prompt[0]:', e);
                    }
                    
                    renderImg(data[id].outputs, timestamp);
                    resolve(); 
                }
            } catch(e) { }
        }, 1000); 
    });
}

// ========== 渲染图片 ==========
function renderImg(outputs, timestamp) {
    const container = document.getElementById('imageContainer');
    const emptyState = document.getElementById('emptyState');
    const resultCount = document.getElementById('resultCount');
    
    if (emptyState) {
        emptyState.style.display = 'none';
    }
    if (resultCount) {
        resultCount.classList.remove('hidden');
    }
    
    if (clearOnNextRender) {
        container.innerHTML = '';
        clearOnNextRender = false;
    }

    const nodeIds = Object.keys(outputs).sort().reverse();
    let imageCount = container.children.length;

    for (let nodeId of nodeIds) {
        if (!outputs[nodeId] || !outputs[nodeId].images) {
            continue;
        }
        outputs[nodeId].images.forEach(img => {
            const url = `${COMFYUI_SERVER}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`;
            const folder = extractFolderFromSubfolder(img.subfolder);
            const time = formatPopupTime(timestamp);
            
            const wrapperEl = document.createElement('div');
            wrapperEl.dataset.folder = folder;
            wrapperEl.dataset.time = time;
            wrapperEl.dataset.nodeId = nodeId;
            wrapperEl.className = 'relative group animate-fade-in';
            
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 img-skeleton cursor-pointer';
            imgWrapper.onclick = () => openResultPreview(url, folder, time);
            
            const imgEl = document.createElement('img');
            imgEl.src = url;
            imgEl.loading = 'lazy';
            imgEl.className = 'w-full h-full object-cover hover:scale-105 transition-transform duration-300';
            imgEl.onload = function() {
                this.parentElement.classList.remove('img-skeleton');
            };
            
            imgWrapper.appendChild(imgEl);
            
            const label = document.createElement('span');
            label.className = 'absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm pointer-events-none';
            label.textContent = '生成结果';
            
            const overlay = document.createElement('div');
            overlay.className = 'absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl pointer-events-none';
            
            wrapperEl.appendChild(imgWrapper);
            wrapperEl.appendChild(label);
            wrapperEl.appendChild(overlay);
            
            container.prepend(wrapperEl);
            imageCount++;
        });
    }

    if (resultCount) {
        resultCount.textContent = imageCount + ' 张';
    }
}

// ========== 历史记录 ==========
async function loadHistory() {
    const res = await fetch(`${COMFYUI_SERVER}/history`);
    const data = await res.json();
    const list = document.getElementById('historyList');
    const emptyState = document.getElementById('historyEmptyState');
    const newEntries = [];
    const newHistoryImages = [];
    const newHistoryImageData = [];

    for (const [taskId, item] of Object.entries(data).reverse()) {
        if (!item.outputs) continue;

        // 检查该任务是否有新图片
        let hasNewImages = false;
        for (let nid in item.outputs) {
            item.outputs[nid].images?.forEach(img => {
                const imageKey = `${taskId}-${nid}-${img.filename}`;
                if (!displayedTaskIds.has(imageKey)) {
                    hasNewImages = true;
                }
            });
        }
        if (!hasNewImages) continue;

        // 获取该任务的准确时间（优先用文件 mtime）
        let timestamp = item.prompt[0];
        try {
            const outputs = item.outputs;
            const firstNodeId = Object.keys(outputs)[0];
            const firstImg = outputs[firstNodeId]?.images?.[0];
            if (firstImg) {
                const infoRes = await fetch(`/api/file-info?subfolder=${encodeURIComponent(firstImg.subfolder)}&filename=${encodeURIComponent(firstImg.filename)}`);
                if (infoRes.ok) {
                    const info = await infoRes.json();
                    if (info.mtime) {
                        timestamp = new Date(info.mtime).getTime() / 1000;
                    }
                }
            }
        } catch (e) {
            console.log('获取历史记录文件时间失败:', e);
        }

        for (let nid in item.outputs) {
            item.outputs[nid].images?.forEach(img => {
                const url = `${COMFYUI_SERVER}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`;
                const imageKey = `${taskId}-${nid}-${img.filename}`;
                
                if (!displayedTaskIds.has(imageKey)) {
                    displayedTaskIds.add(imageKey);
                    
                    // 获取图片信息
                    const prompt = item.prompt[2] || {};
                    const width = prompt['5']?.inputs?.width || '-';
                    const height = prompt['5']?.inputs?.height || '-';
                    const model = prompt['34']?.inputs?.unet_name || '-';
                    const samplerName = prompt['3']?.inputs?.sampler_name || '-';
                    const scheduler = prompt['3']?.inputs?.scheduler || '-';
                    const promptText = prompt['6']?.inputs?.text || '';
                    
                    // 创建外层容器
                    const container = document.createElement('div');
                    container.className = 'flex flex-col gap-2';
                    
                    // 图片包装器
                    const imgWrapper = document.createElement('div');
                    imgWrapper.className = 'relative aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 group cursor-pointer';
                    
                    const imgEl = document.createElement('img');
                    imgEl.src = url;
                    imgEl.loading = 'lazy';
                    imgEl.className = 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer';
                    imgEl.onclick = (e) => {
                        e.stopPropagation();
                        openPreview(url, taskId);
                    };
                    imgWrapper.appendChild(imgEl);
                    
                    const label = document.createElement('span');
                    label.className = 'absolute top-2 right-2 bg-primary-500 text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm pointer-events-none';
                    label.style.pointerEvents = 'none';
                    label.textContent = '生成';
                    imgWrapper.appendChild(label);
                    
                    const overlay = document.createElement('div');
                    overlay.className = 'absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none';
                    overlay.style.pointerEvents = 'none';
                    imgWrapper.appendChild(overlay);
                    
                    // 同时为imgWrapper添加点击事件
                    imgWrapper.onclick = (e) => {
                        e.stopPropagation();
                        openPreview(url, taskId);
                    };
                    
                    // 也为img元素添加阻止冒泡的处理
                    imgEl.onclick = (e) => {
                        e.stopPropagation();
                        openPreview(url, taskId);
                    };
                    
                    container.appendChild(imgWrapper);
                    
                    // 信息展示区域
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
                    
                    container.appendChild(infoDiv);
                    
                    const folder = extractFolderFromSubfolder(img.subfolder);
                    const time = formatPopupTime(timestamp);
                    newEntries.unshift(container);
                    newHistoryImages.unshift(url);
                    newHistoryImageData.unshift({ url, taskId, folder, time });
                }
            });
        }
    }

    if (newEntries.length > 0) {
        newEntries.forEach(entry => {
            list.insertBefore(entry, list.firstChild);
        });
        historyImages = [...historyImages, ...newHistoryImages];
        historyImageData = [...historyImageData, ...newHistoryImageData];
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }
}

async function interruptTask(type) {
    shouldStop = true;
    if(type === 'all') {
        await fetch(`${COMFYUI_SERVER}/queue`, { method: 'POST', body: JSON.stringify({clear: true}) });
        alert("已请求清空队列");
    } else {
        await fetch(`${COMFYUI_SERVER}/interrupt`, { method: 'POST' });
    }
}

// ========== 预览功能 ==========
function openPreview(url, taskId) {
    const preview = document.getElementById('fullPreview');
    const previewImg = document.getElementById('previewImg');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    previewImg.src = url;
    preview.classList.remove('hidden');
    // 禁用body滚动
    document.body.style.overflow = 'hidden';

    // 查找当前图片在历史数组中的索引
    currentPreviewIndex = historyImages.indexOf(url);
    currentTaskId = taskId;

    // 显示导航按钮
    if (prevBtn) prevBtn.classList.remove('hidden');
    if (nextBtn) nextBtn.classList.remove('hidden');
    
    // 设置当前图片额外信息
    const data = historyImageData.find(d => d.url === url);
    currentImageExtraInfo = data ? { folder: data.folder || '-', time: data.time || '-' } : { folder: '-', time: '-' };
}

function closePreview() {
    document.getElementById('fullPreview').classList.add('hidden');
    // 只有当抽屉也关闭时才恢复body滚动
    const drawer = document.getElementById('drawer');
    if (drawer && drawer.classList.contains('drawer-closed')) {
        document.body.style.overflow = '';
    }
}

// 当前预览的图片URL（用于生成结果预览）
let currentResultPreviewUrl = null;

// 预览生成结果图片（独立预览，不参与历史导航）
function openResultPreview(url, folder = '-', time = '-') {
    const preview = document.getElementById('fullPreview');
    const previewImg = document.getElementById('previewImg');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    // 显示预览但不设置当前索引，这样导航按钮将不会工作
    previewImg.src = url;
    currentResultPreviewUrl = url;
    preview.classList.remove('hidden');
    // 禁用body滚动
    document.body.style.overflow = 'hidden';

    // 临时将历史导航功能禁用
    currentPreviewIndex = -1;
    currentTaskId = null; // 从当前结果打开的图片没有历史任务ID

    // 隐藏导航按钮
    if (prevBtn) prevBtn.classList.add('hidden');
    if (nextBtn) nextBtn.classList.add('hidden');
    
    // 设置当前图片额外信息
    currentImageExtraInfo = { folder, time };
}

function toggleDrawer() { 
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawerOverlay');

    // 使用 toggle 切换 drawer-closed 类
    drawer.classList.toggle('drawer-closed');

    if (!drawer.classList.contains('drawer-closed')) {
        // 抽屉打开
        overlay.classList.remove('hidden');
        // 强制重绘以确保过渡动画生效
        void overlay.offsetWidth;
        overlay.classList.remove('opacity-0');
        // 禁用body滚动
        document.body.style.overflow = 'hidden';
        
        // 加载历史记录
        displayedTaskIds.clear();
        historyImages = [];
        historyImageData = [];
        document.getElementById('historyList').innerHTML = '';
        const emptyState = document.getElementById('historyEmptyState');
        if (emptyState) emptyState.style.display = 'block';
        loadHistory();
        startHistoryPolling();
    } else {
        // 抽屉关闭
        overlay.classList.add('opacity-0');
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 300);
        // 恢复body滚动
        document.body.style.overflow = '';
        stopHistoryPolling();
    }
}

// 点击遮罩关闭抽屉
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('drawerOverlay').addEventListener('click', toggleDrawer);
    document.getElementById('modelGalleryOverlay').addEventListener('click', toggleModelGalleryDrawer);
});

// ========== 模型画廊抽屉 ==========
function toggleModelGalleryDrawer() {
    const drawer = document.getElementById('modelGalleryDrawer');
    const overlay = document.getElementById('modelGalleryOverlay');

    drawer.classList.toggle('drawer-closed');

    if (!drawer.classList.contains('drawer-closed')) {
        overlay.classList.remove('hidden');
        void overlay.offsetWidth;
        overlay.classList.remove('opacity-0');
        document.body.style.overflow = 'hidden';
        renderModelGallery();
    } else {
        overlay.classList.add('opacity-0');
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 300);
        const historyDrawer = document.getElementById('drawer');
        if (historyDrawer && historyDrawer.classList.contains('drawer-closed')) {
            document.body.style.overflow = '';
        }
    }
}

// 渲染模型画廊
async function renderModelGallery() {
    const list = document.getElementById('modelGalleryList');
    const empty = document.getElementById('modelGalleryEmpty');

    if (!config || !config.diffusion_models || config.diffusion_models.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    list.innerHTML = '';

    // 先获取后端已有的封面列表，避免大量 404
    let coverSet = new Set();
    try {
        const res = await fetch('/api/model-covers');
        if (res.ok) {
            const data = await res.json();
            coverSet = new Set(data.covers || []);
        }
    } catch (e) {
        console.error('获取封面列表失败:', e);
    }

    const selectedModel = document.getElementById('modelSelect').value;

    config.diffusion_models.forEach(model => {
        const modelValue = typeof model === 'string' ? model : model.value;
        const modelText = typeof model === 'string' ? model : model.text;
        const coverBaseName = modelValue.replace(/\.safetensors$/i, '');
        const hasCover = coverSet.has(coverBaseName);

        const item = document.createElement('div');
        item.className = 'flex flex-col gap-2 cursor-pointer group';
        item.onclick = () => selectModelFromGallery(modelValue);

        const isSelected = modelValue === selectedModel;
        const ringClass = isSelected ? 'ring-2 ring-purple-500 ring-offset-2 dark:ring-offset-slate-800' : '';

        const imgContainer = document.createElement('div');
        imgContainer.className = `aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 relative ${ringClass} transition-all group-hover:ring-2 group-hover:ring-purple-400 group-hover:ring-offset-2 dark:group-hover:ring-offset-slate-800`;

        if (hasCover) {
            const coverUrl = `../model-covers/${encodeURIComponent(coverBaseName)}.png`;
            const img = document.createElement('img');
            img.src = coverUrl;
            img.loading = 'lazy';
            img.className = 'w-full h-full object-cover';
            imgContainer.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500';
            placeholder.innerHTML = `
                <svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
                <span class="text-xs">暂无封面</span>
            `;
            imgContainer.appendChild(placeholder);
        }

        item.appendChild(imgContainer);

        const nameLabel = document.createElement('div');
        nameLabel.className = 'text-xs text-slate-600 dark:text-slate-400 text-center truncate px-1';
        nameLabel.textContent = modelText;
        item.appendChild(nameLabel);

        list.appendChild(item);
    });
}

// 从画廊选中模型
function selectModelFromGallery(modelValue) {
    const modelSelect = document.getElementById('modelSelect');
    modelSelect.value = modelValue;
    toggleModelGalleryDrawer();
    const modelItem = config.diffusion_models.find(m => (typeof m === 'string' ? m : m.value) === modelValue);
    const displayText = modelItem ? (typeof modelItem === 'string' ? modelItem : modelItem.text) : modelValue;
    showToast('已选中: ' + displayText);
}

// 请求 Comfyui 服务，清空历史记录
async function clearHistory() {
    if (confirm('是否清空历史记录？')) {
        try {
            // 调用ComfyUI API清除历史记录
            await fetch(`${COMFYUI_SERVER}/history`, {
                method: 'POST',
                body: JSON.stringify({clear: true})
            });
            
            // 清空本地数据和UI
            displayedTaskIds.clear();
            historyImages = [];
            historyImageData = [];
            document.getElementById('historyList').innerHTML = '';
            const emptyState = document.getElementById('historyEmptyState');
            if (emptyState) emptyState.style.display = 'block';
            
            // 重新加载历史记录（应该为空）
            loadHistory();
            
            showToast('历史记录已清空');
        } catch (error) {
            console.error('清空历史记录失败:', error);
            showToast('清空历史记录失败');
        }
    }
}

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

async function setAsModelCover() {
    const previewImg = document.getElementById('previewImg');
    if (!previewImg || !previewImg.src) {
        showToast('未找到当前图片');
        return;
    }

    // 如果还没有加载过图片信息，先尝试加载
    if (!currentPromptInfo || !currentPromptInfo.model || currentPromptInfo.model === '-') {
        try {
            await parseImageInfo(previewImg.src);
        } catch (e) {
            console.error('预加载图片信息失败:', e);
        }
    }

    if (!currentPromptInfo || !currentPromptInfo.model || currentPromptInfo.model === '-') {
        showToast('未能获取该图片使用的模型信息');
        return;
    }

    // 从 ComfyUI view URL 解析 sourcePath
    let sourcePath = '';
    try {
        const url = new URL(previewImg.src);
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
            body: JSON.stringify({
                sourcePath: sourcePath,
                modelName: modelName
            })
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

// 发送到控制台功能
/**
 * 根据 promptData 填充控制台表单
 * @param {Object} promptData - ComfyUI 工作流数据
 */
async function fillFormFromPromptData(promptData) {
    // 提示词
    if (promptData["6"] && promptData["6"].inputs.text) {
        document.getElementById('promptText').value = promptData["6"].inputs.text;
    }

    // 模型和VAE
    if (promptData["34"] && promptData["34"].inputs.unet_name) {
        const unetName = promptData["34"].inputs.unet_name;
        const modelOption = config.diffusion_models.find(opt => opt.value === unetName);
        if (modelOption) {
            document.getElementById('modelSelect').value = modelOption.value;
        }
    }

    if (promptData["32"] && promptData["32"].inputs.vae_name) {
        const vaeOption = config.vae_models.find(opt => opt.value === promptData["32"].inputs.vae_name);
        if (vaeOption) {
            document.getElementById('vaeSelect').value = vaeOption.value;
        }
    }

    // CFG
    if (promptData["3"] && promptData["3"].inputs.cfg) {
        document.getElementById('cfgInput').value = promptData["3"].inputs.cfg;
    }

    // 步数
    if (promptData["3"] && promptData["3"].inputs.steps) {
        document.getElementById('stepsInput').value = promptData["3"].inputs.steps;
        document.getElementById('stepsValue').textContent = promptData["3"].inputs.steps;
    }

    // 图片尺寸
    if (promptData["5"] && promptData["5"].inputs.width && promptData["5"].inputs.height) {
        const imgWidth = promptData["5"].inputs.width;
        const imgHeight = promptData["5"].inputs.height;
        const sizeValue = `${imgWidth},${imgHeight}`;
        
        let foundRatio = null;
        let foundSize = null;
        
        const sizeMap = await getSizeMap();

        Object.keys(sizeMap).forEach(ratio => {
            sizeMap[ratio].forEach(size => {
                if (size.value === sizeValue) {
                    foundRatio = ratio;
                    foundSize = size.value;
                }
            });
        });
        
        if (foundRatio) {
            document.getElementById('ratioSelect').value = foundRatio;
            updateSizeOptions();
            document.getElementById('sizeSelect').value = foundSize;
        } else {
            document.getElementById('ratioSelect').value = 'custom';
            updateSizeOptions();
            document.getElementById('widthInput').value = imgWidth;
            document.getElementById('heightInput').value = imgHeight;
        }
        
        updateResHint();
    }

    // 采样器组合
    if (promptData["3"] && promptData["3"].inputs.sampler_name && promptData["3"].inputs.scheduler) {
        const samplerValue = `${promptData["3"].inputs.sampler_name},${promptData["3"].inputs.scheduler}`;
        document.getElementById('samplerSelect').value = samplerValue;
    }

    // Control 设置
    if (promptData["35"]) {
        document.getElementById('controlEnable').checked = true;
        document.getElementById('controlStrength').value = promptData["35"].inputs.strength || 0.8;
        if (promptData["41"]) {
            document.getElementById('controlPatchModel').value = promptData["41"].inputs.name;
        }
        if (promptData["38"]) {
            document.getElementById('controlPreprocessor').value = promptData["38"].inputs.preprocessor;
            document.getElementById('controlResolution').value = promptData["38"].inputs.resolution || 512;
        }
        if (promptData["39"]) {
            document.getElementById('controlImagePath').value = promptData["39"].inputs.image;
            restoreControlImagePreview(promptData["39"].inputs.image);
        }
    } else {
        document.getElementById('controlEnable').checked = false;
    }

    // 文件名前缀
    if (promptData["9"] && promptData["9"].inputs.filename_prefix) {
        let prefix_parts = promptData["9"].inputs.filename_prefix.split('/');
        prefix_parts.shift();
        document.getElementById('filePrefix').value = prefix_parts.join('/');
    }


}

/**
 * 验证是否为合法的 ComfyUI 工作流
 * @param {Object} data - 解析后的 JSON 对象
 * @returns {boolean}
 */
function isValidComfyUIWorkflow(data) {
    if (!data || typeof data !== 'object') return false;
    // 检查是否包含 ComfyUI 典型的节点结构
    const keys = Object.keys(data);
    if (keys.length === 0) return false;
    // 至少有一个节点包含 inputs 和 class_type
    return keys.some(key => {
        const node = data[key];
        return node && typeof node === 'object' && node.inputs !== undefined && node.class_type !== undefined;
    });
}

/**
 * 处理导入的文本数据（公共逻辑）
 * @param {string} text - JSON 文本
 */
async function processImportData(text) {
    if (!text.trim()) {
        showToast('内容为空', 'error');
        return false;
    }
    
    // 解析 JSON
    let promptData;
    try {
        promptData = JSON.parse(text);
    } catch (e) {
        showToast('内容不是有效的 JSON', 'error');
        return false;
    }
    
    // 验证是否为 ComfyUI 工作流
    if (!isValidComfyUIWorkflow(promptData)) {
        showToast('内容不是合法的 ComfyUI 工作流', 'error');
        return false;
    }
    
    // 填充表单
    await fillFormFromPromptData(promptData);
    showToast('工作流已导入');
    return true;
}

/**
 * 打开手动导入弹窗
 */
function openImportModal() {
    const modal = document.getElementById('importModal');
    const overlay = document.getElementById('importModalOverlay');
    const content = document.getElementById('importModalContent');
    const textarea = document.getElementById('importModalTextarea');
    
    if (!modal) return;
    
    modal.classList.remove('hidden');
    if (textarea) textarea.value = '';
    
    // 显示动画
    setTimeout(() => {
        if (overlay) overlay.classList.remove('opacity-0');
        if (content) content.classList.add('show');
        if (textarea) textarea.focus();
    }, 10);
}

/**
 * 关闭手动导入弹窗
 */
function closeImportModal() {
    const modal = document.getElementById('importModal');
    const overlay = document.getElementById('importModalOverlay');
    const content = document.getElementById('importModalContent');
    
    if (overlay) overlay.classList.add('opacity-0');
    if (content) content.classList.remove('show');
    
    setTimeout(() => {
        if (modal) modal.classList.add('hidden');
    }, 300);
}

/**
 * 提交手动导入
 */
async function submitManualImport() {
    const textarea = document.getElementById('importModalTextarea');
    const text = textarea ? textarea.value : '';
    const success = await processImportData(text);
    if (success) {
        closeImportModal();
    }
}

/**
 * 从剪贴板导入 ComfyUI 工作流
 */
async function importFromClipboard() {
    try {
        let text = '';
        let clipboardSupported = false;
        
        // 尝试读取剪贴板
        if (navigator.clipboard && window.isSecureContext) {
            try {
                text = await navigator.clipboard.readText();
                clipboardSupported = true;
            } catch (err) {
                // 读取失败（常见于手机浏览器无权限），唤起手动输入弹窗
                console.log('剪贴板读取失败:', err);
                openImportModal();
                return;
            }
        } else {
            // 不支持剪贴板 API，唤起手动输入弹窗
            openImportModal();
            return;
        }
        
        // 如果支持剪贴板但内容为空，也允许手动输入
        if (clipboardSupported && !text.trim()) {
            showToast('剪贴板为空', 'error');
            openImportModal();
            return;
        }
        
        await processImportData(text);
    } catch (error) {
        console.error('导入工作流失败:', error);
        showToast('导入失败，请重试', 'error');
    }
}

async function sendToConsole() {
    if (!currentTaskId) {
        showToast('无法获取任务参数，请确保从历史记录中选择图片');
        return;
    }

    try {
        // 从服务器获取任务历史记录
        const res = await fetch(`${COMFYUI_SERVER}/history/${currentTaskId}`);
        const data = await res.json();
        const task = data[currentTaskId];

        if (!task || !task.prompt) {
            showToast('无法获取任务参数');
            return;
        }

        const promptData = task.prompt[2];
        await fillFormFromPromptData(promptData);

        // 关闭预览
        closePreview();
        toggleDrawer();
        showToast('参数已成功发送到控制台');
    } catch (error) {
        console.error('发送到控制台失败:', error);
        showToast('获取任务参数失败，请重试');
    }
}

// 上一张图片
function prevImage() {
    if (currentPreviewIndex >= 0 && currentPreviewIndex < historyImages.length - 1) {
        currentPreviewIndex++;
        document.getElementById('previewImg').src = historyImages[currentPreviewIndex];
        // 更新当前任务ID
        if (historyImageData[currentPreviewIndex]) {
            currentTaskId = historyImageData[currentPreviewIndex].taskId;
        }
        // 更新图片额外信息
        const data = historyImageData[currentPreviewIndex];
        currentImageExtraInfo = data ? { folder: data.folder || '-', time: data.time || '-' } : { folder: '-', time: '-' };
    }
}

// 下一张图片
function nextImage() {
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        document.getElementById('previewImg').src = historyImages[currentPreviewIndex];
        // 更新当前任务ID
        if (historyImageData[currentPreviewIndex]) {
            currentTaskId = historyImageData[currentPreviewIndex].taskId;
        }
        // 更新图片额外信息
        const data = historyImageData[currentPreviewIndex];
        currentImageExtraInfo = data ? { folder: data.folder || '-', time: data.time || '-' } : { folder: '-', time: '-' };
    }
}

// 键盘事件监听
document.addEventListener('keydown', function(e) {
    // 只有在预览模式打开时才响应键盘事件
    if (!document.getElementById('fullPreview').classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') {
            prevImage();
        } else if (e.key === 'ArrowRight') {
            nextImage();
        } else if (e.key === 'Escape') {
            closePreview();
        }
    }
});

// ========== 面板控制 ==========
// 清空提示词输入框
function clearPrompt() {
    const textarea = document.getElementById('promptText');
    textarea.value = '';
    showToast('提示词已清空');
}

// 控制提示词输入框高度
function togglePromptHeight() {
    const textarea = document.getElementById('promptText');
    const toggleBtn = document.getElementById('promptToggleBtn');

    // 检查当前是否处于展开状态
    if (textarea.style.height === '400px') {
        // 折叠状态
        textarea.style.height = '';
        textarea.setAttribute('rows', '3');
        toggleBtn.innerHTML = `
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
            </svg>
            <span>放大</span>
        `;
    } else {
        // 展开状态
        textarea.style.height = '400px';
        toggleBtn.innerHTML = `
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
            </svg>
            <span>缩小</span>
        `;
    }
}

function toggleModelsContainer() {
    const content = document.getElementById('modelsContent');
    const toggleBtn = document.getElementById('modelsToggleBtn');
    const arrow = document.getElementById('modelsArrow');
    
    const isHidden = content.classList.contains('hidden');
    
    if (isHidden) {
        content.classList.remove('hidden');
        toggleBtn.textContent = '收起';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        toggleBtn.textContent = '展开';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
}

// 控制生成参数容器的展开和收起
function toggleParamsContainer() {
    const content = document.getElementById('paramsContent');
    const toggleBtn = document.getElementById('paramsToggleBtn');
    const arrow = document.getElementById('paramsArrow');

    const isHidden = content.classList.contains('hidden');
    
    if (isHidden) {
        content.classList.remove('hidden');
        toggleBtn.textContent = '收起';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        toggleBtn.textContent = '展开';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
}

// 控制Control容器的展开和收起
function toggleControlContainer() {
    const content = document.getElementById('controlContent');
    const toggleBtn = document.getElementById('controlToggleBtn');

    const isHidden = content.classList.contains('hidden');
    
    if (isHidden) {
        content.classList.remove('hidden');
        toggleBtn.textContent = '收起';
    } else {
        content.classList.add('hidden');
        toggleBtn.textContent = '展开';
    }
}

// 上传 Control 参考图片
async function handleControlImageUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64 = e.target.result;
        
        try {
            showToast('正在上传图片...');
            const res = await fetch('/api/upload-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64 })
            });
            const data = await res.json();
            
            if (data.success) {
                document.getElementById('controlImagePath').value = data.path;
                document.getElementById('controlImageOriginalPath').value = data.path;
                
                const preview = document.getElementById('controlImagePreview');
                const placeholder = document.getElementById('controlImagePlaceholder');
                const previewImg = document.getElementById('controlImagePreviewImg');
                
                previewImg.src = base64;
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');
                const cropBtn = document.getElementById('controlCropBtn');
                cropBtn.disabled = false;
                
                showToast('图片上传成功');
            } else {
                showToast(data.error || '上传失败');
            }
        } catch (err) {
            console.error('上传图片失败:', err);
            showToast('上传失败');
        }
    };
    reader.readAsDataURL(file);
}

// ========== Control 图片裁剪 ==========
let cropState = {
    active: false,
    ratio: 1,
    boxX: 0, boxY: 0,
    boxW: 0, boxH: 0,
    containerW: 0, containerH: 0,
    dragging: false,
    resizing: false,
    handle: null,
    startX: 0, startY: 0,
    startBox: null
};

function getCropAspectRatio() {
    const ratio = document.getElementById('ratioSelect').value;
    if (ratio === '1:1') return 1;
    if (ratio === '3:4') return 3 / 4;
    if (ratio === '4:3') return 4 / 3;
    if (ratio === 'custom') {
        const w = parseInt(document.getElementById('widthInput').value) || 1;
        const h = parseInt(document.getElementById('heightInput').value) || 1;
        return w / h;
    }
    return 1;
}

async function openCropModal() {
    const previewImg = document.getElementById('controlImagePreviewImg');
    if (!previewImg.src) {
        showToast('请先上传参考图片');
        return;
    }

    const modal = document.getElementById('cropModal');
    const sourceImg = document.getElementById('cropSourceImg');
    const ratioHint = document.getElementById('cropRatioHint');

    // 始终使用原图进行裁剪
    const originalPath = document.getElementById('controlImageOriginalPath').value;
    if (originalPath && originalPath !== document.getElementById('controlImagePath').value) {
        sourceImg.src = '/api/read-image?path=' + encodeURIComponent(originalPath);
    } else {
        sourceImg.src = previewImg.src;
    }

    await new Promise((resolve, reject) => {
        sourceImg.onload = resolve;
        sourceImg.onerror = () => { showToast('图片加载失败'); reject(); };
    });

    const ratio = getCropAspectRatio();
    const ratioText = document.getElementById('ratioSelect').value;
    ratioHint.textContent = '裁剪比例: ' + ratioText;

    modal.classList.remove('hidden');
    cropState.active = true;

    // 等两帧确保浏览器布局完全稳定后再初始化
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            initCropBox(ratio);
        });
    });
}

function closeCropModal() {
    document.getElementById('cropModal').classList.add('hidden');
    cropState.active = false;
    cropState.dragging = false;
    cropState.resizing = false;

    // 清除显式尺寸，避免影响下次打开
    const img = document.getElementById('cropSourceImg');
    const container = document.getElementById('cropContainer');
    img.style.width = '';
    img.style.height = '';
    container.style.width = '';
    container.style.height = '';
}

function initCropBox(ratio) {
    const container = document.getElementById('cropContainer');
    const img = document.getElementById('cropSourceImg');

    // 读取图片在 CSS 约束后的实际渲染尺寸
    const displayW = img.offsetWidth;
    const displayH = img.offsetHeight;

    // 显式固定尺寸，确保后续事件处理基于确定值
    img.style.width = displayW + 'px';
    img.style.height = displayH + 'px';
    container.style.width = displayW + 'px';
    container.style.height = displayH + 'px';

    // 初始化裁剪框（居中，占 80%）
    const maxBoxW = displayW * 0.8;
    const maxBoxH = displayH * 0.8;

    let boxW, boxH;
    if (maxBoxW / ratio <= maxBoxH) {
        boxW = maxBoxW;
        boxH = maxBoxW / ratio;
    } else {
        boxH = maxBoxH;
        boxW = maxBoxH * ratio;
    }

    cropState.ratio = ratio;
    cropState.boxX = (displayW - boxW) / 2;
    cropState.boxY = (displayH - boxH) / 2;
    cropState.boxW = boxW;
    cropState.boxH = boxH;
    cropState.containerW = displayW;
    cropState.containerH = displayH;

    updateCropBoxStyle();
}

function updateCropBoxStyle() {
    const box = document.getElementById('cropBox');
    box.style.left = cropState.boxX + 'px';
    box.style.top = cropState.boxY + 'px';
    box.style.width = cropState.boxW + 'px';
    box.style.height = cropState.boxH + 'px';
}

function applyResize(handle, dx, dy) {
    const sb = cropState.startBox;
    let x = sb.boxX, y = sb.boxY, w = sb.boxW, h = sb.boxH;
    const ratio = cropState.ratio;
    const maxW = cropState.containerW;
    const maxH = cropState.containerH;

    const useDy = Math.abs(dy) > Math.abs(dx);
    let delta;

    if (useDy) {
        delta = dy;
        // 上侧手柄：向上拖动应增加高度
        if (handle === 'nw' || handle === 'ne') delta = -delta;
    } else {
        delta = dx;
        // 左侧手柄：向左拖动应增加宽度
        if (handle === 'nw' || handle === 'sw') delta = -delta;
    }

    if (useDy) {
        h = Math.max(64, h + delta);
        w = h * ratio;
    } else {
        w = Math.max(64, w + delta);
        h = w / ratio;
    }

    if (handle.includes('w')) x = sb.boxX + sb.boxW - w;
    if (handle.includes('n')) y = sb.boxY + sb.boxH - h;

    // 边界限制：确保不超出容器
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > maxW) w = maxW - x;
    if (y + h > maxH) h = maxH - y;

    w = Math.max(64, w);
    h = Math.max(64, h);

    // 保持比例并再次检查边界
    if (useDy) {
        w = h * ratio;
        if (x + w > maxW) {
            w = maxW - x;
            h = w / ratio;
        }
    } else {
        h = w / ratio;
        if (y + h > maxH) {
            h = maxH - y;
            w = h * ratio;
        }
    }

    if (handle.includes('w')) x = Math.max(0, sb.boxX + sb.boxW - w);
    if (handle.includes('n')) y = Math.max(0, sb.boxY + sb.boxH - h);

    cropState.boxX = x;
    cropState.boxY = y;
    cropState.boxW = w;
    cropState.boxH = h;
}

async function confirmCrop() {
    const sourceImg = document.getElementById('cropSourceImg');
    const naturalW = sourceImg.naturalWidth;
    const naturalH = sourceImg.naturalHeight;
    const displayW = sourceImg.offsetWidth;
    const displayH = sourceImg.offsetHeight;

    const sx = Math.round((cropState.boxX / displayW) * naturalW);
    const sy = Math.round((cropState.boxY / displayH) * naturalH);
    const sw = Math.round((cropState.boxW / displayW) * naturalW);
    const sh = Math.round((cropState.boxH / displayH) * naturalH);

    const maxCanvasSize = 2048;
    let canvasW = sw;
    let canvasH = sh;
    if (canvasW > maxCanvasSize || canvasH > maxCanvasSize) {
        const scale = maxCanvasSize / Math.max(canvasW, canvasH);
        canvasW = Math.round(canvasW * scale);
        canvasH = Math.round(canvasH * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, canvasW, canvasH);

    const base64 = canvas.toDataURL('image/png');

    try {
        showToast('正在保存裁剪图片...');
        const res = await fetch('/api/upload-image-crop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 })
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('controlImagePath').value = data.path;

            const previewImg = document.getElementById('controlImagePreviewImg');

            previewImg.src = base64;
            const cropBtn = document.getElementById('controlCropBtn');
            cropBtn.disabled = false;

            closeCropModal();
            showToast('裁剪图片已保存');
        } else {
            showToast(data.error || '保存失败');
        }
    } catch (err) {
        console.error('裁剪图片保存失败:', err);
        showToast('保存失败');
    }
}

// 绑定裁剪事件
(function setupCropEvents() {
    const container = document.getElementById('cropContainer');
    if (!container) return;

    function onStart(e) {
        if (!cropState.active) return;
        e.preventDefault();

        const target = e.target;
        const handle = target.closest('.crop-handle');
        const box = document.getElementById('cropBox');

        if (handle) {
            cropState.resizing = true;
            cropState.handle = handle.dataset.handle;
        } else if (target === box || box.contains(target)) {
            cropState.dragging = true;
        }

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        cropState.startX = clientX;
        cropState.startY = clientY;
        cropState.startBox = { boxX: cropState.boxX, boxY: cropState.boxY, boxW: cropState.boxW, boxH: cropState.boxH };
    }

    function onMove(e) {
        if (!cropState.active) return;
        if (!cropState.dragging && !cropState.resizing) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - cropState.startX;
        const dy = clientY - cropState.startY;

        if (cropState.dragging) {
            let newX = cropState.startBox.boxX + dx;
            let newY = cropState.startBox.boxY + dy;
            newX = Math.max(0, Math.min(newX, cropState.containerW - cropState.boxW));
            newY = Math.max(0, Math.min(newY, cropState.containerH - cropState.boxH));
            cropState.boxX = newX;
            cropState.boxY = newY;
            updateCropBoxStyle();
        } else if (cropState.resizing) {
            applyResize(cropState.handle, dx, dy);
            updateCropBoxStyle();
        }
    }

    function onEnd() {
        cropState.dragging = false;
        cropState.resizing = false;
        cropState.handle = null;
    }

    container.addEventListener('mousedown', onStart);
    container.addEventListener('touchstart', onStart, { passive: false });

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });

    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
})();

// ========== Control 遮罩绘制 ==========
let maskCtx = null;
let maskDrawing = false;
let maskLastPos = null;

async function initMaskCanvas() {
    const canvas = document.getElementById('maskCanvas');
    const refImg = document.getElementById('maskRefImg');
    const box = document.getElementById('maskCanvasBox');
    const wrapper = document.getElementById('maskCanvasWrapper');
    const ratio = getCropAspectRatio();

    // 画布实际像素尺寸（保存用）：最小边 768px
    let pixelW, pixelH;
    if (ratio >= 1) {
        pixelH = 768;
        pixelW = Math.round(768 * ratio);
    } else {
        pixelW = 768;
        pixelH = Math.round(768 / ratio);
    }

    // 获取 wrapper 可用空间（保底防止布局未就绪）
    const wrapperRect = wrapper.getBoundingClientRect();
    const availW = Math.max(300, (wrapperRect.width || 800) - 48);
    const availH = Math.max(300, (wrapperRect.height || 600) - 48);

    // 等比例缩放到可用空间
    let displayW = pixelW;
    let displayH = pixelH;
    const scale = Math.min(1, availW / pixelW, availH / pixelH);
    if (scale < 1) {
        displayW = Math.round(pixelW * scale);
        displayH = Math.round(pixelH * scale);
    }

    // 记录设计尺寸，供坐标转换使用
    canvas.dataset.designWidth = pixelW;
    canvas.dataset.designHeight = pixelH;

    // 设置容器固定尺寸（内部 absolute 元素以此为基准）
    box.style.width = displayW + 'px';
    box.style.height = displayH + 'px';

    // 加载参考图（先恢复显示状态）
    refImg.style.display = 'block';
    const previewImg = document.getElementById('controlImagePreviewImg');
    if (previewImg.src) {
        refImg.src = previewImg.src;
        try {
            await new Promise((resolve, reject) => {
                refImg.onload = resolve;
                refImg.onerror = (e) => {
                    console.warn('遮罩参考图加载失败:', previewImg.src.substring(0, 60));
                    reject(e);
                };
            });
        } catch (err) {
            refImg.style.display = 'none';
        }
    }

    // 设置 canvas 实际像素（考虑 DPR）和 CSS 显示尺寸
    const dpr = window.devicePixelRatio || 1;
    canvas.width = pixelW * dpr;
    canvas.height = pixelH * dpr;
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';

    maskCtx = canvas.getContext('2d');
    maskCtx.scale(dpr, dpr);
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';
    maskCtx.clearRect(0, 0, pixelW, pixelH); // 透明背景，由下方黑色半透明层提供视觉效果

    updateMaskBrushSize();

    // 显示画布尺寸
    const ratioText = document.getElementById('ratioSelect').value;
    document.getElementById('maskRatioHint').textContent = pixelW + '×' + pixelH + 'px · ' + ratioText;
}

function updateMaskBrushSize() {
    if (!maskCtx) return;
    const size = parseInt(document.getElementById('maskBrushSize').value);
    document.getElementById('maskBrushSizeValue').textContent = size;
    maskCtx.lineWidth = size;
    maskCtx.strokeStyle = '#ffffff';
    updateMaskFeather();
}

function updateMaskFeather() {
    if (!maskCtx) return;
    const feather = parseInt(document.getElementById('maskFeather').value);
    document.getElementById('maskFeatherValue').textContent = feather;
    maskCtx.shadowBlur = feather;
    maskCtx.shadowColor = '#ffffff';
    maskCtx.shadowOffsetX = 0;
    maskCtx.shadowOffsetY = 0;
}

function getMaskCanvasPos(e) {
    const canvas = document.getElementById('maskCanvas');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    // 将鼠标 CSS 坐标转换为 canvas 内部设计坐标（canvas 显示尺寸可能和实际像素不同）
    const displayW = rect.width;
    const displayH = rect.height;
    const designW = parseFloat(canvas.dataset.designWidth) || displayW;
    const designH = parseFloat(canvas.dataset.designHeight) || displayH;
    return {
        x: (clientX - rect.left) * (designW / displayW),
        y: (clientY - rect.top) * (designH / displayH)
    };
}

function maskDrawStart(e) {
    if (e.target !== document.getElementById('maskCanvas')) return;
    e.preventDefault();
    maskDrawing = true;
    maskLastPos = getMaskCanvasPos(e);
}

function maskDrawMove(e) {
    if (!maskDrawing || !maskCtx) return;
    e.preventDefault();
    const pos = getMaskCanvasPos(e);
    maskCtx.beginPath();
    maskCtx.moveTo(maskLastPos.x, maskLastPos.y);
    maskCtx.lineTo(pos.x, pos.y);
    maskCtx.stroke();
    maskLastPos = pos;
}

function maskDrawEnd() {
    maskDrawing = false;
    maskLastPos = null;
}

function clearMaskCanvas() {
    if (!maskCtx) return;
    const canvas = document.getElementById('maskCanvas');
    const w = parseFloat(canvas.style.width) || canvas.width;
    const h = parseFloat(canvas.style.height) || canvas.height;
    maskCtx.clearRect(0, 0, w, h);
}

function openMaskModal() {
    const previewImg = document.getElementById('controlImagePreviewImg');
    if (!previewImg.src) {
        showToast('请先上传参考图片');
        return;
    }

    const modal = document.getElementById('maskModal');
    modal.classList.remove('hidden');

    // 等布局稳定后初始化画布
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            initMaskCanvas();
        });
    });
}

function closeMaskModal() {
    document.getElementById('maskModal').classList.add('hidden');
    maskDrawing = false;
    maskLastPos = null;

    // 清理参考图和容器尺寸
    const refImg = document.getElementById('maskRefImg');
    const box = document.getElementById('maskCanvasBox');
    refImg.src = '';
    refImg.style.display = '';
    box.style.width = '';
    box.style.height = '';
}

async function confirmMask() {
    const canvas = document.getElementById('maskCanvas');
    if (!canvas) return;

    // 创建临时 canvas：黑色背景（100%）+ 叠加绘制内容
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = '#000000';
    tempCtx.fillRect(0, 0, canvas.width, canvas.height);
    tempCtx.drawImage(canvas, 0, 0);

    const base64 = tempCanvas.toDataURL('image/png');

    try {
        showToast('正在保存遮罩...');
        const res = await fetch('/api/upload-mask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 })
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('controlMaskPath').value = data.path;

            const preview = document.getElementById('controlMaskPreview');
            const placeholder = document.getElementById('controlMaskPlaceholder');
            const previewImg = document.getElementById('controlMaskPreviewImg');

            previewImg.src = base64;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
            document.getElementById('controlClearMaskBtn').classList.remove('hidden');

            closeMaskModal();
            showToast('遮罩已保存');
        } else {
            showToast(data.error || '保存失败');
        }
    } catch (err) {
        console.error('遮罩保存失败:', err);
        showToast('保存失败');
    }
}

function clearMask() {
    document.getElementById('controlMaskPath').value = '';
    const preview = document.getElementById('controlMaskPreview');
    const placeholder = document.getElementById('controlMaskPlaceholder');
    const previewImg = document.getElementById('controlMaskPreviewImg');

    previewImg.src = '';
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    document.getElementById('controlClearMaskBtn').classList.add('hidden');
}

// 绑定遮罩绘制事件
(function setupMaskEvents() {
    const canvas = document.getElementById('maskCanvas');
    const brushSize = document.getElementById('maskBrushSize');
    if (!canvas || !brushSize) return;

    canvas.addEventListener('mousedown', maskDrawStart);
    canvas.addEventListener('mousemove', maskDrawMove);
    canvas.addEventListener('mouseup', maskDrawEnd);
    canvas.addEventListener('mouseleave', maskDrawEnd);

    canvas.addEventListener('touchstart', maskDrawStart, { passive: false });
    canvas.addEventListener('touchmove', maskDrawMove, { passive: false });
    canvas.addEventListener('touchend', maskDrawEnd);

    brushSize.addEventListener('input', updateMaskBrushSize);

    const featherInput = document.getElementById('maskFeather');
    if (featherInput) featherInput.addEventListener('input', updateMaskFeather);
})();

// 恢复 Control 参考图片预览（用于导入工作流时显示已有图片）
async function restoreControlImagePreview(imagePath) {
    if (!imagePath) return;

    try {
        const res = await fetch(`/api/read-image?path=${encodeURIComponent(imagePath)}`);
        if (!res.ok) return;

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const preview = document.getElementById('controlImagePreview');
        const placeholder = document.getElementById('controlImagePlaceholder');
        const previewImg = document.getElementById('controlImagePreviewImg');

        previewImg.src = url;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
        const cropBtn = document.getElementById('controlCropBtn');
        cropBtn.disabled = false;

        // 释放旧的 URL
        if (previewImg.dataset.lastUrl) {
            URL.revokeObjectURL(previewImg.dataset.lastUrl);
        }
        previewImg.dataset.lastUrl = url;
    } catch (err) {
        console.error('恢复预览图失败:', err);
    }
}

// 控制保存参数容器的展开和收起
function toggleSaveParamsContainer() {
    const content = document.getElementById('saveParamsContent');
    const toggleBtn = document.getElementById('saveParamsBtn');
    const arrow = document.getElementById('saveParamsArrow');
    
    const isHidden = content.classList.contains('hidden');
    
    if (isHidden) {
        content.classList.remove('hidden');
        toggleBtn.textContent = '收起';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        toggleBtn.textContent = '展开';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
}

// 重置文件前缀为配置中的默认值
function resetFilePrefix() {
    if (config && config.prefix) {
        document.getElementById('filePrefix').value = config.prefix;
        showToast('文件前缀已重置为默认值');
    } else {
        showToast('无法获取默认文件前缀');
    }
}

// ========== Toast通知 ==========
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

// 点击预览遮罩关闭预览
document.getElementById('fullPreview').addEventListener('click', function(e) {
    // 只有点击遮罩本身（而不是内部的按钮或图片）时才关闭预览
    if (e.target === this) {
        closePreview();
    }
});

// ========== 图片信息 Popup 功能 ==========
let currentPromptInfo = null; // 当前图片的 prompt 信息
let isInfoPopupOpen = false; // 信息弹窗是否打开

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
    const previewImg = document.getElementById('previewImg');
    if (previewImg && previewImg.src) {
        parseImageInfo(previewImg.src);
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
    document.getElementById('popupInfoSampler').textContent = info.sampler;
    document.getElementById('popupInfoScheduler').textContent = info.scheduler;
    document.getElementById('popupInfoSteps').textContent = info.steps;
    document.getElementById('popupInfoCfg').textContent = info.cfg;

    // VAE名称映射
    let displayVae = info.vae;
    if (config && config.vae_models && info.vae && info.vae !== '-') {
        const vaeItem = config.vae_models.find(v => v.value === info.vae);
        if (vaeItem) displayVae = vaeItem.text;
    }
    document.getElementById('popupInfoVae').textContent = displayVae;
    document.getElementById('popupInfoVae').title = info.vae;

    // 模型名称映射
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
    
    // 额外信息：所在目录、生成时间
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
    // 即使 PNG 没有元数据，也显示文件信息
    document.getElementById('popupInfoFolder').textContent = currentImageExtraInfo.folder;
    document.getElementById('popupInfoTime').textContent = currentImageExtraInfo.time;
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
