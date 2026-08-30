# 整合包双向版本迁移开发文档

状态：实施中。第一阶段已经落地原目录事务迁移、备份/直接模式、撤销与历史、`defer` 不完美迁移、基础源 JAR 档案、无限嵌套路径防护，以及目标/扫描/执行/历史/撤销 MCP 工具。后续继续补充功能级平替判断、内容引用图、MC百科验证码协作、自动源码移植和完整运行验证闭环。

当前已完成：

- 目标版本真实扫描、红黄绿橙灰状态、Modrinth/CurseForge 与 MC百科别名回查。
- 原项目目录外暂存生成，随后精确提交回原路径；失败时自动恢复。
- `备份并迁移`、`直接迁移`、持久迁移历史和撤销前自动现场。
- 红色、灰色或未作取舍的 Mod 可作为 `defer` 生成 `incomplete` 项目，不再等同删除。
- 每个源 JAR 记录文件名、大小、SHA-1/SHA-256/SHA-512、Loader、类数量、主要包名、依赖和平台证据。
- 页面当前已有的所有取舍都可通过 `modmind_modpack_migration_apply` 的结构化 decisions 自动执行；工作台 Agent 缺省使用 `backup`。
- 普通项目迁移和整合包迁移同时拒绝源/目标目录重叠，底层复制函数也有相同防线。

尚未完成：

- AI 根据整合包实际功能引用自动评价平替，而非仅消费平台候选。
- 配置、脚本、任务、配方、资源和存档的跨 Mod 引用索引与自动修复。
- MC百科验证码在工作台中的挂起/恢复协作流程。
- 公开源码自动移植、闭源干净重做和构建/客户端/服务端/进服循环验证。

## 目标

ModMind 要支持 Java 整合包在 Minecraft 版本和 Loader 之间向上迁移、向下迁移及跨 Loader 迁移。迁移不是简单替换版本号，而是一项可以持续数轮的工程工作：先得到一个有完整证据和待办的不完美目标项目，再由人或工作台 Agent 继续选择平替、迁移源码、重做闭源功能、修复配置和执行运行验证。

最终产品必须同时满足以下目标：

- Fabric、Quilt、Forge 和 NeoForge 整合包可以选择受支持的任意目标 Minecraft 版本。
- 点击目标版本后扫描整包，显示真实进度和逐项兼容结论。
- 自动识别同项目目标文件、候选平替、可迁移源码、缺失项目和未知本地 JAR。
- 配置、脚本、任务、配方、数据包、资源包、界面、客户端预设、服务端配置和世界内容都进入迁移评估。
- 即使全部 Mod 都是红色或灰色，也能生成明确标记为“不完整”的迁移项目。
- 迁移在原项目目录中事务执行，不再要求生成长期存在的新项目目录。
- 人工入口提供“备份并迁移”和“直接迁移”，备份模式支持“撤销迁移”。
- 工作台 Agent 默认使用备份模式；备份完成后可以自动选择平替、生成草稿、修复内容、创建兼容模块并运行测试，不要求逐项人工批准。
- 版本迁移页面是纯人工操作页面，不嵌入 AI 对话。所有 AI 操作只从工作台发起。
- 版本迁移页面中人能执行的所有业务操作，都必须通过 MCP 暴露给工作台 Agent，并调用同一套主进程服务。

## 产品边界

### 人工页面与 AI 入口

侧边栏“版本迁移”页面只承担人工扫描、查看、取舍、执行、撤销和查看历史。页面不放“AI 自动迁移”按钮、不嵌聊天框，也不直接启动 Agent。

工作台是唯一 AI 入口。用户在工作台提出“把这个整合包迁移到 NeoForge 1.21.1”后，Agent 通过 ModMind MCP 完成与人工页面相同的操作。Agent 不模拟点击 UI；UI 和 MCP 都调用统一的迁移命令层。

必须维持以下结构：

```text
人工版本迁移页面 ─┐
                  ├─> ModpackMigrationCommandService ─> 迁移事务、记录和事件
工作台 Agent/MCP ─┘
```

