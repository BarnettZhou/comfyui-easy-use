# ComfyUI Easy Generator

基于 ComfyUI 的 AI 图像生成 Web 界面，支持文生图、历史图片浏览、图片库管理等功能。

## 功能特性

- **文生图工作台** - 简洁的提示词输入界面，支持多种模型和参数配置
- **历史图片浏览** - 查看生成的历史图片，支持元数据查看和提示词复制
- **图片库管理** - 支持两种浏览模式：
  - **目录浏览模式** - 按目录结构组织图片，支持子目录导航
  - **无限浏览模式** - 按时间倒序展示所有图片，支持无限滚动加载
- **图片索引系统** - 基于 SQLite 自动索引图片，支持快速检索和全量浏览
- **响应式设计** - 完美适配桌面端和移动端
- **PWA 支持** - 可安装为桌面应用，支持离线访问
- **深色模式** - 支持浅色/深色主题切换

## 项目结构

```
zit-easy-use/
├── pages/
│   ├── index.html              # 文生图主页面
│   ├── gallery.html            # 图片库页面
│   └── history-gallery.html    # 历史图片浏览页面（支持双视图模式）
├── js/
│   ├── index.js                # 主页面逻辑
│   ├── gallery.js              # 图片库逻辑
│   ├── history-gallery.js      # 历史浏览逻辑（含无限浏览模式）
│   ├── common.js               # 公共工具函数
│   └── tailwind.js             # Tailwind CSS 配置
├── serve.js                    # Node.js 服务器
├── db.js                       # SQLite 数据库模块
├── scan-images.js              # 图片全量扫描脚本
├── service-worker.js           # PWA Service Worker
├── manifest.json               # PWA 配置
├── config.json                 # 配置文件
└── readme.md                   # 本文档
```

## 快速开始

### 1. 安装

在 ComfyUI 的 `output` 目录下执行：

```bash
git clone https://github.com/BarnettZhou/comfyui-easy-use.git
cd comfyui-easy-use
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置

复制配置文件模板：

```bash
cp example-config.json config.json
```

编辑 `config.json`，配置你的 ComfyUI 服务器地址和模型信息。

### 4. 启动

```bash
node serve.js
```

访问 http://localhost:11451 即可使用。

服务器启动时会自动扫描最近两天的图片建立索引，之后每60秒自动更新索引。

## 配置文件说明

| 配置项 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `port` | number | 本地服务端口 | `11451` |
| `comfyui_host` | string | ComfyUI 服务器地址 | `"192.168.1.100"` |
| `comfyui_port` | number | ComfyUI 服务器端口 | `8188` |
| `diffusion_models` | array | UNet 模型列表 | `[{"value": "model.safetensors", "text": "显示名称"}]` |
| `vae_models` | array | VAE 模型列表 | 同上 |
| `loras` | array | LoRA 模型文件名列表 | `["lora1.safetensors"]` |
| `output_dir` | string | 图片输出目录 | `"easy-use"` |
| `prefix` | string | 文件名前缀，支持 `%date%` 变量 | `"zit"` 或 `"%date%/batch"` |
| `size_map` | object | 图片尺寸配置 | 见示例配置 |
| `sampler_options` | array | 采样器组合列表 | `[{"value": "euler,sgm_uniform", "text": "显示名称"}]` |

### 示例配置

```json
{
    "port": 11451,
    "comfyui_host": "192.168.1.100",
    "comfyui_port": 8188,
    "diffusion_models": [
        {
            "value": "z_image_turbo_bf16.safetensors",
            "text": "Z-Image-Turbo"
        }
    ],
    "vae_models": [
        {
            "value": "ae.safetensors",
            "text": "ZIT VAE"
        }
    ],
    "loras": ["pixel_art_style.safetensors"],
    "output_dir": "easy-use",
    "prefix": "zit",
    "size_map": {
        "1:1": [
            { "value": "1024,1024", "text": "1024 x 1024" },
            { "value": "1200,1200", "text": "1200 x 1200" }
        ],
        "3:4": [
            { "value": "960,1280", "text": "960 x 1280" },
            { "value": "1080,1440", "text": "1080 x 1440" }
        ]
    },
    "sampler_options": [
        { "value": "er_sde,sgm_uniform", "text": "er_sde + sgm_uniform" },
        { "value": "euler,sgm_uniform", "text": "euler + sgm_uniform" }
    ]
}
```

## 图片索引管理

系统使用 SQLite 数据库存储图片索引，支持快速检索和无限浏览模式。

### 自动索引

- **定时心跳扫描**：服务器每60秒自动扫描当日和上一日的目录，更新索引
- **启动扫描**：服务器启动时自动执行一次近期扫描

### 手动扫描脚本

```bash
# 全量扫描 - 扫描 easy-use 目录下所有图片
node scan-images.js

