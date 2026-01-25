let SERVER;
let originalWorkflow;
let config;

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

// 初始化服务器配置
async function initServerConfig() {
    try {
        // 加载服务器配置
        const configResponse = await fetch('../config.json');
        config = await configResponse.json();

        // 获取本地IP地址
        const localIP = await getLocalIPFromServer();
        console.log('本地IP地址:', localIP);
        const port = config.PORT;
        SERVER = `http://${localIP}:${port}`;

        // 加载历史记录
        await loadHistory();
    } catch (error) {
        console.error('加载配置文件失败:', error);
        showToast('加载配置失败，请检查服务器是否正常运行');
    }
}
