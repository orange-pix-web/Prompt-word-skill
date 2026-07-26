# Prompt Word Skill · 牧德旺主图工作台

一个零依赖、本地运行的浏览器管理器，用于管理`D:\ZC\主图2`中的产品、分类、标签、主图模板、参考图和生图提示词。

## 已实现

- 产品缩略图、搜索、分类和标签管理
- 添加产品和新分类
- 产品跨分类移动，产品图与历史提示词一起移动
- 主图模板新增、编辑、启停和线框预览
- 勾选任意产品和模板生成新版提示词
- 参考图导入并生成可编辑模板草稿
- 可选OpenAI视觉模型分析入口
- 所有文件只在本机项目目录中读写

## 启动

本机需要Node.js 22或更高版本。

```powershell
node server.mjs
```

然后打开：

```text
http://127.0.0.1:4178
```

在Codex提供的内置Node环境中可以使用：

```powershell
& "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "D:\ZC\主图2\Prompt-word-skill\server.mjs"
```

默认数据目录是UI仓库的上一级，也就是`D:\ZC\主图2`。也可以临时指定：

```powershell
$env:PROMPT_DATA_ROOT="D:\其他主图项目"
node server.mjs
```

## 可选AI参考图分析

不配置API时，参考图会保存到`参考图/待分析`并生成可编辑草稿。要启用视觉模型分析，请在启动前设置：

```powershell
$env:OPENAI_API_KEY="你的API密钥"
$env:OPENAI_VISION_MODEL="支持图像输入的模型名称"
node server.mjs
```

API密钥只从本机环境变量读取，不会保存到网页或仓库。

## 测试

```powershell
node --test
```

## 数据安全

- 服务只监听`127.0.0.1`，局域网和互联网无法直接访问。
- 所有路径经过项目根目录边界检查。
- 提示词自动使用新版本号，不覆盖历史文件。
- 产品转移前检查目标同名文件，存在冲突时停止。
