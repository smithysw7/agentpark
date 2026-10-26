import path from 'node:path';
import { homeDir, exists, walkMaxMtime, maxDate } from '../util.js';
import { makeJsonMcp } from './json-mcp.js';

const h = () => homeDir();

export default {
  id: 'zcode',
  label: 'ZCode',
  exec: 'zcode',
  detect() {
    return exists(path.join(h(), '.zcode'));
  },
  skillDirs() {
    return [path.join(h(), '.zcode', 'skills')].filter(exists);
  },
  // 用户级 MCP 配置：~/.zcode/settings.json（存在才管理；本机未创建时自然为空）
  mcp: makeJsonMcp(path.join(h(), '.zcode', 'settings.json'), 'mcpServers'),
  detectLastUsed() {
    return maxDate([
      walkMaxMtime(path.join(h(), '.zcode', 'cli', 'rollout'), { maxEntries: 2000 }),
      walkMaxMtime(path.join(h(), '.zcode', 'cli', 'log'), { maxEntries: 2000 }),
    ]);
  },
};
