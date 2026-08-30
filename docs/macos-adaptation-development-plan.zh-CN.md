# ModMind macOS 适配开发文档

状态：规划基线。本文基于当前 Electron 33、electron-builder 25 和 ModMind 1.3.11-beta.2 代码编写，用于指导 macOS 功能适配、发布工程和回归验收。本文不表示所有任务已经实施。

## 1. 目标与发布基线

### 1.1 总体目标

macOS 版不是仅能启动的演示包，而是与 Windows 版共享同一份项目、设置和业务语义的正式桌面应用。完成后必须满足：

- Apple Silicon `arm64` 是一级支持架构，Intel `x64` 是完整支持架构。
- 用户可以从 DMG 安装，首次打开不会被 Gatekeeper 以未签名或未公证为由拦截。
- 创建、导入、编辑、构建、Minecraft 测试、本地服务端、AI 开发、Blockbench、图像与发布流程不因平台而缺失。
- Java、Gradle、Codex、FFmpeg、Sharp 和 7-Zip 使用与当前 CPU 架构一致的可执行文件。
- 窗口、菜单、快捷键、关闭和重新激活符合 macOS 交互预期。
- Windows 现有发布和运行行为不因适配而回归。

### 1.2 本文默认的发布决策

为了让计划可直接执行，本文使用以下基线：

| 事项 | 决策 |
|---|---|
| 发布渠道 | 官网或 GitHub 提供 Developer ID 签名并完成 Apple 公证的 DMG/ZIP |
| Mac App Store | 不纳入本阶段；应用需要执行 Java、Gradle、Git 和 Agent，不适合立即引入 App Sandbox |
| CPU 产物 | `arm64` 和 `x64` 分开发布，首阶段不合并 Universal 包 |
| 最低系统 | 暂定 macOS 13 Ventura；正式发布前依据 Electron 支持范围和实机结果再冻结 |
| 窗口 | macOS 使用系统交通灯和应用菜单，Windows 保留当前自定义窗口控件 |
| 签名与公证 | PR/日常 CI 产出未签名测试包；发布工作流使用受保护密钥签名和公证 |

如后续决定只发布 Apple Silicon，可以移除 `x64` 产物，但不应把一个架构的原生依赖复制进另一个架构的安装包。

### 1.3 非目标

- 不在本阶段进行全面视觉重设计。
- 不为 macOS 维护独立业务逻辑或独立项目格式。
- 不要求 Windows 用户改用 Unix 命令或改变现有安装方式。
- 不把 Rosetta 2 作为 Apple Silicon 的默认运行前提。
- 不在本文中引入自动更新服务；只保证产物可验证、可安装。

## 2. 当前实现基线

### 2.1 已有的跨平台能力

当前代码不是纯 Windows 应用，以下基础应保留并继续使用：

- `package.json` 已配置 `dist:mac`、DMG、ZIP、macOS 应用分类和 PNG 图标。
- `.github/workflows/build-macos.yml` 已在 macOS runner 中执行依赖安装、类型检查、测试、构建和未签名打包。
- `jdkDownload.ts` 已支持 Adoptium `mac`/`aarch64`，并能识别 `.jdk/Contents/Home`。
- Gradle 和 Minecraft 运行时已根据平台选择 `gradlew.bat` 或 `gradlew`，非 Windows 平台会设置执行权限。
- `index.ts` 已处理 `open-url`、`activate` 和 macOS 下最后一个窗口关闭后不退出。
- `externalAgents.ts` 已对 `.cmd`/PowerShell 和 Unix 可执行文件做了基础分流。
- `7zip-bin` 当前依赖同时提供 macOS `arm64` 和 `x64` 二进制；`sharp` 和 `ffmpeg-static` 会在安装依赖时选择宿主平台产物。
- Electron `safeStorage`、`app.getPath()`、`dialog` 和 `shell.openPath()` 已避免了多数手写系统目录。

### 2.2 已确认的缺口

| 编号 | 缺口 | 当前代码 | 影响 |
|---|---|---|---|
| M1 | Codex 自动下载仅支持 Windows x64 | `src/main/codexSetup.ts` | Mac 用户无法直接使用默认 AI 开发流程 |
| M2 | HeadlessMC 登录终端仅支持 Windows | `src/main/headlessMcService.ts` | 需要交互登录时流程中断 |
| M3 | 长运行子进程的终止逻辑分散 | Minecraft、Server、HeadlessMC、External Agents | 可能遗留 Java、Gradle、Minecraft 或 Agent 子进程 |
| M4 | 主窗口和分离窗口使用 Windows 风格无边框控件 | `src/main/index.ts`、`src/renderer/src/App.tsx` | 交通灯、窗口缩放和关闭行为不符合 macOS |
| M5 | 没有明确的 macOS 应用菜单和平台快捷键层 | `src/main/index.ts` | 复制粘贴、设置、窗口和退出体验不稳定 |
| M6 | macOS CI 明确产出未签名包 | `.github/workflows/build-macos.yml` | 不能作为面向普通用户的发布产物 |
| M7 | 发布验证只识别 Windows EXE | `scripts/verify-release.mjs` | DMG/ZIP 的架构、签名、公证和哈希没有门禁 |
| M8 | 当前打包命令没有显式区分 `arm64` 和 `x64` | `package.json`、macOS workflow | 可能只产出 runner 宿主架构的安装包 |
| M9 | macOS 冷启动深链没有统一排队 | `src/main/index.ts` | `open-url` 可在主窗口和 IPC 就绪前到达 |

