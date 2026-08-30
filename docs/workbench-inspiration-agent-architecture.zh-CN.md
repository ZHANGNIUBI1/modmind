# 工作台与灵感台 Agent 架构开发文档

## 目标

工作台和灵感台必须支持多个项目同时运行。项目 A 的 Agent 运行时可以切换到项目 B 并启动另一个 Agent；切回 A 后，A 的草稿、输出、Todo、原生 CLI 会话、恢复检查点、运行状态和取消能力都必须保持不变。

本次保留自动重试上限 `30` 次。修复目标是保证重试不会丢失上下文，而不是降低重试次数。

## Agent 范围

运行时只保留三种入口：ModMind 额度（托管 Codex）、本机 Codex、本机 Claude Code。Gemini、Qwen、OpenCode、Goose 的托管适配、设置入口、检测/安装、MCP 项目写入、恢复和 IPC 白名单全部删除。

`.modtool` 是远古项目格式，不再作为运行时项目类型支持。导入项目时如果发现 `.modtool`，执行一次兼容转换，将项目数据目录迁移为 `.modmind` 并生成迁移报告；转换完成后所有运行时逻辑只处理 `.modmind`。

## 项目与运行身份

每个 AI 运行都有独立的 `runId`。事件、取消、Bridge、MCP 配置、session 回调和恢复写入都以 `runId` 为边界。原生 CLI session ID 与渲染层 UI session ID 分开保存。

主进程使用 `projectPath -> runs` 索引和 `AsyncLocalStorage<ProjectInfo>`。同一项目同时最多一个 workspace 任务（串行；多个工作台对话是多条独立上下文线程，任务仍排队执行），可以同时运行多个 inspiration 任务；不同项目的 Agent 进程可以并行运行。所有工具都必须从异步项目上下文或显式项目路径取得项目，不能读取前台全局项目。

ModMind 额度使用的 Codex 二进制缓存可以全局复用，但 `CODEX_HOME`、模型配置、API 环境和原生 session 必须按“项目 + session scope”隔离。任何任务都不得通过进程级 prepared 状态读取或清理另一个任务的临时凭证。并发准备同一个 scope 时只复用准备 Promise，准备结果由各 run 自己持有。由于首次下载、校验和替换共享 runtime 目录会修改同一组文件，所有 scope 的共享 runtime 准备阶段必须经过进程级队列；准备成功或失败都必须在 `finally` 中释放队列。该队列不得覆盖后续 CLI 运行阶段，不同项目准备完成后仍然并行工作。

## Session 与重试

外层运行状态跨 attempt 保存 `nativeSessionId`、transcript、失败原因和串行 session 写入队列。Codex 从 `thread.started.thread_id`，Claude 从 `system.init.session_id` 更新该状态。

- 有原生 session 时，重试必须使用 Codex `exec resume` 或 Claude `--resume`。
- 没有原生 session 时，重试必须发送完整原始请求、项目上下文和有限失败摘要，不能向新会话发送裸“继续”。
- session 文件失效时走完整上下文 fallback。
- 失败、取消、超时前等待最后一次 checkpoint 和 session 写入。
- `EXTERNAL_AGENT_MAX_ATTEMPTS` 保持 `30`。
- 认证、权限、策略和无效配置错误不因解析错误而被当成成功。

工作台每个项目支持多个对话：每个对话有独立的 `conversationId` 与 session scope（`workspace/<conversationId>`），session 指针、时间线（`.modmind/workbench-timeline-<id>.json`）和 quota `CODEX_HOME` 均按对话隔离；旧版单线程项目在首次加载时迁移为沿用 `workspace` 作用域的第一个对话。正常追问继续所属对话的会话，不再依赖“prompt 完全重复”才能恢复。灵感台按 `conversationId` 独立维护 session scope。

CLI 在 stream-json 输出中上报的 token 用量（Codex `token_count`、Claude `result.usage`）由主进程捕获并随最终 `ai:output` 事件透传，渲染层据此在工作台输入框显示上下文占用百分比（输入 token ÷ 模型上下文窗口）。

## Bridge 与只读边界

Bridge 使用项目内的 run 目录：

```text
.modmind/external-agents/runs/<runId>/
  bridge.json
  mcp-config.json
  modmind-mcp-server.mjs
  agent-context.md
```

每个 run 独立端口、token、MCP 配置和生命周期。清理只能删除自己的 run 目录。

Codex inspiration 使用 read-only sandbox。Claude inspiration 使用进程级只读参数，禁止 Bash、Write、Edit，并传入 `--strict-mcp-config`，只允许本次 run 的 ModMind MCP。Bridge 的只读拒绝仍作为第二层防线。

Claude 的工作流约束通过真正的 system prompt 参数传递。Claude 本机模式沿用用户本机配置，不写全局 `~/.claude/settings.json`；中转配置只注入当前子进程环境，不持久化明文 API Key。

## 渲染层状态

渲染层使用 `Map<projectPath, ProjectAiState>` 保存 prompt、附件、planning、native session、plan、Todo、输出、时间线、事件、恢复信息和运行 token。编辑器内容、dirty 状态和选中文件也按项目保存。

- 后台项目事件按 `projectPath + runId` 路由，不能因当前前台项目不同而丢弃。
- 旧任务完成只能更新所属项目，不能清空当前项目草稿或输出。
- 取消按 `runId`，不使用单个全局 `workspaceSessionRef`。
- 恢复任务的 UI session 与原生 session 不一致时，工作台取消按项目回退到该项目唯一的 workspace run；灵感台取消仍必须精确匹配 conversation session。
- 切换项目只切换前台状态，不取消后台 Agent。
- 编辑器保存必须带所属项目，禁止把 A 的未保存文件写进 B 的同名路径。
- Blockbench 操作必须使用异步项目上下文，禁止使用全局 `currentProject`。

Minecraft 和 Blockbench 是全局串行资源，不承诺跨项目并行实例；但状态和事件必须携带所属 `projectPath`。切换项目后，后台项目的运行事件只能写回该项目缓存，不能显示为前台项目的运行状态。

## 项目生命周期与恢复

切换项目允许后台任务继续。重命名、删除、迁移、恢复快照等会改变项目路径或内容的操作，在存在运行中 AI 时拒绝或先完成明确暂停流程。`active-ai-task.json` 和 session 文件按项目、taskId、runId 原子写入，临时文件使用随机后缀并串行化写入。

灵感台不创建完整编码快照、不计算全量修改 hash、不写 workspace 恢复文件；它只使用只读工具和独立对话状态。

## 删除与导入兼容验收

删除旧 Agent 后，代码、设置、检测、安装、IPC、迁移和测试中不应再出现 Gemini、Qwen、OpenCode、Goose 的运行时入口。旧设置只允许被安全忽略或迁移，不得重新暴露入口。

导入 `.modtool` 项目必须完成数据目录转换并生成报告；转换后的项目只能走 `.modmind` 路径。新建项目、打开 `.modmind` 项目和普通运行流程不应再依赖 `.modtool`。

转换必须可重入：若上次退出发生在新清单写入后、旧清单删除前，下一次打开应校验两份清单一致并完成收尾。若新旧清单或两个数据目录冲突，必须在修改磁盘前拒绝转换。

## 验收测试

必须覆盖 Codex/Claude session 捕获与重试、Claude `result.is_error`、无 session 完整上下文 fallback、同项目并行 Bridge 隔离、Claude inspiration 原生只读、A/B 项目事件与取消隔离、编辑器跨项目保存、Blockbench 项目上下文、项目生命周期守卫、原子 checkpoint、进程重启恢复和 `.modtool` 导入转换。
