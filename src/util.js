import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 沙箱测试 / 多用户场景可整体切换 base home
export function homeDir() {
  return process.env.AGENTPARK_HOME || os.homedir();
}

export function aparkDir() {
  return path.join(homeDir(), '.agentpark');
}

export function storeDir() {
  return path.join(aparkDir(), 'store');
}

export function backupsDir() {
  return path.join(aparkDir(), 'backups');
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function exists(p) {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function nowStamp(d = new Date()) {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

export function atomicWriteText(file, text) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.apark-tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

export function atomicWriteJson(file, data) {
  atomicWriteText(file, JSON.stringify(data, null, 2) + '\n');
}

function backupsIndexFile() {
  return path.join(backupsDir(), 'index.json');
}

// 修改任何配置文件之前调用；备份索引同时供 rollback 使用
export function backupFile(originalPath, tag = 'misc') {
  if (!exists(originalPath)) throw new Error(`备份目标不存在: ${originalPath}`);
  ensureDir(backupsDir());
  const base = `${nowStamp()}__${tag}__${path.basename(originalPath)}`;
  let backupPath = path.join(backupsDir(), base);
  let i = 1;
  while (exists(backupPath)) backupPath = path.join(backupsDir(), `${base}.${i++}`);
  fs.copyFileSync(originalPath, backupPath);
  const idx = readJson(backupsIndexFile(), { version: 1, entries: [] });
  idx.entries.push({ ts: new Date().toISOString(), tag, originalPath, backupPath });
  atomicWriteJson(backupsIndexFile(), idx);
  return backupPath;
}

export function rollbackLast() {
  const idxFile = backupsIndexFile();
  const idx = readJson(idxFile, { version: 1, entries: [] });
  const entry = idx.entries.pop();
  if (!entry) return null;
  if (!exists(entry.backupPath)) {
    atomicWriteJson(idxFile, idx);
    throw new Error(`备份文件丢失: ${entry.backupPath}`);
  }
  if (exists(entry.originalPath)) {
    // 回滚前对当前状态再做一次备份，保证回滚本身可撤销
    const guard = path.join(
      backupsDir(),
      `${nowStamp()}__rollback-guard__${path.basename(entry.originalPath)}`
    );
    fs.copyFileSync(entry.originalPath, guard);
    idx.entries.push({ ts: new Date().toISOString(), tag: 'rollback-guard', originalPath: entry.originalPath, backupPath: guard });
  }
  ensureDir(path.dirname(entry.originalPath));
  fs.copyFileSync(entry.backupPath, entry.originalPath);
  atomicWriteJson(idxFile, idx);
  return entry;
}

export function movePath(src, dest) {
  ensureDir(path.dirname(dest));
  if (exists(dest)) throw new Error(`目标已存在，拒绝覆盖: ${dest}`);
  try {
    fs.renameSync(src, dest);
  } catch (e) {
    if (e.code === 'EXDEV') {
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    } else {
      throw e;
    }
  }
}

export function listDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => {
        if (e.isDirectory()) return true;
        // 符号链接/联接指向目录的也算技能（如 .zcode/skills 常链接到 .agents/skills）
        if (e.isSymbolicLink()) {
          try {
            return fs.statSync(path.join(dir, e.name)).isDirectory();
          } catch {
            return false;
          }
        }
        return false;
      })
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export function dirSize(p, { maxEntries = 5000 } = {}) {
  let total = 0;
  let count = 0;
  const stack = [p];
  while (stack.length && count < maxEntries) {
    const cur = stack.pop();
    let st;
    try {
      st = fs.statSync(cur);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      let entries;
      try {
        entries = fs.readdirSync(cur);
      } catch {
        continue;
      }
      for (const e of entries) stack.push(path.join(cur, e));
    } else {
      total += st.size;
      count++;
    }
  }
  return total;
}

export function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function whichSync(name) {
  if (!name) return null;
  if (path.isAbsolute(name)) return exists(name) ? name : null;
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts =
    process.platform === 'win32'
      ? ['', ...(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase())]
      : [''];
  for (const d of dirs) {
    for (const ext of exts) {
      const fp = path.join(d, name + ext);
      try {
        if (fs.statSync(fp).isFile()) return fp;
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

// 有界递归取目录下文件的最大 mtime，作为"最后使用时间"的被动信号
export function walkMaxMtime(dir, { maxEntries = 4000 } = {}) {
  if (!dir || !exists(dir)) return null;
  let max = 0;
  let count = 0;
  const stack = [dir];
  while (stack.length && count < maxEntries) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (count++ >= maxEntries) break;
      const fp = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(fp);
      } else {
        try {
          const m = fs.statSync(fp).mtimeMs;
          if (m > max) max = m;
        } catch {
          /* continue */
        }
      }
    }
  }
  return max ? new Date(max) : null;
}

export function maxDate(dates) {
  const valid = dates.filter(Boolean);
  return valid.length ? new Date(Math.max(...valid.map((d) => d.getTime()))) : null;
}

export function fmtDate(d) {
  if (!d) return '从未/未知';
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())} ${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
}

export function daysSince(d) {
  if (!d) return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Math.floor((Date.now() - t) / 86400000);
}