不允许出现以下分叉：

- 页面能选择某种取舍，但 MCP 没有等价操作。
- MCP 可以跳过路径、版本或事务校验，而页面不可以。
- Agent 用原生文件工具直接替换 `mods`、清单或迁移记录来绕过迁移服务。
- 人工页面和 Agent 分别维护一份互不兼容的迁移方案。

### 撤销与反向迁移

“撤销迁移”和“反向迁移”不是同一个功能：

- 撤销迁移精确恢复迁移前备份，不尝试把迁移后的新改动合并回旧版本。
- 反向迁移把当前项目作为新来源，再执行一次目标指向旧版本的迁移，尽量保留迁移后的新改动。

第一阶段实现可靠撤销。撤销前必须自动保存“撤销前现场”，因此用户迁移后继续做的改动不会永久丢失。后续可以基于迁移前、迁移完成基线和撤销前现场实现三方差异分析及 AI 反向迁移。

## 版本选择与扫描体验

### 目标版本矩阵

页面顶部按 Loader 提供 Fabric、Quilt、Forge、NeoForge 分段控件，下方显示迁移工具接受的 Minecraft 版本。每个版本同时显示支持级别：

- 稳定：模板、Java、Loader 与基础测试链已验证。
- 实验：能够生成，但 Loader、依赖或测试覆盖不完整。
- 当前：不可再次选择。
- 不支持：不显示或明确禁用并说明原因。

点击一个目标版本立即开始扫描，不修改项目。扫描完成前不允许执行迁移。

### 真实进度

进度必须来自主进程真实事件，而不是前端定时器。至少包含：

1. `inventory`：读取整合包清单、锁文件、模块和魔改内容。
2. `jar-inspection`：读取 JAR 描述文件、哈希和结构摘要。
3. `identity`：锁文件、Modrinth/CurseForge 哈希和源版本身份反查。
4. `mcmod-discovery`：MC百科名称、中文名、英文名和别名辅助发现。
5. `target-resolution`：查询目标版本、目标 Loader、依赖和候选平替。
6. `content`：分析配置、脚本、任务、资源和世界内容。
7. `complete`：冻结评估结果和摘要哈希。

进度事件需要包含阶段、已完成项、总项数、当前 Mod 名称和可读消息。单个平台失败不得让整次扫描无提示地停住；失败要进入对应 Mod 的证据和全局诊断。

## 状态模型

每个 Mod 使用下列状态。颜色只是显示，业务逻辑使用稳定枚举。

| 状态 | 显示 | 含义 | 默认取舍 |
|---|---|---|---|
| `compatible` | 绿色勾 | 已验证同一平台项目存在目标版本/Loader 文件 | 自动采用官方目标文件 |
| `replacement` | 黄色感叹号 | 没有同项目目标文件，但存在一个或多个平替候选 | 人工未选；Agent 可自动选择并记录理由 |
| `source-port` | 橙色扳手 | 没有目标文件，但存在公开源码或本地自制源码 | 创建目标版本移植模块 |
| `missing` | 红色叉 | 身份已确认，但没有目标文件、可信平替或可用源码 | `defer`，不得静默删除 |
| `unknown` | 灰色问号 | 无法可靠确认平台身份或 JAR 无法解析 | `defer`，保留完整证据 |

黄色不是“兼容”，只表示存在候选。绿色必须有平台项目、目标 Minecraft 版本和目标 Loader 的可验证文件。名称相似不能判绿。

## 身份识别、搜索与下载顺序

### 身份识别链

按可信度从高到低执行：

1. ModMind 锁文件中的 provider、projectId、versionId 和哈希。
2. Modrinth SHA-1/SHA-512 与 CurseForge 指纹/哈希识别。
3. JAR 内 `fabric.mod.json`、`quilt.mod.json`、`mods.toml`、`neoforge.mods.toml` 或 `mcmod.info`。
4. 源 Minecraft 版本和源 Loader 下的文件名完全匹配。
5. 源版本号、Mod ID、显示名和 slug 的唯一组合匹配。
6. MC百科搜索得到的中文名、英文名和别名，再回到 MR/CF 验证源项目。
7. 仍不能确认时保持 `unknown`。

