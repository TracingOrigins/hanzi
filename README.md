## 项目简介

本项目是一个**依托于 [HanziWriter](https://github.com/chanind/hanzi-writer) 与 [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data)** 的轻量级静态站点，用于展示汉字笔顺动画、书写练习，以及将笔画导出为 SVG、栅格图片与逐笔 GIF，便于汉字教学与课件制作。

使用 Node 构建脚本将模板与资源输出到 `dist/`，生成物可直接本地打开或部署到任意静态托管（例如 GitHub Pages）。

## 仓库结构（简要）

| 路径 | 说明 |
|------|------|
| `src/pages/` | 页面片段、`pages.json` 页面清单 |
| `src/assets/` | 样式、脚本、第三方资源（如 `gif.js`） |
| `src/templates/base.html` | HTML 壳模板 |
| `scripts/build.js` | 生成 `dist/` |
| `scripts/deploy-nginx.js` | 可选：将 `dist/` 同步到本机 Nginx 目录 |
| `scripts/publish-gh-pages.js` | CI：将 `dist/` 发布到 `gh-pages` 分支 |

## 已有页面与功能

页面由 `src/pages/pages.json` 统一管理，构建后写入 `dist/`。主要入口如下：

- **`index.html`**：首页（演示 / 练习 / 预览 / 导出切换，内嵌对应功能）
  - `hz`：要渲染的字符串（按字符逐个网格展示）
  - `tab`：可选 `display | practice | preview | export`（默认 `display`）
- **`display.html`**：演示（多字网格、点击重播）
  - `hz`
- **`practice.html`**：练习（quiz，逐字进入）
  - `hz`
- **`preview.html`**：预览（内联 SVG）
  - `hz`
- **`export.html`**：导出（SVG/图片预览、「导出为图片」等）
  - `hz`

## 快速开始

### 仅构建 `dist/`（不部署）

```bash
node scripts/build.js
```

### 构建后直接打开本地文件

在浏览器中打开，例如：

- `dist/index.html?hz=永`
- `dist/practice.html?hz=学`
- `dist/export.html?hz=爱`
- `dist/display.html?hz=你好世界`
- `dist/preview.html?hz=汉`

### 本地静态服务器（推荐）

```bash
python -m http.server 8080
```

然后访问：

- `http://localhost:8080/dist/index.html?hz=汉`

### 作为 Node 项目：构建并同步到 Nginx

`npm run build` 会依次执行：`node scripts/build.js`，再执行 `node scripts/deploy-nginx.js`。

- **若仓库根目录没有 `.env` 文件**：部署脚本会静默跳过（适合 GitHub Actions 等只需 `dist/` 的场景）。
- **若存在 `.env`**：需配置 `NGINX_HTML_PATH`，脚本会清空该目录后将 `dist/` 内容复制进去。

1. 安装依赖：

```bash
npm install
```

2. 新建 `.env`（可参考 `.env.example`）：

```bash
# 必填：Nginx 的 html 根目录（与 deploy 脚本配合使用）
NGINX_HTML_PATH=C:\nginx\html
# 可选：部署完成后在终端打印访问链接（末尾不要多余斜杠）
SITE_BASE_URL=http://localhost:80
```

3. 执行：

```bash
npm run build
```

未设置 `SITE_BASE_URL` 时，部署成功后仍会提示可在 `.env` 中配置以便打印访问链接。

## 部署到 GitHub Pages（`gh-pages` 分支）

工作流：`.github/workflows/publish-gh-pages.yml`。

1. 仓库 **Settings → Pages**：Source 选择 **`gh-pages` / `root`**。
2. 向 `main` 或 `master` 推送会触发：安装依赖 → `npm run build`（无 `.env` 时仅生成 `dist/`）→ `node scripts/publish-gh-pages.js` 将 `dist/` 推送到 `gh-pages` 分支。
3. 若 `dist/` 相对上次无变化，会跳过无意义提交。

## URL 参数

- **`hz`**：要展示/练习/预览/导出的字符串（按字符逐个渲染；建议使用数据源中存在的汉字）。

若某字符在 `hanzi-writer-data` 中无对应 JSON，可能无法渲染。

## 技术说明

- **渲染**：`hanzi-writer@3.5`（通过 jsDelivr CDN）
- **字形数据**：`hanzi-writer-data@2.0`（按字请求 JSON）
- **主题**：CSS 使用 `prefers-color-scheme`；脚本读取 CSS 变量并在主题变化时重渲染
- **SVG**：基于 `data.strokes` 与 `g transform` 做坐标系修正（Y 轴翻转、缩放居中）
- **导出**：Blob 下载 SVG/图片；预览与导出页使用 `gif.js` 生成逐笔 GIF（含透明背景选项）

## 后续可演进方向（路线图）

- 输入框与词条/字表导航，快速切换 `hz`
- 逐笔播放速度、循环、笔画序号显示/隐藏；练习统计与评分
- 更多导出样式（轮廓/填充、带笔画编号等）
- 缓存已加载的字形 JSON，或可选离线数据包

## 版权与许可

- 本仓库许可证：MIT，见 `LICENSE`
- `hanzi-writer` 与 `hanzi-writer-data` 的许可请见各自上游仓库
