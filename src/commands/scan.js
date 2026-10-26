import { AGENTS, detectedAgents } from '../agents/index.js';
import { itemsFor, loadManifest } from '../store.js';
import { effectiveLastUsed } from '../usage.js';
import { aparkDir, whichSync, listDirs, fmtDate, daysSince } from '../util.js';
import { emit, renderTable } from '../output.js';

export function agentSummary(a) {
  const detected = a.detect();
  const parked = detected ? itemsFor(a.id) : [];
  let skillsActive = 0;
  let mcpActive = 0;
  if (detected) {
    for (const d of a.skillDirs()) skillsActive += listDirs(d).length;
    if (a.mcp) mcpActive = a.mcp.list().length;
  }
  const lu = detected ? effectiveLastUsed(a) : null;
  return {
    id: a.id,
    label: a.label,
    detected,
    exec: a.exec,
    execPath: detected && a.exec ? whichSync(a.exec) : null,
    skillsActive,
    skillsParked: parked.filter((i) => i.type === 'skill').length,
    mcpActive,
    mcpParked: parked.filter((i) => i.type === 'mcp').length,
    lastUsed: lu ? lu.toISOString() : null,
    idleDays: lu ? daysSince(lu) : null,
  };
}

export function cmdScan(opts) {
  const summaries = AGENTS.map(agentSummary);
  const manifest = loadManifest();
  emit(
    { store: aparkDir(), totalParked: manifest.items.length, agents: summaries },
    opts.json,
    () => [
      `AgentPark 扫描结果（收纳仓库: ${aparkDir()}）`,
      ...renderTable(
        ['状态', 'Agent', '技能 活跃/收纳', 'MCP 活跃/收纳', '最后使用', '可执行文件'],
        summaries.map((s) => [
          s.detected ? '✓ 已安装' : '· 未安装',
          `${s.label} (${s.id})`,
          `${s.skillsActive} / ${s.skillsParked}`,
          `${s.mcpActive} / ${s.mcpParked}`,
          s.lastUsed ? `${fmtDate(s.lastUsed)}（${s.idleDays} 天前）` : '从未/未知',
          s.execPath || (s.exec ? '未在 PATH 找到' : '—'),
        ])
      ),
      '',
      `共收纳 ${manifest.items.length} 项。常用命令:`,
      '  agentpark list                 盘点所有资源',
      '  agentpark policy run --dry-run 预览 14 天未使用将被收纳的资源',
      '  agentpark run <agent>          启动工具（自动装配 + 记录使用）',
    ]
  );
}

export function cmdDetected() {
  return detectedAgents();
}