JAR 改名、二次打包、私有 Mod、未收录哈希和残缺元数据都可能产生灰色项。系统宁可保留未知，也不能把同名项目自动认错。

### MC百科的角色

MC百科是发现与中文语义补全层，不直接替代兼容性验证。搜索顺序为：

1. 已知项目直接查询 MR/CF 目标文件。
2. 未知名称先直接搜索 MR/CF。
3. 没有可靠结果时搜索 MC百科。
4. 提取百科中文名、英文名、括号别名和相关项目。
5. 使用这些别名重新搜索 MR/CF，并按目标版本和 Loader 过滤文件。
6. MR/CF 仍无结果时，检查 MC百科目标文件列表并作为人工验证码下载兜底。

下载优先级固定为：

```text
Modrinth / CurseForge 可验证文件
  -> MC百科可验证文件（需要用户验证码）
  -> 用户手工导入目标 JAR
  -> 源码移植或干净重做
  -> defer
```

Agent 可以发起 MC百科下载、选择文件并等待结果，但验证码必须由用户在工作台交互区域输入。验证码图片、答案、Cookie 和下载 token 不暴露给模型，也不允许模型识别或代填。

## 人工可执行操作

每个 Mod 行必须支持：

- 查看源 JAR 身份、哈希、结构、平台匹配和 MC百科匹配。
- 采用同项目官方目标文件。
- 查看多个平替候选并选择其中一个。
- 手工导入目标 Loader 的 JAR。
- 发起 MC百科目标文件下载并完成人工验证码。
- 创建公开源码移植模块。
- 创建闭源功能的干净兼容模块。
- 从目标运行时移除。
- 暂缓处理 `defer`。
- 重置为扫描默认值。

页面还需要批量操作：

- 批量采用全部绿色官方文件。
- 批量接受高置信度平替。
- 批量把红色/灰色标记为 `defer`。
- 批量创建兼容模块。
- 按状态、来源平台、Loader、客户端/服务端侧和置信度筛选。

所有操作只更新当前迁移草稿。真正修改项目只发生在执行迁移事务时。

## Agent 自动判断与执行

Agent 读取结构化评估后可以自动完成所有人工取舍。备份模式下不要求逐行审批；每项决策必须写入迁移记录，包括候选、理由、证据、置信度、预期功能缺口和回退动作。

Agent 判断平替时至少考虑：

- 原 Mod 在当前整合包中实际被哪些配置、脚本、任务、配方和存档引用。
- 原 Mod 的主要功能，而不只比较名称和简介。
- 候选的目标版本、Loader、客户端/服务端侧和依赖闭包。
- 配置格式、注册 ID、网络协议、世界数据和 API 差异。
- 维护状态、发布日期、下载量、源码仓库和许可证。
- 一个候选能否完整替代，还是需要多个 Mod 加兼容模块组合。

建议输出：

```json
{
  "modId": "source-entry-id",
  "action": "use-replacement",
  "candidate": {
    "provider": "modrinth",
    "projectId": "...",
    "versionId": "..."
  },
  "confidence": "medium",
  "reason": "目标 Mod 覆盖原包使用的存储与传输功能",
  "knownGaps": ["原配置键需要转换", "旧方块 ID 需要数据修复"],
  "evidence": ["配置引用", "任务文本", "平台描述", "依赖图"]
}
```

Agent 判断失败不是阻塞迁移的理由。无法确认时使用 `defer`，生成不完美项目和后续待办；不得为了让表格全绿而静默删除 Mod 或伪造兼容结论。

## 不完美迁移

### 允许生成

迁移生成不再要求所有 Mod 已取舍。即使全部项目为红色或灰色，也可以执行迁移。生成结果分为：

- `complete`：所有运行时 Mod 有明确目标，依赖闭合，基础验证通过。
- `incomplete`：存在 deferred、未验证平替、待编译源码模块、未转换内容或失败测试。

