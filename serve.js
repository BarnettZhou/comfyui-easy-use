const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 获取局域网IP地址
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            // 跳过IPv6和回环地址
            if (net.family === 'IPv4' && !net.internal) {
                // 检查是否为标准私有IPv4地址（适用于所有局域网环境）
                // 私有网段：10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
                if (
                    net.address.startsWith('10.') ||
                    (net.address.startsWith('172.') && parseInt(net.address.split('.')[1]) >= 16 && parseInt(net.address.split('.')[1]) <= 31) ||
                    net.address.startsWith('192.168.')
                ) {
                    return net.address;
                }
            }
        }
    }
    
    // 如果没有找到私有IP地址，返回本地地址
    return '127.0.0.1';
}

// 服务器配置
const PORT = 11451;
const HOST = '0.0.0.0'; // 允许所有设备访问

// 支持的MIME类型
const mimeTypes = {
    '.html': 'text/html',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.json': 'application/json'
};

// 创建服务器
const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    
    // 路由映射
    const routes = {
        '/gallery': '/pages/gallery.html',
        '/history-gallery.html': '/pages/gallery.html' // 保持向后兼容
    };

    // 默认访问index.html
    let filePath = routes[req.url] || (req.url === '/' ? '/index.html' : req.url);
    filePath = path.join(__dirname, filePath);
    
    // 获取文件扩展名
    const extname = path.extname(filePath);
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    // 读取文件并响应
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // 文件不存在
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                // 服务器错误
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            // 文件存在，返回内容
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// 启动服务器
server.listen(PORT, HOST, () => {
    const localIP = getLocalIP();
    console.log(`Server running at http://${HOST}:${PORT}/`);
    console.log('Local access: http://localhost:11451/');
    console.log(`LAN access: http://${localIP}:11451/`);
});
