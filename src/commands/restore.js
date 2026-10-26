import fs from 'node:fs';
import { getAgent } from '../agents/index.js';
import { loadManifest, removeItem } from '../store.js';
import { exists, movePath, backupFile } from '../util.js';
import { emit } from '../output.js';
import path from 'node:path';

export function restoreItem(item) {
  const a = getAgent(item.agent);
  if (!a) throw new Error(`找不到适配器: ${item.agent}`);
  if (item.type === 'skill') {
    if (!exists(item.storedPath)) throw new Error(`仓库中文件丢失: ${item.storedPath}`);
    let dest = item.originalPath;
    let conflict = false;
    if (exists(dest)) {
      // 收纳期间用户重装了同名技能：不覆盖，恢复到旁路目录
      dest = dest + '.apark-restored';
      conflict = true;
    }
    movePath(item.storedPath, dest);
    removeItem(item.id);
    return { ...item, restoredTo: dest, conflict };
  }
  // mcp
  if (!exists(item.storedPath)) throw new Error(`仓库中定义丢失: ${item.storedPath}`);
  if (!item.configPath) throw new Error(`记录中缺少原配置文件路径: ${item.id}`);
  backupFile(item.configPath, item.agent);
  const raw = fs.readFileSync(item.storedPath, 'utf8');
  const def = item.storedPath.endsWith('.toml') ? raw : JSON.parse(raw);
  a.mcp.upsert(item.name, def);
  removeItem(item.id);
  return { ...item, restoredTo: item.configPath, conflict: false };
}

export function cmdRestore(name, opts) {
  if (!name) throw new Error('用法: agentpark restore <名称> [--agent id] [--type skill|mcp]');
  const items = loadManifest().items.filter(
    (i) =>
      i.name === name &&
      (!opts.agent || i.agent === opts.agent) &&
      (!opts.type || i.type === opts.type)
  );
  if (items.length === 0) {
    throw new Error(`收纳清单中没有名为 ${name} 的资源（agentpark list --json 查看全部）`);
  }
  if (items.length > 1) {
    throw new Error(
      `找到 ${items.length} 个同名资源，请用 --agent / --type 消歧:\n` +
        items.map((i) => `  ${i.id}`).join('\n')
    );
  }
  const res = restoreItem(items[0]);
  emit({ restored: res }, opts.json, () => [
    `✓ 已唤醒 ${res.type === 'skill' ? '技能' : 'MCP'}: ${res.name}（${res.agent}）`,
    `  恢复到: ${res.restoredTo}`,
    ...(res.conflict ? ['  ⚠ 原位置已有同名目录，恢复到了旁路路径 *.apark-restored'] : []),
    '  下次启动对应工具时生效',
  ]);
}