`incomplete` 是合法迁移产物，不是服务错误。页面和工作台必须醒目标明它不能被当作可发布整合包。

### deferred 的行为

- 不把不兼容源 JAR放入目标版本的运行时 `mods`。
- 不将 deferred 等同于用户选择“移除”。
- 在备份和证据目录中保留原 JAR 与元数据。
- 在报告、结构化状态和 Agent Todo 中记录缺失功能。
- 扫描配置、脚本、任务、配方和世界数据对原 Mod ID 的引用。
- 允许后续补入平替、手工 JAR或兼容模块后重新评估。

### 每个源 JAR 的证据档案

每个源 Mod 都生成 JSON 档案，必要时附带 Markdown 摘要：

- 原始文件名、相对路径、大小、SHA-1、SHA-256。
- JAR 是否可打开、压缩格式和安全诊断。
- Mod ID、显示名、声明版本、Loader 和环境侧。
- 入口点、Mixin 配置、Access Widener/Transformer、核心插件和嵌套 JAR。
- 声明依赖、可选依赖、冲突和嵌入依赖。
- 包名、资源命名空间和文件树摘要；不把完整反编译代码写进报告。
- 锁文件、MR、CF、MC百科匹配及每项证据强度。
- 可用源码 URL、源码版本、声明许可证和许可证待确认状态。
- 目标文件、平替候选、被拒绝候选和拒绝原因。
- 选择的迁移动作、AI/人工操作者、理由、时间和结果。
- 配置、脚本、任务、配方、资源和存档中的引用位置。
- 当前缺失功能、后续实现建议和验证结果。

备份模式下，原 JAR 位于迁移前快照中，证据档案保存稳定引用。直接模式没有完整可撤销备份，但仍将源 JAR复制到迁移证据区；证据副本不加入目标 `mods`，也不随普通整合包导出。该证据副本用于本地分析，不改变原文件的许可证和再分发限制。

## 魔改内容迁移

以下类别必须独立评估和取舍：

| 类别 | 默认策略 | 额外检查 |
|---|---|---|
| 配置与默认配置 | 复制并标记复核 | 配置键、路径、格式、Mod ID |
| KubeJS/CraftTweaker/脚本 | 复制并标记修复 | API、事件、注册 ID、类名 |
| 配方与数据包 | 复制并验证 | pack format、物品/方块/标签 ID |
| FTB Quests/Patchouli | 复制并验证 | 任务依赖、物品图标、章节引用 |
| 资源包与界面 | 复制并验证 |资源包格式、纹理和模型引用 |
| 光影 | 默认保留候选 | 渲染器和目标版本兼容性 |
| 客户端预设 | 复制并复核 | 键位、选项名和已移除 Mod |
| 服务端配置 | 复制并复核 | serverconfig、权限和端口无关项 |
| 世界与存档 | 向上迁移默认排除后单独测试 | 数据版本、缺失注册项和不可逆升级 |

向下迁移不得自动转换或打开原世界。任何世界测试只能使用一次性副本。跨 Loader 迁移必须特别标记事件、注册、网络、能力/附件、配置和数据生成 API 差异。

## 源码移植与闭源重做

### 有公开源码

1. 记录源码仓库、对应源版本/提交和许可证。
2. 验证许可证是否允许复制、修改和分发，保留必须的 NOTICE 与作者信息。
3. 创建目标版本模块工程，保留来源证据但不覆盖原源码。
4. 迁移构建配置、描述文件和 Loader API。
5. 修复映射、注册、事件、网络、配置、数据和资源 API。
6. 构建并执行客户端、专用服务端和进服验证。

### 没有源码

创建干净的兼容模块，不复制、反编译或改写闭源实现。Agent 可以依据公开文档、整合包内配置和脚本、注册 ID、公开 API、用户描述及黑盒运行结果重做整合包实际需要的功能。

兼容模块必须包含：

- 原 JAR 身份和需要替代的功能清单。
- 明确的非目标功能，防止无边界复刻。
- 旧注册 ID、配置和存档数据的兼容策略。
- 未知行为和测试缺口。
- 许可证与资产来源说明。