## 3. 平台能力边界

不应继续在业务文件中分散增加 `process.platform === 'win32'` 判断。跨平台行为应收敛为可测试的小型能力模块：

```text
src/main/runtimeTarget.ts       Codex/JDK/原生依赖目标解析
src/main/processTree.ts         运行与终止长时间子进程树
src/main/nativeTerminal.ts      打开系统终端执行交互命令
src/main/applicationMenu.ts     macOS/Windows 应用菜单
src/shared/platform.ts          可暴露给渲染层的稳定平台类型
```

这些文件名是预期实现方向，实施时可以在不改变责任边界的前提下配合当前代码结构调整。

### 3.1 平台信息模型

渲染层不应使用已逐步弃用的 `navigator.platform` 推断业务行为。在 shared 层定义：

```ts
export interface RuntimePlatformInfo {
  os: 'windows' | 'macos' | 'linux'
  arch: 'x64' | 'arm64' | 'other'
  packaged: boolean
}
```

主进程从 `process.platform`、`process.arch` 和 `app.isPackaged` 生成该对象，preload 只读暴露 `getPlatformInfo()`。渲染层仅用它控制窗口控件、提示文本和快捷键标签，不获得 Node 权限。

### 3.2 可测试的目标解析

与平台相关的纯函数必须允许注入 `platform` 和 `arch`，不应让测试只能验证当前 CI 宿主平台。例如：

```ts
resolveCodexRuntimeTarget('darwin', 'arm64')
resolveCodexRuntimeTarget('darwin', 'x64')
projectGradleWrapperExecutable(root, 'darwin')
```

不支持的组合必须返回结构化不支持原因，而不是默认落入 Linux 或 x64。

## 4. Codex 运行时适配

### 4.1 目标结构

将 `codexSetup.ts` 中的 Windows 常量改为版本化目标表：

```ts
interface CodexRuntimeDescriptor {
  id: 'win32-x64' | 'darwin-arm64' | 'darwin-x64'
  archiveName: string
  executableRelativePath: string
  sha512: string
  executableName: string
}
```

每个 descriptor 必须包含：

- 与 `CODEX_RUNTIME_VERSION` 完全一致的官方包名或官方发布产物名。
- npm 官方源和项目已信任镜像的下载 URL。
- 从 npm 完整性元数据得到的 SHA-512，不接受未校验下载。
- 通过实际解包确认的可执行文件相对路径，不根据 Windows 包结构猜测 Mac 路径。

在引入新 descriptor 时，必须对对应版本的官方包进行一次解包检查，并将包名、integrity 和二进制路径作为 review 证据。

### 4.2 下载、解压与缓存

`downloadCodex()` 改造为：

1. 根据注入或当前 `platform/arch` 选择 descriptor。
2. 将缓存目录设为 `<version>-<target-id>`，防止架构间共用二进制。
3. 继续使用 `verifiedDownload`、大小限制、重试和临时目录。
4. 解压后验证目标是普通文件、位于解压根内，且不是符号链接越界目标。
5. macOS/Linux 对可执行文件调用 `chmod(0o755)`。
6. 运行 `<executable> --version` 进行短时间探测，确认不是错误架构或损坏产物。
7. 最后原子替换正式缓存，失败时不删除上一个可用版本。

`prepareCodex()` 不得再拼接固定的 `win32-x64` 运行时目录。用户显式配置 `existingExecutable` 时仍优先使用该路径，但必须先运行版本探测并返回可读错误。

### 4.3 macOS 执行限制

- 必须在真实签名应用中测试下载后的 Codex 二进制能否直接执行。
- 如果官方二进制被 Gatekeeper 或签名策略拦截，优先采用官方支持的安装方式或将已验证二进制纳入应用签名链，不在代码中执行 `xattr -d com.apple.quarantine` 规避系统保护。
- 所有下载 URL、哈希和运行时版本变更都需要代码 review，不通过远程未签名配置替换。

### 4.4 测试

`codexSetup.test.ts` 至少增加：

