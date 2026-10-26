import path from 'node:path';
import { aparkDir, readJson, atomicWriteJson } from './util.js';

// 使用统计两层来源：
// 1) 主动记录：agentpark run <agent> 每次启动写一条事件
// 2) 被动检测：适配器扫描会话/日志文件的 mtime（用户绕过 run 直接启动也能捕获）
export function usageFile() {
  return path.join(aparkDir(), 'usage.json');
}

export function loadUsage() {
  return readJson(usageFile(), { version: 1, events: [], lastUsed: {} });
}

export function recordUsage(agentId, via = 'run') {
  const u = loadUsage();
  const ts = new Date().toISOString();
  u.events.push({ agent: agentId, ts, via });
  if (u.events.length > 5000) u.events = u.events.slice(-5000);
  u.lastUsed = u.lastUsed || {};
  if (!u.lastUsed[agentId] || u.lastUsed[agentId] < ts) u.lastUsed[agentId] = ts;
  atomicWriteJson(usageFile(), u);
}

export function lastUsedFromLog(agentId) {
  const u = loadUsage();
  const ts = u.lastUsed && u.lastUsed[agentId];
  return ts ? new Date(ts) : null;
}

export function effectiveLastUsed(adapter) {
  const a = lastUsedFromLog(adapter.id);
  const p = adapter.detectLastUsed ? adapter.detectLastUsed() : null;
  if (a && p) return a > p ? a : p;
  return a || p;
}