生成脚手架不等于迁移完成。只有通过构建和运行验证后，模块状态才能从 `scaffolded` 进入 `verified`。

## 原目录事务迁移

### 两个执行按钮

人工迁移页面提供两个清晰命令：

1. `备份并迁移`：主按钮。创建永久迁移前快照，然后在原目录提交目标状态。成功后可撤销。
2. `直接迁移`：次要危险按钮。显示“成功后不能一键恢复迁移前状态”的确认对话框。只保留事务失败所需的临时回滚副本和必要证据，成功后删除临时回滚副本。

工作台 Agent 调用迁移时，`mode` 缺省并强制归一为 `backup`。只有用户明确要求不保留备份时，Agent 才能提交 `direct`；备份模式下 Agent 可以自动完成后续所有决策和修复，不增加逐项批准。

### 执行算法

1. 校验评估 ID、摘要哈希、源项目指纹和目标版本仍然有效。
2. 获取项目写锁和全局 Minecraft 资源锁；拒绝与构建、运行、快照恢复或另一个迁移并发。
3. 在项目外的临时目录生成完整目标树，不边下载边覆盖原项目。
4. 完成依赖闭包、文件名冲突、清单、锁文件、模块和路径校验。
5. 备份模式创建并锁定永久快照；直接模式创建临时回滚副本。
6. 精确同步受管文件回原目录，保留 `.git`、`.modmind`、迁移历史和明确排除的用户目录。
7. 写入新的项目清单、整合包清单、锁文件、报告和迁移记录。
8. 重新加载 `currentProject`、最近项目和运行时服务，项目路径保持不变。
9. 执行锁文件审计和可选基础启动验证。
10. 成功后提交事务；失败时恢复操作前状态并保留诊断。

任何阶段失败都不能留下“项目清单是新版本、mods 还是旧版本”的半提交状态。

## 备份、撤销和历史

### 迁移记录

建议目录：

```text
.modmind/migrations/
  index.json
  <migrationId>/
    migration.json
    assessment.json
    decisions.json
    events.jsonl
    evidence/
      mods/<modId>.json
      jar-listings/<modId>.txt
      source-jars/                 # 直接模式或显式保留时使用
    reports/
      migration-report.md
      unresolved.md
```

永久文件快照继续使用 `.modmind/snapshots/<snapshotId>/`，迁移记录通过 `sourceSnapshotId` 引用。承担撤销依据的快照必须被标记为 pinned，普通快照删除操作不得删除它。

`migration.json` 至少包含：

```json
{
  "id": "migration-...",
  "mode": "backup",
  "status": "incomplete",
  "source": { "loader": "fabric", "minecraftVersion": "1.20.1" },
  "target": { "loader": "neoforge", "minecraftVersion": "1.21.1" },
  "sourceSnapshotId": "...",
  "completedBaselineSnapshotId": "...",
  "preUndoSnapshotId": null,
  "assessmentDigest": "...",
  "unresolvedCount": 12,
  "createdAt": "...",
  "completedAt": "..."
}
```

### 撤销迁移

“撤销迁移”仅在存在有效 `sourceSnapshotId` 时启用：

1. 停止运行和写任务并获取项目锁。
2. 验证迁移记录、备份完整性和当前项目身份。
3. 自动创建“撤销迁移前现场”，记录为 `preUndoSnapshotId`。
4. 精确恢复迁移前快照。
5. 重新读取项目元数据和运行时。
6. 将迁移记录标记为 `undone`，显示迁移后改动的恢复点。
7. 恢复失败时再回滚到 `preUndoSnapshotId`。

撤销不会静默合并迁移后的改动。页面必须明确提示：旧版本已经恢复，迁移后的工作保存在指定现场，可从迁移历史中恢复或用于以后反向迁移。

直接迁移没有永久源快照，因此不显示“撤销迁移”。迁移历史仍保留评估、决策、证据和报告。

## MCP 能力设计

### 工具清单

