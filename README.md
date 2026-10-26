# AgentPark

> 给 AI 编程智能体的扩展做一个"停车场"：不用的技能与 MCP 自动休眠，启动时自动装配，上下文不再被塞爆。

AgentPark 是一个**零依赖**的命令行工具，统一管理本机多个 AI 编程智能体（Claude Code、ZCode、OpenAI Codex CLI、Gemini CLI…）的**技能（Skills）**与 **MCP 服务器**的生命周期：

- 🔍 **扫描检测** `scan`：识别本机安装了哪些 Agent，各有多少技能 / MCP、可执行文件在哪、多久没用过
- 😴 **自动休眠** `policy`：策略驱动——默认 **14 天未使用则收纳**进仓库，从工具的加载路径中移出（可调阈值、可排除白名单）
- ⚡ **启动时装配** `run`：用 `agentpark run <工具>` 启动，策略收纳的资源**自动唤醒**、使用行为**自动记录**，然后拉起真实工具
- 🖐 **手动收纳 / 唤醒** `park` / `restore`：对单个技能或 MCP 随时操作；手动收纳是"钉住"，不会被自动唤醒
- 💾 **安全第一**：每次修改配置前自动备份，原子写入，一条 `rollback` 撤销最近一次变更，收纳期间重装同名资源也不会被覆盖

## 为什么要做这个

装多了 Agent 工具之后，三类真实成本一直在发生：

1. **上下文成本（最大头）**：每个技能描述、每个 MCP 工具的 schema 都会被注入系统提示词。几十个技能 + 十几个 MCP 轻松吃掉大比例上下文，还会增加模型选错工具的噪音。
2. **磁盘与重复**：同一个技能在 `.claude`、`.zcode`、`.agents` 里各装一份；MCP 配置四处重复。
3. **心智负担**：不知道自己装过什么、哪个工具能用什么、哪些三个月没碰过。

AgentPark 的答案是**按工具、按使用频率的生命周期管理**：常用的留在原位，不用的搬进仓库休眠，启动工具时自动把该用的装配回去。隐藏 ≠ 删除，仓库里的一切都能原样搬回。

## 快速开始

```bash
git clone <repo-url> agentpark && cd agentpark
npm link          # 注册 agentpark / apark 两个命令（零依赖，无需 install）

agentpark scan    # 看看本机装了哪些 Agent、各有多少扩展
```

典型工作流：

```bash
# 1) 看看 14 天没用的资源有哪些（预览，不执行）
agentpark policy run --dry-run

# 2) 一键收纳它们
agentpark policy run

# 3) 以后都用这种方式启动工具：装配 + 记录使用一步到位
agentpark run claude -- --resume
agentpark run codex

# 4) 某个资源想单独收纳 / 唤醒
agentpark park playwright --type mcp --reason "近期不做浏览器自动化"
agentpark restore playwright

# 5) 任何配置改动不放心？一键回滚最近一次
agentpark rollback
```

`scan` 输出示例：

```
状态      Agent                    技能 活跃/收纳   MCP 活跃/收纳   最后使用                     可执行文件
✓ 已安装  Claude Code (claude-code)  60 / 0          0 / 0          2026-10-26 10:02（0 天前）   C:\...\claude.exe
✓ 已安装  ZCode (zcode)              35 / 0          0 / 0          2026-10-26 10:31（0 天前）   ...
✓ 已安装  OpenAI Codex CLI (codex)   1 / 0           1 / 0          2026-10-20 22:10（5 天前）   ...
✓ 已安装  Gemini CLI (gemini)        0 / 0           2 / 0          2026-09-02 08:44（54 天前）  ...
✓ 已安装  共享技能目录 (.agents)      60 / 0          —              从未/未知                    —
```

## 命令参考

