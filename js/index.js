// 全局状态控制
let isGenerating = false;
let shouldStop = false;
let clearOnNextRender = false; 
let historyImages = [];     // 存储历史图片URL数组
let historyImageData = [];  // 存储历史图片URL和任务ID的关联信息
let currentPreviewIndex = 0; // 当前预览图片的索引 
let currentTaskId = null;   // 当前预览图片的任务ID
let prefix; // 文件保存前缀全局变量
let historyPollingTimer = null; // 历史记录轮询定时器
let displayedTaskIds = new Set(); // 跟踪已显示的任务ID，用于优化历史记录加载
let socket; // WebSocket 实例，用于监听进度更新

// 页面卸载时停止轮询
window.addEventListener('beforeunload', stopHistoryPolling);

// 初始化原始工作流
async function initOriginalWorkflow() {
    try {
        // 加载原始工作流
        const workflowResponse = await fetch('../original_workflow.json');
        originalWorkflow = await workflowResponse.json();
        console.log('原始工作流:', originalWorkflow);
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

        // 初始化LoRA模型下拉选项
        const loraSelect = document.getElementById('loraModel');
        loraSelect.innerHTML = '';
        config.loras.forEach(lora => {
            const option = document.createElement('option');
            option.value = lora;
            option.textContent = lora;
            loraSelect.appendChild(option);
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

    socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
            const msg = JSON.parse(event.data);

            if (msg.type === 'progress') {
                const { value, max, node } = msg.data;
                const percent = Math.round((value / max) * 100) + '%';
                
                // 根据 original_workflow.json 节点 ID 分配进度
                if (node === "3") { // 初步采样节点
                    document.getElementById('progress1').style.width = percent;
                    document.getElementById('progressText1').innerText = percent;
                    document.getElementById('progressSection2').classList.add('opacity-50');
                } else if (node === "40") { // 二次采样节点
                    document.getElementById('progress2').style.width = percent;
                    document.getElementById('progressText2').innerText = percent;
                    document.getElementById('progressSection2').classList.remove('opacity-50');
                }
            }

            if (msg.type === 'execution_start') {
                resetProgress();
            }
            
            if (msg.type === 'executing' && msg.data.node === null) {
                // 队列中所有任务执行完毕
                setTimeout(() => {
                    document.getElementById('progressContainer').classList.add('hidden');
                }, 2000);
            }
        } else {
            // pass
        }
    };

    socket.onclose = () => setTimeout(setupWebSocket, 5000); // 掉线重连
}

function resetProgress() {
    document.getElementById('progress1').style.width = '0%';
    document.getElementById('progress2').style.width = '0%';
    document.getElementById('progressText1').innerText = '0%';
    document.getElementById('progressText2').innerText = '0%';
    document.getElementById('progressSection2').classList.add('opacity-50');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async function() {
    await initServerConfig();
    initOriginalWorkflow();
    initConsole();
    initTheme();
});

// ========== 主题切换功能 ==========
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.classList.contains('dark') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    if (newTheme === 'dark') {
        html.classList.add('dark');
    } else {
        html.classList.remove('dark');
    }
    
    localStorage.setItem('theme', newTheme);
}

// 初始化主题
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    
    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            if (e.matches) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }
    });
}