- `darwin/arm64`、`darwin/x64`、`win32/x64` 能解析到不同目标。
- 不支持的架构不会回退到 x64。
- 缓存目录包含目标 ID。
- 已存在且版本正确的可执行文件不重复下载。
- 哈希错误、缺少二进制、越界链接和版本探测失败时不覆盖现有缓存。
- Unix 产物有执行权限。权限测试只在 POSIX CI 运行。

## 5. HeadlessMC 交互登录

### 5.1 统一终端启动接口

新增 `nativeTerminal.ts`，不让 `HeadlessMcService` 直接知道 `cmd.exe`、Terminal.app 或脚本格式。接口建议为：

```ts
interface InteractiveTerminalCommand {
  executable: string
  args: string[]
  cwd: string
  title?: string
}

openInteractiveTerminal(command: InteractiveTerminalCommand): Promise<void>
```

Windows 分支可复用现有 `windowsCmdInvocation(..., '/k')`。macOS 分支在应用自有临时目录中生成权限为 `0700` 的 `.command` 文件，再使用：

```text
/usr/bin/open -a Terminal <script.command>
```

### 5.2 脚本安全要求

- Java 路径、JAR 路径和工作目录都必须能包含空格、中文、单引号和换行等特殊字符。
- 不允许把未转义用户输入拼接到 AppleScript、`zsh -c` 或 `bash -c`。
- 优先把固定脚本与参数分离；如必须写入脚本，使用专用 POSIX shell 参数编码函数并对其做独立测试。
- 临时脚本不记录 token、Cookie 或账号密钥。
- 脚本在终端会话结束后删除；应用崩溃遗留的脚本在下次启动清理。

### 5.3 用户流程

`openLoginConsole()` 在 macOS 上必须自动完成 launcher 下载、终端打开和工作目录设置。用户只在 Terminal 中完成 HeadlessMC 要求的交互，不手工寻找 JAR 或复制 Java 命令。终端无法打开时，错误应包含脚本所在目录和可重试操作，但不显示凭据。

### 5.4 验收

- Java 和用户数据目录包含空格、中文时可正常启动。
- 脚本不能通过构造的 JAR 路径执行额外命令。
- Terminal 关闭后 HeadlessMC 服务状态能够重新检测。
- Windows 现有交互终端测试继续通过。

## 6. 子进程树与应用退出

### 6.1 问题

Minecraft、Gradle、HeadlessMC、本地服务端、服务端包工具和外部 Agent 都可以产生二级子进程。Windows 上当前多处调用 `taskkill /t`，但 macOS 分支的 `child.kill('SIGTERM')` 仅保证向直接子进程发送信号。

### 6.2 统一进程管理

新增 `processTree.ts`，提供：

```ts
interface ManagedChildOptions {
  kind: 'gradle' | 'java' | 'minecraft' | 'server' | 'agent' | 'tool'
  gracefulTimeoutMs?: number
}

terminateProcessTree(child, options): Promise<void>
```

实现规则：

- Windows 继续使用 `taskkill /pid <pid> /t /f`，并等待终止命令结束。
- macOS/Linux 的长运行进程以独立进程组启动；终止时向进程组发送 `SIGTERM`。
- 等待可配置的优雅退出窗口，超时后才发送 `SIGKILL`。
- 仅在 PID 有效且确认为应用创建的子进程时向负 PID 进程组发信号，不允许触及 Electron 主进程所在组。
- 短时间命令，例如 `java -version`、`which`、Git 查询和哈希验证，不强制创建新进程组。
- 终止是幂等操作，子进程已退出时直接成功。

### 6.3 替换范围

以下文件中的分散 `taskkill`/单进程 `kill` 必须迁移到统一服务：

- `src/main/minecraftRuntime.ts`
- `src/main/headlessMcService.ts`
- `src/main/localServerService.ts`
- `src/main/serverPackCreatorService.ts`
- `src/main/serverPackService.ts`
- `src/main/serverVerificationService.ts`
- `src/main/externalAgents.ts`

不一次性改变这些服务的业务状态机；只统一启动和终止的平台语义。

### 6.4 关闭门禁

`app.quit()` 前建立统一 `shutdownApplication()`：

1. 阻止新任务和新下载进入。
2. 取消 AI 任务和远程连接。
3. 停止 MCP bridge、Minecraft、HeadlessMC 和本地服务端。
4. 等待进程树清理和诊断日志落盘。
5. 总超时后才使用 `app.exit()` 作为最后保底。

当前 750ms 强制退出不足以保证 Java 和 Gradle 进程树清理，需要改为有状态、可记录的关闭流程。

### 6.5 测试

