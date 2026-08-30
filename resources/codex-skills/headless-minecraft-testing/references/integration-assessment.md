# HeadlessMC Integration Assessment

Assessment date: 2026-07-30

Upstream: https://github.com/headlesshq/headlessmc

Inspected release: `2.10.0`

License: MIT for the upstream repository; bundled dependencies have separate licenses.

## Capabilities

HeadlessMC is a Java command-line launcher for Minecraft Java Edition. It manages clients and servers, installs loader runtimes, and can launch a client without a display by patching LWJGL. Its command/test framework can wait for log output and send commands to a running process.

Normal launches require an authenticated Minecraft account. Offline accounts are permitted by upstream only for headless CI scenarios and are not an authentication bypass. The launcher runs on Java 8+, but each Minecraft process still requires the Java version associated with that Minecraft release. The published image advertises Java 8, 17, and 21; newer Minecraft versions can require an explicitly configured newer runtime.

## ModMind Fit

ModMind implements HeadlessMC as an additive external verification engine for Fabric, Forge,
and NeoForge client startup smoke tests:

1. Run the existing Gradle build and validate the output JAR.
2. Download the pinned official launcher JAR at first use and verify its SHA-256 digest.
3. Start the CLI with a project-local game directory and log directory.
4. Stream stdout and stderr, enforce a stable launch window, retain the transcript, and kill
   the process tree on cancellation.
5. Keep Minecraft authentication in HeadlessMC's own configuration; never pass account tokens
   through ModMind.

`MinecraftRuntimeManager` currently owns managed Java downloads, loader API installation, mod synchronization, Electron progress events, and the existing offline test profile. Compare an additive backend, a replacement, and direct CLI integration against those responsibilities. A child-process CLI boundary is usually easier to operate than the in-memory wrapper because Java classloaders and process-exit behavior otherwise share the Electron process.

Upstream documentation establishes Fabric, Forge, and NeoForge support. Quilt client support is not established. Require an explicit capability check before offering other loaders.

## Security and Distribution

- Treat the launcher and every mod JAR as executable third-party code.
- Prefer ModMind-managed build and runtime tools when they cover the task, then use native commands or HeadlessMC for missing capabilities.
- Prefer HeadlessMC's protected configuration or authentication flow for credentials.
- Isolate game data per project.
- Pin a release, verify SHA-256, and retain upstream license notices when bundling artifacts.
- Kill the complete process tree on timeout or cancellation.
- Make the HeadlessMC executable and version explicit in reproducible automation.

The current ModMind distribution does not bundle HeadlessMC; it downloads the verified pinned
launcher to application data when a user invokes the smoke test. Distinguish an actual headless
run from a planned or failed download in the reported evidence.
