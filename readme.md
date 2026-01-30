# ComfyUI Easy Generator

快速调用本地或局域网中的ComfyUI服务，快速生成图片。

## 安装项目

找到你的 ComfyUI 项目输出目录（output），在该目录下执行`git clone`

```
git clone https://github.com/BarnettZhou/comfyui-easy-use.git
```

> 以上操作将为你获得查看历史图片的能力

## 快速开始

### Comfyui 检查

确保 Comfyui 服务已启动，且开启了 CORS 跨域访问。

### 模型配置

`example-config.json`中包含 Comfyui 的 Z-Image-Turbo 文生图模板中所需的模型名称（ UNet + VAE ）。文本编码默认使用官方提供的 Qwen3-4b，不支持修改。

模型可以到 HuggingFace 下载，将模型文件放到提供 Comfyui 服务器相应目录下。

- diffusion_models: 放置主模型，如 z_image_turbo_bf16.safetensors
- vae_models: 放置 VAE 模型，如 ae.safetensors

你可以到如下地址下载官方提供的模型文件。当然作为一个Comfyui老手，你应该已经有了自己的模型文件。

[https://huggingface.co/Comfy-Org/z_image_turbo](https://huggingface.co/Comfy-Org/z_image_turbo)

### 配置文件

将`example-server.json`复制为`server.json`，并根据实际情况修改。具体可参考后文表格。

### 运行服务

确认本地已经安装了 node.js，推荐使用最新版本。

在根目录下运行如下命令启动服务：

```
node server.js
```

访问 [http://localhost:11451](http://localhost:11451) 即可使用。

### 局域网访问

项目已开启局域网访问，默认端口为 11451。

你可以在浏览器中访问 `http://<本服务局域网 IP>:11451` 来使用。

## 配置文件说明

| 配置项 | 说明 | 示例 |
| --- | --- | --- |
| port | Comfyui 默认服务器的地址和端口，默认 8000 | 8000 |
| diffusion_models | UNet 模型列表，包含模型文件名称和显示名称。 | `[ { "name": "z_image_turbo_bf16", "file": "z_image_turbo_bf16.safetensors" } ]` |
| vae_models | VAE 模型列表，包含模型文件名称和显示名称。 | `[ { "name": "z_image_turbo_bf16", "file": "z_image_turbo_bf16.safetensors" } ]` |
| loras | LoRA 模型列表，包含模型文件名称。 | `[ "z_image_turbo_bf16_lora.safetensors" ]` |
| output_dir | 输出目录，默认 easy-use。 | easy-use |
| prefix | 输出文件前缀，默认 zit ，支持使用变量 `%date%` 和多级目录，如 `%date%/easy-use`。 | zit |
| size_map | 图片尺寸列表，包含比例和尺寸以及展示的名称。 | `[ { "name": "1:1", "size": "512,512" } ]` |
| sampler_options | 采样器组合，包含采样器+调度器组合和显示名称。 | `[ { "name": "euler", "value": "euler" } ]` |