- POSIX CI 创建“父进程 -> 子进程 -> 孙进程” fixture，验证整个进程组被终止。
- 验证先 `SIGTERM`、超时后 `SIGKILL` 的顺序。
- 验证重复终止、无 PID、已退出和权限拒绝时的结果。
- Windows 现有任务取消、Minecraft 停止和 Agent 取消测试必须保持通过。

## 7. 窗口、菜单与应用生命周期

### 7.1 BrowserWindow 平台选项

主窗口和分离窗口必须调用同一个窗口外观辅助函数：

```ts
function platformWindowOptions(): Pick<BrowserWindowConstructorOptions,
  'frame' | 'titleBarStyle' | 'trafficLightPosition'>
```

建议行为：

- Windows/Linux：保留当前 `frame: false` 和右侧自定义控件。
- macOS：使用有系统 frame 能力的 `hiddenInset` 标题栏，显示原生交通灯。
- 主窗口和分离窗口使用一致规则，不让一类窗口仍显示 Windows 控件。
- CSS 为交通灯预留稳定宽度，窄窗口下标题和操作不能与交通灯重叠。

preload 的平台信息就绪前，页面不应先渲染一帧 Windows 窗口按钮再隐藏。可以将平台作为同步 preload 常量暴露，或在 HTML 根元素应用平台 class。

### 7.2 macOS 应用菜单

新增 `applicationMenu.ts`，使用 Electron role 而不是手写系统快捷键：

- App：About ModMind、Settings、Services、Hide、Hide Others、Show All、Quit。
- Edit：Undo、Redo、Cut、Copy、Paste、Paste and Match Style、Delete、Select All。
- View：Reload（仅开发）、Toggle Developer Tools（仅开发）、Enter Full Screen。
- Window：Minimize、Zoom、Front。
- Help：文档和问题反馈入口。

“Settings”通过现有 `app:openSettings` 事件打开主窗口设置。菜单 accelerator 使用 `CommandOrControl`，不在业务代码同时绑定 `Ctrl` 和 `Meta` 产生双重触发。

### 7.3 关闭、Dock 与托盘

macOS 的默认行为：

- 点击红色关闭按钮只关闭或隐藏主窗口，不等同于退出应用。
- Dock 图标被点击或收到 `activate` 时，如果主窗口不存在则重建，存在则显示并聚焦。
- `Cmd+Q` 或菜单 Quit 设置 `quitRequested/allowWindowClose`，进入统一关闭流程。
- Windows 的“关闭到托盘”设置不直接套用到 Mac。Mac 如果保留菜单栏图标，它是独立选项，不是关闭窗口的前提。

macOS 托盘图标必须使用 Template Image，提供 `trayTemplate.png` 和 `trayTemplate@2x.png`，并调用 `nativeImage.setTemplateImage(true)`，以适配浅色/深色菜单栏。

### 7.4 深链时序

使用现有 `pendingDeviceDeepLinks` 作为唯一排队：

- `process.argv`、`second-instance` 和 `open-url` 都调用同一 `enqueueDeviceDeepLink()`。
- `app.whenReady()`、IPC 注册和主窗口创建完成后才消费队列。
- 应用就绪后收到的链接可立即处理。
- 队列设置小型上限并去重，避免外部程序使用深链占用内存或重复启动授权。

### 7.5 验收

- 主窗口和分离窗口都显示原生交通灯，双击标题栏和全屏行为正常。
- 交通灯不覆盖项目标题、账号按钮、模式开关或分离窗口置顶按钮。
- `Cmd+C/V/X/A/Z/Shift+Z/Q/W/M/,` 符合 macOS 预期，Monaco 和普通输入框均可使用。
- 关闭最后一个窗口后应用不退出，点击 Dock 可恢复。
- `Cmd+Q` 不被当前关闭询问逻辑拦截，且退出后不遗留子进程。
- 应用完全未启动时打开 `mcdev://` 能完成授权并显示主窗口。

## 8. 原生依赖和文件权限

### 8.1 必须验证的依赖

| 依赖 | 用途 | macOS 风险 | 验证方式 |
|---|---|---|---|
| `sharp` / `@img/*` | 图像处理 | 原生 Node 模块必须匹配 Electron ABI 和 CPU | 打包后读取、resize 并写入 PNG |
| `ffmpeg-static` | 音频转换 | install 脚本根据当前宿主选择二进制 | 打包后运行 `-version` 和短音频转换 |
| `7zip-bin` | 7z/RAR 归档处理 | asar unpack 路径与执行位需正确 | 打包后创建、列出并解压测试归档 |
| Codex | AI 开发 | 架构、执行位、完整性和 Gatekeeper | 下载后运行 `--version`，再执行最小 Agent 请求 |
| Adoptium JDK | 构建与 Minecraft | `.jdk/Contents/Home`、架构和可执行位 | `java -version`、`javac -version`、Gradle build |

