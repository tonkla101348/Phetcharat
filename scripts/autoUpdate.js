const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = 'tonkla101348/Phetcharat';
const BRANCH = 'main';
const ROOT_DIR = path.resolve(__dirname, '..');
const SHA_FILE = path.join(ROOT_DIR, 'data', '.last_update_sha');
const CODE_FILES = ['server.js', 'package.json', 'README.md', '.gitignore', 'start.bat'];
const CODE_DIRS = ['src', 'public', 'google-apps-script', 'scripts'];

function hasGitCli() {
  if (!fs.existsSync(path.join(ROOT_DIR, '.git'))) return false;
  try {
    execFileSync('git', ['--version'], { cwd: ROOT_DIR, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function writeShaFile(sha) {
  fs.mkdirSync(path.dirname(SHA_FILE), { recursive: true });
  fs.writeFileSync(SHA_FILE, `${sha}\n`, 'utf8');
}

function readLocalSha() {
  if (fs.existsSync(SHA_FILE)) {
    const val = fs.readFileSync(SHA_FILE, 'utf8').trim();
    if (val) return val;
  }
  const gitRefPath = path.join(ROOT_DIR, '.git', 'refs', 'heads', BRANCH);
  if (fs.existsSync(gitRefPath)) {
    const val = fs.readFileSync(gitRefPath, 'utf8').trim();
    if (val) return val;
  }
  return '';
}

function extractZip(zipPath, extractDir) {
  try {
    execFileSync('tar', ['-xf', zipPath, '-C', extractDir], { stdio: 'ignore' });
    return;
  } catch {
    // Fallback to PowerShell Expand-Archive
  }
  const escapedZip = zipPath.replace(/'/g, "''");
  const escapedDir = extractDir.replace(/'/g, "''");
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDir}' -Force`],
    { stdio: 'ignore' }
  );
}

async function runAutoUpdate() {
  let remoteSha = '';
  let commitTitle = '';

  try {
    const apiUrl = `https://api.github.com/repos/${REPO}/commits/${BRANCH}`;
    const resp = await fetch(apiUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Phetcharat-AutoUpdater',
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!resp.ok) {
      console.log('[Auto-Update] Offline or GitHub unreachable — starting with current version.');
      return;
    }
    const data = await resp.json();
    remoteSha = String(data?.sha || '').trim();
    commitTitle = String(data?.commit?.message || '').split('\n')[0].trim();
    if (!remoteSha) {
      console.log('[Auto-Update] Offline or GitHub unreachable — starting with current version.');
      return;
    }
  } catch {
    console.log('[Auto-Update] Offline or GitHub unreachable — starting with current version.');
    return;
  }

  const localSha = readLocalSha();
  if (localSha === remoteSha) {
    console.log(`[Auto-Update] Up to date (${remoteSha.slice(0, 7)}).`);
    return;
  }

  const gitAvailable = hasGitCli();
  if (gitAvailable) {
    try {
      const dirty = execFileSync(
        'git',
        ['status', '--porcelain', '--', 'server.js', 'start.bat', 'package.json', 'src', 'public', 'google-apps-script', 'scripts'],
        { cwd: ROOT_DIR, encoding: 'utf8' }
      ).trim();
      if (dirty) {
        console.log('[Auto-Update] Local dev changes detected — skipping auto-update.');
        return;
      }
    } catch {
      // Ignore git status failure and proceed
    }

    try {
      execFileSync('git', ['merge-base', '--is-ancestor', remoteSha, 'HEAD'], { cwd: ROOT_DIR, stdio: 'ignore' });
      writeShaFile(remoteSha);
      console.log(`[Auto-Update] Local branch is already at or ahead of GitHub (${remoteSha.slice(0, 7)}).`);
      return;
    } catch {
      // Remote commit is not yet an ancestor of HEAD — proceed with download
    }
  }

  console.log(`[Auto-Update] New update found (${remoteSha.slice(0, 7)}${commitTitle ? `: ${commitTitle}` : ''}). Downloading...`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phetcharat-upd-'));
  try {
    const zipUrl = `https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCH}`;
    const zipResp = await fetch(zipUrl, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'Phetcharat-AutoUpdater' },
    });
    if (!zipResp.ok) {
      throw new Error(`HTTP ${zipResp.status}`);
    }
    const buf = Buffer.from(await zipResp.arrayBuffer());
    if (buf.length <= 100 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      throw new Error('Downloaded archive is not a valid ZIP file');
    }

    const zipPath = path.join(tmpDir, 'repo.zip');
    const extractDir = path.join(tmpDir, 'extract');
    fs.writeFileSync(zipPath, buf);
    fs.mkdirSync(extractDir, { recursive: true });
    extractZip(zipPath, extractDir);

    const entries = fs.readdirSync(extractDir).filter((name) => {
      try {
        return fs.statSync(path.join(extractDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
    if (entries.length === 0) {
      throw new Error('Extracted ZIP contains no root directory');
    }
    const srcRoot = path.join(extractDir, entries[0]);

    for (const file of CODE_FILES) {
      const srcFile = path.join(srcRoot, file);
      const dstFile = path.join(ROOT_DIR, file);
      if (!fs.existsSync(srcFile)) continue;
      const srcBuf = fs.readFileSync(srcFile);
      const changed = !fs.existsSync(dstFile) || !Buffer.equals(srcBuf, fs.readFileSync(dstFile));
      if (changed) {
        fs.writeFileSync(dstFile, srcBuf);
      }
    }

    for (const dir of CODE_DIRS) {
      const srcDir = path.join(srcRoot, dir);
      const dstDir = path.join(ROOT_DIR, dir);
      if (fs.existsSync(srcDir)) {
        fs.cpSync(srcDir, dstDir, { recursive: true, force: true });
      }
    }

    // Never overwrite existing data/ files (e.g., data/petcharat.db or data/snapshots/*)
    const srcData = path.join(srcRoot, 'data');
    const dstData = path.join(ROOT_DIR, 'data');
    if (fs.existsSync(srcData)) {
      fs.mkdirSync(dstData, { recursive: true });
      fs.cpSync(srcData, dstData, { recursive: true, force: false, errorOnExist: false });
    }

    writeShaFile(remoteSha);

    if (gitAvailable) {
      try {
        execFileSync('git', ['fetch', 'origin', BRANCH], { cwd: ROOT_DIR, stdio: 'ignore' });
        execFileSync('git', ['reset', '--soft', `origin/${BRANCH}`], { cwd: ROOT_DIR, stdio: 'ignore' });
      } catch {
        // Ignore git metadata sync errors
      }
    }

    console.log(`[Auto-Update] Updated successfully to ${remoteSha.slice(0, 7)}!`);
  } catch (err) {
    console.log(`[Auto-Update] Update failed (${err.message || err}) — starting with current version.`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runAutoUpdate().catch((err) => {
  console.log(`[Auto-Update] Unexpected error (${err.message || err}) — starting with current version.`);
});
