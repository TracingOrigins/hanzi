## 项目简介

本项目是一个**依托于 [HanziWriter](https://github.com/chanind/hanzi-writer) 与 [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data)** 的轻量级静态应用网站，用于展示汉字笔顺动画、提供书写练习，并支持把汉字笔画导出为 SVG/图片以辅助汉字教学与课件制作。

项目使用简单的构建脚本把页面模板生成到 `dist/` 下，生成后的静态文件即可直接打开或部署到任意静态托管（例如 GitHub Pages）。

## 已有页面与功能
当前站点由 `src/pages/pages.json` 统一管理页面清单，构建后生成到 `dist/`。主要页面如下：

- **`index.html`**：首页（演示 / 练习 / 预览 / 导出切换）
  - `hz`：要渲染的字符串（会按字符逐个渲染成网格）
  - `tab`：可选 `display | practice | preview | export`（默认 `display`）
- **`display.html`**：演示（多字网格展示与点击重播）
  - `hz`
- **`practice.html`**：练习（quiz，逐字进入）
  - `hz`
- **`svg.html`**：预览（内联 SVG 展示）
  - `hz`
- **`export.html`**：导出（合并生成可下载的 SVG/图片预览，并提供“导出为图片”按钮）
  - `hz`

## 快速开始

### 方式一：构建后直接打开（最简单）

先执行构建生成 `dist/`，然后用浏览器打开页面，例如：

- `dist/index.html?hz=永`
- `dist/practice.html?hz=学`
- `dist/export.html?hz=爱`
- `dist/display.html?hz=你好世界`

### 方式二：本地起一个静态服务器（推荐）

用任意静态服务器都可以。举例（任选其一）：

```bash
# Python 3
python -m http.server 8080
```

然后访问（示例）：

- `http://localhost:8080/dist/index.html?hz=汉`

### 方式三：作为 Node 项目使用（用于“一键同步到 Nginx”）

本项目也可以作为 Node 项目管理：静态文件放在 `dist/` 下，通过脚本把 `dist/` 一键同步到你配置的 Nginx `html` 目录（会先清空目标目录，再复制文件）。

1) 安装依赖：

```bash
npm install
```

2) 新建 `.env`（可参考 `.env.example`）：

```bash
# 你的 nginx html 目录
NGINX_HTML_PATH=C:\nginx\html
```
3) 执行同步（会先清空目标目录，再复制 `dist/`）：

```bash
npm run build
```

> 说明：你的 `build` 脚本会先生成 `dist/`，再执行 `scripts/deploy-nginx.js`（同步到 Nginx）。

## 部署到 GitHub Pages（gh-pages 分支）

本项目已内置 GitHub Actions 工作流：`.github/workflows/publish-gh-pages.yml`。

1. 仓库 `Settings -> Pages`：
   - Source 选择 **`gh-pages` / `root`**
2. 触发发布：
   - 该工作流默认只在向 `main` 或 `master` 推送时触发
   - 你可以在 `main` 上做一次很小的提交（改 README 或任意文件）来触发构建
3. 工作流执行成功后，`dist/` 会被发布到 `gh-pages` 分支，Pages 将自动生效

## URL 参数

- **`hz`**：要展示/练习/预览/导出的字符串（会按字符逐个渲染到网格里；建议传入常见汉字）

> 说明：若字符串中包含数据源无法加载的字符，可能会出现渲染失败；这取决于 `hanzi-writer-data` 是否提供对应字形数据。

## 技术说明（基于现有代码推断）

- **渲染引擎**：`hanzi-writer@3.5`（通过 `jsdelivr` CDN 引入）
- **字形/笔画数据**：`hanzi-writer-data@2.0`（按字逐个 JSON 加载）
- **主题适配策略**：
  - CSS 使用 `prefers-color-scheme`
  - JS 在初始化时读取 CSS 变量（避免在 JS 中硬编码色值）
  - 监听主题变化并重新初始化/重渲染
- **SVG 生成策略**：
  - 读取 `data.strokes`（SVG path 数据）
  - 通过 `g transform` 做坐标系修正（翻转 Y 轴、缩放/平移居中）
- 在导出页面中使用 Blob 将 SVG 生成为可下载/可保存的图片资源

## 未来功能推测（路线图建议）

结合当前页面与代码结构，最自然的演进方向通常包括：

- **汉字输入与导航**
  - 增加输入框/词条列表，支持快速切换 `hz`
  - 支持常用汉字表、教材分级（按年级/课本单元）

- **教学场景功能**
  - 逐笔播放、调速、循环、笔画序号显示/隐藏
  - 错误提示策略与评分（quiz 结果统计、练习记录）
  - 生成练习纸（田字格/米字格）与打印样式

- **资源导出**
  - 导出 SVG（不同风格：仅轮廓/仅实心/带笔画编号）
  - 导出 PNG（前端将 SVG 渲染到 canvas 后下载）

- **离线与性能**
  - 缓存已加载的 `hanzi-writer-data` JSON（内存/`localStorage`）
  - 支持离线包（将常用字数据内置或可选下载）

## 版权与许可

- 本仓库许可证：MIT，见 `LICENSE`
- 第三方项目与数据：
  - `hanzi-writer` 与 `hanzi-writer-data` 版权与许可请参见其上游仓库说明

