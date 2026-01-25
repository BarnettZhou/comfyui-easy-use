// 配置从外部JSON文件加载
let SERVER;
let originalWorkflow;

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

// 尺寸选项映射
const sizeMap = {
    '1:1': [
        { value: '768,768', text: '768 x 768 (测试)' },
        { value: '1024,1024', text: '1024 x 1024' },
        { value: '1200,1200', text: '1280 x 1280' }
    ],
    '3:4': [
        { value: '576,768', text: '576 x 768 (测试)' },
        { value: '768,1024', text: '768 x 1024' },
        { value: '960,1280', text: '960 x 1280' },
        { value: '1080,1440', text: '1080 x 1440' },
        { value: '1152,1536', text: '1152 x 1536' },
        { value: '1200,1600', text: '1200 x 1600' }
    ],
};

// 采样器选项映射
const samplerOptions = [
    { value: 'er_sde,sgm_uniform', text: 'er_sde + sgm_uniform(黑兽)' },
    { value: 'euler,sgm_uniform', text: 'euler + sgm_uniform(黑兽)' },
    { value: 'er_sde,simple', text: 'er_sde + simple' },
    { value: 'res_multistep,simple', text: 'res_multistep + simple' },
    { value: 'euler,simple', text: 'euler + simple(BEYOND)' },
    { value: 'dpmpp_2m,beta', text: 'dpmpp_2m + beta(unStable)' },
    { value: 'dpmpp_2s_ancestral,FlowMatchEulerDiscreteScheduler', text: 'dpmpp_2s_ancestral + FlowMatchEulerDiscreteScheduler' }
];

// 页面卸载时停止轮询
window.addEventListener('beforeunload', stopHistoryPolling);

// 获取本地IP地址
async function getLocalIPFromServer() {
    try {
        const response = await fetch('/api/local-ip');
        const data = await response.json();
        return data.localIP;
    } catch (error) {
        console.error('获取本地IP失败:', error);
        return null;
    }
}

