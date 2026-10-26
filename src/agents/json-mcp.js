import fs from 'node:fs';
import { exists, readJson, atomicWriteJson } from '../util.js';

// 为"配置文件里 mcpServers 键"型的 Agent（Claude Code / ZCode / Gemini CLI）
// 生成统一的 MCP 读写实现。file 为 null 或文件不存在时视为没有 MCP 配置。
export function makeJsonMcp(file, key = 'mcpServers') {
  const enabled = () => (file ? exists(file) : false);
  return {
    ext: 'json',
    file,
    list() {
      if (!enabled()) return [];
      const cfg = readJson(file, {});
      const defs = (cfg && cfg[key]) || {};
      return Object.entries(defs).map(([name, def]) => ({ name, def }));
    },
    remove(name) {
      const cfg = readJson(file, null);
      if (!cfg || !cfg[key] || !(name in cfg[key])) {
        throw new Error(`配置中不存在 MCP: ${name}（${file}）`);
      }
      const def = cfg[key][name];
      delete cfg[key][name];
      atomicWriteJson(file, cfg);
      return def;
    },
    upsert(name, def) {
      const cfg = readJson(file, null) || {};
      if (typeof cfg !== 'object' || Array.isArray(cfg)) {
        throw new Error(`配置文件不是 JSON 对象: ${file}`);
      }
      cfg[key] = cfg[key] || {};
      cfg[key][name] = def;
      atomicWriteJson(file, cfg);
    },
    describe(def) {
      return (def && (def.command || def.url || def.type)) || '';
    },
  };
}