| MCP 工具 | 类型 | 对应人工操作 |
|---|---|---|
| `modmind_modpack_migration_targets` | 只读、本地 | 查看可选 Loader 和 Minecraft 版本 |
| `modmind_modpack_migration_preview` | 只读、联网 | 点击版本并扫描，获取状态表和进度 |
| `modmind_modpack_migration_get_plan` | 只读、本地 | 查看当前草稿、取舍和未解决项 |
| `modmind_modpack_migration_update_plan` | 写入、可逆 | 选择官方文件、平替、移除、defer、兼容模块、模块与内容策略、重置取舍 |
| `modmind_modpack_migration_attach_jar` | 写入、可逆 | 为某项选择项目内或已授权路径的手工目标 JAR |
| `modmind_modpack_migration_mcmod_download` | 写入、联网 | 选择百科文件并发起需要用户验证码的受管下载 |
| `modmind_modpack_migration_apply` | 写入、事务 | 备份并迁移或直接迁移 |
| `modmind_modpack_migration_status` | 只读、本地 | 查看当前迁移、进度、报告和是否可撤销 |
| `modmind_modpack_migration_history` | 只读、本地 | 查看迁移历史、证据和恢复点 |
| `modmind_modpack_migration_undo` | 写入、事务 | 撤销指定迁移并自动保存当前现场 |

筛选、排序和展开详情不需要改变后端状态，Agent 可以直接处理 preview 返回的结构化数组。所有会改变迁移草稿或磁盘状态的页面行为必须落到上述命令之一。

### 计划更新结构

`modmind_modpack_migration_update_plan` 支持批量变更：

```json
{
  "assessmentId": "...",
  "assessmentDigest": "...",
  "modDecisions": [
    {
      "modId": "...",
      "action": "use-replacement",
      "candidate": {
        "provider": "modrinth",
        "projectId": "...",
        "versionId": "..."
      },
      "reason": "...",
      "confidence": "medium"
    }
  ],
  "moduleDecisions": [],
  "contentDecisions": []
}
```

允许的 Mod action：

- `use-compatible`
- `use-replacement`
- `manual-file`
- `mcmod-file`
- `port-source`
- `create-compat-module`
- `remove`
- `defer`
- `reset`

后端必须重新验证候选仍存在、目标版本仍匹配、手工 JAR Loader 正确以及批量决策没有重复或越权路径。

### 执行结构

`modmind_modpack_migration_apply`：

```json
{
  "assessmentId": "...",
  "assessmentDigest": "...",
  "mode": "backup",
  "unresolvedPolicy": "defer",
  "runVerification": true
}
```

规则：

- `mode` 省略时为 `backup`。
- Agent 发起时默认和正常路径始终为 `backup`。
- `direct` 必须与用户最新请求中的明确意图一致，否则 Review Agent 拒绝。
- `unresolvedPolicy` 默认 `defer`，不能默认 `remove`。
- 返回 migrationId、状态、快照 ID、报告路径、未解决项、已安装文件、生成模块和验证结果。

`modmind_modpack_migration_undo`：

```json
{
  "migrationId": "...",
  "preserveCurrent": true
}
```

`preserveCurrent` 在服务端固定为 `true`。即使 Agent 传入 false，也不得跳过撤销前现场。

### MCP Bridge 改动

需要同步修改：

- `ExternalAgentBridgeHandlers` 增加上述 handler。
- `MCP_SERVER_SOURCE` 增加工具声明、action 映射和 JSON Schema。
- `ModMindBridge.dispatch` 增加 action 分支。
- 本机/托管 Agent 两套 bridge handler 都绑定同一命令服务。
- `READ_ONLY_DENIED_ACTIONS` 加入 update、attach、download、apply 和 undo；灵感台只能调用 targets、preview、status 和 history。
- Managed Download Policy 要求迁移相关下载只能走迁移服务，Agent 不能用 curl、浏览器或原生文件操作替换受管路径。
- Review Agent 将 `direct` 和 `undo` 视为高影响操作；备份模式 apply 是标准可逆迁移操作。
- Agent 上下文写入当前迁移 ID、目标版本、状态、报告路径和未解决项摘要。

