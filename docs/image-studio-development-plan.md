# Image Studio Development Plan

状态：客户端已实现，等待托管图片服务端接口联调。

## 已确认的产品行为

- 专业模式侧边栏增加一个“图像工坊”页面，页面内包含 AI 绘画、图片处理和手动编辑三个工作区。
- AI 绘画需要支持较完整的 ComfyUI 风格生产流程：参数面板、批量数量、队列、历史记录、结果网格和可重复任务。
- 预设风格至少包含 Minecraft 像素风纯色背景，以及不追加限制的其他风格。
- 图片处理包含 PerfectPixel、rembg 去背景和成熟的 TOAST UI Image Editor 手动编辑器，支持本地上传、拖放和剪贴板导入。
- 快速制作模式和专业模式设置都提供“允许 AI 生成图片”开关。开关关闭时，Agent 不应看到图像 Skill 或图像工具；用户仍可在专业图像工坊手动操作，除非产品决定把开关定义为全局禁用。
- 快速制作模式和专业模式不显示逐次审批或“自动批准”开关。启用“允许 AI 生成图片”后，Agent 的计费生成由 ModMind 在后台自动执行并记录额度。
- 专业模式填写自有图片 API Key 后直接使用用户配置的图片服务；未填写时直接使用托管额度，由余额和服务端租约决定是否可执行。
- 快速制作模式始终使用托管图片额度。生成图片时会扣除相应额度，具体以服务端计费策略为准。

## 当前上游探测结果

配置的图片服务地址为 `https://ai.soulecho.cc/v1`。

- `GET /models` 在无认证时返回 HTTP 401，无法公开发现模型。
- `/openapi.json`、`/swagger.json`、`/docs` 未发现公开接口文档。
- 授权模型列表包含 `gpt-image-2`、`gpt-image-2-4k` 和 `gpt-image-2-adobe`。单模型查询只确认标准 `gpt-image-2` 存在；另外两个别名在单模型查询中返回 `model_not_found`，不能视为可用。
- 在用户明确授权下执行了一次且仅一次生成探测：`POST /images/generations` 使用 `gpt-image-2`、`quality=low`、`size=1536x1024`、`moderation=low`，约 26 秒后成功返回一张图片。
- 响应结构为顶层 `data`、`created`，图片项包含 `url`、`b64_json`、`revised_prompt`，没有返回模型名或 usage。
- 中转站接受参数不代表实际执行，不能仅靠 HTTP 200 判断所有参数都被严格遵守。
- 测试图片只写入系统临时目录用于检查文件头，检查后已删除；没有进入项目或长期存储。

## 建议的服务端接口

客户端只申请短期图片凭证。余额、额度预留、计费和模型策略全部由服务端内部完成。

建议新增：

```http
POST /api/device/image-lease
Authorization: Bearer {deviceKey}
Content-Type: application/json
Idempotency-Key: {clientRequestId}

{
  "username": "modmind-user",
  "timestamp": "2026-08-10T12:00:00.000Z"
}
```

服务端负责余额、额度预留、模型白名单、批量上限和计费，成功响应只需包含：

```json
{
  "baseUrl": "https://.../v1",
  "apiKey": "short-lived-scoped-key",
  "model": "gpt-image-2"
}
```

`timestamp` 使用 UTC ISO 8601，服务端应校验时间窗口并结合 Authorization 和幂等键防止重放；`apiKey` 应为短期图片专用 Key。服务端可以在内部完成预留和结算，不要求客户端上传额度、模型、数量或 usage。

## 图片请求参数设计

OpenAI 图片接口常见参数可以作为 UI 基线，但不能直接视为 `ai.soulecho.cc` 的真实能力：

- `model`
- `prompt`
- `n`
- `size`
- `quality`
- `background`
- 图片编辑相关的输入图片、mask 和编辑提示词

当前 GPT Image 2 参数基线：

