const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const DIST_DIR = path.resolve(ROOT, 'dist');
const SRC_PAGES_DIR = path.join(ROOT, 'src', 'pages');
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
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const target = path.join(dir, ent.name);
    await fs.rm(target, { recursive: true, force: true });
  }
}

async function copyDir(src, dest) {
  // Node 16+ 起提供 fs.cp；当前环境多为 Node 20+
  await fs.cp(src, dest, { recursive: true, force: true });
}

async function readPagesManifest() {
  if (!(await pathExists(PAGES_MANIFEST_PATH))) {
    return null;
  }
  const raw = await fs.readFile(PAGES_MANIFEST_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function ensureNotRootDir(dir) {
  const resolved = path.resolve(dir);
  const root = path.parse(resolved).root;
  if (resolved === root) {
    throw new Error(`拒绝操作：NGINX_HTML_PATH 指向磁盘根目录（${root}）`);
  }
}

async function main() {
  if (!(await pathExists(ENV_PATH))) {
    // 在 GitHub Actions 等只需要构建（不需要部署）场景下，允许静默跳过部署。
    return;
  }

  // 只有在 .env 存在时才加载，避免缺少配置时继续执行部署。
  require('dotenv').config({ path: ENV_PATH });

  const RAW_BASE_URL = process.env.SITE_BASE_URL || '';
  const SITE_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

  const nginxHtmlPathRaw = process.env.NGINX_HTML_PATH;
  if (!nginxHtmlPathRaw || !nginxHtmlPathRaw.trim()) {
    throw new Error('未找到环境变量 NGINX_HTML_PATH，请在 .env 中配置 NGINX_HTML_PATH=<你的nginx html目录>');
  }

  const nginxHtmlPath = path.resolve(nginxHtmlPathRaw.trim());

  if (!(await pathExists(DIST_DIR))) {
    throw new Error(`未找到 dist 目录：${DIST_DIR}。请先执行构建脚本生成 dist/`);
  }

  await ensureNotRootDir(nginxHtmlPath);
  await ensureDir(nginxHtmlPath);

  // 清空目标目录，再复制 dist 内容进去
  await emptyDir(nginxHtmlPath);
  await copyDir(DIST_DIR, nginxHtmlPath);

  console.log(`[OK] dist: ${DIST_DIR}`);
  console.log(`[OK] nginx html: ${nginxHtmlPath}`);

  if (SITE_BASE_URL) {
    const manifest = await readPagesManifest();
    if (manifest && typeof manifest === 'object') {
      const pages = Object.entries(manifest);
      if (pages.length > 0) {
        console.log('[INFO] 部署完成，可通过以下链接访问页面：');
        for (const [outName, cfg] of pages) {
          const title = cfg && cfg.title ? String(cfg.title) : outName;
          console.log(`- ${title}: ${SITE_BASE_URL}/${outName}`);
        }
      }
    }
  } else {
    console.log('[HINT] 如需在部署后打印访问链接，请在 .env 中配置 SITE_BASE_URL，例如：SITE_BASE_URL=http://localhost:8080');
  }
}

main().catch(err => {
  console.error('[ERROR]', err && err.message ? err.message : err);
  process.exitCode = 1;
});

