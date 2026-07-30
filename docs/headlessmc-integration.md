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

## Fit for ModMind

HeadlessMC can be used in ModMind as an optional external verification engine:

1. ModMind performs the existing Gradle build and validates the output JAR.
2. A user explicitly enables HeadlessMC and selects a pinned launcher binary or JAR.
3. ModMind starts HeadlessMC as a child process with a project-local `hmc.gamedir`, a
   per-project log directory, and the selected loader/version.
4. ModMind streams stdout/stderr, applies a timeout, and reports the exit code and test
   transcript. A future test profile can use HeadlessMC's command test file to wait for a
   server-ready line and send `stop`.

This is a good fit for CI and repeatable server/client smoke tests. It is not a replacement
for the current `MinecraftRuntimeManager`: ModMind still needs its managed Java downloads,
Fabric/Quilt API installation, mod synchronization, Electron progress events, and existing
offline test profile. HeadlessMC's in-memory wrapper mode is also a poor Electron integration
boundary because it relies on Java classloaders and process-exit handling; use the CLI child
process instead.

Quilt client support is not established by the upstream documentation inspected here. Keep
the first integration limited to Fabric, Forge, and NeoForge, and require an explicit
capability check before offering any other loader.

## Security and distribution requirements

- Treat the launcher and every mod JAR as executable third-party code. Reuse ModMind's build
  trust prompt and require an explicit user action before starting it.
- Never pass account tokens or secrets on the command line. Use HeadlessMC's own config and
  authentication flow, and isolate its game directory per project.
- Pin a release, verify its SHA-256, and keep the upstream MIT license and dependency notices
  if a binary is ever bundled. The current ModMind distribution does not bundle HeadlessMC.
- Keep a process timeout and kill the complete process tree on cancellation. Do not allow a
  project-provided Gradle script or mod to choose an arbitrary HeadlessMC executable path.

## Recommendation

Use HeadlessMC as an optional, external-process backend for a future `headless smoke test`
action. Do not embed it in the application yet: the current runtime already covers the
interactive workflow, and a safe integration needs a pinned artifact, capability detection,
process-tree cancellation, per-project authentication/config handling, and an end-to-end
test on Windows and Linux. The project is technically usable, but it should be an additive
verification feature rather than a replacement for the existing runtime.
