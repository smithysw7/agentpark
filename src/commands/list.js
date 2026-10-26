import path from 'node:path';
import { AGENTS, detectedAgents, getAgent } from '../agents/index.js';
import { itemsFor } from '../store.js';
import { effectiveLastUsed } from '../usage.js';
import { listDirs, dirSize, fmtBytes, fmtDate } from '../util.js';
import { emit, renderTable } from '../output.js';

export function cmdList(opts) {
  let agents;
  if (opts.agent) {
    const a = getAgent(opts.agent);
    if (!a) throw new Error(`未知 Agent: ${opts.agent}（可选: ${AGENTS.map((x) => x.id).join(', ')}）`);
    agents = [a];
  } else {
    agents = detectedAgents();
  }
  const typeFilter = opts.type || null;
  if (typeFilter && !['skill', 'mcp'].includes(typeFilter)) {
    throw new Error(`未知类型: ${typeFilter}（可选: skill, mcp）`);
  }

  const rows = [];
  for (const a of agents) {
    const lu = effectiveLastUsed(a);
    const parked = itemsFor(a.id);
    if (!typeFilter || typeFilter === 'skill') {
      const parkedSkillNames = new Set(parked.filter((i) => i.type === 'skill').map((i) => i.name));
      for (const d of a.skillDirs()) {
        for (const n of listDirs(d)) {
          if (parkedSkillNames.has(n)) continue;
          rows.push({
            agent: a.id,
            type: 'skill',
            name: n,
            status: '活跃',
            size: dirSize(path.join(d, n)),
            lastUsed: lu ? lu.toISOString() : null,
          });
        }
      }
      for (const item of parked.filter((i) => i.type === 'skill')) {
        rows.push({
          agent: a.id,
          type: 'skill',
          name: item.name,
          status: '收纳',
          size: dirSize(item.storedPath),
          lastUsed: null,
          reason: item.reason,
          parkedAt: item.parkedAt,
        });
      }
    }
    if ((!typeFilter || typeFilter === 'mcp') && a.mcp) {
      const parkedMcpNames = new Set(parked.filter((i) => i.type === 'mcp').map((i) => i.name));
      for (const m of a.mcp.list()) {
        if (parkedMcpNames.has(m.name)) continue;
        rows.push({
          agent: a.id,
          type: 'mcp',
          name: m.name,
          status: '活跃',
          describe: a.mcp.describe ? a.mcp.describe(m.def) : '',
          lastUsed: lu ? lu.toISOString() : null,
        });
      }
      for (const item of parked.filter((i) => i.type === 'mcp')) {
        rows.push({
          agent: a.id,
          type: 'mcp',
          name: item.name,
          status: '收纳',
          reason: item.reason,
          parkedAt: item.parkedAt,
        });
      }
    }
  }

  emit({ items: rows }, opts.json, () => [
    `共 ${rows.length} 项资源（最后使用时间为 Agent 级别）:`,
    ...renderTable(
      ['Agent', '类型', '名称', '状态', '大小', '最后使用', '备注'],
      rows.map((r) => [
        r.agent,
        r.type,
        r.name,
        r.status,
        r.type === 'skill' ? fmtBytes(r.size) : '—',
        r.lastUsed ? fmtDate(r.lastUsed) : '—',
        r.reason ? `${r.reason} @ ${fmtDate(r.parkedAt)}` : r.describe || '',
      ])
    ),
  ]);
}
