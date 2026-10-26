#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmdScan } from './commands/scan.js';
import { cmdList } from './commands/list.js';
import { cmdPark } from './commands/park.js';
import { cmdRestore } from './commands/restore.js';
import { cmdPolicy } from './commands/policy.js';
import { cmdRun } from './commands/run.js';
import { cmdRollback } from './commands/rollback.js';

const pkg = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
);

const HELP = `AgentPark v${pkg.version} — AI 编程智能体的扩展生命周期管理器

管理 Claude Code / ZCode / Codex / Gemini CLI 的技能(Skills)与 MCP 服务器：
按使用频率自动休眠、启动时自动装配、手动收纳/唤醒、配置全量备份可回滚。

用法:
  agentpark <命令> [参数]

命令:
  scan                                      检测本机已安装的 Agent 与扩展概况
  list [--agent id] [--type skill|mcp]      盘点所有技能与 MCP（状态/大小/最后使用）
  park <名称> [--agent id] [--type skill|mcp] [--reason 说明]
                                            收纳（休眠）一个技能或 MCP
  restore <名称> [--agent id] [--type skill|mcp]
                                            唤醒（恢复）已收纳的资源
  policy [--days N] [--on|--off] [--exclude a,b]
                                            查看或设置自动休眠策略（默认 14 天未使用）
  policy run [--dry-run]                    立即执行一次自动收纳
  run <agent> [-- 参数...]                  启动时装配：唤醒策略收纳项 → 记录使用 → 拉起真实工具
  rollback                                  回滚最近一次配置文件变更
  help                                      显示本帮助
  version                                   显示版本

Agent 标识(id): claude-code | zcode | codex | gemini | hermes | dsh | agents-shared
（run 同时接受可执行名: claude | zcode | codex | gemini | hermes | dsh）

全局选项:
  --json                                    以 JSON 输出（便于脚本化）
  --help                                    显示帮助

数据目录 ~/.agentpark:
  manifest.json  收纳清单（唯一事实来源）
  usage.json     使用记录（run 主动记录 + 会话文件被动检测）
  policy.json    自动休眠策略
  store/         收纳仓库（资源从这里原样搬回）
  backups/       配置备份（rollback 的数据源）

示例:
  agentpark scan
  agentpark park playwright --type mcp --reason "暂时不用浏览器自动化"
  agentpark policy --days 14
  agentpark policy run --dry-run
  agentpark run claude -- --resume
`;

function parseOpts(argv) {
  const opts = {};
  const rest = [];
  const extra = []; // "--" 之后的原样透传参数
  let after = false;
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (after) {
      extra.push(t);
      continue;
    }
    if (t === '--') {
      after = true;
      continue;
    }
    if (t.startsWith('--') && t.length > 2) {
      const eq = t.indexOf('=');
      if (eq > 0) {
        opts[t.slice(2, eq)] = t.slice(eq + 1);
      } else {
        const key = t.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          opts[key] = next;
          i++;
        } else {
          opts[key] = true;
        }
      }
      continue;
    }
    rest.push(t);
  }
  return { opts, rest, extra };
}

function dispatch() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }
  if (cmd === 'version' || cmd === '--version') {
    console.log(pkg.version);
    return;
  }
  const { opts, rest: pos, extra } = parseOpts(rest);
  switch (cmd) {
    case 'scan':
      cmdScan(opts);
      break;
    case 'list':
      cmdList(opts);
      break;
    case 'park':
      cmdPark(pos[0], opts);
      break;
    case 'restore':
      cmdRestore(pos[0], opts);
      break;
    case 'policy':
      // "policy run" 的 run 是位置子命令；--dry-run 的键名带连字符
      cmdPolicy({ ...opts, run: opts.run || pos.includes('run'), dryRun: opts.dryRun || opts['dry-run'] });
      break;
    case 'run':
      cmdRun(pos[0], opts, extra);
      break;
    case 'rollback':
      cmdRollback(opts);
      break;
    default:
      console.error(`未知命令: ${cmd}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

try {
  dispatch();
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
}
