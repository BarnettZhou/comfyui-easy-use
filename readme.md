# ComfyUI Easy Generator

快速调用本地或局域网中的ComfyUI服务，快速生成图片。

## 快速开始

将`example-server.json`复制为`server.json`，并根据实际情况修改。

### 服务器配置

`example-server.json`中包含 Comfyui 默认服务器的地址和端口。默认为本地地址，若 Comfyui 在局域网中运行，需要修改为局域网内提供服务的服务器地址。另外需要确认你的 Comfyui 服务是否开启了 CORS 跨域访问，否则会导致访问失败。

### 模型配置

`example-config.json`中包含 Comfyui 的 Z-Image-Turbo 文生图模板中所需的模型名称（ UNet + VAE ）。文本编码默认使用官方提供的 Qwen3-4b，不支持修改。

模型可以到 HuggingFace 下载，将模型文件放到提供 Comfyui 服务器相应目录下。

- diffusion_models: 放置主模型，如 z_image_turbo_bf16.safetensors
- vae_models: 放置 VAE 模型，如 ae.safetensors

[https://huggingface.co/Comfy-Org/z_image_turbo](https://huggingface.co/Comfy-Org/z_image_turbo)

### 运行服务

确认本地已经安装了 node.js，推荐使用最新版本。

在根目录下运行如下命令启动服务：

```
node server.js
```

访问 [http://localhost:11451](http://localhost:11451) 即可使用。

### 通过 HTML 文件运行

当前的配置依赖 node.js 加载，若需要直接通过打开 HTML 文件运行，需要将`config.json`和`original_workflowjson`复制到`comfyui-easy-gen.html`中相应变量中，即可直接通过 HTML 文件访问 Comfyui 服务。