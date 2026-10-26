import path from 'node:path';
import { homeDir, exists, walkMaxMtime } from '../util.js';

const h = () => homeDir();

export default {
  id: 'dsh',
  label: 'DeepSeek DSH',
  exec: 'dsh',
  detect() {
    return exists(path.join(h(), '.dsh'));
  },
  skillDirs() {
    return [path.join(h(), '.dsh', 'skills')].filter(exists);
  },
  // DSH 未发现稳定的用户级 MCP 配置文件（顶层配置均无 mcp 键，
  // 扩展疑似由桌面端 dsh-config-manager 事务化管理）。
  // 先支持技能维度；待其配置入口稳定后补 MCP 适配。
  mcp: null,
  detectLastUsed() {
    // 会话按项目分子目录存放：~/.dsh/sessions/<project>/session-*
    return walkMaxMtime(path.join(h(), '.dsh', 'sessions'), { maxEntries: 3000 });
  },
};
