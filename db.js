/**
 * SQLite 数据库模块 - 用于存储 easy-use 目录下的图片索引
 */

const fs = require('fs');
const path = require('path');

// 使用更好的-sqlite3（如果可用），否则使用内置的 sqlite3
let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    try {
        Database = require('sqlite3').Database;
    } catch (e2) {
        console.error('错误：未找到 SQLite 模块。请运行：npm install better-sqlite3');
        process.exit(1);
    }
}

const DB_PATH = path.join(__dirname, 'images.db');

// 判断是 better-sqlite3 还是 sqlite3
const isBetterSQLite3 = Database.name === 'Database' && Database.prototype.constructor.name === 'Database';

class ImageDatabase {
    constructor() {
        this.db = null;
    }

    /**
     * 初始化数据库连接和表结构
     */
    init() {
        try {
            this.db = new Database(DB_PATH);
            
            // 如果是 better-sqlite3，启用 WAL 模式提高性能
            if (isBetterSQLite3) {
                this.db.pragma('journal_mode = WAL');
            }

            // 创建图片索引表
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS images (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    path TEXT UNIQUE NOT NULL,
                    full_path TEXT NOT NULL,
                    size INTEGER DEFAULT 0,
                    mtime INTEGER DEFAULT 0,
                    created_at INTEGER DEFAULT (strftime('%s', 'now')),
                    checked_at INTEGER DEFAULT (strftime('%s', 'now'))
                )
            `;

            // 创建索引
            const createIndexSQL = `
                CREATE INDEX IF NOT EXISTS idx_mtime ON images(mtime DESC);
                CREATE INDEX IF NOT EXISTS idx_path ON images(path);
            `;

            // 创建日期统计表（用于快速获取日期导航）
            const createDateStatsSQL = `
                CREATE TABLE IF NOT EXISTS date_stats (
                    date TEXT PRIMARY KEY,
                    count INTEGER DEFAULT 0,
                    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
                )
            `;

            if (isBetterSQLite3) {
                this.db.exec(createTableSQL);
                this.db.exec(createIndexSQL);
                this.db.exec(createDateStatsSQL);
            } else {
                this.db.run(createTableSQL);
                this.db.run(createIndexSQL);
                this.db.run(createDateStatsSQL);
            }

            console.log('[DB] 数据库初始化成功');
            return true;
        } catch (error) {
            console.error('[DB] 数据库初始化失败:', error);
            return false;
        }
    }

    /**
     * 关闭数据库连接
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('[DB] 数据库连接已关闭');
        }
    }

    /**
     * 添加或更新图片记录
     * @param {Object} image - 图片信息
     * @returns {boolean} 是否成功
     */
    upsertImage(image) {
        const { filename, path: imgPath, full_path, size, mtime } = image;
        
        try {
            const sql = `
                INSERT INTO images (filename, path, full_path, size, mtime, checked_at)
                VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
                ON CONFLICT(path) DO UPDATE SET
                    size = excluded.size,
                    mtime = excluded.mtime,
                    checked_at = excluded.checked_at
            `;

            if (isBetterSQLite3) {
                const stmt = this.db.prepare(sql);
                stmt.run(filename, imgPath, full_path, size, mtime);
            } else {
                this.db.run(sql, [filename, imgPath, full_path, size, mtime]);
            }
            return true;
        } catch (error) {
            console.error('[DB] 插入图片失败:', error);
            return false;
        }
    }

    /**
     * 批量添加图片记录
     * @param {Array} images - 图片信息数组
     * @returns {number} 成功插入的数量
     */
    batchUpsertImages(images) {
        if (!images || images.length === 0) return 0;

        let count = 0;
        
        if (isBetterSQLite3) {
            // better-sqlite3 支持事务
            const insert = this.db.prepare(`
                INSERT INTO images (filename, path, full_path, size, mtime, checked_at)
                VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
                ON CONFLICT(path) DO UPDATE SET
                    size = excluded.size,
                    mtime = excluded.mtime,
                    checked_at = excluded.checked_at
            `);
            
            const insertMany = this.db.transaction((imgs) => {
                for (const img of imgs) {
                    insert.run(img.filename, img.path, img.full_path, img.size, img.mtime);
                    count++;
                }
            });
            
            try {
                insertMany(images);
            } catch (error) {
                console.error('[DB] 批量插入失败:', error);
            }
        } else {
            // sqlite3 使用串行执行
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                const stmt = this.db.prepare(`
                    INSERT INTO images (filename, path, full_path, size, mtime, checked_at)
                    VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
                    ON CONFLICT(path) DO UPDATE SET
                        size = excluded.size,
                        mtime = excluded.mtime,
                        checked_at = excluded.checked_at
                `);
                
                for (const img of images) {
                    stmt.run([img.filename, img.path, img.full_path, img.size, img.mtime], (err) => {
                        if (!err) count++;
                    });
                }
                
                stmt.finalize();
                this.db.run('COMMIT');
            });
        }

        return count;
    }

    /**
     * 删除不存在的图片记录
     * @param {string} dirPath - 目录路径（可选，为空则检查所有）
     * @returns {number} 删除的数量
     */
    removeNonExistent(dirPath = null) {
        return new Promise((resolve, reject) => {
            // 获取所有记录
            const sql = dirPath 
                ? `SELECT path, full_path FROM images WHERE path LIKE ?`
                : `SELECT path, full_path FROM images`;
            const params = dirPath ? [`${dirPath}%`] : [];

            if (isBetterSQLite3) {
                try {
                    const rows = this.db.prepare(sql).all(...params);
                    let deleted = 0;
                    
                    for (const row of rows) {
                        if (!fs.existsSync(row.full_path)) {
                            this.db.prepare('DELETE FROM images WHERE path = ?').run(row.path);
                            deleted++;
                        }
                    }
                    resolve(deleted);
                } catch (error) {
                    reject(error);
                }
            } else {
                this.db.all(sql, params, (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    let deleted = 0;
                    const checkNext = (index) => {
                        if (index >= rows.length) {
                            resolve(deleted);
                            return;
                        }

                        const row = rows[index];
                        fs.access(row.full_path, fs.constants.F_OK, (err) => {
                            if (err) {
                                this.db.run('DELETE FROM images WHERE path = ?', [row.path], (err) => {
                                    if (!err) deleted++;
                                    checkNext(index + 1);
                                });
                            } else {
                                checkNext(index + 1);
                            }
                        });
                    };

                    checkNext(0);
                });
            }
        });
    }

    /**
     * 获取图片列表（按时间倒序）
     * @param {number} limit - 限制数量（0表示无限制）
     * @param {number} offset - 偏移量
     * @returns {Array} 图片列表
     */
    getImages(limit = 0, offset = 0) {
        return new Promise((resolve, reject) => {
            let sql = `SELECT * FROM images ORDER BY mtime DESC`;
            const params = [];
            
            if (limit > 0) {
                sql += ` LIMIT ?`;
                params.push(limit);
            }
            if (offset > 0) {
                sql += ` OFFSET ?`;
                params.push(offset);
            }

            if (isBetterSQLite3) {
                try {
                    const rows = this.db.prepare(sql).all(...params);
                    // 确保路径使用正斜杠
                    rows.forEach(row => {
                        if (row.path) row.path = row.path.replace(/\\/g, '/');
                    });
                    resolve(rows);
                } catch (error) {
                    reject(error);
                }
            } else {
                this.db.all(sql, params, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        // 确保路径使用正斜杠
                        rows.forEach(row => {
                            if (row.path) row.path = row.path.replace(/\\/g, '/');
                        });
                        resolve(rows);
                    }
                });
            }
        });
    }

    /**
     * 获取图片总数
     * @returns {number}
     */
    getCount() {
        return new Promise((resolve, reject) => {
            const sql = `SELECT COUNT(*) as count FROM images`;
            
            if (isBetterSQLite3) {
                try {
                    const row = this.db.prepare(sql).get();
                    resolve(row.count);
                } catch (error) {
                    reject(error);
                }
            } else {
                this.db.get(sql, [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                });
            }
        });
    }

    /**
     * 检查图片是否已存在
     * @param {string} imgPath - 图片路径
     * @returns {boolean}
     */
    exists(imgPath) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT 1 FROM images WHERE path = ?`;
            
            if (isBetterSQLite3) {
                try {
                    const row = this.db.prepare(sql).get(imgPath);
                    resolve(!!row);
                } catch (error) {
                    reject(error);
                }
            } else {
                this.db.get(sql, [imgPath], (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                });
            }
        });
    }

    /**
     * 修复路径分隔符（将反斜杠转换为正斜杠）
     * @returns {number} 修复的记录数
     */
    fixPathSeparators() {
        return new Promise((resolve, reject) => {
            const selectSql = `SELECT id, path FROM images WHERE path LIKE '%\\%'`;
            
            if (isBetterSQLite3) {
                try {
                    const rows = this.db.prepare(selectSql).all();
                    let fixed = 0;
                    
                    const updateStmt = this.db.prepare(`UPDATE images SET path = ? WHERE id = ?`);
                    
                    for (const row of rows) {
                        const newPath = row.path.replace(/\\/g, '/');
                        if (newPath !== row.path) {
                            updateStmt.run(newPath, row.id);
                            fixed++;
                        }
                    }
                    
                    resolve(fixed);
                } catch (error) {
                    reject(error);
                }
            } else {
                this.db.all(selectSql, [], (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    let fixed = 0;
                    const updateNext = (index) => {
                        if (index >= rows.length) {
                            resolve(fixed);
                            return;
                        }
                        
                        const row = rows[index];
                        const newPath = row.path.replace(/\\/g, '/');
                        
                        if (newPath !== row.path) {
                            this.db.run(`UPDATE images SET path = ? WHERE id = ?`, [newPath, row.id], (err) => {
                                if (!err) fixed++;
                                updateNext(index + 1);
                            });
                        } else {
                            updateNext(index + 1);
                        }
                    };
                    
                    updateNext(0);
                });
            }
        });
    }

    // ==================== 日期统计表操作 ====================

    /**
     * 更新日期统计
     * @param {string} date - 日期字符串，如 "2026-02-14"
     * @param {number} count - 该日期的图片数量
     */
    updateDateStats(date, count) {
        const sql = `
            INSERT INTO date_stats (date, count, updated_at)
            VALUES (?, ?, strftime('%s', 'now'))
            ON CONFLICT(date) DO UPDATE SET
                count = excluded.count,
                updated_at = excluded.updated_at
        `;
        
        if (isBetterSQLite3) {
            try {
                this.db.prepare(sql).run(date, count);
                return true;
            } catch (error) {
                console.error('[DB] 更新日期统计失败:', error);
                return false;
            }
        } else {
            this.db.run(sql, [date, count], (err) => {
                if (err) console.error('[DB] 更新日期统计失败:', err);
            });
            return true;
        }
    }

    /**
     * 批量更新日期统计
     * @param {Object} dateCounts - { '2026-02-14': 10, '2026-02-13': 5 }
     */
    batchUpdateDateStats(dateCounts) {
        const dates = Object.keys(dateCounts);
        if (dates.length === 0) return;
        
        if (isBetterSQLite3) {
            const insert = this.db.prepare(`
                INSERT INTO date_stats (date, count, updated_at)
                VALUES (?, ?, strftime('%s', 'now'))
                ON CONFLICT(date) DO UPDATE SET
                    count = excluded.count,
                    updated_at = excluded.updated_at
            `);
            
            const insertMany = this.db.transaction((items) => {
                for (const [date, count] of items) {
                    insert.run(date, count);
                }
            });
            
            try {
                insertMany(Object.entries(dateCounts));
            } catch (error) {
                console.error('[DB] 批量更新日期统计失败:', error);
            }
        } else {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                const stmt = this.db.prepare(`
                    INSERT INTO date_stats (date, count, updated_at)
                    VALUES (?, ?, strftime('%s', 'now'))
                    ON CONFLICT(date) DO UPDATE SET
                        count = excluded.count,
                        updated_at = excluded.updated_at
                `);
                
                for (const [date, count] of Object.entries(dateCounts)) {
                    stmt.run([date, count]);
                }
                
                stmt.finalize();
                this.db.run('COMMIT');
            });
        }
    }

    /**
     * 获取所有日期统计（按日期倒序）
     * @returns {Array} 日期统计列表 [{ date: '2026-02-14', count: 10 }, ...]
     */
    getDateStats() {
        return new Promise((resolve, reject) => {
            const sql = `SELECT date, count FROM date_stats ORDER BY date DESC`;
            
            if (isBetterSQLite3) {
                try {
                    const rows = this.db.prepare(sql).all();
                    resolve(rows);
                } catch (error) {
                    reject(error);
                }
            } else {
                this.db.all(sql, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            }
        });
    }

    /**
     * 获取指定日期在图片列表中的偏移量（offset）
     * @param {string} date - 日期字符串，如 "2026-02-14"
     * @returns {number} 偏移量（该日期第一张图片的索引），如果不存在返回 -1
     */
    getDateOffset(date) {
        return new Promise((resolve, reject) => {
            // 查询该日期之前（更晚）的所有图片数量
            // 因为图片按时间倒序，日期越大（越新）排在越前面
            const sql = `
                SELECT COUNT(*) as offset 
                FROM images 
                WHERE SUBSTR(path, 1, 10) > ?
            `;
            
            if (isBetterSQLite3) {
                try {
                    const row = this.db.prepare(sql).get(date);
                    resolve(row ? row.offset : 0);
                } catch (error) {
                    reject(error);
                }
            } else {
                this.db.get(sql, [date], (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.offset : 0);
                });
            }
        });
    }

    /**
     * 根据图片路径更新日期统计
     * 从路径中提取日期并统计
     */
    async rebuildDateStatsFromImages() {
        try {
            // 从 images 表中按日期分组统计
            const sql = `
                SELECT 
                    SUBSTR(path, 1, 10) as date,
                    COUNT(*) as count
                FROM images
                WHERE path LIKE '____-__-__/%'
                GROUP BY SUBSTR(path, 1, 10)
                ORDER BY date DESC
            `;
            
            let rows;
            if (isBetterSQLite3) {
                rows = this.db.prepare(sql).all();
            } else {
                rows = await new Promise((resolve, reject) => {
                    this.db.all(sql, [], (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
            }
            
            // 清空旧数据并插入新数据
            if (isBetterSQLite3) {
                this.db.exec('DELETE FROM date_stats');
            } else {
                await new Promise((resolve, reject) => {
                    this.db.run('DELETE FROM date_stats', (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
            
            // 批量插入新数据
            const dateCounts = {};
            for (const row of rows) {
                dateCounts[row.date] = row.count;
            }
            this.batchUpdateDateStats(dateCounts);
            
            console.log(`[DB] 重建日期统计完成，共 ${rows.length} 个日期`);
            return rows.length;
        } catch (error) {
            console.error('[DB] 重建日期统计失败:', error);
            throw error;
        }
    }
}

module.exports = ImageDatabase;