// ========== 分辨率提示更新 ==========
function updateResHint() {
    const ratio = document.getElementById('ratioSelect').value;
    const scale = parseFloat(document.getElementById('upscaleScale').value);
    let w, h;
    
    if (ratio === 'custom') {
        // 自定义大小：从输入框获取值
        w = parseInt(document.getElementById('widthInput').value) || 0;
        h = parseInt(document.getElementById('heightInput').value) || 0;
    } else {
        // 预设比例：从下拉框获取值
        const sizeValue = document.getElementById('sizeSelect').value;
        [w, h] = sizeValue ? sizeValue.split(',').map(Number) : [0, 0];
    }
    
    document.getElementById('targetRes').innerText = `${Math.round(w * scale)} x ${Math.round(h * scale)}`;
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
    
    // 显示进度条并重置进度
    document.getElementById('progressContainer').classList.remove('hidden');
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

        // 放大处理
        if(!document.getElementById('upscaleEnable').checked) {
            delete p["38"]; delete p["39"]; delete p["40"]; delete p["42"];
        } else {
            p["38"].inputs.scale_by = parseFloat(document.getElementById('upscaleScale').value);
            p["40"].inputs.seed = seed;
            p["40"].inputs.sampler_name = sampler;
            p["40"].inputs.scheduler = scheduler;
            p["40"].inputs.denoise = parseFloat(document.getElementById('denoiseValue').value);
            p["40"].inputs.cfg = parseFloat(document.getElementById('cfgInput').value);
            p["40"].inputs.steps = parseInt(document.getElementById('stepsInput').value);
        }

        // LoRA处理
        if(document.getElementById('loraEnable').checked) {
            p["44"].inputs.lora_name = document.getElementById('loraModel').value;
            p["44"].inputs.strength_model = parseFloat(document.getElementById('loraStrength').value);
            p["25"].inputs.shift = 22; // mystic-xxx-zit-v2 的特殊参数
        } else {
            delete p["44"];
            p["25"].inputs.shift = 3;
            p["25"].inputs.model = ["34", 0]
        }

        // 文件前缀处理
        prefix = document.getElementById('filePrefix').value || prefix;
        // 如果prefix中包含%date%，则替换为实际日期
        if (prefix.includes('%date%')) {
            const date_str = new Date().toISOString().split('T')[0];
            prefix = prefix.replace(/%date%/g, date_str);
        }
        const filename_prefix = config.output_dir + "/" + prefix;
        p["9"].inputs.filename_prefix = filename_prefix;
        if (p["42"]) p["42"].inputs.filename_prefix = filename_prefix;

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
            if(p["40"]) p["40"].inputs.seed = p["3"].inputs.seed;
        }

    } catch (e) {
        console.error(e);
        alert("任务发送失败，请检查控制台连接");
    } finally {
        isGenerating = false;
        btn.disabled = false;
        btn.innerText = originalText;
        btn.classList.add('hover:bg-blue-700');
        
        // 所有任务执行完毕后隐藏进度条
        setTimeout(() => {
            document.getElementById('progressContainer').classList.add('hidden');
        }, 2000);
    }
}

function trackTask(id) {
    return new Promise((resolve) => {
        const timer = setInterval(async () => {
            try {
                const res = await fetch(`${COMFYUI_SERVER}/history/${id}`);
                const data = await res.json();
                if(data[id]) {
                    clearInterval(timer);
                    renderImg(data[id].outputs);
                    resolve(); 
                }
            } catch(e) { }
        }, 1000); 
    });
}