### 人工与 MCP 对等验收

维护一张代码级能力清单。每新增一个页面命令，都必须同时满足：

1. 有主进程命令实现。
2. 有 IPC/preload 调用。
3. 有 MCP handler 或明确属于纯显示行为。
4. 页面和 MCP 使用相同输入校验、事务、进度和结果类型。
5. 有契约测试证明 UI command 与 MCP action 产生等价计划变更。

## 工作台 Agent 标准流程

用户在工作台要求迁移后，Agent 应按以下顺序工作：

1. 调用 targets 和 preview，读取完整证据而不是根据文件名猜测。
2. 对绿色采用官方目标文件。
3. 对黄色分析实际功能与候选差异并自动作出选择。
4. 对红色/灰色搜索 MR、CF、MC百科和源码。
5. 能移植则创建源码计划；不能移植则确定干净兼容模块范围；暂时无解则 defer。
6. 分析配置、脚本、任务、配方、资源和世界引用并更新计划。
7. 调用 apply，默认 `backup`，允许生成 incomplete 项目。
8. 在同一个原目录继续修复源码模块和魔改内容。
9. 调用现有构建、客户端、服务端、进服和场景测试工具。
10. 把失败证据写回迁移记录和 Todo，继续处理，直到完成或清楚报告剩余阻塞。

备份建立以后，Agent 可以自主选择平替、下载依赖、修改内容和运行测试。默认备份是恢复保障，不是限制 Agent 能力的逐次审批机制。

## 数据与类型

建议新增或扩展：

- `ModpackMigrationMode = 'backup' | 'direct'`
- `ModpackMigrationProjectStatus = 'complete' | 'incomplete'`
- `ModpackMigrationTransactionStatus`
- `ModpackMigrationRecord`
- `ModpackMigrationPlan`
- `ModpackMigrationDecision` 增加 `defer`、`port-source`、`mcmod-file`、reason、confidence 和 evidence。
- `ModpackMigrationEvidence`
- `ModpackMigrationJarDossier`
- `ModpackMigrationProgress` 增加 transactionId、projectPath、currentItem 和更多阶段。
- `SnapshotInfo` 增加 pinned、pinReason 和 migrationId，或建立独立 pin 索引。

评估、计划和执行结果必须可序列化。MCP、IPC、迁移记录和测试夹具共用 shared 类型，避免四套结构漂移。

## 实现模块

建议把当前服务拆成清晰边界：

- `modpackMigrationAssessmentService.ts`：清单、JAR、平台、百科、内容和候选评估。
- `modpackMigrationPlanService.ts`：计划草稿、批量决策、摘要哈希和重新验证。
- `modpackMigrationEvidenceService.ts`：JAR 档案、引用扫描、报告和迁移历史。
- `modpackMigrationTransactionService.ts`：暂存、备份、原目录提交、回滚和撤销。
- `modpackMigrationSourcePortService.ts`：公开源码移植与干净兼容模块脚手架。
- `modpackMigrationVerificationService.ts`：锁审计、构建、客户端、服务端和进服结果归档。

渲染层只维护选择状态和展示，不实现候选验证、文件复制或备份逻辑。

## 实施阶段

### 阶段 1：原目录事务与撤销

- 把现有新目录生成改为临时目录暂存后原目录提交。
- 增加 backup/direct 两种模式。
- 复用并扩展快照 pin。
- 增加迁移记录、历史和撤销前自动现场。
- 页面增加两个执行按钮、撤销和历史入口。

### 阶段 2：不完美迁移与证据

- 增加 `defer` 和 complete/incomplete 状态。
- 允许全红/全灰生成。
- 生成每个 JAR 的结构化档案、引用索引和 unresolved 报告。
- 直接模式保留源 JAR 证据但不提供完整撤销。

### 阶段 3：MCP 全能力对等

- 增加 targets、preview、plan、update、attach、MC百科下载、apply、status、history 和 undo。
- 接入工作台 Agent 上下文、进度、Todo 和 Review Agent。
- 建立 UI/MCP 命令对等契约测试。