| 命令 | 作用 |
|---|---|
| `scan` | 检测已安装 Agent 与扩展概况 |
| `list [--agent id] [--type skill\|mcp]` | 盘点所有资源：状态（活跃/收纳）、大小、最后使用、收纳原因 |
| `park <名称>` | 收纳一个技能或 MCP；`--reason` 记录原因，`--agent`/`--type` 消歧 |
| `restore <名称>` | 唤醒已收纳的资源 |
| `policy` | 查看/设置自动休眠策略：`--days N`、`--on/--off`、`--exclude a,b` |
| `policy run [--dry-run]` | 立即执行一次自动收纳（dry-run 只预览） |
| `run <agent> [-- 参数...]` | 启动时装配：唤醒策略收纳项 → 记录使用 → 拉起真实工具（退出码透传） |
| `rollback` | 回滚最近一次配置文件变更 |

所有命令支持 `--json` 输出，便于脚本化与其他工具集成。

## 工作原理

各 Agent 工具都在**启动时**从固定目录/配置文件读取扩展——这意味着"运行中热卸载"做不到，但"启动前装配、不用时收纳"完全可行，而后者恰好是正确的使用模型：

```
                 park / policy(14天未用)          ┌────────────────────────┐
  工具读取的活跃目录  ────────────────────────►  │  收纳仓库 ~/.agentpark  │
  ~/.claude/skills   ◄────────────────────────  │  store/<agent>/skills/  │
  config 里的 mcpServers   restore / run(启动时自动唤醒)      │  store/<agent>/mcp/     │
                                          └────────────────────────┘
  每次改配置前 ──► 自动备份到 ~/.agentpark/backups ◄── rollback 从这里恢复
```

数据目录布局：

```
~/.agentpark/
├── manifest.json   收纳清单（唯一事实来源：原路径、仓库路径、原因、时间）
├── usage.json      使用记录（run 主动记录 + 会话文件 mtime 被动检测，两者取最大）
├── policy.json     自动休眠策略（默认 { enabled: true, days: 14, exclude: [] }）
├── store/          收纳仓库，按 <agent>/skills 与 <agent>/mcp 存放
└── backups/        配置备份 + 索引（rollback 的数据源，回滚前还会再备份当前状态）
```

三种收纳语义：

- **策略收纳**（reason 以 `policy:` 开头）：由 `policy run` 产生，`agentpark run <工具>` 启动时**自动唤醒**——你启动了工具，就说明你要用。
- **手动收纳**（reason 为 `manual` 或自定义）：用户明确钉住的资源，启动时**不会**被自动唤醒，只响应显式 `restore`。
- **被动使用检测**：即使你绕过 `agentpark run` 直接启动工具，适配器也会扫描会话转录/日志文件的修改时间来估计"最后使用"，策略不会误收正在使用的工具。

## 使用统计的口径（诚实说明）

当前版本统计的是 **Agent 级**使用（这个工具多久没用过），而不是资源级（某条 MCP 在会话内被调用过几次）。资源级精确统计需要往各工具的 hooks 体系里埋点，在 Roadmap 中；对"14 天不用则收纳"这个决策，Agent 级信号已经足够可靠。

## 安全设计

- **永不删除**：收纳 = 原样移动到仓库；唤醒 = 原样搬回。
- **改前必备份**：任何配置文件写入前先快照进 `backups/` 并登记索引。
- **原子写入**：临时文件 + rename，进程中断不会留下半截配置。
- **可撤销链**：`rollback` 恢复最近备份，且回滚动作本身也会先备份当前状态。
- **冲突保护**：收纳期间你重装了同名技能？唤醒时恢复到 `*.apark-restored` 旁路目录，绝不覆盖。
- **沙箱测试**：设置 `AGENTPARK_HOME` 环境变量可把全部读写重定向到隔离目录，`node tests/smoke.mjs` 在假 home 里跑通全流程，不碰真实配置。

## 与同类项目的差异