每个打包 job 必须在本架构的 macOS runner 上重新执行 `npm ci`。不能将 Windows 或另一个 Mac 架构的 `node_modules` 作为打包输入缓存恢复。npm 缓存可以共享 tarball，但必须重新运行安装脚本和 native rebuild。

### 8.2 执行位

以下文件在使用前必须确认执行位：

- 创建项目后的 `gradlew`。
- 下载并解压后的 Codex、Java、`javac` 和 `javap`。
- `7zip-bin` 的 macOS `7za`。
- HeadlessMC 交互登录的 `.command` 脚本。

不通过 `chmod -R 777`、禁用 Gatekeeper 或清除隔离属性解决权限问题。

### 8.3 路径和文件系统

所有 macOS 测试至少包含一个带空格和中文的项目路径。必须覆盖：

- APFS 默认大小写不敏感卷。
- CI 中可创建时，附加一个大小写敏感的测试卷，检查资源路径大小写。
- 项目从 Windows 复制到 Mac 后，不使用上一台机器的 Java 绝对路径。
- ZIP/TAR/7z 导入不因 `\` 和 `/` 差异造成越界、重名或文件丢失。
- 文件类型默认使用 `path`、URL 和归档库提供的结构化 API，不使用手写分隔符替换。

## 9. 打包、签名与公证

### 9.1 图标和包元数据

增加：

```text
resources/icon.icns
resources/trayTemplate.png
resources/trayTemplate@2x.png
build/entitlements.mac.plist
build/entitlements.mac.inherit.plist
```

`icon.icns` 使用 1024x1024 源图生成完整 iconset，不仅将当前 512x512 PNG 改名。`package.json` 的 mac 配置至少明确：

- `icon`、`category`、`minimumSystemVersion`。
- `hardenedRuntime: true`。
- 主进程和子组件 entitlements。
- 包含架构的稳定 `artifactName`，防止 `arm64`/`x64` 产物互相覆盖。
- 现有 `mcdev` protocol 继续进入 Info.plist。

Electron JIT 所需权限按 Electron 当前签名要求配置。不默认开启 App Sandbox，也不默认添加 `disable-library-validation`等宽泛权限；只在打包后原生模块验证证明必需时增加，并记录原因。

### 9.2 架构产物

`package.json` 增加独立命令：

```text
dist:mac:arm64
dist:mac:x64
dist:mac:unsigned
dist:mac:release
```

具体命令可由 electron-builder CLI 或显式 target/arch 配置实现，但必须满足：

- `arm64` 产物只包含 arm64 的 Electron 和原生依赖。
- `x64` 产物只包含 x64 的 Electron 和原生依赖。
- 产物名包含 `${version}` 和 `${arch}`。
- 任一架构不完整时，发布 job 整体失败，不用 Rosetta 产物假冒本机产物。

### 9.3 签名

正式发布使用 `Developer ID Application` 证书。CI 通过临时 keychain 导入证书，构建后删除 keychain。密钥只存放在受保护的 CI environment/secrets 中，不得：

- 提交 `.p12`、API key、Apple ID 密码或 app-specific password。
- 在日志中输出 base64 证书或 keychain 密码。
- 在来自 fork 的 PR 上开放签名密钥。
- 对日常未签名测试包伪造“可正式发布”标记。

### 9.4 公证

使用 electron-builder 当前支持的 notarization 流程或 `@electron/notarize`，两者只选一套作为主路径。使用 App Store Connect API key 时，密钥文件必须临时创建并在 job 结束时清理。

发布顺序：

```text
npm ci on target architecture
  -> typecheck/test/build
  -> package .app
  -> codesign app and nested binaries
  -> submit notarization
  -> wait for Accepted
  -> staple ticket
  -> create/sign DMG and ZIP
  -> verify artifacts
  -> generate SHA256SUMS.txt
  -> upload release artifacts