### 阶段 4：AI 平替与内容修复

- 向评估输出加入功能引用、依赖图和候选差异。
- Agent 自动选择平替并记录置信度、理由和缺口。
- 增加配置、脚本、任务、配方和资源引用的修复流程。
- 支持组合平替和兼容模块。

### 阶段 5：源码移植与验证闭环

- 公开源码按许可证和精确版本建立目标模块。
- 闭源项目建立干净兼容模块和功能边界。
- 构建、客户端、服务端、进服和场景测试写回迁移状态。
- 支持从 incomplete 多轮继续，最终提升为 complete。

## 测试要求

### 单元测试

- 锁文件、哈希、JAR 元数据、源版本和 MC百科别名识别。
- 同名、改名、多候选和版本号歧义不误判绿色。
- MR/CF 下载优先于 MC百科；百科验证码不暴露给 Agent。
- 红黄绿橙灰状态和默认决策。
- deferred 不等于 remove。
- JAR 档案和内容引用索引完整。
- 迁移摘要哈希变化时拒绝陈旧计划。

### 事务测试

- 备份成功后原目录迁移，项目路径不变。
- 直接迁移成功后无 undo，但保留证据和历史。
- 下载、生成、同步和清单写入各阶段失败都能恢复。
- `.git`、`.modmind`、快照和迁移记录不被精确同步删除。
- 承担撤销的快照不能被普通删除。
- 迁移后新增、修改和删除文件，再撤销时先建立现场并恢复原状态。
- 撤销失败自动回滚到撤销前现场。
- 运行中的 Minecraft、构建、AI 写任务和另一个迁移会阻止冲突事务。

### 不完美迁移测试

- 所有 Mod 都为 missing 时仍生成 incomplete 项目。
- 所有 Mod 都为 unknown 时仍保留源 JAR、哈希、结构和后续待办。
- 不兼容源 JAR 不进入目标运行时目录。
- 报告逐项列出缺失功能、原文件、身份、候选和引用。
- 后续补入目标 JAR或兼容模块后可以重新评估并减少 unresolvedCount。

### MCP 与 Agent 测试

- `tools/list` 暴露完整迁移工具集。
- 灵感台不能调用任何迁移写工具。
- apply 未传 mode 时实际使用 backup。
- direct 与用户明确意图不一致时被拒绝。
- undo 永远保存当前现场。
- 页面每个业务命令都有等价 MCP action。
- MCP 与页面提交同一计划时得到相同 assessmentDigest、迁移记录和文件结果。
- Agent 能在无人逐项审批的备份模式下完成扫描、决策、incomplete 生成、继续修复和测试。

### 端到端测试

- Fabric 1.20.1 向上迁移到 Fabric 1.21.1。
- Forge 1.20.1 迁移到 NeoForge 1.21.1。
- 新版本向旧版本迁移并默认排除世界。
- 含官方 Mod、平替、私有 JAR、公开源码、自制模块和魔改内容的混合整合包。
- 迁移后人工修改，再撤销并从撤销前现场恢复。
- 全红/全灰整合包由 Agent 生成 incomplete 项目，并为每项建立 Todo 和证据。

## 完成标准

以下条件全部满足才算完成：

- 人可以在版本迁移页面完成扫描、所有取舍、备份迁移、直接迁移、查看历史和撤销。
- Agent 可以在工作台通过 MCP 完成同一组操作，且默认使用备份模式。
- 项目始终在原路径迁移，任何失败都不会留下半迁移状态。
- 全红或全灰仍能生成可继续工作的 incomplete 项目。
- 每个源 JAR、每个不完美决策和每项魔改内容都有可追溯证据。
- 平替选择区分自动验证、AI 判断和人工选择，不把名称相似伪装成兼容。
- MC百科用于强搜索和中文别名，MR/CF 保持优先下载来源。
- 有源码时按许可证移植，无源码时只做干净兼容实现。
- 撤销前保存迁移后现场，恢复失败能够再次回滚。
- 迁移报告、结构化记录、页面状态、MCP 返回值和测试结果彼此一致。
