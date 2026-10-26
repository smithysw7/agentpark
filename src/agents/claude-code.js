import path from 'node:path';
import { homeDir, exists, walkMaxMtime } from '../util.js';
import { makeJsonMcp } from './json-mcp.js';

const h = () => homeDir();

export default {
  id: 'claude-code',
  label: 'Claude Code',
  exec: 'claude',
  detect() {
    return exists(path.join(h(), '.claude')) || exists(path.join(h(), '.claude.json'));
  },
  skillDirs() {
    return [path.join(h(), '.claude', 'skills')].filter(exists);
  },
  mcp: makeJsonMcp(path.join(h(), '.claude.json'), 'mcpServers'),
  detectLastUsed() {
    // 会话转录文件的 mtime 是最可靠的被动使用信号
    return walkMaxMtime(path.join(h(), '.claude', 'projects'));
  },
};
