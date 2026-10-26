import path from 'node:path';
import fs from 'node:fs';
import { homeDir, exists, walkMaxMtime, atomicWriteText } from '../util.js';

const h = () => homeDir();

function configFile() {
  return path.join(h(), '.codex', 'config.toml');
}

// 仅匹配 [mcp_servers.<name>] 顶层表头；[mcp_servers.<name>.env] 子表不算独立服务
const HEADER = /^\s*\[mcp_servers\.("?)([^.\]"]+)\1\]\s*(#.*)?$/;

function readText() {
  return fs.readFileSync(configFile(), 'utf8');
}

// 找到某服务块的行范围：从它的表头行到下一个表头行（任意 [ 开头）或文件尾。
// 环境变量子表 [mcp_servers.<name>.env] 位于该范围内，会随块一起移动。
function findBlock(text, name) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADER);
    if (m && m[2] === name) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end, text: lines.slice(start, end).join('\n') };
}

// Codex 用文本块手术而不是整文件 TOML 反序列化：
// 只增删目标块，文件其余部分（注释、格式、顺序）原样保留。
const tomlMcp = {
  ext: 'toml',
  file: configFile(),
  list() {
    if (!exists(configFile())) return [];
    const text = readText();
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(HEADER);
      if (m) {
        const blk = findBlock(text, m[2]);
        out.push({ name: m[2], def: blk ? blk.text : '' });
      }
    }
    return out;
  },
  remove(name) {
    const text = readText();
    const blk = findBlock(text, name);
    if (!blk) throw new Error(`config.toml 中不存在 [mcp_servers.${name}]`);
    const lines = text.split(/\r?\n/);
    lines.splice(blk.start, blk.end - blk.start);
    atomicWriteText(configFile(), lines.join('\n'));
    return blk.text;
  },
  upsert(name, blockText) {
    let text = exists(configFile()) ? readText() : '';
    if (findBlock(text, name)) throw new Error(`config.toml 中已存在 [mcp_servers.${name}]`);
    if (text && !text.endsWith('\n')) text += '\n';
    text += '\n' + blockText.trimEnd() + '\n';
    atomicWriteText(configFile(), text);
  },
  describe(blockText) {
    const m = blockText.match(/^command\s*=\s*"([^"]+)"/m);
    return m ? m[1] : '';
  },
};

export default {
  id: 'codex',
  label: 'OpenAI Codex CLI',
  exec: 'codex',
  detect() {
    return exists(path.join(h(), '.codex'));
  },
  skillDirs() {
    return [path.join(h(), '.codex', 'skills')].filter(exists);
  },
  mcp: tomlMcp,
  detectLastUsed() {
    return walkMaxMtime(path.join(h(), '.codex', 'sessions'));
  },
};
