// 冒烟测试：在沙箱假 home（AGENTPARK_HOME 指向临时目录）中跑通全流程，
// 绝不触碰真实配置。运行: node tests/smoke.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentpark-test-'));
const H = path.join(tmp, 'home');
process.env.AGENTPARK_HOME = H;

// ---- 造一个假 home：Claude Code + Codex，30 天前使用过 ----
const old = new Date(Date.now() - 30 * 86400000);
fs.mkdirSync(path.join(H, '.claude', 'skills', 'demo'), { recursive: true });
fs.writeFileSync(path.join(H, '.claude', 'skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\nhi');
fs.mkdirSync(path.join(H, '.claude', 'projects', 'p1'), { recursive: true });
fs.writeFileSync(path.join(H, '.claude', 'projects', 'p1', 's.jsonl'), '{}');
fs.utimesSync(path.join(H, '.claude', 'projects', 'p1', 's.jsonl'), old, old);
fs.writeFileSync(
  path.join(H, '.claude.json'),
  JSON.stringify({ mcpServers: { foo: { command: 'uvx', args: ['x'] } }, other: { keep: true } }, null, 2)
);
fs.mkdirSync(path.join(H, '.codex', 'skills', 'fancy'), { recursive: true });
fs.mkdirSync(path.join(H, '.codex', 'sessions'), { recursive: true });
fs.writeFileSync(
  path.join(H, '.codex', 'config.toml'),
  '# top comment\n[other]\nkey = "v"\n\n[mcp_servers.bar]\ncommand = "uvx"\nargs = ["a"]\n\n[mcp_servers.bar.env]\nK = "V"\n'
);

// ---- Hermes Agent：YAML 型 MCP ----
fs.mkdirSync(path.join(H, '.hermes', 'skills', 'orb'), { recursive: true });
fs.writeFileSync(path.join(H, '.hermes', 'skills', 'orb', 'SKILL.md'), '---\nname: orb\n---\nx');
fs.writeFileSync(
  path.join(H, '.hermes', 'config.yaml'),
  'model: big\n\nmcp_servers:\n  cua-driver:\n    command: "uvx"\n    args: ["mcp"]\n\nnotes: keep\n'
);

// ---- DeepSeek DSH：仅技能维度 ----
fs.mkdirSync(path.join(H, '.dsh', 'skills', 'liang'), { recursive: true });
fs.writeFileSync(path.join(H, '.dsh', 'skills', 'liang', 'SKILL.md'), 'x');
fs.mkdirSync(path.join(H, '.dsh', 'sessions', 'proj'), { recursive: true });

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: process.env });
}
function runOk(args) {
  const r = run(args);
  assert.equal(r.status, 0, `命令失败: agentpark ${args.join(' ')}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return r;
}

// 1. scan 检测
const scan = JSON.parse(runOk(['scan', '--json']).stdout);
const cc = scan.agents.find((a) => a.id === 'claude-code');
const cx = scan.agents.find((a) => a.id === 'codex');
assert.equal(cc.detected, true);
assert.equal(cc.skillsActive, 1);
assert.equal(cc.mcpActive, 1);
assert.ok(cc.idleDays >= 29, '被动检测应识别出 30 天前的会话');
assert.equal(cx.detected, true);

// 2. park 技能
runOk(['park', 'demo', '--json']);
assert.ok(fs.existsSync(path.join(H, '.agentpark', 'store', 'claude-code', 'skills', 'demo', 'SKILL.md')));
assert.ok(!fs.existsSync(path.join(H, '.claude', 'skills', 'demo')));

// 3. restore 技能
runOk(['restore', 'demo']);
assert.ok(fs.existsSync(path.join(H, '.claude', 'skills', 'demo', 'SKILL.md')));

// 4. park/restore JSON 型 MCP（保留无关键）
runOk(['park', 'foo', '--agent', 'claude-code', '--type', 'mcp']);
let cfg = JSON.parse(fs.readFileSync(path.join(H, '.claude.json'), 'utf8'));
assert.deepEqual(cfg.mcpServers, {});
assert.equal(cfg.other.keep, true);
runOk(['restore', 'foo']);
cfg = JSON.parse(fs.readFileSync(path.join(H, '.claude.json'), 'utf8'));
assert.deepEqual(cfg.mcpServers.foo, { command: 'uvx', args: ['x'] });

// 5. park/restore TOML 型 MCP（保留注释与其他表）
runOk(['park', 'bar', '--agent', 'codex', '--type', 'mcp']);
let t1 = fs.readFileSync(path.join(H, '.codex', 'config.toml'), 'utf8');
assert.ok(!t1.includes('[mcp_servers.bar]'), 'bar 块应被移除');
assert.ok(t1.includes('# top comment') && t1.includes('[other]'), '其余内容应原样保留');
runOk(['restore', 'bar']);
t1 = fs.readFileSync(path.join(H, '.codex', 'config.toml'), 'utf8');
assert.ok(t1.includes('[mcp_servers.bar]') && t1.includes('command = "uvx"') && t1.includes('K = "V"'));

// 6. policy run：30 天未使用 → 自动收纳 demo 技能 + foo MCP
runOk(['policy', 'run', '--days', '14', '--json']);
assert.ok(!fs.existsSync(path.join(H, '.claude', 'skills', 'demo')));
assert.equal(JSON.parse(fs.readFileSync(path.join(H, '.claude.json'), 'utf8')).mcpServers.foo, undefined);

// 7. run 启动装配：策略收纳项自动唤醒 + 使用记录 + 参数/退出码透传
const exitR = spawnSync(
  process.execPath,
  [CLI, 'run', 'claude-code', '--exec', process.execPath, '--', '-e', 'process.exit(7)'],
  { encoding: 'utf8', env: process.env }
);
assert.equal(exitR.status, 7, `run 应透传退出码 7: ${exitR.stdout} ${exitR.stderr}`);
assert.ok(fs.existsSync(path.join(H, '.claude', 'skills', 'demo', 'SKILL.md')), 'run 应自动唤醒策略收纳的技能');
cfg = JSON.parse(fs.readFileSync(path.join(H, '.claude.json'), 'utf8'));
assert.ok('foo' in cfg.mcpServers, 'run 应自动唤醒策略收纳的 MCP');
const usage = JSON.parse(fs.readFileSync(path.join(H, '.agentpark', 'usage.json'), 'utf8'));
assert.ok(usage.events.some((e) => e.agent === 'claude-code' && e.via === 'run'));

// 8. rollback：park 造成配置变更后一键撤销
runOk(['park', 'foo', '--agent', 'claude-code', '--type', 'mcp']);
assert.equal(JSON.parse(fs.readFileSync(path.join(H, '.claude.json'), 'utf8')).mcpServers.foo, undefined);
runOk(['rollback']);
assert.ok('foo' in JSON.parse(fs.readFileSync(path.join(H, '.claude.json'), 'utf8')).mcpServers);

// 9. 手动收纳不被 run 自动唤醒
runOk(['park', 'demo', '--reason', 'manual-keep-away']);
run(['run', 'claude-code', '--exec', process.execPath, '--', '-e', 'process.exit(0)']);
assert.ok(!fs.existsSync(path.join(H, '.claude', 'skills', 'demo')), '手动收纳的技能不应被 run 唤醒');
runOk(['restore', 'demo']);

// 10. Hermes：scan 检测 + YAML 型 MCP park/restore（保留其余顶层键）
const hm = JSON.parse(runOk(['scan', '--json']).stdout).agents.find((a) => a.id === 'hermes');
assert.equal(hm.detected, true);
assert.equal(hm.skillsActive, 1);
assert.equal(hm.mcpActive, 1);
runOk(['park', 'cua-driver', '--agent', 'hermes', '--type', 'mcp']);
let hy = fs.readFileSync(path.join(H, '.hermes', 'config.yaml'), 'utf8');
assert.ok(!hy.includes('cua-driver'), 'cua-driver 块应被移除');
assert.ok(hy.includes('model: big') && hy.includes('notes: keep'), '其余顶层键应保留');
runOk(['restore', 'cua-driver']);
hy = fs.readFileSync(path.join(H, '.hermes', 'config.yaml'), 'utf8');
assert.ok(
  hy.includes('cua-driver:') && hy.includes('command: "uvx"') && hy.includes('notes: keep'),
  '恢复后应完整回来且不影响其他键'
);

// 11. DSH：技能 park/restore
runOk(['park', 'liang', '--agent', 'dsh']);
assert.ok(!fs.existsSync(path.join(H, '.dsh', 'skills', 'liang')));
assert.ok(fs.existsSync(path.join(H, '.agentpark', 'store', 'dsh', 'skills', 'liang', 'SKILL.md')));
runOk(['restore', 'liang']);
assert.ok(fs.existsSync(path.join(H, '.dsh', 'skills', 'liang', 'SKILL.md')));

console.log('✅ 全部冒烟测试通过（scan/park/restore/policy/run/rollback/TOML/JSON/透传）');
fs.rmSync(tmp, { recursive: true, force: true });
