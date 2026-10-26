import path from 'node:path';
import { detectedAgents } from '../agents/index.js';
import { effectiveLastUsed } from '../usage.js';
import { itemId, getItem } from '../store.js';
import { aparkDir, readJson, atomicWriteJson, listDirs, daysSince, fmtDate } from '../util.js';
import { emit } from '../output.js';
import { parkSkill, parkMcp, findSkillDir } from './park.js';

const POLICY_DEFAULTS = { enabled: true, days: 14, exclude: [] };

export function policyFile() {
  return path.join(aparkDir(), 'policy.json');
}

export function loadPolicy() {
  return { ...POLICY_DEFAULTS, ...readJson(policyFile(), {}) };
}

export function savePolicy(p) {
  atomicWriteJson(policyFile(), p);
}

export function policyCandidates(a, exclude) {
  const cands = [];
  for (const d of a.skillDirs()) {
    for (const n of listDirs(d)) {
      if (exclude.includes(n)) continue;
      if (getItem(itemId(a.id, 'skill', n))) continue;
      cands.push({ type: 'skill', name: n });
    }
  }
  if (a.mcp) {
    for (const m of a.mcp.list()) {
      if (exclude.includes(m.name)) continue;
      if (getItem(itemId(a.id, 'mcp', m.name))) continue;
      cands.push({ type: 'mcp', name: m.name });
    }
  }
  return cands;
}

export function cmdPolicy(opts) {
  const p = loadPolicy();
  if (opts.on) p.enabled = true;
  if (opts.off) p.enabled = false;
  if (opts.days) {
    const d = parseInt(opts.days, 10);
    if (!Number.isFinite(d) || d < 1) throw new Error('--days 需要正整数');
    p.days = d;
  }
  if (typeof opts.exclude === 'string') {
    p.exclude = opts.exclude.split(',').map((s) => s.trim()).filter(Boolean);
  }
  savePolicy(p);

  if (!opts.run) {
    emit({ policy: p }, opts.json, () => [
      `自动休眠策略: ${p.enabled ? '开启' : '关闭'} | 阈值: ${p.days} 天未使用 | 排除: ${p.exclude.join(', ') || '无'}`,
      `策略文件: ${policyFile()}`,
      '立即执行一次收纳: agentpark policy run [--dry-run]',
    ]);
    return;
  }

  const results = [];
  for (const a of detectedAgents()) {
    const lu = effectiveLastUsed(a);
    const idle = lu ? daysSince(lu) : null;
    const row = { agent: a.id, label: a.label, lastUsed: lu ? lu.toISOString() : null, idleDays: idle };
    if (!p.enabled) {
      row.action = '策略已关闭，跳过';
    } else if (idle == null) {
      row.action = '无使用记录，保守跳过（用 agentpark run <agent> 产生记录）';
    } else if (idle < p.days) {
      row.action = `仅 ${idle} 天未使用，保留`;
    } else {
      const cands = policyCandidates(a, p.exclude);
      row.candidates = cands.map((c) => `${c.type}:${c.name}`);
      if (opts.dryRun) {
        row.action = `已 ${idle} 天未使用，可收纳 ${cands.length} 项（dry-run 未执行）`;
      } else {
        const parked = [];
        for (const c of cands) {
          try {
            if (c.type === 'skill') {
              const dir = findSkillDir(a, c.name);
              if (!dir) continue;
              parkSkill(a, c.name, dir, `policy:${p.days}d`);
            } else {
              parkMcp(a, c.name, `policy:${p.days}d`);
            }
            parked.push(`${c.type}:${c.name}`);
          } catch (e) {
            row.errors = row.errors || [];
            row.errors.push(`${c.type}:${c.name}: ${e.message}`);
          }
        }
        row.action = `已 ${idle} 天未使用，收纳了 ${parked.length} 项`;
        row.parked = parked;
      }
    }
    results.push(row);
  }

  emit({ policy: p, results }, opts.json, () => [
    `自动休眠策略执行（阈值 ${p.days} 天）:`,
    ...results.flatMap((r) => [
      `  ${r.label}（${r.agent}）: 最后使用 ${fmtDate(r.lastUsed)}${r.idleDays != null ? `（${r.idleDays} 天前）` : ''}`,
      `    → ${r.action}`,
      ...(r.parked && r.parked.length ? [`    ${r.parked.join(', ')}`] : []),
    ]),
  ]);
}