```

如果具体工具要求先生成 DMG 再公证，可以调整包装步骤，但最终 DMG 和其中 `.app` 都必须通过验证，不只检查 CI 命令退出码。

### 9.5 发布验证脚本

将 `scripts/verify-release.mjs` 从固定 Windows 文件名改为平台感知的验证器，或拆分为共享哈希层与平台验证层。macOS 正式产物必须执行：

```text
codesign --verify --deep --strict --verbose=2 <app>
codesign -dv --verbose=4 <app>
spctl --assess --type execute --verbose=4 <app>
xcrun stapler validate <app-or-dmg>
file <app-main-executable>
```

脚本检查：

- DMG 和 ZIP 都存在，文件大小合理。
- 产物版本与 `package.json` 一致。
- 主可执行文件架构与产物名一致。
- 签名身份、Team ID、Hardened Runtime 和公证票据符合发布策略。
- 签名后没有二次修改 `.app` 内文件。
- 为每个产物生成 SHA-256，`SHA256SUMS.txt` 使用稳定排序。

未签名测试包可通过 `--allow-unsigned`类似标志跳过签名和公证断言，但仍必须检查文件、版本、架构和哈希。

## 10. CI/CD 改造

### 10.1 验证工作流

保留当前 macOS 验证工作流，但拆分为架构清晰的 job。每个 job 开始时输出并检查：

```text
node -p "process.platform + '-' + process.arch"
uname -m
sw_vers
```

runner label 必须在当前 GitHub 组织/套餐中实际验证，不仅根据 `macos-14` 名称推断 CPU 架构。

PR 和 `main` 分支的工作流执行：

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. 对当前架构生成未签名 DMG/ZIP
6. 执行未签名产物结构验证和原生依赖 smoke test
7. 上传标记为 `unsigned-test-only` 的短保留期 artifact

### 10.2 发布工作流

新增独立 release workflow，只允许：

- 版本 tag 或带受保护 environment 审批的手工触发。
- 从已验证 commit 构建，不接受未记录的工作区内容。
- 在目标架构 runner 中重新安装依赖并打包。
- 签名、公证、staple 和发布校验全部成功后才上传正式产物。
- `arm64` 或 `x64` 任一 job 失败时，不发布一个缺架构但未标注的版本。

### 10.3 缓存

- npm 下载缓存可按 lockfile 使用。
- `node_modules`、`out`、`release-macos` 和下载后的 Codex/JDK 运行时不跨架构缓存。
- Electron 和 electron-builder 缓存 key 包含 OS、arch 和版本。
- 签名后 `.app` 不作为下一次构建的可变输入缓存。

## 11. 测试策略

### 11.1 单元测试

必须补充：

- Codex 平台/架构 descriptor、缓存目录和错误分支。
- POSIX 脚本参数编码与命令注入防护。
- 窗口平台选项和渲染层控件可见性。
- 关闭行为选择，确保 macOS 不进入 Windows 托盘询问。
- 深链排队、去重、就绪前保留和就绪后消费。
- 产物命名、架构判断和 SHA-256 结果。

### 11.2 macOS 集成测试

只有 macOS 能给出有意义结果的测试使用条件运行，不在 Windows 上伪造通过：

- 下载并运行当前架构 Codex。
- 下载 Adoptium JDK，验证 `.jdk/Contents/Home`。
- 在包含空格和中文的路径运行 `./gradlew build`。
- 启动长运行父子进程，取消后确认不再存活。
- 通过 `open-url` 冷启动应用并检查授权页状态。
- 打开和关闭 HeadlessMC 登录终端，检查临时脚本权限和清理。

需要真实 Minecraft/Microsoft 账号的登录测试不在普通 PR CI 运行，只在受保护的手工验收环境中执行。

### 11.3 打包后 smoke test

测试对象必须是 `.app` 内的实际文件，不是仓库 `node_modules` 中的开发版依赖。至少检查：

1. `.app` 主进程启动并创建窗口。
2. preload 正常注入，渲染层不含 Node 权限。
3. Blockbench 和 miniPaint 附带资源能加载。
4. Sharp 完成一次图像处理。
5. FFmpeg 完成一次短音频转换。
6. 7-Zip 完成一次归档列表和解压。
7. 创建项目后 `gradlew` 有执行位。
8. 诊断日志包含平台、架构、应用版本和 Electron 版本。

### 11.4 手工回归矩阵

| 场景 | Apple Silicon | Intel | 签名 DMG 必测 |
|---|---:|---:|---:|
| 拖入 Applications 并首次启动 | 是 | 是 | 是 |
| 完全未启动时打开 `mcdev://` | 是 | 是 | 是 |
| 创建 Fabric/Forge/NeoForge 项目 | 是 | 是 | 是 |
| 托管 JDK 下载与 Gradle 构建 | 是 | 是 | 是 |
| Codex 自动准备与最小任务 | 是 | 是 | 是 |
| Minecraft 客户端/服务端启动与停止 | 是 | 是 | 是 |
| HeadlessMC 交互登录 | 是 | 是 | 是 |
| Blockbench/图像/音频 | 是 | 是 | 是 |
| 分离窗口、全屏、Dock 重开 | 是 | 是 | 是 |
| `Cmd+Q` 清理所有任务 | 是 | 是 | 是 |

正式发布前至少在当前最新 macOS 和上一个主版本各完成一次关键流程。最低支持系统如无长期实机，可在每个稳定版发布前做一次专项验收。

## 12. 分阶段实施计划

### 阶段 0：固结基线

