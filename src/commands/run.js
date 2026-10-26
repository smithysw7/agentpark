import { spawnSync } from 'node:child_process';
import { AGENTS, getAgent } from '../agents/index.js';
import { itemsFor } from '../store.js';
import { recordUsage } from '../usage.js';
import { whichSync } from '../util.js';
import { restoreItem } from './restore.js';

// 启动时装配：唤醒策略收纳项（手动收纳保持不动，那是用户明确意图）
// → 记录使用事件 → 拉起真实工具并透传退出码
export function cmdRun(agentRef, opts, passthrough) {
  const a = getAgent(agentRef);
  if (!a) {
    throw new Error(
      `未知 Agent: ${agentRef}（可用 id: ${AGENTS.map((x) => x.id).join(', ')}；或可执行名: ${AGENTS.filter((x) => x.exec).map((x) => x.exec).join(', ')}）`
    );
  }
  if (!a.exec && !opts.exec) throw new Error(`${a.label} 不是可启动的工具`);

  const woken = [];
  for (const item of itemsFor(a.id)) {
    if (String(item.reason || '').startsWith('policy')) {
      try {
        restoreItem(item);
        woken.push(`${item.type}:${item.name}`);
      } catch (e) {
        console.error(`⚠ 唤醒失败 ${item.id}: ${e.message}`);
      }
    }
  }
  recordUsage(a.id, 'run');
  console.log(
    `[agentpark] ${a.label} 装配完成${woken.length ? `，唤醒 ${woken.length} 项: ${woken.join(', ')}` : ''}，使用记录已写入`
  );

  const execName = opts.exec || a.exec;
  const resolved = whichSync(execName);
  if (!resolved) {
    console.error(`✗ 未在 PATH 中找到可执行文件: ${execName}。装配与使用记录已完成，但无法启动。`);
    process.exitCode = 1;
    return;
  }
  const r = spawnSync(resolved, passthrough, {
    stdio: 'inherit',
    shell: !opts.exec && process.platform === 'win32',
  });
  if (r.error) {
    console.error(`✗ 启动失败: ${r.error.message}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = r.status == null ? 1 : r.status;
}
