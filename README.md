# transproof-dsh-plugin

译校助手 **TransProof** 的 DeepSeek Harness 插件：把译校助手网页打包进 DSH 页面入口，并暴露一个「跑本地体检」Agent 工具。

- **自包含**：网页内置在 `app/`（index.html + 13 个 js + config），装上就能用，不依赖外部文件夹。
- **本地体检**：`transproof_audit` 一次性跑四项机械比对——段落对齐、数字与格式、标点·书名号、翻译腔。**纯 JS、不联网、不调模型、不花 token。**

## 安装

插件在本仓库的 `transproof-plugin/` 子目录。从该目录安装：

```bash
dsh plugin add <本仓库>/transproof-plugin
```

（从 git 装的精确命令待核实；先用本地路径装最稳。）

## 说明

- 体检复用网页版同一套逻辑（`app/js/08-render-audit.js`），改网页即同步，不漂移。
- **瘦身版不含 OCR 字库**（chi_sim/eng traineddata）：体检 / 翻译 / 校对 / 术语都正常，只有「图片翻译」需另配字库。
- 许可：Apache-2.0。
