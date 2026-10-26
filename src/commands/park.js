import path from 'node:path';
import { AGENTS, detectedAgents, getAgent } from '../agents/index.js';
import { itemId, getItem, addItem, storePathFor, loadManifest } from '../store.js';
import { exists, movePath, backupFile, atomicWriteJson, atomicWriteText, listDirs } from '../util.js';
import { emit } from '../output.js';

function resolveTargets(name, opts) {
  const agentFilter = opts.agent || null;
  const typeFilter = opts.type || null;
  if (agentFilter && !getAgent(agentFilter)) {
    throw new Error(`未知 Agent: ${agentFilter}（可选: ${AGENTS.map((a) => a.id).join(', ')}）`);
  }
  if (typeFilter && !['skill', 'mcp'].includes(typeFilter)) {
    throw new Error(`未知类型: ${typeFilter}（可选: skill, mcp）`);
  }
  const agents = agentFilter ? [getAgent(agentFilter)] : detectedAgents();
  const cands = [];
  for (const a of agents) {
    if (!a.detect()) continue;
    if (!typeFilter || typeFilter === 'skill') {
      for (const d of a.skillDirs()) {
        if (listDirs(d).includes(name)) cands.push({ agent: a, type: 'skill', dir: d });
      }
    }
    if ((!typeFilter || typeFilter === 'mcp') && a.mcp) {
      if (a.mcp.list().some((m) => m.name === name)) cands.push({ agent: a, type: 'mcp' });
    }
  }
  return cands;
}

export function findSkillDir(a, name) {
  return a.skillDirs().find((d) => listDirs(d).includes(name)) || null;
}

export function parkSkill(a, name, dir, reason) {
  const id = itemId(a.id, 'skill', name);
  if (getItem(id)) throw new Error(`已处于收纳状态: ${id}`);
  const src = path.join(dir, name);
  const dest = storePathFor(a.id, 'skill', name);
  if (exists(dest)) throw new Error(`仓库中已存在同名资源，请先 restore 或清理: ${dest}`);
  movePath(src, dest);
  if (!exists(dest)) {
    try {
      movePath(dest, src);
    } catch {
      /* 尽力还原 */
    }
    throw new Error('移动后校验失败，已尝试还原');
  }
  addItem({
    id,
    agent: a.id,
    type: 'skill',
    name,
    originalPath: src,
    storedPath: dest,
    parkedAt: new Date().toISOString(),
    reason: reason || 'manual',
  });
  return { id, src, dest };
}

export function parkMcp(a, name, reason) {
  const id = itemId(a.id, 'mcp', name);
  if (getItem(id)) throw new Error(`已处于收纳状态: ${id}`);
  const file = a.mcp.file;
  if (!file || !exists(file)) throw new Error(`MCP 配置文件不存在: ${file}`);
  backupFile(file, a.id);
  const storedPath = storePathFor(a.id, 'mcp', name, a.mcp.ext || 'json');
  const def = a.mcp.remove(name);
  if (a.mcp.ext === 'toml') atomicWriteText(storedPath, def);
  else atomicWriteJson(storedPath, def);
  addItem({
    id,
    agent: a.id,
    type: 'mcp',
    name,
    originalPath: file,
    storedPath,
    configPath: file,
    parkedAt: new Date().toISOString(),
    reason: reason || 'manual',
  });
  return { id, file, storedPath };
}

export function cmdPark(name, opts) {
  if (!name) throw new Error('用法: agentpark park <名称> [--agent id] [--type skill|mcp]');
  const cands = resolveTargets(name, opts);
  if (cands.length === 0) {
    const parked = loadManifest().items.filter((i) => i.name === name);
    if (parked.length) throw new Error(`${name} 已在收纳中: ${parked.map((p) => p.id).join(', ')}`);
    throw new Error(`未找到名为 ${name} 的技能或 MCP（用 agentpark list 查看现有资源）`);
  }
  if (cands.length > 1) {
    throw new Error(
      `找到 ${cands.length} 个同名资源，请用 --agent / --type 消歧:\n` +
        cands.map((c) => `  ${c.agent.id}  ${c.type}`).join('\n')
    );
  }
  const c = cands[0];
  const res = c.type === 'skill' ? parkSkill(c.agent, name, c.dir, opts.reason) : parkMcp(c.agent, name, opts.reason);
  emit({ parked: res }, opts.json, () => [
    `✓ 已收纳 ${c.type === 'skill' ? '技能' : 'MCP'}: ${name}（${c.agent.label}）`,
    `  仓库位置: ${res.dest || res.storedPath}`,
    `  恢复: agentpark restore ${name}`,
  ]);
}