// 初始化时加载配置
async function initConfig() {
    try {
        // 加载服务器配置
        const configResponse = await fetch('config.json');
        const config = await configResponse.json();
        // SERVER = config.SERVER;

        // 获取本地IP地址
        const localIP = await getLocalIPFromServer();
        console.log('本地IP地址:', localIP);
        const port = config.PORT;
        SERVER = `http://${localIP}:${port}`;

        // 加载工作流配置
        const workflowResponse = await fetch('original_workflow_lora.json');
        originalWorkflow = await workflowResponse.json();

        // 初始化模型下拉选项
        const modelSelect = document.getElementById('modelSelect');
        modelSelect.innerHTML = '';
        config.diffusion_models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });

        // 初始化VAE下拉选项
        const vaeSelect = document.getElementById('vaeSelect');
        vaeSelect.innerHTML = '';
        config.vae_models.forEach(vae => {
            const option = document.createElement('option');
            option.value = vae;
            option.textContent = vae;
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
        samplerOptions.forEach(option => {
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
    const wsUrl = SERVER.replace('http', 'ws') + '/ws?clientId=easy_gen_client';
    socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
        console.log('收到消息:', event.data);

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
document.addEventListener('DOMContentLoaded', initConfig);

// 分辨率提示更新
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

// 主生成逻辑
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

        // // 保存参数
        // const date_str = new Date().toISOString().split('T')[0];
        // p["42"].inputs.filename_prefix = `zit-api/${date_str}/${prefix}`;
        // p["9"].inputs.filename_prefix = `zit-api/${date_str}/${prefix}`;

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
        p["9"].inputs.filename_prefix = prefix;
        if (p["42"]) p["42"].inputs.filename_prefix = prefix;

        for(let i = 0; i < batchCount; i++) {
            if (shouldStop) break; 
            btn.innerText = `Running ${i + 1}/${batchCount}`;

            const res = await fetch(`${SERVER}/prompt`, {
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
                const res = await fetch(`${SERVER}/history/${id}`);
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

// 渲染图片
function renderImg(outputs) {
    const container = document.getElementById('imageContainer');
    
    if (clearOnNextRender) {
        container.innerHTML = ""; 
        clearOnNextRender = false; 
    }

    const nodeIds = Object.keys(outputs).sort().reverse();

    for(let nodeId of nodeIds) {
        outputs[nodeId].images.forEach(img => {
            const url = `${SERVER}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`;
            
            const wrapper = document.createElement('div');
            wrapper.className = "relative group animate-fade-in"; 
            wrapper.innerHTML = `
                <img src="${url}" loading="lazy" onclick="openResultPreview('${url}')" 
                        class="w-full h-auto rounded-lg shadow-lg cursor-pointer hover:opacity-90 transition border border-gray-700">
                <span class="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                    ${nodeId == '39' || nodeId == '42' ? '高清大图' : '预览草图'}
                </span>
            `;
            container.prepend(wrapper); 
        });
    }
}

// 历史记录
async function loadHistory() {
    const res = await fetch(`${SERVER}/history`);
    const data = await res.json();
    const list = document.getElementById('historyList');
    const newEntries = []; // 存储新的历史记录项
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
                    imgWrapper.className = "relative w-full mb-2";
                    
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
                    
                    // 将新元素和数据存储起来
                    newEntries.unshift(imgWrapper); // 保持最新的在前面
                    newHistoryImages.unshift(url); // 保持最新的在前面
                    newHistoryImageData.unshift({ url, taskId }); // 保持最新的在前面
                }
            });
        }
    });

    // 如果有新的记录，添加到列表顶部
    if (newEntries.length > 0) {
        // 将新记录添加到列表开头
        newEntries.forEach(entry => {
            list.insertBefore(entry, list.firstChild);
        });

        // 更新历史数组（保持最新的在前面）
        historyImages = [...historyImages, ...newHistoryImages];
        historyImageData = [...historyImageData, ...newHistoryImageData];
    }
}

async function interruptTask(type) {
    shouldStop = true;
    if(type === 'all') {
        await fetch(`${SERVER}/queue`, { method: 'POST', body: JSON.stringify({clear: true}) });
        alert("已请求清空队列");
    } else {
        await fetch(`${SERVER}/interrupt`, { method: 'POST' });
    }
}

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

function closePreview() {
    document.getElementById('fullPreview').classList.add('hidden');
}

function toggleDrawer() { 
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawerOverlay');

    drawer.classList.toggle('drawer-closed');
    overlay.classList.toggle('hidden');

    if(!drawer.classList.contains('drawer-closed')) {
        // 抽屉打开时，清空已显示图片键集合和历史数组
        displayedTaskIds.clear();
        historyImages = [];
        historyImageData = [];
        // 清空历史记录列表
        document.getElementById('historyList').innerHTML = "";
        // 重新加载所有历史记录
        loadHistory();
        // 启动轮询
        startHistoryPolling();
    } else {
        // 抽屉关闭时，停止轮询
        stopHistoryPolling();
    }
}

// 点击遮罩关闭抽屉
document.getElementById('drawerOverlay').addEventListener('click', toggleDrawer);

// 请求 Comfyui 服务，清空历史记录
async function clearHistory() {
    if (confirm('是否清空历史记录？')) {
        try {
            // 调用ComfyUI API清除历史记录
            await fetch(`${SERVER}/history`, {
                method: 'POST',
                body: JSON.stringify({clear: true})
            });
            
            // 清空本地数据和UI
            displayedTaskIds.clear();
            historyImages = [];
            historyImageData = [];
            document.getElementById('historyList').innerHTML = "";
            
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
        const res = await fetch(`${SERVER}/history/${currentTaskId}`);
        const data = await res.json();
        const task = data[currentTaskId];

        console.log(task);

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
            document.getElementById('modelSelect').value = promptData["34"].inputs.unet_name;
        }

        if (promptData["32"] && promptData["32"].inputs.vae_name) {
            document.getElementById('vaeSelect').value = promptData["32"].inputs.vae_name;
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
        let prefix = '';
        if (promptData["9"] && promptData["9"].inputs.filename_prefix) {
            prefix = promptData["9"].inputs.filename_prefix;
            document.getElementById('filePrefix').value = prefix;
        }
        if (promptData["42"] && promptData["42"].inputs.filename_prefix) {
            document.getElementById('filePrefix').value = promptData["42"].inputs.filename_prefix;
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

// 控制提示词输入框高度
function togglePromptHeight() {
    const textarea = document.getElementById('promptText');
    const toggleBtn = document.getElementById('promptToggleBtn');

    // 检查当前是否处于展开状态
    if (textarea.style.height === '400px') {
        // 折叠状态
        textarea.style.height = '';
        textarea.setAttribute('rows', '3');
        toggleBtn.textContent = '放大';
    } else {
        // 展开状态
        textarea.style.height = '400px';
        toggleBtn.textContent = '缩小';
    }
}

function toggleModelsContainer() {
    const content = document.getElementById('modelsContent');
    const toggleBtn = document.getElementById('modelsToggleBtn');
    // 检查当前是否处于展开状态
    if (content.style.display === 'none') {
        // 展开状态
        content.style.display = 'grid';
        toggleBtn.textContent = '收起';
    } else {
        // 折叠状态
        content.style.display = 'none';
        toggleBtn.textContent = '展开';
    }
}

// 控制生成参数容器的展开和收起
function toggleParamsContainer() {
    const content = document.getElementById('paramsContent');
    const toggleBtn = document.getElementById('paramsToggleBtn');

    // 检查当前是否处于展开状态
    if (content.style.display === 'none') {
        // 展开状态
        content.style.display = 'grid';
        toggleBtn.textContent = '收起';
    } else {
        // 折叠状态
        content.style.display = 'none';
        toggleBtn.textContent = '展开';
    }
}

// 控制图片放大容器的展开和收起
function toggleUpscaleContainer() {
    const content = document.getElementById('upscaleContent');
    const toggleBtn = document.getElementById('upscaleToggleBtn');

    // 检查当前是否处于展开状态
    if (content.style.display === 'none') {
        // 展开状态
        content.style.display = 'block';
        toggleBtn.textContent = '收起';
    } else {
        // 折叠状态
        content.style.display = 'none';
        toggleBtn.textContent = '展开';
    }
}

// 控制保存参数容器的展开和收起
function toggleSaveParamsContainer() {
    const content = document.getElementById('saveParamsContent');
    const toggleBtn = document.getElementById('saveParamsBtn');
    // 检查当前是否处于展开状态
    if (content.style.display === 'none') {
        // 展开状态
        content.style.display = 'block';
        toggleBtn.textContent = '收起';
    } else {
        // 折叠状态
        content.style.display = 'none';
        toggleBtn.textContent = '展开';
    }
}

// 控制LoRAs容器的展开和收起
function toggleLoraContainer() {
    const content = document.getElementById('loraContent');
    const toggleBtn = document.getElementById('loraToggleBtn');

    // 检查当前是否处于展开状态
    if (content.style.display === 'none') {
        // 展开状态
        content.style.display = 'block';
        toggleBtn.textContent = '收起';
    } else {
        // 折叠状态
        content.style.display = 'none';
        toggleBtn.textContent = '展开';
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

// 预览生成结果图片（独立预览，不参与历史导航）
function openResultPreview(url) {
    const preview = document.getElementById('fullPreview');
    const previewImg = document.getElementById('previewImg');

    // 显示预览但不设置当前索引，这样导航按钮将不会工作
    previewImg.src = url;
    preview.classList.remove('hidden');

    // 临时将历史导航功能禁用
    currentPreviewIndex = -1;
    currentTaskId = null; // 从当前结果打开的图片没有历史任务ID

    // 隐藏导航按钮
    document.getElementById('prevBtn').classList.add('hidden');
    document.getElementById('nextBtn').classList.add('hidden');
}

// 点击预览遮罩关闭预览
document.getElementById('fullPreview').addEventListener('click', function(e) {
    // 只有点击遮罩本身（而不是内部的按钮或图片）时才关闭预览
    if (e.target === this) {
        closePreview();
    }
});