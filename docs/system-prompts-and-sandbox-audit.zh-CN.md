# ModMind 外部代理权限与工作流清单

审计日期：2026-08-09

范围：本文件只描述 ModMind 项目自身对 Codex 和 Claude Code 的配置，不包含模型供应商或 CLI 自身可能附带的规则。

## 当前结论

快速制作模式和专业模式中的外部 Agent 使用各自原生的自动化模式。ModMind 保留少量完成证据门槛：工程变更需要实现、内容校验和托管构建；Minecraft 运行时测试是启动、注册、Mixin、世界生成、网络、Loader 兼容或玩法行为变更的推荐验证，也是用户明确要求时的目标，但不再是所有工程任务的硬性完成条件。审查 Agent 负责危险 MCP 操作放行和完成度反馈，不会因一次审查不通过就终止任务或自动回滚。

两种模式的区别只保留在产品体验上：

- 快速制作模式固定使用 Codex，自动准备运行时，并附加更易理解的自主工作流建议。
- 专业模式允许用户选择 Codex 或 Claude Code。
- 两种模式使用同一套原生 CLI 能力、ModMind MCP 集成和 Minecraft 工作流资料。

## CLI 权限

### Codex

托管启动传入：

```text
--dangerously-bypass-approvals-and-sandbox
```

### Claude Code

托管启动传入：

```text
--dangerously-skip-permissions
```

ModMind MCP 只是额外能力，外部 Agent 可以自由使用原生工具或 MCP 工具。

## ModMind MCP 的定位

MCP 工具全部是可选集成点：

- `modmind_project_info`：项目元数据
- `modmind_set_intent`：可选的界面状态标签
- `modmind_apply_edits`：可选的精确文本编辑
- `modmind_update_todo`：可选的界面进度列表
- `modmind_mapping_search` / `modmind_mapping_class`：版本映射与类检查
- `modmind_dependency_search` / `modmind_dependency_install`：Modrinth 依赖
- `modmind_validate_content`：资源校验
- `modmind_test_matrix`：托管测试矩阵
- `modmind_release_preflight`：发布准备度检查
- `modmind_build_project`：托管 Gradle 构建
- `modmind_test_minecraft` / `modmind_runtime_state`：Minecraft 测试与状态
- `modmind_blockbench_actions`：Blockbench 集成

以下旧规则已经移除：

- 第一个工具调用必须是 `modmind_set_intent`
- 信息任务不得编辑、构建或测试
- 工程任务必须创建 Todo
- Todo 全部完成前不得构建或测试
- Todo 不能删除、回退或重排
- 必须通过 MCP 编辑文件
- 外部代理结束时必须检测到文件修改
- 修改后必须由 ModMind 自动构建
- 运行时变更必须自动启动 Minecraft
- 构建或启动失败后必须无限递归修复
- 修改 Gradle Wrapper 或项目清单时由 ModMind自动回滚

## 工作流与 Skill

ModMind 会把 `resources/codex-skills` 同步到快速制作模式的 Codex Home，同时复制到当前项目的：

```text
.modmind/external-agents/skills
```

动态生成的 `agent-context.md` 会告诉 Codex 和 Claude Code 可以按需读取这些工作流。

当前包含：

- `minecraft-mod-development`：完整功能纵向实现
- `minecraft-build-repair`：构建、编译、Mixin 和运行时故障修复
- `minecraft-content-assets`：模型、纹理、数据和资源联动
- `minecraft-version-migration`：版本、映射和 Loader 迁移
- `headless-minecraft-testing`：无头 Minecraft 测试

这些 Skill 提供推荐步骤和领域知识，不负责限制 CLI 权限。

## 仍然存在的产品基础设施

以下不是外部代理权限限制，而是应用运行所需的协调机制：

- 同一窗口同时只托管一个 AI 任务，避免多个任务争用同一进度流和项目状态。
- 任务开始前创建项目快照，供用户手动恢复。
- MCP 的结构化工具仍校验自身参数；代理可以改用原生 CLI 工具。
- ModMind 托管构建仍检查是否产生有效 Mod JAR；代理也可以自行运行其他命令。
- 用户主动点击“停止”时，ModMind 会终止外部 CLI 进程树。
- Electron 渲染器和内嵌 Blockbench 继续使用 Electron 沙盒；这与外部 Codex/Claude Code 进程权限无关。

## 审查 Agent

每次写入、构建、测试、整合包、Blockbench 或图像 MCP 操作前，审查 Agent 会返回风险级别和是否放行。拒绝会作为工具错误反馈给主 Agent，主 Agent 必须换用更安全的方案并继续任务。主 Agent 报告完成后，审查 Agent 会核对上述完成证据，最多追加三轮反馈；任务快照只用于中断恢复和用户主动回滚。
