#!/usr/bin/env node
/**
 * 全量扫描脚本 - 扫描 ../easy-use 目录下的所有图片并建立索引
 * 
 * 用法:
 *   node scan-images.js           # 全量扫描
 *   node scan-images.js --recent  # 只扫描最近两天
 *   node scan-images.js --check   # 检查并清理不存在的记录
 *   node scan-images.js --fix     # 修复数据库中的路径分隔符
 */

const fs = require('fs');
const path = require('path');
const ImageDatabase = require('./db');

// 图片扩展名
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

// easy-use 目录路径
const EASY_USE_DIR = path.join(__dirname, '..', 'easy-use');

// 命令行参数
const args = process.argv.slice(2);
const isRecentMode = args.includes('--recent');
const isCheckMode = args.includes('--check');
const isFixMode = args.includes('--fix');
const isVerbose = args.includes('--verbose') || args.includes('-v');

/**
 * 获取日期字符串（格式：2026-02-14）
 */
function getDateString(date = new Date()) {
    return date.toISOString().split('T')[0];
}

/**
 * 检查文件是否为图片
 */
function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * 从路径中提取日期
 * @param {string} path - 图片路径
 * @returns {string} 日期字符串
 */
function extractDateFromPath(path) {
    if (!path) return '';
    const match = path.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
}

/**
 * 按日期分组统计图片
 * @param {Array} images - 图片数组
 * @returns {Object} 日期统计 { '2026-02-14': 10, ... }
 */
function groupImagesByDate(images) {
    const groups = {};
    
    for (const img of images) {
        const date = extractDateFromPath(img.path);
        if (!date) continue;
        
        if (!groups[date]) {
            groups[date] = 0;
        }
        groups[date]++;
    }
    
    return groups;
}

/**
 * 扫描单个目录中的图片
 * @param {string} dirPath - 目录绝对路径
 * @param {string} relativePath - 相对于 easy-use 的路径
 * @returns {Array} 图片信息数组
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
                // 递归扫描子目录
                const subImages = scanDirectory(fullPath, itemRelativePath);
                images.push(...subImages);
            } else if (stat.isFile() && isImageFile(item)) {
                images.push({
                    filename: item,
                    path: itemRelativePath.replace(/\\/g, '/'), // 统一使用正斜杠
                    full_path: fullPath,
                    size: stat.size,
                    mtime: Math.floor(stat.mtime.getTime() / 1000) // 转换为秒
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
 * @param {string} dateStr - 日期字符串（如 2026-02-14）
 */
function scanDateDirectory(dateStr) {
    const dateDir = path.join(EASY_USE_DIR, dateStr);
    
    if (!fs.existsSync(dateDir)) {
        if (isVerbose) console.log(`[扫描] 目录不存在: ${dateStr}`);
        return [];
    }
    
    if (isVerbose) console.log(`[扫描] 正在扫描: ${dateStr}`);
    return scanDirectory(dateDir, dateStr);
}

/**
 * 主函数
 */
async function main() {
    console.log('='.repeat(60));
    console.log('图片扫描工具');
    console.log('='.repeat(60));
    console.log(`目标目录: ${EASY_USE_DIR}`);
    console.log(`扫描模式: ${isRecentMode ? '最近两天' : '全量扫描'}`);
    console.log('');

    // 检查目录是否存在
    if (!fs.existsSync(EASY_USE_DIR)) {
        console.error(`错误: 目录不存在 ${EASY_USE_DIR}`);
        process.exit(1);
    }

    // 初始化数据库
    const db = new ImageDatabase();
    if (!db.init()) {
        console.error('数据库初始化失败');
        process.exit(1);
    }

    try {
        // 修复模式：修复路径分隔符
        if (isFixMode) {
            console.log('[修复] 正在修复路径分隔符...');
            const fixed = await db.fixPathSeparators();
            console.log(`[修复] 已修复 ${fixed} 条记录`);
            db.close();
            return;
        }

        // 检查模式：清理不存在的记录
        if (isCheckMode) {
            console.log('[检查] 正在清理不存在的记录...');
            const deleted = await db.removeNonExistent();
            console.log(`[检查] 已删除 ${deleted} 条无效记录`);
        }

        let allImages = [];

        if (isRecentMode) {
            // 最近两天模式
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            const todayStr = getDateString(today);
            const yesterdayStr = getDateString(yesterday);

            console.log(`[扫描] 今日: ${todayStr}`);
            const todayImages = scanDateDirectory(todayStr);
            allImages.push(...todayImages);

            console.log(`[扫描] 昨日: ${yesterdayStr}`);
            const yesterdayImages = scanDateDirectory(yesterdayStr);
            allImages.push(...yesterdayImages);
        } else {
            // 全量扫描模式
            console.log('[扫描] 开始全量扫描...');
            allImages = scanDirectory(EASY_USE_DIR);
        }

        console.log(`[扫描] 共发现 ${allImages.length} 张图片`);

        if (allImages.length > 0) {
            // 批量插入数据库
            console.log('[数据库] 正在更新索引...');
            const inserted = db.batchUpsertImages(allImages);
            console.log(`[数据库] 已更新 ${inserted} 条记录`);
            
            // 更新日期统计
            console.log('[数据库] 正在更新日期统计...');
            const dateCounts = groupImagesByDate(allImages);
            // 如果是近期扫描模式，只更新扫描的日期；全量扫描时重建所有日期统计
            if (isRecentMode) {
                db.batchUpdateDateStats(dateCounts);
            } else {
                // 全量扫描时，先清空再重建
                await db.rebuildDateStatsFromImages();
            }
            console.log(`[数据库] 已更新 ${Object.keys(dateCounts).length} 个日期的统计`);
        }

        // 显示统计
        const totalCount = await db.getCount();
        console.log('');
        console.log('='.repeat(60));
        console.log('扫描完成');
        console.log(`数据库中的图片总数: ${totalCount}`);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('执行错误:', error);
    } finally {
        db.close();
    }
}

// 运行主函数
main().catch(console.error);
