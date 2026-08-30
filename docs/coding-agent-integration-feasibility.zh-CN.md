# ModMind Coding Agent 接入可行性验证报告

版本：2026-08-13  
结论范围：本报告验证“外部 Coding Agent 通过本地 stdio MCP 接入 ModMind”的可行性，不判断任何供应商账号、内容政策、组织管理策略或商业再分发授权。

## 一、执行摘要

ModMind 当前已经具备一个清晰的本地接入契约：为每个项目动态生成 MCP 配置和 MCP Server，通过 stdin/stdout 提供 JSON-RPC 工具协议；MCP Server 再通过带随机 token 的 `127.0.0.1` 回环桥调用 ModMind 主进程能力。

按“能否直接消费这份本地 MCP 配置”划分：

- **已在 ModMind 代码中接入：2 个**：Codex CLI、Claude Code。
- **公开资料确认支持 MCP、具备独立客户端接入条件：至少 6 个**：Gemini CLI、OpenCode、Goose、Qwen Code，以及前述 Codex CLI、Claude Code。
- **公开资料确认支持 MCP、但主要运行在 IDE/扩展内：至少 8 个**：Cursor、Windsurf、Cline、Roo Code、Continue、VS Code GitHub Copilot、JetBrains AI Assistant、Trae。
- **本次未能确认完整官方 stdio 配置契约：至少 3 个**：通义灵码、腾讯云 CodeBuddy、百度 Comate。它们不应在没有 PoC 前标记为“可直接接入”。

因此，ModMind 的现实接入池为：**2 个已完成，4 个独立客户端可低成本适配，8 个 IDE 产品可通过插件/配置适配，3 个国内产品待验证**。

## 二、当前 ModMind 接入契约

