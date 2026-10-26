import fs from 'node:fs';
import { exists, atomicWriteText } from '../util.js';

// 为"YAML 顶层 mcp_servers: 嵌套块"型 Agent（Hermes）生成 MCP 读写实现。
// 与 Codex 的 TOML 同思路做文本块手术：只增删目标服务的缩进块，
// 文件其余键、注释与格式原样保留。
export function makeYamlMcp(file, topKey = 'mcp_servers') {
  const KEY_LINE = new RegExp(`^${topKey}:\\s*(#.*)?$`);
  // 顶层 key 下两空格缩进的服务名行，如 "  cua-driver:"
  const SERVER = /^ {2}("?)([^#\s:"'][^:]*?)\1:(\s*(#.*)?)?$/;

  const readLines = () => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');

  // 返回 mcp_servers 键所在行号，以及该节区间的结束行号（不含）：
  // 结束 = 下一个顶层（缩进 < 2）非空行或文件尾
  function sectionRange(lines) {
    let keyIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (KEY_LINE.test(lines[i])) {
        keyIdx = i;
        break;
      }
    }
    if (keyIdx < 0) return null;
    let end = lines.length;
    for (let i = keyIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === '' || l.trimStart().startsWith('#')) continue;
      if (!/^ {2}/.test(l) && !/^\s/.test(l)) {
        end = i;
        break;
      }
    }
    return { keyIdx, end };
  }

  // 某服务块的行范围：从 "  name:" 到下一个同级服务行 / 节结束行 / 文件尾
  function serverRange(lines, range, name) {
    for (let i = range.keyIdx + 1; i < range.end; i++) {
      const m = lines[i].match(SERVER);
      if (m && m[2] === name) {
        let end = range.end;
        for (let j = i + 1; j < range.end; j++) {
          if (SERVER.test(lines[j])) {
            end = j;
            break;
          }
        }
        return { start: i, end };
      }
    }
    return null;
  }

  return {
    ext: 'yaml',
    file,
    list() {
      if (!exists(file)) return [];
      const lines = readLines();
      const range = sectionRange(lines);
      if (!range) return [];
      const out = [];
      for (let i = range.keyIdx + 1; i < range.end; i++) {
        const m = lines[i].match(SERVER);
        if (m) {
          const sr = serverRange(lines, range, m[2]);
          out.push({ name: m[2], def: sr ? lines.slice(sr.start, sr.end).join('\n') : '' });
        }
      }
      return out;
    },
    remove(name) {
      const lines = readLines();
      const range = sectionRange(lines);
      if (!range) throw new Error(`${file} 中不存在 ${topKey}: 节`);
      const sr = serverRange(lines, range, name);
      if (!sr) throw new Error(`${topKey}: 中不存在 MCP: ${name}`);
      const block = lines.slice(sr.start, sr.end).join('\n');
      lines.splice(sr.start, sr.end - sr.start);
      atomicWriteText(file, lines.join('\n'));
      return block;
    },
    upsert(name, blockText) {
      let lines = exists(file) ? readLines() : [];
      const range = sectionRange(lines);
      if (range) {
        if (serverRange(lines, range, name)) throw new Error(`${topKey}: 中已存在 ${name}`);
        // 已有其他服务 → 追加到节内末尾（去掉块尾多余空行，统一一个分隔空行）
        const clean = blockText.replace(/\n+$/, '');
        lines.splice(range.end, 0, '', clean);
      } else {
        // 整个键都不存在：补一个顶层键再放块
        let text = lines.join('\n');
        if (text && !text.endsWith('\n')) text += '\n';
        text += `\n${topKey}:\n${blockText.replace(/\n+$/, '')}\n`;
        atomicWriteText(file, text);
        return;
      }
      atomicWriteText(file, lines.join('\n'));
    },
    describe(blockText) {
      const m = blockText.match(/^\s+command:\s*['"]?([^'"\s#]+)/m);
      return m ? m[1] : '';
    },
  };
}