// ========== 渲染图片 ==========
function renderImg(outputs) {
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
        outputs[nodeId].images.forEach(img => {
            const url = `${COMFYUI_SERVER}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'relative group animate-fade-in';
            wrapper.innerHTML = `
                <div class="aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 img-skeleton">
                    <img src="${url}" loading="lazy" onclick="openResultPreview('${url}')" 
                        class="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                        onload="this.parentElement.classList.remove('img-skeleton')">
                </div>
                <span class="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm">
                    ${nodeId == '39' || nodeId == '42' ? '高清大图' : '预览草图'}
                </span>
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl"></div>
            `;
            container.prepend(wrapper);
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

    Object.entries(data).reverse().forEach(([taskId, item]) => {
        if (!item.outputs) return;
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
                    
                    const isLargeImage = nid === '39' || nid === '42';
                    const labelColor = isLargeImage ? 'bg-purple-500' : 'bg-primary-500';
                    
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
                    label.className = `absolute top-2 right-2 ${labelColor} text-white text-xs px-2 py-1 rounded-lg backdrop-blur-sm pointer-events-none`;
                    label.style.pointerEvents = 'none';
                    label.textContent = isLargeImage ? '高清' : '预览';
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
                    
                    newEntries.unshift(container);
                    newHistoryImages.unshift(url);
                    newHistoryImageData.unshift({ url, taskId });
                }
            });
        }
    });

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
}

function closePreview() {
    document.getElementById('fullPreview').classList.add('hidden');
    // 只有当抽屉也关闭时才恢复body滚动
    const drawer = document.getElementById('drawer');
    if (drawer && drawer.classList.contains('drawer-closed')) {
        document.body.style.overflow = '';
    }
}

// 预览生成结果图片（独立预览，不参与历史导航）
function openResultPreview(url) {
    const preview = document.getElementById('fullPreview');
    const previewImg = document.getElementById('previewImg');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    // 显示预览但不设置当前索引，这样导航按钮将不会工作
    previewImg.src = url;
    preview.classList.remove('hidden');
    // 禁用body滚动
    document.body.style.overflow = 'hidden';

    // 临时将历史导航功能禁用
    currentPreviewIndex = -1;
    currentTaskId = null; // 从当前结果打开的图片没有历史任务ID

    // 隐藏导航按钮
    if (prevBtn) prevBtn.classList.add('hidden');
    if (nextBtn) nextBtn.classList.add('hidden');
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
});

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

function openInNewTab() {
    const imgUrl = document.getElementById('previewImg').src;
    window.open(imgUrl, '_blank');
}

// 发送到控制台功能
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

        // 填充表单参数
        // 提示词
        if (promptData["6"] && promptData["6"].inputs.text) {
            document.getElementById('promptText').value = promptData["6"].inputs.text;
        }

        // 模型和VAE
        if (promptData["34"] && promptData["34"].inputs.unet_name) {
            const unetName = promptData["34"].inputs.unet_name;
            // 查找模型名称对应的显示文本
            const modelOption = config.diffusion_models.find(opt => opt.value === unetName);
            if (modelOption) {
                document.getElementById('modelSelect').value = modelOption.value;
            }
        }

        if (promptData["32"] && promptData["32"].inputs.vae_name) {
            // 查找VAE名称对应的显示文本
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
        }

        // 图片尺寸
        if (promptData["5"] && promptData["5"].inputs.width && promptData["5"].inputs.height) {
            const imgWidth = promptData["5"].inputs.width;
            const imgHeight = promptData["5"].inputs.height;
            const sizeValue = `${imgWidth},${imgHeight}`;
            
            // 检查是否在预设sizeMap中
            let foundRatio = null;
            let foundSize = null;
            
            // 获取尺寸映射
            const sizeMap = await getSizeMap();

            // 遍历sizeMap查找匹配的尺寸
            Object.keys(sizeMap).forEach(ratio => {
                sizeMap[ratio].forEach(size => {
                    if (size.value === sizeValue) {
                        foundRatio = ratio;
                        foundSize = size.value;
                    }
                });
            });
            
            if (foundRatio) {
                // 尺寸在预设中：设置对应的比例和尺寸
                document.getElementById('ratioSelect').value = foundRatio;
                updateSizeOptions(); // 更新尺寸下拉框
                document.getElementById('sizeSelect').value = foundSize;
            } else {
                // 尺寸不在预设中：使用自定义大小
                document.getElementById('ratioSelect').value = 'custom';
                updateSizeOptions(); // 显示自定义输入框
                document.getElementById('widthInput').value = imgWidth;
                document.getElementById('heightInput').value = imgHeight;
            }
            
            updateResHint(); // 更新目标分辨率提示
        }

        // 采样器组合
        if (promptData["3"] && promptData["3"].inputs.sampler_name && promptData["3"].inputs.scheduler) {
            const samplerValue = `${promptData["3"].inputs.sampler_name},${promptData["3"].inputs.scheduler}`;
            document.getElementById('samplerSelect').value = samplerValue;
        }

        // 图片放大设置
        if (promptData["38"] && promptData["38"].inputs.scale_by) {
            document.getElementById('upscaleEnable').checked = true;
            document.getElementById('upscaleScale').value = promptData["38"].inputs.scale_by;
            updateResHint(); // 更新目标分辨率提示
        } else {
            document.getElementById('upscaleEnable').checked = false;
        }

        if (promptData["44"]) {
            document.getElementById('loraEnable').checked = true;
            document.getElementById('loraModel').value = promptData["44"].inputs.lora_name;
            document.getElementById('loraStrength').value = promptData["44"].inputs.strength_model;
        } else {
            document.getElementById('loraEnable').checked = false;
        }

        // Denoise参数
        if (promptData["40"] && promptData["40"].inputs.denoise) {
            document.getElementById('denoiseValue').value = promptData["40"].inputs.denoise;
        }

        // 文件名前缀
        if (promptData["9"] && promptData["9"].inputs.filename_prefix) {
            let prefix_parts = promptData["9"].inputs.filename_prefix.split('/');
            prefix_parts.shift();
            document.getElementById('filePrefix').value = prefix_parts.join('/');;
        }

        if (promptData["42"] && promptData["42"].inputs.filename_prefix) {
            let prefix_parts = promptData["42"].inputs.filename_prefix.split('/');
            prefix_parts.shift();
            document.getElementById('filePrefix').value = prefix_parts.join('/');
        }

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

// 控制图片放大容器的展开和收起
function toggleUpscaleContainer() {
    const content = document.getElementById('upscaleContent');
    const toggleBtn = document.getElementById('upscaleToggleBtn');

    const isHidden = content.classList.contains('hidden');
    
    if (isHidden) {
        content.classList.remove('hidden');
        toggleBtn.textContent = '收起';
    } else {
        content.classList.add('hidden');
        toggleBtn.textContent = '展开';
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

// 控制LoRAs容器的展开和收起
function toggleLoraContainer() {
    const content = document.getElementById('loraContent');
    const toggleBtn = document.getElementById('loraToggleBtn');

    const isHidden = content.classList.contains('hidden');
    
    if (isHidden) {
        content.classList.remove('hidden');
        toggleBtn.textContent = '收起';
    } else {
        content.classList.add('hidden');
        toggleBtn.textContent = '展开';
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