| 任务 | 内容 | 完成标准 |
|---|---|---|
| MAC-001 | 在当前 macOS CI 中记录 OS/arch，保留一份未签名基线产物 | CI 清晰显示实际架构，DMG/ZIP 可下载 |
| MAC-002 | 建立 macOS 功能验收清单和已知失败记录 | 每个核心功能有可重复步骤和诊断日志 |
| MAC-003 | 在 Windows 上运行当前 typecheck/test/build 作为回归基线 | 后续每个阶段可比较 Windows 回归 |

### 阶段 1：核心功能对等

| 任务 | 内容 | 依赖 | 完成标准 |
|---|---|---|---|
| MAC-101 | 实现 Codex runtime descriptor 和 Mac 下载 | 官方产物元数据 | arm64/x64 均能校验、解压、探测和缓存 |
| MAC-102 | 扩展外部 Agent 可执行文件检测 | MAC-101 | 支持 `/opt/homebrew/bin`、`/usr/local/bin`、用户 npm/bin 和显式路径 |
| MAC-103 | 实现 macOS HeadlessMC 交互终端 | `nativeTerminal.ts` | 无需手工拼接命令即可启动登录 |
| MAC-104 | 对 JDK、Gradle、FFmpeg、7-Zip、Sharp 做本机和打包后 smoke test | macOS runner | 五项原生能力在 `.app` 中通过 |

### 阶段 2：进程与生命周期

| 任务 | 内容 | 依赖 | 完成标准 |
|---|---|---|---|
| MAC-201 | 新增跨平台 `processTree` | POSIX 集成测试 | 父子孙进程可优雅停止并超时强制结束 |
| MAC-202 | 迁移 Minecraft/Server/HeadlessMC/Agent 停止逻辑 | MAC-201 | 相关服务不再自行调用 `taskkill` |
| MAC-203 | 实现可等待的统一应用关闭 | MAC-201/202 | `Cmd+Q` 后无 Java、Gradle、Minecraft 和 Agent 遗留 |
| MAC-204 | 统一深链排队 | 无 | 冷启动和热启动 `mcdev://` 均只处理一次 |

### 阶段 3：macOS 桌面体验

| 任务 | 内容 | 依赖 | 完成标准 |
|---|---|---|---|
| MAC-301 | 暴露只读平台信息 | shared/preload | renderer 不再使用 `navigator.platform` 决定行为 |
| MAC-302 | 改造主窗口和分离窗口 | MAC-301 | Mac 使用原生交通灯，Windows UI 不变 |
| MAC-303 | 增加应用菜单和快捷键 | MAC-301 | 标准 Edit/Window/App role 全部可用 |
| MAC-304 | 分平台处理关闭、Dock 和托盘 | MAC-203/301 | 红色关闭、Dock 恢复和 Quit 语义正确 |
| MAC-305 | 增加 ICNS 和 Template Image | 设计资产 | Finder、Dock、DMG 和菜单栏显示清晰 |

### 阶段 4：双架构正式发布

| 任务 | 内容 | 依赖 | 完成标准 |
|---|---|---|---|
| MAC-401 | 拆分 arm64/x64 打包命令和 CI job | 对应架构 runner | 产物名和实际主程序架构一致 |
| MAC-402 | 配置 Hardened Runtime 和 entitlements | 签名证书 | `.app` 及嵌套二进制签名校验通过 |
| MAC-403 | 接入 Apple notarization 和 staple | 受保护凭据 | `notarytool` 返回 Accepted，本机断网验证票据 |
| MAC-404 | 扩展发布验证与 SHA-256 清单 | MAC-401/402/403 | 错架构、签名失效、无票据均能使 CI 失败 |
| MAC-405 | 完成双架构实机回归 | 所有上述任务 | 手工回归矩阵全部通过 |

### 阶段 5：发布后稳定性

| 任务 | 内容 | 完成标准 |
|---|---|---|
| MAC-501 | 对诊断包增加架构、签名状态和原生工具版本摘要 | 用户不需要手工运行终端命令即可提交有用诊断 |
| MAC-502 | 建立 macOS 缺陷分类 | 可按 Gatekeeper/架构/权限/路径/进程/图形分析失败 |
| MAC-503 | 连续两个 beta 版本观察启动、构建、AI 和 Minecraft 测试失败率 | 不存在系统性 Mac-only 阻断后转稳定发布 |

## 13. 预期文件变更

