const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');

const BRANCH = process.env.GH_PAGES_BRANCH || 'gh-pages';
const COMMIT_MESSAGE =
  process.env.GH_PAGES_COMMIT_MESSAGE || 'chore: publish dist to GitHub Pages';

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', ...opts }).toString('utf-8').trim();
}

function runInherit(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function branchExists(ref) {
  try {
    execSync(`git show-ref --verify --quiet ${ref}`);
    return true;
  } catch {
    return false;
  }
}

function ensureDistExists() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`未找到 dist 目录：${DIST_DIR}`);
  }
}

function copyDistToDir(srcDir, destDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(srcDir, ent.name);
    const dest = path.join(destDir, ent.name);
    fs.cpSync(src, dest, { recursive: true, force: true });
  }
}

function cleanWorktreeDir(worktreeDir) {
  const entries = fs.readdirSync(worktreeDir, { withFileTypes: true });
  for (const ent of entries) {
    // worktree 里通常会有一个 .git 文件用来指向真实 git 目录
    if (ent.name === '.git') continue;
    fs.rmSync(path.join(worktreeDir, ent.name), { recursive: true, force: true });
  }
}

function main() {
  ensureDistExists();

  // 必须在 git 仓库内执行
  run('git rev-parse --is-inside-work-tree');

  // 设置提交作者（GitHub Actions 下一般需要）
  const actor = process.env.GITHUB_ACTOR || 'github-actions[bot]';
  const email = process.env.GITHUB_ACTOR
    ? `${process.env.GITHUB_ACTOR}@users.noreply.github.com`
    : 'github-actions[bot]@users.noreply.github.com';
  runInherit(`git config user.name "${actor}"`);
  runInherit(`git config user.email "${email}"`);

  const hasLocalBranch = branchExists(`refs/heads/${BRANCH}`);
  const hasRemoteBranch = branchExists(`refs/remotes/origin/${BRANCH}`);

  // 为了使用 worktree，确保本地至少存在该分支
  if (!hasLocalBranch) {
    if (hasRemoteBranch) {
      runInherit(`git branch -f ${BRANCH} origin/${BRANCH}`);
    } else {
      runInherit(`git branch ${BRANCH}`);
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `gh-pages-${BRANCH}-`));
  let worktreeAdded = false;
  try {
    runInherit(`git worktree add --force "${tmpDir}" ${BRANCH}`);
    worktreeAdded = true;

    cleanWorktreeDir(tmpDir);
    copyDistToDir(DIST_DIR, tmpDir);

    runInherit(`git add -A`, { cwd: tmpDir });

    // 如果内容没有变化，就不提交/不推送，避免无意义提交
    let hasCachedChanges = true;
    try {
      execSync('git diff --cached --quiet', { cwd: tmpDir, stdio: 'ignore' });
      hasCachedChanges = false;
    } catch {
      hasCachedChanges = true;
    }

    if (!hasCachedChanges) {
      console.log('[INFO] gh-pages 无变更，跳过提交。');
      return;
    }

    runInherit(`git commit -m "${COMMIT_MESSAGE}"`, { cwd: tmpDir });
    runInherit(`git push origin ${BRANCH}`);
    console.log(`[OK] 已发布到分支：${BRANCH}`);
  } finally {
    if (worktreeAdded) {
      try {
        runInherit(`git worktree remove --force "${tmpDir}"`);
      } catch {
        // 清理失败不影响主要逻辑
      }
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // 忽略删除临时目录失败
    }
  }
}

main();

