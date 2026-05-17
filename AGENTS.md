# ZIT Easy Use - AGENTS.md

> 本文档面向 AI 编程助手。阅读本文档前，默认你对本项目一无所知。所有注释、界面文本和文档均使用中文。

---

## 1. 项目概述

**ZIT Easy Use** 是一个基于 [ComfyUI](https://github.com/comfyanonymous/ComfyUI) 的 AI 图像生成 Web 界面。它提供了一个简洁的独立 Web 前端，通过调用 ComfyUI 的 REST API 和 WebSocket 接口来驱动文生图工作流，并附带本地图片浏览与管理功能。

项目部署在 ComfyUI 的 `output` 目录下，作为独立的 Node.js HTTP 服务运行，不修改 ComfyUI 本体。

### 1.1 核心功能

| 功能 | 说明 | 对应页面 |
|------|------|----------|
| 文生图工作台 | 提示词输入、模型选择、参数配置、批量生成、实时进度 | `/` (index.html) |
| 实时相册 | 从 ComfyUI `/history` API 实时拉取生成记录，自动刷新 | `/gallery` |
| 历史相册 | 双视图模式浏览本地图片：目录浏览 + 无限滚动浏览 | `/history-gallery` |
| 模型测评 | 使用同一组提示词和参数，批量对多个模型进行生成对比 | `/model-evaluate` |
| 深色模式 | 浅色/深色主题切换，偏好保存在 localStorage | 全局 |
| 图片索引 | 基于 SQLite 自动索引 `../easy-use` 目录下的图片，支持快速检索 | 全局 |

### 1.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | HTML5 + Tailwind CSS (CDN) + Vanilla JavaScript | 无前端框架，无构建步骤 |
| 后端 | Node.js 原生 `http` 模块 | 自定义静态文件服务器和 REST API |
| 数据库 | SQLite (`better-sqlite3`) | 图片索引与日期统计，启用 WAL 模式 |
| 外部依赖 | ComfyUI | 图像生成引擎，通过 HTTP/WebSocket 通信 |

---

## 2. 项目结构

```
zit-easy-use/
├── client/                         # 前端代码
│   ├── pages/                      # 前端页面
│   │   ├── index.html              # 文生图主页面
│   │   ├── gallery.html            # 实时相册（ComfyUI 历史）
│   │   ├── history-gallery.html    # 历史相册（双视图：目录浏览 + 无限滚动）
│   │   └── model-evaluate.html     # 模型测评页面
│   └── js/                         # 前端逻辑
│       ├── index.js                # 主页面逻辑（生成控制、WebSocket 进度）
│       ├── gallery.js              # 实时相册逻辑
│       ├── history-gallery.js      # 历史相册逻辑（视图切换、无限滚动、日期导航）
│       ├── model-evaluate.js       # 模型测评逻辑（批量生成、结果对比）
│       ├── common.js               # 公共工具（PNG 元数据解析、主题切换、服务器配置初始化）
│       ├── header-component.js     # 共享导航栏 Web Component (<zit-header>)
│       └── tailwind.js             # Tailwind CSS 运行时构建（CDN 本地化）
├── server/                         # 后端代码
│   ├── serve.js                    # Node.js HTTP 服务器入口
│   ├── db.js                       # SQLite 数据库模块（ImageDatabase 类）
│   └── init-db.js                  # 数据库初始化脚本（创建表 + 重建日期统计）
├── bin/                            # 命令行工具
│   └── scan-images.js              # 图片扫描命令行工具
├── config/                         # 配置文件
│   ├── config.json                 # 应用配置文件（用户自定义，必须存在）
│   ├── example-config.json         # 配置文件模板
│   └── original_workflow.json      # ComfyUI 工作流模板（被 index.js / model-evaluate.js 修改后提交）
├── package.json                    # 仅依赖 better-sqlite3
├── manifest.json                   # PWA 清单
├── storage/                        # 运行时数据目录
│   ├── images.db                   # SQLite 数据库（自动生成）
│   ├── images.db-shm / .db-wal     # WAL 文件
│   ├── model-covers/               # 模型封面图片（由 /api/set-model-cover 写入）
│   └── evaluate/                   # 测评任务汇总 JSON（由 /api/save-evaluate-task 写入）
├── resources/                      # 静态资源
│   └── icon.png                    # 应用图标
└── kimi/                           # AI 助手内部文档（非用户文档）
    ├── AGENT.md
    ├── INFO.md
    └── CHANGELOG.md
```

### 2.1 关键文件说明

- **`server/serve.js`**：唯一的服务器入口。启动时初始化数据库、执行一次近期扫描、然后每 60 秒执行心跳扫描。支持命令行参数 `--port <number>`。
- **`server/db.js`**：导出 `ImageDatabase` 类，封装所有 SQLite 操作。兼容 `better-sqlite3` 和 `sqlite3` 两种驱动。
- **`bin/scan-images.js`**：独立命令行工具，用于手动维护图片索引。支持 `--recent`、`--check`、`--fix`、`-v` 参数。
- **`config/config.json`**：运行时必需的配置文件。若缺失，服务器启动时会打印错误并退出。
- **`config/original_workflow.json`**：ComfyUI 工作流模板。前端加载后修改其中节点参数（如提示词、模型、尺寸等），再通过 `POST /prompt` 提交给 ComfyUI。
- **`client/js/common.js`**：所有页面共享的全局脚本，负责加载 `config.json`、初始化 `COMFYUI_SERVER` 地址、解析 PNG 元数据、主题切换、移动端抽屉。

---

## 3. 运行与构建

### 3.1 环境要求

- Node.js（支持原生 `http`、`fs`、`path` 等模块即可）
- `better-sqlite3` 需要本地编译环境（Python、C++ 构建工具）

### 3.2 安装依赖

```bash
npm install
```

仅安装 `better-sqlite3` 一个 npm 依赖。

### 3.3 配置

首次运行前必须创建 `config.json`：

```bash
cp config/example-config.json config/config.json
# 然后编辑 config/config.json，填入 comfyui_host、模型列表等
```

`config.json` 关键字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `port` | number | 本服务监听端口（默认 11451） |
| `comfyui_host` | string | ComfyUI 服务器 IP（可选，默认使用浏览器当前 host） |
| `comfyui_port` | number | ComfyUI 端口（默认 8188） |
| `diffusion_models` | `{value, text}[]` | UNet 主模型列表 |
| `vae_models` | `{value, text}[]` | VAE 模型列表 |
| `loras` | `string[]` | LoRA 文件名列表 |
| `output_dir` | string | 图片输出子目录名（默认 `easy-use`） |
| `prefix` | string | 文件名前缀，支持 `%date%` 占位符 |
| `size_map` | object | 图片尺寸预设，按比例分组 |
| `sampler_options` | `{value, text}[]` | 采样器+调度器组合选项 |

### 3.4 启动命令

```bash
# 启动服务器（默认端口 11451）
node server/serve.js

# 指定端口
node server/serve.js --port 8080

# 手动扫描图片索引
node bin/scan-images.js           # 全量扫描 ../easy-use 目录
node bin/scan-images.js --recent  # 只扫描最近两天（与心跳任务相同）
node bin/scan-images.js --check   # 清理数据库中已不存在的记录
node bin/scan-images.js --fix     # 修复数据库中的反斜杠路径分隔符
node bin/scan-images.js -v        # 详细输出

# 初始化/重建数据库
node server/init-db.js
```

服务器启动后会自动：
1. 初始化 SQLite 数据库（`storage/images.db`）。
2. 检查并创建 `../easy-use` 目录。
3. 执行一次 `--recent` 扫描。
4. 启动 60 秒间隔的心跳扫描定时器。

### 3.5 访问地址

- 本机：`http://localhost:<port>/`
- 局域网：`http://<本机IP>:<port>/`

---

## 4. 代码风格与开发规范

### 4.1 通用约定

- 使用 **ES6+** 语法（`const`/`let`、箭头函数、模板字符串、`async/await`）。
- 异步操作统一使用 `async/await`，错误处理使用 `try/catch`。
- 注释使用中文，函数注释使用 JSDoc 格式。
- 字符串优先使用单引号，模板字符串使用反引号。
- 路径拼接统一使用 `path.join()`。
- 所有对外暴露的文件路径统一使用 **正斜杠 `/`**（Windows 反斜杠在入库前必须替换）。

### 4.2 前端规范

- **无框架**：原生 DOM 操作，禁止引入 Vue/React/Angular 等框架。
- **样式**：Tailwind CSS 工具类为主，少量自定义 CSS 放在 `<style>` 标签中。
- **深色模式**：通过 `html.dark` 类控制，颜色类需同时写浅色和深色版本（如 `bg-white dark:bg-slate-800`）。
- **响应式断点**：使用 Tailwind 标准前缀 `sm:`、`md:`、`lg:`。
- **懒加载**：图片懒加载使用 `IntersectionObserver`，禁止监听 `scroll` 事件做高频计算。
- **Web Component**：共享导航栏使用原生 `customElements.define('zit-header', ZitHeader)` 实现。

### 4.3 后端规范

- **路径遍历防护**：所有接收外部路径参数的 API 必须检查是否包含 `..`，若包含则返回 400。
- **数据库操作**：
  - 批量写入必须使用事务（`db.transaction` 或 `BEGIN TRANSACTION`）。
  - 查询使用参数化语句，禁止字符串拼接 SQL。
  - WAL 模式已在 `db.js` 中自动启用，无需额外管理。
- **API 设计**：RESTful 风格，JSON 响应，统一设置 CORS 头。

---

## 5. 测试策略

**本项目目前没有自动化测试。** 所有功能验证依赖手动测试：

1. 启动 `node server/serve.js`，确认控制台无报错。
2. 访问各页面，确认导航、主题切换、移动端抽屉正常。
3. 在 `index.html` 提交一次生成任务，确认 WebSocket 进度条更新、图片生成并保存到 `../easy-use/`。
4. 访问 `/history-gallery`，切换目录/无限视图，测试日期导航、图片预览、键盘快捷键（V/I/←→/ESC）。
5. 访问 `/gallery`，确认能从 ComfyUI 历史正确加载图片。
6. 运行 `node bin/scan-images.js --check`，确认无异常崩溃。

如需添加自动化测试，建议从 `db.js` 的单元测试和 API 路由测试开始。

---

## 6. 安全注意事项

### 6.1 路径遍历

所有文件访问 API（`/api/easy-use/files/*`、`/api/easy-use/images/*`、`/api/easy-use/structure/*`、`/model-covers/*`、`/api/file-info`、`/api/set-model-cover`）均已实现 `..` 检查。修改或新增类似接口时必须保留此检查。

### 6.2 CORS

`server/serve.js` 对所有响应设置了 `Access-Control-Allow-Origin: *`。ComfyUI 本身也需要开启 CORS，否则前端无法直接调用 ComfyUI API。

### 6.3 HTTPS / 安全上下文

- 本地局域网使用 HTTP 即可。
- 移动端 Clipboard API 需要安全上下文（HTTPS 或 localhost）。`common.js` 中已有降级方案（`execCommand`），但功能可能受限。

### 6.4 输入验证

- 前端提交的生成参数由 ComfyUI 自行校验，本服务仅做代理/转发。
- `config.json` 中的模型名称在提交前不做存在性校验，需确保 ComfyUI 服务器上已放置对应模型文件。

---

## 7. 核心模块详解

### 7.1 数据库模块 (`db.js`)

**类**：`ImageDatabase`

主要方法：
- `init()` — 创建表和索引，启用 WAL 模式。
- `upsertImage(image)` / `batchUpsertImages(images)` — 插入或更新图片记录（基于 `path` 的唯一性冲突更新）。
- `getImages(limit, offset)` — 按时间倒序分页查询（仅返回 `YYYY-MM-DD/` 格式目录下的图片）。
- `getCount()` — 获取图片总数。
- `removeNonExistent()` — 清理数据库中物理文件已不存在的记录。
- `updateDateStats(date, count)` / `getDateStats()` — 日期统计表操作，用于无限浏览模式的日期导航。
- `getDateOffset(date)` — 计算指定日期在倒序列表中的偏移量，支持点击日期快速跳转。
- `fixPathSeparators()` — 将数据库中路径的反斜杠修复为正斜杠。

**表结构**：

```sql
CREATE TABLE images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    path TEXT UNIQUE NOT NULL,      -- 相对路径，如 2026-02-14/image_001.png
    full_path TEXT NOT NULL,        -- 绝对路径
    size INTEGER DEFAULT 0,
    mtime INTEGER DEFAULT 0,        -- 修改时间（秒级时间戳）
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    checked_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE date_stats (
    date TEXT PRIMARY KEY,          -- 日期，如 "2026-02-14"
    count INTEGER DEFAULT 0,        -- 该日期图片数量
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### 7.2 HTTP 服务器 (`server/serve.js`)

路由与 API：

| 路由 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 文生图主页面 |
| `/gallery` | GET | 实时相册页面 |
| `/history-gallery` | GET | 历史相册页面 |
| `/model-evaluate` | GET | 模型测评页面 |
| `/api/local-ip` | GET | 返回本机局域网 IP |
| `/api/easy-use/structure/{path}` | GET | 获取目录结构（仅返回子目录） |
| `/api/easy-use/images/{path}` | GET | 获取指定目录下的图片列表（按 mtime 倒序） |
| `/api/easy-use/files/{path}` | GET | 返回图片文件内容 |
| `/api/infinite-images?limit=&offset=` | GET | 无限浏览模式分页查询 |
| `/api/images-count` | GET | 数据库图片总数 |
| `/api/dates` | GET | 获取日期统计列表（用于日期导航） |
| `/api/date-offset?date=` | GET | 获取指定日期的列表偏移量 |
| `/api/scan-images` | POST | 触发一次后台近期扫描 |
| `/api/model-covers` | GET | 获取已设置的模型封面列表 |
| `/api/set-model-cover` | POST | 将某张图片复制为指定模型的封面 |
| `/api/file-info?subfolder=&filename=` | GET | 获取文件的 mtime 和 size |
| `/api/save-evaluate-task` | POST | 保存模型测评任务汇总 JSON |
| `/model-covers/{filename}` | GET | 提供模型封面图片 |

### 7.3 图片扫描 (`bin/scan-images.js`)

扫描目标：`../easy-use/`（相对于项目根目录）。

支持的图片格式：`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`。

- 全量扫描会递归遍历所有子目录。
- 近期扫描只扫描当天和前一天目录（与服务器心跳任务一致）。
- 扫描完成后会自动重建 `date_stats` 表（全量扫描时清空重建，近期扫描时增量更新）。

### 7.4 前端共享逻辑 (`common.js`)

**全局变量**（由 `initServerConfig()` 初始化）：
- `SERVER` — 本服务地址（`http://<host>:<port>`）。
- `COMFYUI_SERVER` — ComfyUI 服务器地址（优先从 `config.json` 读取，否则使用浏览器当前 host + 默认端口 8188）。
- `config` — `config.json` 的对象引用。

**PNG 元数据解析**：
- `extractPromptFromPNG(uint8Array)` — 从 PNG 二进制数据中解析 `tEXt`/`iTXt` chunk，提取 ComfyUI 的 `prompt` JSON。
- `extractPromptDataFromPromptText(text)` — 从 prompt JSON 中提取可读参数（尺寸、模型、采样器、提示词等），并解码 Unicode 转义序列（`\u4e2d\u6587` → 中文）。

### 7.5 模型测评 (`model-evaluate.js` + `model-evaluate.html`)

- 页面加载时读取 `config.json` 中的 `diffusion_models` 列表，渲染为可选卡片（支持封面视图和标签视图两种展示模式）。
- 默认全选所有模型。
- 用户配置提示词、VAE、采样器、尺寸、步数等参数后，逐个模型提交生成任务到 ComfyUI。
- 生成结果按模型分组展示，支持全屏预览、图片信息查看、保存测评汇总。
- 模型封面通过 `/api/set-model-cover` 设置，存储在 `storage/model-covers/`。

---

## 8. 关键实现细节

### 8.1 ComfyUI 集成

前端通过以下方式与 ComfyUI 通信：

| 接口 | 用途 |
|------|------|
| `POST {COMFYUI_SERVER}/prompt` | 提交生成任务 |
| `GET {COMFYUI_SERVER}/history` | 获取历史任务列表 |
| `GET {COMFYUI_SERVER}/view?filename=...` | 查看单张图片 |
| `POST {COMFYUI_SERVER}/interrupt` | 中断当前任务 |
| `WebSocket {COMFYUI_SERVER}/ws?clientId=...` | 实时进度推送 |

`original_workflow.json` 中硬编码了一些关键节点 ID，前端代码依赖这些 ID 修改参数：
- 节点 `3` — `KSampler`（初步采样，负责主要进度）。
- 节点 `5` — `EmptyLatentImage`（尺寸）。
- 节点 `6` — `CLIPTextEncode`（提示词）。
- 节点 `25` — `ModelSamplingAuraFlow` / 主模型加载相关（`shift` 参数）。
- 节点 `32` — `VAELoader`（VAE）。
- 节点 `34` — `UNETLoader`（UNet 模型名称）。
- 节点 `40` — 二次采样节点（如果有放大流程）。

**修改工作流模板时必须同步检查 `index.js` 和 `model-evaluate.js` 中对这些节点 ID 的引用。**

### 8.2 无限浏览模式

- 使用 `IntersectionObserver` 监听 sentinel 元素，触发 `loadInfiniteImages()` 加载下一页（默认 50 张）。
- 图片按 `SUBSTR(path, 1, 10) DESC, mtime DESC` 排序（即按日期字符串倒序 + 同日期内按修改时间倒序）。
- 日期导航通过 `/api/dates` 获取日期列表，点击后调用 `/api/date-offset` 计算该日期在全局倒序列表中的偏移量，再加载到该位置。
- 预览图片时（键盘左右导航），若到达当前已加载队列末尾且有更多图片，会自动触发加载更多，实现无缝浏览。

### 8.3 心跳扫描任务

- 间隔：60 秒（`setInterval`）。
- 范围：当天 + 前一天目录。
- 操作：扫描图片 → `batchUpsertImages` 增量更新 → `updateDateStatsForScan` 更新日期统计。
- 若目录不存在或为空，对应日期的 `date_stats` 记录会被删除，避免导航中出现空日期。

---

## 9. 常见修改场景

### 9.1 添加新模型

在 `config.json` 的 `diffusion_models` 数组中添加：

```json
{ "value": "model_filename.safetensors", "text": "显示名称" }
```

然后重启 `serve.js` 即可。无需修改前端代码。

### 9.2 修改默认生成参数

- 在 `client/js/index.js` 的 `initConsole()` 中修改默认值。
- 或在 `client/pages/index.html` 对应 `<input>` / `<select>` 元素的 `value` 属性中修改。

### 9.3 调整工作流

1. 在 ComfyUI 中设计好工作流，导出 JSON。
2. 替换 `original_workflow.json`。
3. **关键步骤**：对比新旧 JSON 的节点 ID，更新 `index.js` 和 `model-evaluate.js` 中所有硬编码引用的节点 ID（如 `prompt['3']`、`prompt['34']` 等）。

### 9.4 新增页面

1. 在 `client/pages/` 下新建 HTML，引用 `../js/tailwind.js`、`../js/common.js`、`../js/header-component.js`。
2. 使用 `<zit-header active-page="your-page"></zit-header>` 添加导航栏。
3. 在 `server/serve.js` 的路由映射 `routes` 对象中添加路径映射。
4. 在 `client/js/header-component.js` 的导航链接列表中添加新页面入口（桌面端 + 移动端抽屉各一处）。

---

## 10. 依赖清单

| 依赖 | 版本 | 来源 | 用途 |
|------|------|------|------|
| Tailwind CSS | latest | jsDelivr CDN (已本地化为 `client/js/tailwind.js`) | 样式框架 |
| better-sqlite3 | ^12.6.2 | npm | SQLite 数据库驱动 |
| ComfyUI | 外部服务 | 需自行部署 | 图像生成引擎 |

---

## 11. 相关文档

- `readme.md` — 面向用户的快速开始指南和配置说明。
- `kimi/AGENT.md` — 历史技术文档（可能包含部分实现细节）。
- `kimi/INFO.md` — 项目概览和开发规范摘要。
- `kimi/CHANGELOG.md` — 版本更新日志。

---

*本文档基于项目实际代码生成，最后更新应与代码同步维护。*
