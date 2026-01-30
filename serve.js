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

// 检查config.json文件是否存在
const configPath = path.join(__dirname, 'config.json');
// const exampleConfigPath = path.join(__dirname, 'example-config.json');

if (!fs.existsSync(configPath)) {
    console.log('\n错误：未找到config.json配置文件！');
    console.log('\n请按照以下步骤配置：');
    console.log('1. 复制 example-config.json 文件');
    console.log('2. 将其重命名为 config.json');
    console.log('3. 根据实际情况修改配置内容');
    console.log('4. 重新启动本服务\n');
    console.log('提示：example-config.json 文件应位于当前目录下\n');
    process.exit(1);
}

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
        '/': '/pages/index.html',
        '/gallery': '/pages/gallery.html',
        '/history-gallery': '/pages/history-gallery.html',
        '/api/local-ip': '/api/local-ip' // 添加IP获取接口
    };

    // 处理API请求
    if (req.url === '/api/local-ip') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ localIP: getLocalIP() }), 'utf-8');
        return;
    }
    
    /**
     * 获取easy-use目录下的项目结构
     * @returns {Object} 包含目录和图片信息的结构对象
     * @example
     * {
     *   "structure": [
     *     {
     *       "name": "2026-01-11",
     *       "type": "directory",
     *       "path": "2026-01-11"
     *     },
     *     {
     *       "name": "image_0001.png",
     *       "type": "file",
     *       "path": "image_0001.png",
     *       "size": 12345,
     *       "mtime": "2026-01-11T00:00:00.000Z"
     *     }
     *   ]
     * }
     */
    if (req.url === '/api/easy-use/structure') {
        try {
            const easyUsePath = path.join(__dirname, '..', 'easy-use');
            const structure = [];
            
            // 读取easy-use目录下的所有项目
            const items = fs.readdirSync(easyUsePath);
            items.forEach(item => {
                const itemPath = path.join(easyUsePath, item);
                const stat = fs.statSync(itemPath);
                
                if (stat.isDirectory()) {
                    // 对于目录，添加到结构中
                    structure.push({
                        name: item,
                        type: 'directory',
                        path: item
                    });
                } else if (stat.isFile() && ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(item).toLowerCase())) {
                    // 对于根目录下的图片文件
                    structure.push({
                        name: item,
                        type: 'file',
                        path: item,
                        size: stat.size,
                        mtime: stat.mtime.toISOString()
                    });
                }
            });
            
            // 按名称排序，目录在前，文件在后
            structure.sort((a, b) => {
                if (a.type === 'directory' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ structure }), 'utf-8');
        } catch (error) {
            console.error('获取easy-use目录结构失败:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '获取目录结构失败' }), 'utf-8');
        }
        return;
    }

    /**
     * 获取指定目录下的图片列表
     * @param {string} dirPath - 目录路径，相对于easy-use目录
     * @returns {Object} 包含图片信息的对象
     * @example
     * {
     *   "files": [
     *     {
     *       "name": "image_0001.png",
     *       "path": "2026-01-11/image_0001.png",
     *       "size": 12345,
     *       "mtime": "2026-01-11T00:00:00.000Z"
     *     }
     *   ]
     * }
     */
    if (req.url.startsWith('/api/easy-use/images/')) {
        try {
            // 提取目录路径
            const dirPath = req.url.replace('/api/easy-use/images/', '');
            // 防止路径遍历攻击
            if (dirPath.includes('..')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '无效的路径' }), 'utf-8');
                return;
            }
            
            const targetPath = path.join(__dirname, '..', 'easy-use', dirPath);
            
            // 检查路径是否存在且是目录
            if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '目录不存在' }), 'utf-8');
                return;
            }
            
            // 读取目录中的图片文件
            const files = [];
            const items = fs.readdirSync(targetPath);
            items.forEach(item => {
                const itemPath = path.join(targetPath, item);
                const stat = fs.statSync(itemPath);
                
                if (stat.isFile() && ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(item).toLowerCase())) {
                    files.push({
                        name: item,
                        path: path.join(dirPath, item),
                        size: stat.size,
                        mtime: stat.mtime.toISOString()
                    });
                }
            });
            
            // 按修改时间倒序排序，最新的在前
            files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ files }), 'utf-8');
        } catch (error) {
            console.error('获取图片列表失败:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '获取图片列表失败' }), 'utf-8');
        }
        return;
    }

    /**
     * 提供easy-use目录中的图片文件访问
     * @param {string} filePath - 文件路径，相对于easy-use目录
     * @returns {File} 图片文件内容
     */
    if (req.url.startsWith('/api/easy-use/files/')) {
        try {
            // 提取文件路径
            const filePath = req.url.replace('/api/easy-use/files/', '');
            // 防止路径遍历攻击
            if (filePath.includes('..')) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h1>400 Bad Request</h1>', 'utf-8');
                return;
            }
            
            const targetPath = path.join(__dirname, '..', 'easy-use', filePath);
            
            // 检查文件是否存在
            if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
                return;
            }
            
            // 获取文件扩展名并设置MIME类型
            const extname = path.extname(targetPath);
            const contentType = mimeTypes[extname] || 'application/octet-stream';
            
            // 读取并返回文件内容
            fs.readFile(targetPath, (error, content) => {
                if (error) {
                    res.writeHead(500);
                    res.end(`Server Error: ${error.code}`, 'utf-8');
                } else {
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(content, 'utf-8');
                }
            });
        } catch (error) {
            console.error('访问文件失败:', error);
            res.writeHead(500);
            res.end(`Server Error: ${error.code}`, 'utf-8');
        }
        return;
    }

    // 处理文件路径
    let filePath = routes[req.url] || req.url;
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
