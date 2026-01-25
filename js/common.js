let SERVER;
let originalWorkflow;
let config;

// 获取本地IP地址
function getLocalIPFromServer() {
    const currentHost = window.location.hostname;
    return currentHost;
}

// 初始化服务器配置
async function initServerConfig() {
    try {
        // 加载服务器配置
        const configResponse = await fetch('../config.json');
        config = await configResponse.json();

        // 获取本地IP地址
        const localIP = getLocalIPFromServer();
        console.log('服务IP地址:', localIP);
        const port = config.port;
        SERVER = `http://${localIP}:${port}`;
    } catch (error) {
        console.error('加载配置文件失败:', error);
        showToast('加载配置失败，请检查服务器是否正常运行');
    }
}