代码证据：[`src/main/externalAgents.ts`](../src/main/externalAgents.ts#L142)

| 契约项 | 当前实现 | 对第三方 Agent 的要求 |
|---|---|---|
| MCP 传输 | 本地 stdio Server；Server 内部访问 `http://127.0.0.1:<port>/tool` | 支持本地 stdio MCP Server |
| 配置 | 动态生成 `mcp-config.json`，包含 command、args、可选 env | 能读取 JSON MCP 配置，或提供等价配置入口 |
| 协议 | MCP JSON-RPC，支持 `initialize`、`tools/list`、`tools/call` | 支持标准 MCP tools |
| 认证 | 回环 HTTP 请求携带随机 `x-modmind-token` | Agent 无需理解 token；只需启动 ModMind 生成的 Server |
| 工具 | 项目信息、编辑、映射、依赖、构建、测试、Blockbench、图像等 | 能发现并调用 MCP tools |
| 项目范围 | Agent 以项目目录为工作目录，并获得项目上下文文件 | 支持 cwd、`-C`、`--add-dir` 或等价参数 |
| 输出 | Codex JSON 事件、Claude stream-json 事件 | 需要输出解析适配器，或至少能接收退出码/文本 |
| 会话 | ModMind 保存 Codex/Claude 会话 ID并尝试恢复历史 | 可选；没有 resume API 也可做无状态适配 |

当前 Codex/Claude 启动参数位于 [`src/main/externalAgents.ts`](../src/main/externalAgents.ts#L18)：

```text
Codex: --dangerously-bypass-approvals-and-sandbox
Claude Code: --dangerously-skip-permissions
```

这些参数只影响本地 CLI 的审批/沙箱行为，不能解除供应商账号限制、组织策略、操作系统 ACL 或模型服务端政策。

## 三、工具兼容性矩阵

判定含义：

- **A：已接入**：ModMind 已有启动、MCP、输出和会话适配。
- **B：低成本适配**：公开资料确认有独立客户端 MCP 配置，预计只需新增启动器、配置格式和输出解析。
- **C：IDE 适配**：MCP 能力明确，但需要 IDE 插件、工作区配置或用户手动导入，不能直接复用当前 CLI 托管器。
- **D：待 PoC**：有 MCP 相关迹象，但缺少稳定可核验的官方 stdio 配置或执行入口。
- **E：不建议**：未确认原生 MCP，需额外桥接或协议重写。

| Agent | 地区 | 运行形态 | MCP 证据 | 等级 | 预计工作量 | 主要阻塞 |
|---|---|---|---|---|---|---|
| Codex CLI | 国外 | CLI | 当前代码和本机 CLI 参数 | A | 已完成 | 供应商授权/分发条款 |
| Claude Code | 国外 | CLI | 当前代码和 CLI 参数 | A | 已完成 | Anthropic 授权/分发条款 |
| Gemini CLI | 国外 | CLI | 官方 MCP Server 文档 | B | 低 | 配置格式、JSON 输出和 resume 行为 |
| OpenCode | 国外 | CLI/TUI | 官方 MCP Server 文档 | B | 低 | 非交互执行和事件解析 |
| Goose | 国外 | CLI/桌面 | 官方配置/MCP 资料需按版本核对 | B | 低-中 | 稳定 CLI 参数、会话模型 |
| Qwen Code | 国内 | CLI | 官方 Qwen Code MCP 文档 | B | 低 | Windows 分发、输出格式、账号授权 |
| Cursor | 国外 | IDE | 官方 MCP 配置文档 | C | 中 | 需要 `.cursor/mcp.json` 或扩展集成 |
| Windsurf | 国外 | IDE | 官方 Cascade MCP 资料 | C | 中 | IDE 生命周期和用户配置路径 |
| Cline | 国外 | VS Code 扩展 | 官方 MCP Server 资料 | C | 中 | 不能由 ModMind 直接托管扩展进程 |
| Roo Code | 国外 | VS Code 扩展 | 官方 MCP 使用文档 | C | 中 | 工作区配置、扩展授权 |
| Continue | 国外 | IDE/扩展 | 官方 MCP 深度文档 | C | 中 | YAML/JSON 配置与模型设置 |
| GitHub Copilot in VS Code | 国外 | IDE | VS Code 官方 MCP Server 文档 | C | 中 | 需要 VS Code 工作区或扩展 API |
| JetBrains AI Assistant | 国外 | IDE | MCP 能力需按当前 IDE 版本核对 | C | 中-高 | 插件安装、JetBrains 配置和授权 |
| Trae | 国内 | IDE | 官方 Trae MCP 页面 | C | 中 | 配置导入方式、Windows 路径和权限提示 |
| 通义灵码 | 国内 | IDE/插件 | 本次未确认完整 stdio 契约 | D | 中-高 | 需要官方配置样例和非交互调用验证 |
| 腾讯云 CodeBuddy | 国内 | IDE/云端 | 本次未确认完整 MCP tools 契约 | D | 中-高 | 需要确认本地 command/args 支持 |
| 百度 Comate | 国内 | IDE/插件 | 本次未找到稳定官方 MCP 配置页 | D | 中-高 | 需要厂商文档或厂商 PoC |
| Aider | 国外 | CLI | 未在本次验证中确认原生 MCP | E | 高 | 需要独立 MCP-to-Aider 桥接 |
| GitHub Copilot CLI | 国外 | CLI | 与 VS Code Copilot MCP 不是同一产品面 | D | 中 | 需要单独确认 CLI MCP 配置和输出协议 |

## 四、已验证与未验证边界

### 已验证

1. ModMind 的 MCP Server 可由外部进程通过 stdio 启动。
2. MCP Server 能返回工具列表并转发工具调用。
3. Codex 和 Claude Code 在 ModMind 中有独立的启动、输出解析、会话持久化路径。
4. Codex 的全权限参数和 Claude Code 的等效无确认参数已写入统一参数函数，避免“打开终端”和“托管任务”使用不同权限模式。
5. 工具桥只监听回环地址，并使用随机 token；这属于桥接安全基础设施，不是 Agent 审批限制。

### 尚未验证

1. 每个候选工具的当前版本是否支持 ModMind 使用的 JSON-RPC MCP 版本。
2. 每个工具是否允许从分发程序启动子进程，以及其商业许可是否允许这种集成。
3. 每个工具的非交互输出、退出码、会话恢复和取消行为。
4. 国内工具的账号登录、网络可达性、企业策略和数据出境要求。
5. IDE 产品能否在不要求用户手动编辑配置的情况下由 ModMind 自动注册 MCP。

## 五、适配成本估算

以现有 `ExternalAgentKind` 适配器为基础：

| 适配类型 | 典型对象 | 预计新增内容 |
|---|---|---|
| CLI 低成本适配 | Gemini CLI、OpenCode、Qwen Code | 一个启动参数表、MCP 配置生成器、输出解析器、检测/安装入口、基础测试 |
| CLI 中成本适配 | Goose | 额外处理配置层级、会话和非交互模式 |
| IDE 适配 | Cursor、Windsurf、Cline、Roo、Continue、VS Code、Trae | 工作区配置写入、插件检测、打开 IDE、配置回滚、用户授权说明 |
| 待 PoC | 通义灵码、CodeBuddy、Comate | 厂商确认、最小 MCP Server、权限和网络测试 |

建议不要把所有 Agent 塞进当前 `ExternalAgentKind = 'codex' | 'claude'`。应抽象为：

```text
AgentProvider
  id
  kind: cli | ide | hosted
  executable / launch target
  mcpConfigStrategy
  permissionArgs
  outputParser
  sessionStrategy
  cancellationStrategy
```

这样可以保留现有 Codex/Claude 行为，同时以插件式方式增加其他工具。

## 六、分发风险与验收门槛

### 必须在发行前确认

- Codex、Claude Code 和其他 CLI 的再分发、商标、无人值守执行和商业使用条款。
- 是否要求用户自行登录；ModMind 不应代替用户创建第三方账号或隐式共享凭据。
- 安装包是否捆绑 CLI，还是只检测用户已有 CLI。
- Windows、macOS、Linux 的进程启动和脚本策略差异。
- 外部 Agent 具备全权限时，产品界面、隐私政策和授权页必须明确说明其可读写项目目录并执行本机命令。

### 最小 PoC 验收标准

每个新 Agent 至少通过以下测试才可标记为“可接入”：

1. 能从干净项目目录启动并完成 MCP `initialize`。
2. `tools/list` 能看到 ModMind 工具。
3. 能调用 `modmind_project_info` 和一个写入工具。
4. 能从项目目录读取 `agent-context.md`。
5. 进程异常退出时 ModMind 能关闭桥接并清理临时 token。
6. 用户点击停止时能终止整个进程树。
7. 没有凭据时，错误能明确显示为授权/配置问题，而不是静默重试。

## 七、最终结论

ModMind 的 MCP 接入方案具备良好可行性。当前最实际的扩展顺序是：

1. **Gemini CLI、OpenCode、Qwen Code**：优先做 CLI 适配，投入小且能复用当前托管架构。
2. **Goose**：作为第二批 CLI 适配，重点验证非交互和会话行为。
3. **VS Code 系列与 Cursor/Windsurf/Trae**：单独做 IDE 集成，不与 CLI 适配器混写。
4. **通义灵码、CodeBuddy、Comate**：先向厂商索取 MCP stdio 配置样例，再决定是否投入。

按当前证据，不能严谨地声称“所有国内外 Coding Agent 都能直接接入”；可以严谨地声称：**至少 6 个独立客户端具备可行接入路径，至少 8 个 IDE 产品具备 MCP 集成路径，2 个已在 ModMind 完成现有适配。**

## 参考资料

- [Gemini CLI MCP Servers](https://geminicli.com/docs/tools/mcp-server/)
- [OpenCode MCP Servers](https://opencode.ai/docs/mcp-servers/)
- [Qwen Code MCP](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/)
- [Roo Code MCP](https://docs.roocode.com/features/mcp/using-mcp-in-roo)
- [Continue MCP](https://docs.continue.dev/customize/deep-dives/mcp)
- [VS Code Copilot MCP Servers](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)
- [Trae MCP](https://docs.trae.ai/ide/mcp)
- [OpenAI Codex MCP](https://developers.openai.com/codex/mcp)（本次抓取受 403 限制，未将页面内容作为唯一证据）
- [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)（本次抓取超时，未将页面内容作为唯一证据）
# 状态说明

本文是早期可行性调研，不再代表产品实现决策。工作台与灵感台现在只支持 ModMind 额度 Codex、本机 Codex 和本机 Claude Code；Gemini CLI、OpenCode、Qwen Code、Goose 的适配已取消。当前实现规范见 `workbench-inspiration-agent-architecture.zh-CN.md`。