- `quality`: `low`、`medium`、`high`、`auto`
- `size`: `auto` 或 `WIDTHxHEIGHT`。宽高都应为 16 的倍数，最长边不超过 3840，长短边比例不超过 3:1，总像素范围为 655,360 至 8,294,400。
- 宽高比没有独立的标准 `aspect_ratio` 字段，应通过 `size` 的宽和高表达。UI 可以提供比例预设，再换算为合法尺寸。
- `moderation`: `auto` 或 `low`
- `n`: 1 至 10，但产品需要另外施加额度和批量上限。
- GPT Image 2 不支持原生透明背景参数；透明输出走纯色背景加去背景处理。
- 参考图通过上游 `/images/edits` 以 multipart 上传；客户端只在用户选择本地图片或项目资源后发送图片数据，不把项目路径直接交给上游。

实现时应以服务端返回的 `capabilities` 动态生成控件。格式和压缩率不纳入产品参数；未知参数不发送；不要通过反复发送生成请求来探测参数，因为这可能扣费。

## 图像能力开关

一个开关控制 Agent 能力暴露：

1. “允许 AI 生成图片”控制能力是否暴露给 Agent。关闭时，Agent 完全看不到 Skill 和工具。

开启时，ModMind 在后台完成凭证、额度和租约处理；界面不展示逐次确认或风险审批。余额不足、租约失败或图片服务返回错误时，任务直接失败并返回可读错误。

快速制作模式仍不显示图像工坊、Key 或模型参数；专业模式在设置中只显示图像能力开关。

## Agent/Skill 接入

- 新增精简的 `modmind-image-assets` Skill，只说明何时调用图像工具、如何选择 Minecraft 预设、如何保存资源和如何处理失败。
- 当“允许 AI 生成图片”关闭时，不复制该 Skill，不在 MCP `tools/list` 注册图像工具，也不向 Codex、Claude Code 或其他兼容 MCP 的外部 Agent 注入图像能力说明。
- 当开关开启时，所有兼容 MCP 的外部 Agent 看到同一套受控工具；Key、租约和余额永远不返回给 Agent。
- 图片输出先写入 `.modmind` 工作区；仅在 Agent 或图像工坊明确要求加入项目时才写入项目资源目录。
- 工作流画布采用 MIT 许可的 React Flow；它承载 GPT image2 的 ModMind 节点执行，不捆绑 GPL 许可的 ComfyUI 前端或后端。

## Windows 首发与后续平台风险

当前发行目标是 Windows，但代码已有部分跨平台分支。适配 macOS/Linux 时需要重点处理：

1. Codex 自动下载目前仅支持 Windows x64，URL、压缩包结构、SHA-512 和可执行文件路径均是 Windows 专用。
2. 外部 Agent 依赖 `.cmd`、`.ps1`、`powershell.exe`、`taskkill.exe` 和 Windows PATH 查找逻辑。
3. FFmpeg 使用 `ffmpeg-static`，需要确认各平台二进制、许可证通知、可执行权限和 ASAR 解包路径。
4. Gradle Wrapper、Java 探测、脚本执行权限和 shell 行为在 macOS/Linux 不同。
5. PerfectPixel 已内置到 Electron 主进程，不再依赖 Python sidecar；rembg 仍是可选的 Python 运行时能力，跨平台发行时需要验证其模型准备、可执行权限和 Electron 资源路径。
6. Electron `safeStorage`、用户数据目录、临时文件权限和子进程环境变量在三平台上要分别验证。
7. 图片路径不能只按 Windows 反斜杠处理；项目资源安全校验要同时拒绝 POSIX 和 Windows 绝对路径及目录穿越。
8. electron-builder 的 `extraResources`、原生依赖和可能的大模型文件需要分别验证 Windows、macOS 和 Linux 包体。

首发建议只打包 Windows x64，并在依赖选型时保留未来使用 Node/WASM 或平台 sidecar 的路径。

## 暂定实现顺序

1. 服务端接口和能力响应协议。
2. 图像设置、加密 Key 存储、额度确认和临时租约服务。
3. 图片生成适配器与请求参数校验。
4. PerfectPixel、rembg 和 TOAST UI Image Editor 适配。
5. 专业模式图像工坊、队列和历史。
6. 快速制作模式开关和动态 Agent/Skill 门控。
7. 安全、失败重试、退款、跨平台和打包测试。
