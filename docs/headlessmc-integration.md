# HeadlessMC integration assessment

Assessment date: 2026-07-30
Upstream: https://github.com/headlesshq/headlessmc
Latest inspected release: `2.10.0`
License: MIT (the repository itself; bundled dependencies have separate licenses)

## What it provides

HeadlessMC is a Java command-line launcher for Minecraft Java Edition. It can manage
clients and servers, install loader runtimes, and launch a client without a display by
patching LWJGL. The upstream README documents Fabric, Forge, and NeoForge server support,
and client commands such as `launch fabric:1.21.4 -lwjgl`. It also provides a command/test
framework that can wait for log output and send commands to a running process.

The project requires an authenticated Minecraft account for normal launches. Its README
allows offline accounts only for headless CI scenarios; it is not an authentication bypass.
The launcher itself runs on Java 8+, but the Minecraft process still needs the Java version
required by the selected Minecraft release. The published Docker image advertises Java 8,
17, and 21, so Minecraft 26.2/Java 25 would require an explicitly configured runtime.

## ModMind integration

ModMind exposes HeadlessMC as an optional external verification engine for Fabric, Forge,
and NeoForge projects:

1. ModMind performs the existing Gradle build and validates the output JAR.
2. On first use, ModMind downloads the official `2.10.0` launcher JAR and verifies the
   GitHub release SHA-256 before caching it in application data.
3. ModMind starts HeadlessMC as a child process with a project-local
   `.modmind/headlessmc/game` directory, per-run transcript, and the managed Java runtime.
4. The launcher receives the documented `launch <loader>:<version> -lwjgl` command and the
   test passes only after launch evidence is observed and the process remains stable for 20
   seconds. Cancellation kills the process tree.
5. Minecraft authentication remains inside HeadlessMC's own configuration. The app can open
   its official login console but never reads or stores account credentials.

This is a good fit for repeatable client startup smoke tests. It is not a replacement
for the current `MinecraftRuntimeManager`: ModMind still needs its managed Java downloads,
Fabric/Quilt API installation, mod synchronization, Electron progress events, and existing
interactive test profile. HeadlessMC's in-memory wrapper mode remains a poor Electron
integration boundary because it relies on Java classloaders and process-exit handling; the
implementation uses the CLI child process instead.

Quilt client support is not established by the upstream documentation inspected here. Keep
the first integration limited to Fabric, Forge, and NeoForge, and require an explicit
capability check before offering any other loader.

## Security and distribution requirements

- Treat the launcher and every mod JAR as executable third-party code. Reuse ModMind's build
  trust prompt and require an explicit user action before starting it.
- Never pass account tokens or secrets on the command line. Use HeadlessMC's own config and
  authentication flow, and isolate its game directory per project.
- Pin a release, verify its SHA-256, and keep the upstream MIT license and dependency notices.
  ModMind currently downloads but does not bundle HeadlessMC.
- Keep a process timeout and kill the complete process tree on cancellation. Do not allow a
  project-provided Gradle script or mod to choose an arbitrary HeadlessMC executable path.

## Recommendation

Use HeadlessMC as an optional external-process backend for the `无头冒烟` action in the
Minecraft test workspace. It is additive to the existing interactive runtime. Quilt remains
disabled pending an upstream compatibility confirmation, and server-ready command-test
profiles remain a follow-up because their loader/mod packaging needs its own verification
matrix.
