import path from 'node:path';
import { homeDir, exists } from '../util.js';

const h = () => homeDir();

// Agent Skills 开放标准的共享目录：可能被多个遵循标准的工具同时加载。
// 单独作为一个作用域管理，park/restore 对所有读取该目录的工具同时生效。
export default {
  id: 'agents-shared',
  label: '共享技能目录 (.agents)',
  exec: null,
  detect() {
    return exists(path.join(h(), '.agents', 'skills'));
  },
  skillDirs() {
    return [path.join(h(), '.agents', 'skills')].filter(exists);
  },
  mcp: null,
  detectLastUsed() {
    return null; // 无法归属到单一工具，策略引擎会保守跳过
  },
};
