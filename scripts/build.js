const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');

const SRC_PAGES_DIR = path.join(SRC_DIR, 'pages');
const SRC_ASSETS_DIR = path.join(SRC_DIR, 'assets');
const SRC_TEMPLATES_DIR = path.join(SRC_DIR, 'templates');

const BASE_TEMPLATE_PATH = path.join(SRC_TEMPLATES_DIR, 'base.html');
const PAGES_MANIFEST_PATH = path.join(SRC_PAGES_DIR, 'pages.json');

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function emptyDir(dir) {
  if (!(await pathExists(dir))) return;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const target = path.join(dir, ent.name);
    await fs.rm(target, { recursive: true, force: true });
  }
}

async function copyDir(src, dest) {
  await ensureDir(dest);
  await fs.cp(src, dest, { recursive: true, force: true });
}

function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? String(vars[key]) : ''));
}

function renderStyles(hrefs) {
  return (hrefs ?? [])
    .map(href => `  <link rel="stylesheet" href="${href}">`)
    .join('\n');
}

async function main() {
  if (!(await pathExists(SRC_PAGES_DIR))) {
    throw new Error(`未找到源页面目录：${SRC_PAGES_DIR}`);
  }
  if (!(await pathExists(SRC_ASSETS_DIR))) {
    throw new Error(`未找到源资源目录：${SRC_ASSETS_DIR}`);
  }
  if (!(await pathExists(SRC_TEMPLATES_DIR))) {
    throw new Error(`未找到模板目录：${SRC_TEMPLATES_DIR}`);
  }
  if (!(await pathExists(BASE_TEMPLATE_PATH))) {
    throw new Error(`未找到基础模板：${BASE_TEMPLATE_PATH}`);
  }
  if (!(await pathExists(PAGES_MANIFEST_PATH))) {
    throw new Error(`未找到页面清单：${PAGES_MANIFEST_PATH}`);
  }

  await ensureDir(DIST_DIR);
  await emptyDir(DIST_DIR);

  const baseTemplate = await fs.readFile(BASE_TEMPLATE_PATH, 'utf-8');
  const manifestRaw = await fs.readFile(PAGES_MANIFEST_PATH, 'utf-8');
  const manifest = JSON.parse(manifestRaw);

  for (const [outName, cfg] of Object.entries(manifest)) {
    const bodyFile = cfg && cfg.body ? String(cfg.body) : '';
    if (!bodyFile) throw new Error(`页面 ${outName} 缺少 body 配置`);

    const bodyPath = path.join(SRC_PAGES_DIR, bodyFile);
    if (!(await pathExists(bodyPath))) {
      throw new Error(`页面 ${outName} 的 body 文件不存在：${bodyPath}`);
    }

    const body = await fs.readFile(bodyPath, 'utf-8');
    const html = renderTemplate(baseTemplate, {
      title: cfg.title ?? '',
      styles: renderStyles(cfg.styles),
      body
    });

    await fs.writeFile(path.join(DIST_DIR, outName), html, 'utf-8');
  }

  await copyDir(SRC_ASSETS_DIR, path.join(DIST_DIR, 'assets'));

  console.log('[OK] build dist/');
}

main().catch(err => {
  console.error('[ERROR]', err && err.message ? err.message : err);
  process.exitCode = 1;
});

