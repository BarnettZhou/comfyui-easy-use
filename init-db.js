#!/usr/bin/env node
/**
 * 数据库初始化脚本
 * 创建所有必要的表结构
 */

const ImageDatabase = require('./db');

console.log('='.repeat(60));
console.log('数据库初始化');
console.log('='.repeat(60));

const db = new ImageDatabase();

if (db.init()) {
    console.log('[初始化] 数据库表结构创建成功');
    
    // 检查是否需要重建日期统计
    console.log('[初始化] 检查是否需要重建日期统计...');
    db.rebuildDateStatsFromImages().then(count => {
        console.log(`[初始化] 日期统计重建完成，共 ${count} 个日期`);
        console.log('='.repeat(60));
        console.log('数据库初始化完成');
        console.log('='.repeat(60));
        db.close();
        process.exit(0);
    }).catch(error => {
        console.error('[初始化] 重建日期统计失败:', error.message);
        db.close();
        process.exit(1);
    });
} else {
    console.error('[初始化] 数据库初始化失败');
    process.exit(1);
}
