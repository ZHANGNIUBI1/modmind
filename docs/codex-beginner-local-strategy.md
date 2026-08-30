# 快速制作模式本地智能开发引擎策略

> 当前行为以 `docs/system-prompts-and-sandbox-audit.zh-CN.md` 和运行代码为准：外部 CLI 使用原生自动化模式，审查 Agent 对危险 MCP 操作和任务完成度提供反馈。

**版本：** 1.0  
**日期：** 2026-07-31  
**目标：** 在快速制作模式中让用户只看到“智能开发引擎”，由 ModMind 自动准备本地 Codex 运行环境、项目工具桥和会话恢复能力。

## 先说边界

“无感”应解释为：

- 不要求用户手动安装 Node、CLI、MCP、Gradle 或编辑配置文件；
- 不要求用户理解 Codex、MCP、命令行和项目目录结构；
- 主界面使用 ModMind 的产品语言，而不是外部 CLI 的技术名称；
- 准备过程由 ModMind 统一管理，失败时给出可执行的修复动作。

“无感”不能解释为：

- 未经授权静默安装程序；
- 未经授权读取或上传项目文件；
- 未经授权使用用户的账号、API Key 或付费额度；
- 隐藏网络访问、文件访问、构建脚本执行和高风险修改；
- 通过共享账号或未确认的上游授权规避使用条款。

产品可以不在小白主界面显示“Codex”品牌，但隐私政策、服务条款、授权页和高级诊断中必须说明本地 Agent 的运行、数据流向和权限范围。否则会形成用户知情同意和合作条款风险。

## 推荐产品模型

### 快速制作模式看到的名称

统一称为：

- 智能开发引擎
- 本地项目助手
- 项目工具服务

不在小白主流程显示：

- Codex CLI
- MCP
- Node
- Shell
- API Key
- Agent session

专业模式仍可以显示实际后端、版本、日志和诊断信息。

### 本地执行但不把实现细节塞给用户

~~~
小白界面
  -> ModMind 主进程
  -> 应用管理的本地 Agent Runtime
  -> ModMind MCP 工具桥
  -> 项目目录、构建和 Minecraft 测试
~~~

Codex 只是 Runtime 的一种实现。代码层不要把快速制作模式永久绑定到一个 CLI 名称，使用：

~~~
beginnerExecutionProfile: local-agent
agentRuntimeProvider: codex
~~~

这样未来如果不能分发或托管 Codex，可以替换为 ModMind Agent Runtime，用户界面和任务协议不需要重做。

## 一次性准备流程

### 状态机

~~~
uninitialized
  -> consent_required
  -> checking
  -> runtime_ready
  -> account_required
  -> authenticated
  -> project_bridge_ready
  -> ready
  -> degraded / failed
~~~

### 用户可见文案

| 内部状态 | 快速制作模式显示 |
| --- | --- |
| consent_required | 准备智能开发引擎 |
| checking | 正在检查本地开发环境 |
| downloading | 正在准备项目工具 |
| verifying | 正在验证组件完整性 |
| account_required | 需要连接智能开发服务 |
| authenticated | 正在准备项目助手 |
| project_bridge_ready | 项目工具已准备好 |
| ready | 可以开始制作 |
| degraded | 部分功能不可用 |
| failed | 准备失败，查看修复建议 |

### 首次授权卡片

用户第一次启用快速制作模式时显示一次，不要每次打断：

- 允许 ModMind 访问当前项目目录；
- 允许 ModMind 运行项目构建和 Minecraft 测试；
- 按需联网下载组件和调用 AI 服务；
- 写入项目的 .modmind 工具目录；
- 高风险操作仍需要单独确认。

按钮：

~~~
继续准备
取消
查看权限说明
~~~

授权结果写入本机安全存储；用户可以在设置中撤销并删除本地 Agent Runtime。

## Runtime 安装策略

### 不使用全局安装

当前 src/main/externalAgents.ts 的安装逻辑会尝试：

- WinGet 静默安装；
- npm 全局安装；
- 从 PATH 搜索 CLI。

这适合专业用户诊断，不适合快速制作模式。快速制作模式改为：

~~~
%LOCALAPPDATA%\\ModMind\\agent-runtime\\codex\\<version>\\
~~~

或对应平台的应用数据目录，并满足：