# 近期扫描 - 只扫描最近两天的目录（与自动扫描相同）
node scan-images.js --recent

# 检查清理 - 扫描并清理数据库中不存在的记录
node scan-images.js --check
```

### 数据库文件

- 数据库文件：`images.db`（自动创建在项目根目录）
- 使用 `better-sqlite3` 驱动，支持 WAL 模式提高性能

## API 接口

本地服务器提供以下 REST API：

### 获取目录结构

```
GET /api/easy-use/structure
GET /api/easy-use/structure/{dirPath}
```

返回指定目录下的子目录列表。

### 获取指定目录图片列表

```
GET /api/easy-use/images
GET /api/easy-use/images/{dirPath}
```

返回指定目录下的所有图片文件列表。

### 获取图片文件

```
GET /api/easy-use/files/{filePath}
```

返回指定图片文件内容。

### 无限浏览模式 - 获取所有图片

```
GET /api/infinite-images?limit=50&offset=0
```

按时间倒序返回所有图片，支持分页加载。

- `limit`: 每次返回数量（默认50）
- `offset`: 偏移量（用于分页）

### 获取图片总数

```
GET /api/images-count
```

返回数据库中图片的总数。

### 触发手动扫描

```
POST /api/scan-images
```

触发后台扫描任务更新图片索引。

## 页面说明

### 文生图页面 (index.html)

- 提示词输入（支持展开/收起）
- 模型选择（UNet、VAE、LoRA）
- 图片尺寸和比例选择
- 采样器和调度器配置
- 批量生成设置
- 图片放大配置
- 生成历史实时预览

### 实时相册页面 (gallery.html)

- 从 ComfyUI 历史记录实时加载图片
- 支持图片预览和元数据查看
- 支持提示词复制
- 响应式网格布局
- 图片懒加载
- 自动刷新功能

### 历史浏览页面 (history-gallery.html)

支持两种视图模式，可通过顶部按钮切换：

**目录浏览模式**（默认）：
- 面包屑路径导航
- 目录树浏览（可展开/收起）
- 子目录点击进入
- 当前目录图片网格展示

**无限浏览模式**：
- 按创建时间倒序展示所有图片
- 无限滚动自动加载（每次50张）
- 显示图片总数
- 适合快速浏览全部历史图片

**通用功能**：
- 全屏预览（支持键盘左右导航）
- 图片信息弹窗（按 I 键打开）
- 提示词复制
- 视图切换（按 V 键快速切换）

## 技术栈

- **前端**: HTML5, Tailwind CSS, Vanilla JavaScript
- **后端**: Node.js, Native HTTP Module
- **数据库**: SQLite (better-sqlite3)
- **PWA**: Service Worker, Manifest
- **UI 设计**: Glassmorphism 风格，深色/浅色主题

## 浏览器兼容性

- Chrome / Edge 90+
- Firefox 90+
- Safari 14+
- iOS Safari 14+
- Android Chrome 90+

## 注意事项

1. **CORS 配置**: 确保 ComfyUI 服务已开启 CORS 跨域访问
2. **HTTPS**: 在局域网环境中使用 HTTP 即可，Clipboard API 在移动端有降级方案
3. **模型路径**: 确保配置的模型文件存在于 ComfyUI 服务器的对应目录中
4. **首次使用**: 启动后首次进入无限浏览模式可能需要等待索引建立完成

## 快捷键

### 历史浏览页面

| 快捷键 | 功能 |
|--------|------|
| `V` | 切换视图模式（目录/无限） |
| `I` | 打开/关闭图片信息弹窗 |
| `←` | 上一张图片（预览模式） |
| `→` | 下一张图片（预览模式） |
| `ESC` | 关闭预览/信息弹窗 |

## 模型下载

官方推荐的 Z-Image-Turbo 模型：

[https://huggingface.co/Comfy-Org/z_image_turbo](https://huggingface.co/Comfy-Org/z_image_turbo)

模型放置位置：
- `ComfyUI/models/diffusion_models/` - UNet 模型
- `ComfyUI/models/vae_models/` - VAE 模型
- `ComfyUI/models/loras/` - LoRA 模型

## License

MIT License