| 文件 | 预期变更 |
|---|---|
| `src/main/codexSetup.ts` | runtime descriptor、Mac 下载、目标缓存、执行位和版本探测 |
| `src/main/codexSetup.test.ts` | 目标矩阵、失败保护和 POSIX 权限测试 |
| `src/main/runtimeTarget.ts` | 新增可测试平台/架构解析 |
| `src/main/nativeTerminal.ts` | 新增系统终端启动与安全参数处理 |
| `src/main/processTree.ts` | 新增跨平台进程树终止 |
| `src/main/applicationMenu.ts` | 新增 Electron 应用菜单 |
| `src/main/headlessMcService.ts` | 改用 `nativeTerminal` 和 `processTree` |
| `src/main/minecraftRuntime.ts` | 改用 `processTree`，保留 Unix Wrapper/JDK 逻辑 |
| `src/main/*Server*.ts` | 迁移进程终止逻辑 |
| `src/main/externalAgents.ts` | 迁移进程终止，补充 Homebrew/npm 路径检测 |
| `src/main/index.ts` | 窗口选项、macOS 生命周期、深链排队、菜单和统一关闭 |
| `src/preload/index.ts` | 暴露只读平台信息 |
| `src/shared/platform.ts` / `types.ts` | 平台信息类型与 API 约束 |
| `src/renderer/src/App.tsx` | 按平台显示窗口控件和文本 |
| `src/renderer/src/styles.css` | 交通灯安全区、Mac 标题栏和窄窗口约束 |
| `package.json` | macOS 双架构命令、artifactName、ICNS、Hardened Runtime 和 entitlements |
| `.github/workflows/build-macos.yml` | 架构明确的未签名验证 |
| `.github/workflows/release-macos.yml` | 新增受保护的签名与公证发布 |
| `scripts/verify-release.mjs` | 跨平台产物发现、Mac 签名/公证/架构校验 |
| `resources/icon.icns` | 新增 macOS 应用图标 |
| `resources/trayTemplate*.png` | 新增 macOS 菜单栏 Template Image |
| `build/entitlements.mac*.plist` | 新增 macOS 签名权限 |

## 14. 风险与回退

### 14.1 原生依赖架构错配

风险：打包成功不代表 Sharp、FFmpeg 或 7-Zip 与主程序同架构。

防护：架构专用 runner、每 job `npm ci`、打包后 smoke test 和 `file` 校验。

回退：暂停有问题架构的正式标记，明确保留另一架构的独立下载标签，不用重命名的错架构包替代。

### 14.2 签名后运行时失败

风险：Hardened Runtime 或嵌套二进制签名顺序导致启动后才崩溃。

防护：对签名后而非仅未签名 `.app` 执行原生功能 smoke test，并验证嵌套签名链。

回退：保留上一个已公证版本，不用未签名修复包覆盖公开下载。

### 14.3 进程组误杀

风险：POSIX 负 PID 信号使用错误时可能影响主进程或无关进程。

防护：只管理由封装层启动并记录的独立进程组，严格检查 PID，在真实 POSIX 子进程 fixture 上测试。

回退：将某类服务回退为只终止直接子进程，同时保留诊断，不关闭整个进程终止安全检查。

### 14.4 Codex 产物变化

风险：版本升级后包名、目录或哈希改变。

防护：目标 descriptor 与版本同一 PR 更新，CI 解包并运行 `--version`，不通过模糊搜索选择第一个可执行文件。

回退：保留上一个已验证运行时缓存，下载失败时不原子替换正式目录。

## 15. 完成定义

macOS 适配只有在以下条件全部满足时才可标记完成：

- `arm64` 和 `x64` 使用各自架构的 macOS 环境安装依赖并打包。
- 两个架构的 DMG/ZIP 均通过版本、架构、签名、Hardened Runtime、公证票据和 SHA-256 验证。
- 从 DMG 拖入 Applications 后，首次启动不需要右键打开、关闭 Gatekeeper 或执行 `xattr`。
- Codex 能在两个架构上自动下载、校验、配置和执行最小 AI 任务。
- HeadlessMC 能打开 macOS Terminal 进入交互登录，不要求用户手动定位 launcher。
- 创建项目、托管 JDK、Gradle 构建、Minecraft 启动/停止、本地服务端和核心内容工具通过实机验收。
- 窗口交通灯、标准菜单、`Cmd` 快捷键、Dock 重开和 `Cmd+Q` 行为符合 macOS 预期。
- 任务取消和应用退出后没有由 ModMind 启动的 Java、Gradle、Minecraft、HeadlessMC 或 Agent 进程遗留。
- 冷启动和热启动的 `mcdev://` 深链均能正确处理。
- Windows 的 typecheck、全量测试、构建、未签名打包与主要功能回归继续通过。

## 16. 开发与发布命令基线

实施前可使用当前命令：

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

macOS 实施后应形成对应命令，名称以最终 `package.json` 为准：

```bash
npm run typecheck
npm test
npm run build
npm run dist:mac:unsigned
npm run dist:mac:arm64
npm run dist:mac:x64
npm run verify:release -- --platform mac --arch arm64
npm run verify:release -- --platform mac --arch x64
```

正式发布不以本地命令输出作为唯一证据，必须由受保护 CI workflow 记录签名、公证、验证和产物哈希。