- 固定版本清单；
- HTTPS 下载；
- SHA-256 校验；
- 可验证的发布签名；
- 原子解压和目录切换；
- 旧版本保留一个可回滚副本；
- 不修改 PATH；
- 不写入用户全局 npm；
- 不覆盖用户已有 Codex；
- 卸载时可以完整删除。

### 分发前必须确认

在把 Codex 二进制或 npm 包放进安装器前，必须由合作方确认：

- 是否允许再分发；
- 是否允许商业产品内嵌；
- 是否允许无人值守/服务化执行；
- 是否允许多用户或按额度售卖；
- 是否可以使用 Codex 商标或在条款中称为 Codex；
- 用户是否必须拥有自己的账号或授权。

这些事项不能靠代码推断。若不能获得明确授权，采用：

1. 用户自行安装并授权的本地连接模式；或
2. ModMind 服务端 Agent Runtime；或
3. 使用允许再分发的自有/开源 Agent Runtime。

## 认证策略

### 不能“自动生成”用户的 Codex 账号

本地 Runtime 需要模型服务授权。ModMind 不能把一个共享 API Key 写入每个用户的机器，也不能在用户不知情的情况下复用企业账号。

建议分三种配置：

**用户自有授权：**

- 第一次准备时打开一次授权流程；
- Access Token 不进入渲染层和项目目录；
- Refresh Token/API Key 存系统凭据存储；
- 退出账号时撤销本地会话并清除缓存。

**ModMind 托管额度：**

- 用户登录 ModMind 账号；
- 由 ModMind 服务端调用受控的 Agent Worker；
- Electron 只连接任务 WebSocket；
- 不在本地启动 Codex。

**无授权状态：**

- 不启动本地 Agent；
- 显示“连接智能开发服务”；
- 不自动切换到另一个账号或共享 Key。

## 配置生成

每个项目生成隔离的工具桥配置：

~~~
<project>/.modmind/external-agents/
  agent-context.md
  bridge.json
  modmind-mcp-server.mjs
  session.json
~~~

配置原则：

- MCP 服务只绑定 127.0.0.1；
- 每次启动生成随机短期 token；
- token 不写日志、不进入 AI 提示词；
- 项目路径使用规范化绝对路径并做 allowlist 校验；
- 工具桥进程退出时立即失效；
- 配置文件权限限制为当前用户；
- 不把 API Key、Refresh Token 或平台证书写入项目。

Codex 配置使用应用管理的 profile，不写入用户全局配置，至少包括：

- ModMind MCP command/args；
- 项目根目录；
- 原生项目范围自动模式；
- 任务快照仅用于中断任务的恢复和用户主动回滚；审查拒绝会反馈给主 Agent 继续修正；
- 日志脱敏规则。

## 权限和高风险操作

快速制作模式不显示人工审批流程；审查 Agent 对受管 MCP 操作执行智能放行，原生 CLI 权限模式仍由外部 Agent 自身负责。

### 自动允许

- 读取当前项目文件；
- 读取项目元数据；
- 查询 Mappings 和依赖信息；
- 生成 Todo；
- 创建项目快照；
- 读取构建日志；
- 在项目根目录内写入经过校验的文件修改。

### 服务商安全审查

模型服务商的安全审查保持启用。ModMind 审查 Agent 只提供操作放行和完成度反馈；拒绝不会直接结束主 Agent 任务。

## 快速制作模式任务流程

~~~
用户描述需求
  -> 检查本地 Agent Runtime
  -> 检查账号和额度
  -> 创建安全快照
  -> 启动本地 Agent + MCP 桥
  -> Agent 读取项目并发布 Todo
  -> 构建和 Minecraft 测试
  -> 服务端/本地账本结算
  -> 展示结果和可回滚入口
~~~

失败时不要显示 CLI 堆栈作为主信息，转换为：

- 本地组件准备失败；
- 账号授权已过期；
- 项目工具连接失败；
- 构建脚本检查失败或无法执行；
- 构建没有通过；
- 本次修改已保存，可以恢复。

“查看技术详情”才展示 Runtime 名称、版本、退出码和诊断日志。

## 现有代码的改造边界

### shared 类型

新增：

~~~
LocalAgentState
LocalAgentProvider
LocalAgentConsent
LocalAgentCapability
LocalAgentDiagnostic
~~~

将用户界面模式与 AI 后端分开，不要用 codingBackend === 'codex' 作为快速制作模式唯一判断。

### main

新增 LocalAgentRuntimeService，负责：

