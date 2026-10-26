import path from 'node:path';
import { aparkDir, storeDir, readJson, atomicWriteJson } from './util.js';

// manifest 是唯一事实来源：记录每个被收纳资源的位置、原因和时间。
// 任何移动/改配置成功之后才写入 manifest，失败则不留痕迹。
export function manifestFile() {
  return path.join(aparkDir(), 'manifest.json');
}

export function loadManifest() {
  return readJson(manifestFile(), { version: 1, items: [] });
}

export function saveManifest(m) {
  atomicWriteJson(manifestFile(), m);
}

export function itemId(agent, type, name) {
  return `${agent}:${type}:${name}`;
}

export function getItem(id) {
  return loadManifest().items.find((i) => i.id === id) || null;
}

export function addItem(item) {
  const m = loadManifest();
  if (m.items.some((i) => i.id === item.id)) throw new Error(`manifest 中已存在: ${item.id}`);
  m.items.push(item);
  saveManifest(m);
}

export function removeItem(id) {
  const m = loadManifest();
  const before = m.items.length;
  m.items = m.items.filter((i) => i.id !== id);
  if (m.items.length !== before) saveManifest(m);
}

export function itemsFor(agentId) {
  return loadManifest().items.filter((i) => i.agent === agentId);
}

export function storePathFor(agentId, type, name, ext = 'json') {
  return type === 'skill'
    ? path.join(storeDir(), agentId, 'skills', name)
    : path.join(storeDir(), agentId, 'mcp', `${name}.${ext}`);
}
