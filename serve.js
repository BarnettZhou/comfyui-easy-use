const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

// 引入数据库模块
const ImageDatabase = require('./db');

// 数据库实例
const db = new ImageDatabase();

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

// easy-use 目录路径
const EASY_USE_DIR = path.join(__dirname, '..', 'easy-use');

// 检查config.json文件是否存在
const configPath = path.join(__dirname, 'config.json');

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
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.svg': 'image/svg+xml'
};

// ==================== 图片扫描功能 ====================

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

/**
 * 检查文件是否为图片
 */
function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * 获取日期字符串
 */
function getDateString(date = new Date()) {
    return date.toISOString().split('T')[0];
}

/**
 * 扫描单个目录中的图片
 */
function scanDirectory(dirPath, relativePath = '') {
    const images = [];
    
    try {
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const itemRelativePath = relativePath ? path.join(relativePath, item) : item;
            
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                const subImages = scanDirectory(fullPath, itemRelativePath);
                images.push(...subImages);
            } else if (stat.isFile() && isImageFile(item)) {
                images.push({
                    filename: item,
                    path: itemRelativePath.replace(/\\/g, '/'),
                    full_path: fullPath,
                    size: stat.size,
                    mtime: Math.floor(stat.mtime.getTime() / 1000)
                });
            }
        }
    } catch (error) {
        console.error(`[扫描错误] ${dirPath}:`, error.message);
    }
    
    return images;
}

/**
 * 扫描指定日期目录
 */
function scanDateDirectory(dateStr) {
    const dateDir = path.join(EASY_USE_DIR, dateStr);
    
    if (!fs.existsSync(dateDir)) {
        return [];
    }
    
    return scanDirectory(dateDir, dateStr);
}

/**
 * 执行心跳扫描任务（扫描最近两天）
 */
function doHeartbeatScan() {
    console.log('[心跳] 开始扫描最近两天的图片...');
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayStr = getDateString(today);
    const yesterdayStr = getDateString(yesterday);

    let allImages = [];
    
    const todayImages = scanDateDirectory(todayStr);
    allImages.push(...todayImages);
    
    const yesterdayImages = scanDateDirectory(yesterdayStr);
    allImages.push(...yesterdayImages);

    if (allImages.length > 0) {
        const inserted = db.batchUpsertImages(allImages);
        console.log(`[心跳] 扫描完成，新增/更新 ${inserted} 张图片`);
    } else {
        console.log('[心跳] 最近两天没有发现新图片');
    }
}

// ==================== HTTP 服务器 ====================

// 创建服务器
const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // 路由映射
    const routes = {
        '/': '/pages/index.html',
        '/gallery': '/pages/gallery.html',
        '/history-gallery': '/pages/history-gallery.html',
        '/api/local-ip': '/api/local-ip'
    };

    // 处理API请求
    if (req.url === '/api/local-ip') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ localIP: getLocalIP() }), 'utf-8');
        return;
    }

    // ========== 无限浏览模式 API ==========
    
    // 获取无限浏览图片列表
    if (req.url.startsWith('/api/infinite-images')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const offset = parseInt(url.searchParams.get('offset')) || 0;
        
        db.getImages(limit, offset).then(images => {
            // 转换路径格式供前端使用
            const formattedImages = images.map(img => ({
                name: img.filename,
                path: img.path,
                fullPath: `/api/easy-use/files/${img.path}`,
                size: img.size,
                mtime: new Date(img.mtime * 1000).toISOString()
            }));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                files: formattedImages,
                limit: limit,
                offset: offset,
                hasMore: images.length === limit
            }), 'utf-8');
        }).catch(error => {
            console.error('[API] 获取无限浏览图片失败:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '获取图片列表失败' }), 'utf-8');
        });
        return;
    }
    
    // 获取图片总数
    if (req.url === '/api/images-count') {
        db.getCount().then(count => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ count }), 'utf-8');
        }).catch(error => {
            console.error('[API] 获取图片数量失败:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '获取图片数量失败' }), 'utf-8');
        });
        return;
    }
    
    // 触发手动扫描
    if (req.url === '/api/scan-images' && req.method === 'POST') {
        console.log('[API] 收到手动扫描请求');
        
        // 异步执行扫描（不阻塞响应）
        setTimeout(() => {
            doHeartbeatScan();
        }, 0);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: '扫描任务已启动' }), 'utf-8');
        return;
    }
    
    // ========== 原有 API ==========
    
    /**
     * 获取easy-use目录下的项目结构
     * GET /api/easy-use/structure/{dir}
     * 返回{dir}目录下的项目结构，支持递归查询
     */
    if (req.url.startsWith('/api/easy-use/structure')) {
        try {
            // 提取目录路径
            let dirParam = req.url.replace('/api/easy-use/structure', '').replace(/^\//, '');
            
            // 构建目标路径
            const basePath = path.join(__dirname, '..', 'easy-use');
            let targetPath = basePath;
            
            // 如果传入了目录参数，则使用传入的目录
            if (dirParam) {
                // 防止路径遍历攻击
                if (dirParam.includes('..')) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '无效的路径' }), 'utf-8');
                    return;
                }
                targetPath = path.join(basePath, dirParam);
                
                // 检查路径是否存在且是目录
                if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '目录不存在' }), 'utf-8');
                    return;
                }
            }
            
            const structure = [];
            
            // 读取目录下的所有项目
            const items = fs.readdirSync(targetPath);
            items.forEach(item => {
                const itemPath = path.join(targetPath, item);
                const stat = fs.statSync(itemPath);
                
                // 只返回目录
                if (stat.isDirectory()) {
                    const fullPath = dirParam ? dirParam + '/' + item : item;
                    structure.push({
                        name: item,
                        type: 'directory',
                        path: fullPath
                    });
                }
            });
            
            // 按名称排序
            structure.sort((a, b) => a.name.localeCompare(b.name));
            
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
     * GET /api/easy-use/images/{dirPath}
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
                        path: path.join(dirPath, item).replace(/\\/g, '/'),
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

// ==================== 启动 ====================

// 初始化数据库
db.init();

// 启动服务器
server.listen(PORT, HOST, () => {
    const localIP = getLocalIP();
    console.log('='.repeat(60));
    console.log('ZIT Easy Use Server 启动成功');
    console.log('='.repeat(60));
    console.log(`本地访问: http://localhost:${PORT}/`);
    console.log(`局域网访问: http://${localIP}:${PORT}/`);
    console.log('='.repeat(60));
    
    // 检查 easy-use 目录
    if (!fs.existsSync(EASY_USE_DIR)) {
        console.log(`[警告] easy-use 目录不存在: ${EASY_USE_DIR}`);
        console.log('[提示] 将自动创建目录');
        fs.mkdirSync(EASY_USE_DIR, { recursive: true });
    }
    
    // 启动时执行一次全量扫描
    console.log('[启动] 正在执行初始扫描...');
    exec('node scan-images.js --recent', (error, stdout, stderr) => {
        if (error) {
            console.error('[启动扫描错误]', error);
        } else {
            console.log(stdout);
        }
    });
    
    // 设置定时心跳任务（每60秒扫描最近两天）
    console.log('[心跳] 已启用定时扫描（每60秒）');
    setInterval(() => {
        doHeartbeatScan();
    }, 60000);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n[关闭] 正在关闭服务器...');
    db.close();
    server.close(() => {
        console.log('[关闭] 服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n[关闭] 正在关闭服务器...');
    db.close();
    server.close(() => {
        console.log('[关闭] 服务器已关闭');
        process.exit(0);
    });
});