- runtime manifest；
- 下载、校验、安装、回滚；
- 版本检测；
- 本地授权状态；
- profile 生成；
- MCP bridge 生命周期；
- 进程退出和资源回收；
- 脱敏诊断。

保留 externalAgents.ts 给专业模式使用，或者逐步把它改成 Runtime Service 的底层适配器。

### preload

暴露抽象 API：

~~~
beginnerAgent.status()
beginnerAgent.prepare()
beginnerAgent.authorize()
beginnerAgent.reset()
beginnerAgent.diagnostics()
beginnerAgent.onState()
~~~

不要把 installCodex()、runCodexCli() 直接暴露给渲染层。

### renderer

快速制作模式只显示抽象状态和安全确认。专业模式显示：

- 实际 Runtime；
- 版本；
- MCP 连接；
- 会话恢复；
- 诊断日志；
- 重新安装/回滚。

## 失败和回滚策略

- 下载失败：重试一次，再提供“稍后重试”；
- 校验失败：删除临时目录，禁止启动；
- 进程崩溃：保留任务快照，提示可恢复；
- 授权失效：暂停任务，不继续消耗额度；
- MCP 桥无响应：停止 Agent，保留事件序号；
- 更新失败：回滚到上一版本；
- 用户取消：杀掉 Agent、MCP 和子进程，关闭临时 token；
- 应用退出：持久化任务状态，禁止留下无限运行的后台进程。

## 关键风险清单

### 授权和分发风险

未经确认就把 Codex CLI 内嵌进商业安装包，可能产生再分发、商标、商业调用和账号授权问题。必须保留平台条款核验记录。

### 用户知情风险

如果用户以为代码完全在本地处理，但实际发送给第三方模型，属于重大产品信息。主界面可以隐藏技术品牌，但隐私政策和授权页必须准确说明：

- 哪些文件会被读取；
- 哪些内容会发送给模型服务；
- 数据保存多久；
- 是否用于训练；
- 如何停止和删除。

### 安全风险

- 把 API Key 写入项目或日志；
- MCP localhost token 泄露；
- Agent 越过项目根目录；
- --ask-for-approval never 与宽松 Shell 权限组合；
- 静默下载未经校验的可执行文件；
- 通过 CLI 自由 Shell 绕过 ModMind 权限系统。

### 运营风险

- Codex 版本升级导致参数变化；
- 用户已有 CLI 与应用 Runtime 冲突；
- 服务商不可用；
- 任务消耗失控；
- Windows 杀进程失败导致后台进程残留；
- 用户在多台设备间无法恢复本地会话。

## 验收标准

在一台没有 Node、Gradle、Codex CLI 的干净 Windows 机器上：

- 用户只看到“准备智能开发引擎”；
- 一次授权后可以完成准备；
- 不修改 PATH 和全局 npm；
- Runtime 包下载可验证、可回滚；
- 用户没有输入 API Key 时不会误用共享凭据；
- 快速制作模式不出现 Codex/MCP/CLI 字样；
- 外部 Agent 使用原生权限执行，用户可通过快照手动恢复；
- 关闭应用后没有残留 Agent 或 MCP 进程；
- 所有任务可以从快照和事件序号恢复；
- 退出账号后本地凭据和短期 token 被清理；
- 专业模式能查看真实 Runtime 版本和诊断信息。

## 实施顺序

1. 先完成 Codex CLI 再分发、商业使用和无人值守执行的条款核验。
2. 把现有全局 WinGet/npm 安装改为应用管理、签名校验和版本回滚。
3. 增加本地 Agent 状态机、用户授权和账号授权边界。
4. 使用 CLI 原生自动模式，并由审查 Agent 持续检查受管操作和任务完成度。
5. 增加快速制作模式抽象状态和“技术详情”入口。
6. 在干净系统、断网、断电、杀进程、权限拒绝和更新失败场景下测试。
7. 通过隐私、条款和合作方审核后再进入公测。

## 推荐决策

采用“产品界面无 Codex 品牌、实现层可插拔、授权与数据流透明、首次启用一次确认”的方案。

不要采用“静默安装、静默登录、静默读取项目、静默上传代码、静默执行任意 Shell”的方案。

第一版如果无法确认 Codex 的商业再分发和无人值守授权，优先上线 ModMind 自有 Agent Runtime 或服务端 Hosted Agent；本地 Codex 只作为用户自有授权的专业/兼容路径。
