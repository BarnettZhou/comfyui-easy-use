let SERVER;
let originalWorkflow;
let config;

// 获取本地IP地址
function getLocalIPFromServer() {
    const currentHost = window.location.hostname;
    return currentHost;
}

// ComfyUI 服务器地址（从配置读取）
let COMFYUI_SERVER;

// 初始化服务器配置
async function initServerConfig() {
    try {
        // 加载服务器配置
        const configResponse = await fetch('../config.json');
        config = await configResponse.json();

        // 获取本地IP地址（用于本服务）
        const localIP = getLocalIPFromServer();
        console.log('本服务IP地址:', localIP);
        const port = config.port;
        SERVER = `http://${localIP}:${port}`;

        // 从配置读取 ComfyUI 服务器地址（如果配置中未指定，则使用浏览器当前访问的地址）
        const comfyuiHost = config.comfyui_host || localIP;
        const comfyuiPort = config.comfyui_port || config.port || 8188;
        COMFYUI_SERVER = `http://${comfyuiHost}:${comfyuiPort}`;
        console.log('ComfyUI 服务器地址:', COMFYUI_SERVER, config.comfyui_host ? '(来自配置文件)' : '(来自浏览器地址)');
    } catch (error) {
        console.error('加载配置文件失败:', error);
        showToast('加载配置失败，请检查服务器是否正常运行');
    }
}

/**
 * 从原始 prompt 文本中提取需要的数据
 * @param {string} prompt_text - 原始 prompt 文本
 * @returns {Object} 提取的信息
 */
function extractPromptDataFromPromptText(prompt_text) {
    const prompt = JSON.parse(prompt_text);

    let width = prompt['5']?.inputs?.width || '-';
    let height = prompt['5']?.inputs?.height || '-';
    let model = prompt['34']?.inputs?.unet_name || '-';
    let samplerName = prompt['3']?.inputs?.sampler_name || '-';
    let scheduler = prompt['3']?.inputs?.scheduler || '-';
    let steps = prompt['3']?.inputs?.steps || '-';
    let cfgScale = prompt['3']?.inputs?.cfg || '-';
    let seed = prompt['3']?.inputs?.seed || '-';
    let promptText = prompt['6']?.inputs?.text || '';

    // 如果 width/height 为空，尝试从原始文本中正则提取
    if (width === '-' || height === '-') {
        const match = prompt_text.match(/"width":\s*(\d+),\s*"height":\s*(\d+)/);
        if (match) {
            width = match[1];
            height = match[2];
        }
    }

    // 如果 model 为空，尝试从 UNETLoader 节点中提取
    if (model === '-') {
        const match = prompt_text.match(/"unet_name":\s*"([^"]+)"/);
        if (match) {
            model = match[1];
        }
    }

    // 如果 samplerName 为空，尝试从 KSampler 节点中提取
    if (samplerName === '-') {
        const match = prompt_text.match(/"sampler_name":\s*"([^"]+)"/);
        if (match) {
            samplerName = match[1];
        }
    }

    // 如果 scheduler 为空，尝试从 KSampler 节点中提取
    if (scheduler === '-') {
        const match = prompt_text.match(/"scheduler":\s*"([^"]+)"/);
        if (match) {
            scheduler = match[1];
        }
    }

    // 如果 steps 为空，尝试从 KSampler 节点中提取
    if (steps === '-') {
        const match = prompt_text.match(/"steps":\s*(\d+)/);
        if (match) {
            steps = match[1];
        }
    }

    // 如果 cfgScale 为空，尝试从 KSampler 节点中提取
    if (cfgScale === '-') {
        const match = prompt_text.match(/"cfg":\s*([\d.]+)/);
        if (match) {
            cfgScale = match[1];
        }
    }

    // 如果 seed 为空，尝试从 KSampler 节点中提取
    if (seed === '-') {
        const match = prompt_text.match(/"seed":\s*(\d+)/);
        if (match) {
            seed = match[1];
        }
    }

    // 如果 promptText 为空，尝试从 CLIPTextEncode 节点中提取
    if (!promptText || promptText === '') {
        const match = prompt_text.match(/"text":\s*"([^"]+)"/);
        if (match) {
            promptText = match[1];
        }
    }

    // 解码 Unicode 转义序列
    promptText = decodeUnicode(promptText);

    return {
        size: width !== '-' && height !== '-' ? `${width} × ${height}` : '-',
        model: model,
        sampler: samplerName,
        scheduler: scheduler,
        steps: steps,
        cfg: cfgScale,
        seed: seed,
        prompt: promptText
    };
}

/**
 * 从 PNG 二进制数据中提取 prompt 信息
 * @param {Uint8Array} uint8Array - PNG 文件数据
 * @returns {Object|null} 解析后的 prompt 信息
 */
function extractPromptFromPNG(uint8Array) {
    try {
        // PNG 文件头签名
        const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        for (let i = 0; i < 8; i++) {
            if (uint8Array[i] !== pngSignature[i]) {
                console.error('不是有效的 PNG 文件');
                return null;
            }
        }
        
        let offset = 8; // 跳过 PNG 签名
        
        while (offset < uint8Array.length) {
            // 读取块长度（4字节，大端序）
            const length = (uint8Array[offset] << 24) | 
                          (uint8Array[offset + 1] << 16) | 
                          (uint8Array[offset + 2] << 8) | 
                          uint8Array[offset + 3];
            
            // 读取块类型（4字节）
            const type = String.fromCharCode(
                uint8Array[offset + 4],
                uint8Array[offset + 5],
                uint8Array[offset + 6],
                uint8Array[offset + 7]
            );
            
            // 检查是否是 tEXt 块
            if (type === 'tEXt' || type === 'iTXt') {
                const dataStart = offset + 8;
                const dataEnd = dataStart + length;
                const data = uint8Array.slice(dataStart, dataEnd);
                
                let nullIndex = data.indexOf(0);
                const keyword = new TextDecoder().decode(data.slice(0, nullIndex));
                
                // ComfyUI 的关键字通常是 'prompt'
                if (keyword === 'parameters' || keyword === 'prompt') {
                    try {
                        let text;
                        if (type === 'iTXt') {
                            // iTXt 结构较复杂：Keyword(null)Compression(null)Method(null)Lang(null)Tag(null)Text
                            // 这里简化处理，跳过前面的元数据找到实际内容
                            text = new TextDecoder().decode(data.slice(nullIndex + 5)); 
                        } else {
                            text = new TextDecoder().decode(data.slice(nullIndex + 1));
                        }
                        const prompt = JSON.parse(text);
                        return extractPromptDataFromPromptText(text);
                    } catch (e) {
                        console.error('解析 JSON 失败:', e);
                    }
                }
            }
            
            // IEND 块，结束解析
            if (type === 'IEND') {
                break;
            }
            
            // 移动到下一个块（长度 + 类型 + 数据 + CRC）
            offset += 12 + length;
        }
        
        return null;
    } catch (error) {
        console.error('提取 PNG 信息失败:', error);
        return null;
    }
}

/**
 * 解码 Unicode 转义序列（如 \u4e2d\u6587 转换为中文）
 * @param {string} str - 包含 Unicode 转义的字符串
 * @returns {string} 解码后的字符串
 */
function decodeUnicode(str) {
    if (!str || typeof str !== 'string') return str;
    
    return str.replace(/\\u([0-9a-fA-F]{4})/g, function(match, hex) {
        return String.fromCharCode(parseInt(hex, 16));
    });
}