| 项目 | 定位 | 与 AgentPark 的区别 |
|---|---|---|
| add-mcp | 一条命令向 20+ Agent 写入 MCP 配置 | 只管"装进去"，不管生命周期 |
| Cross-Code Organizer | 跨工具查看/切换 MCP 等 | 偏 MCP 维度与手动切换，无使用频率策略 |
| 各类 config-sync 工具 | 让多个 Agent 的配置保持全量一致 | 思路是"全都有"，AgentPark 是"按需装配 + 自动收纳" |

AgentPark 的差异化：**按工具使用频率的生命周期管理——自动休眠/唤醒、启动时装配、使用统计**，并且同时覆盖技能与 MCP。

## 支持矩阵

| Agent | 技能 | MCP | 启动装配 | 最后使用检测（被动） |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills` | `~/.claude.json` 的 `mcpServers` | ✅ `claude` | `~/.claude/projects` 会话 mtime |
| ZCode | `~/.zcode/skills` | `~/.zcode/settings.json`（存在时） | ✅ `zcode` | `~/.zcode/cli/{rollout,log}` mtime |
| OpenAI Codex CLI | `~/.codex/skills` | `~/.codex/config.toml` 的 `[mcp_servers.*]` | ✅ `codex` | `~/.codex/sessions` mtime |
| Gemini CLI | `~/.gemini/skills` | `~/.gemini/settings.json` 的 `mcpServers` | ✅ `gemini` | `~/.gemini` 目录 mtime |
| Hermes Agent | `~/.hermes/skills` | `~/.hermes/config.yaml` 的 `mcp_servers:` | ✅ `hermes` | 配置/技能目录 mtime（弱信号） |
| DeepSeek DSH | `~/.dsh/skills` | 暂无（见注） | ✅ `dsh` | `~/.dsh/sessions` mtime |
| 共享目录 `.agents/skills` | ✅（遵循 Agent Skills 标准的工具可能共用） | — | — | — |

> **DSH 注**：未发现稳定的用户级 MCP 配置文件（其扩展疑似由桌面端配置管理器事务化管理），当前版本先支持技能维度，待配置入口稳定后补充 MCP 适配。

适配器极薄（见 `src/agents/`），接入新工具（Cursor、Cline、DSH 等）只需声明：配置目录、技能目录、MCP 读写方式、会话目录。欢迎 PR。

Codex 的 TOML 采用"文本块手术"而非整文件反序列化：只增删目标 `[mcp_servers.*]` 块，文件其余注释与格式原样保留。

## Roadmap

- [ ] 多工具重复安装去重：统一仓库 + 硬链接/junction，真正省磁盘
- [ ] 按项目目录的 profile：不同仓库启动时装配不同的 MCP/技能组合
- [ ] 资源级精确使用统计（基于各工具 hooks 埋点）
- [ ] Plugins 维度管理（各工具插件系统尚不统一，谨慎推进）
- [ ] TUI 与统计报表
- [ ] 英文文档

## FAQ

**会弄丢我的配置吗？** 收纳不删除任何东西；配置改动前有备份，`rollback` 一键撤销，收纳清单 `manifest.json` 记录了一切的原路径。

**对一个正在运行的会话执行收纳会怎样？** 该会话已加载的扩展不受影响（配置只在启动时读取），下次启动生效。建议在工具关闭时执行 `policy run`。

**为什么用 `agentpark run` 启动？** 它是"启动时装配"的入口：自动唤醒策略收纳项、记录使用事件，然后拉起真实工具。你仍然可以直接 `claude` 启动，只是该次使用只能靠被动检测在下次 `scan`/`policy run` 时补记。

**磁盘能省多少？** 当前版本收益主要在上下文与噪音，不在磁盘（资源只是移动）。磁盘收益来自 Roadmap 的去重存储（同一技能只存一份，多工具硬链接共享）。

## 参与贡献

零依赖、零构建：`node src/cli.js` 即源码即程序，`node tests/smoke.mjs` 即测试。适配新工具 = 新增一个 `src/agents/<name>.js`。Issue / PR 均欢迎。

## License

MIT
