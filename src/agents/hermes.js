import path from 'node:path';
import fs from 'node:fs';
import { homeDir, exists, maxDate } from '../util.js';
import { makeYamlMcp } from './yaml-mcp.js';

const h = () => homeDir();

export default {
  id: 'hermes',
  label: 'Hermes Agent',
  exec: 'hermes',
  detect() {
    return exists(path.join(h(), '.hermes'));
  },
  skillDirs() {
    return [path.join(h(), '.hermes', 'skills')].filter(exists);
  },
  // 用户级 MCP：~/.hermes/config.yaml 的 mcp_servers: 嵌套块
  mcp: makeYamlMcp(path.join(h(), '.hermes', 'config.yaml'), 'mcp_servers'),
  detectLastUsed() {
    // hermes 未发现会话转录目录，用配置与技能目录的改动时间作弱信号
    const weak = [];
    for (const f of [path.join(h(), '.hermes', 'config.yaml'), ...this.skillDirs()]) {
      try {
        weak.push(new Date(fs.statSync(f).mtimeMs));
      } catch {
        /* continue */
      }
    }
    return maxDate(weak);
  },
};
