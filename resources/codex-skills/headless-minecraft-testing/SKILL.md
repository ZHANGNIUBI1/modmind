---
name: headless-minecraft-testing
description: Plan, implement, run, or diagnose headless Minecraft Java Edition smoke tests for mods. Use when a task mentions HeadlessMC, no-display launches, CI client/server startup verification, automated loader smoke tests, isolated game directories, process timeouts, or headless crash-log diagnosis.
---

# Headless Minecraft Testing

Use HeadlessMC or another headless launcher when it provides better automation than the existing ModMind runtime.

## Choose the path

1. Inspect the project loader, Minecraft version, Java version, test APIs, and CI environment.
2. Check whether the repository already implements a headless backend and reuse it when practical.
3. Select a client, server, or GameTest smoke test that exercises the changed behavior.
4. Build the mod and inspect the produced JAR before launching when packaging is part of the diagnosis.
5. Choose authentication, game directories, artifact acquisition, timeouts, and process management appropriate to the user's environment.

Read [references/integration-assessment.md](references/integration-assessment.md) for ModMind's current runtime boundaries and possible integration points.

## Capture useful evidence

- Launcher command and environment assumptions
- Minecraft, loader, Java, and mod versions
- stdout, stderr, exit code, timeout state, game log, and crash report
- Ready-line or server-ready evidence
- Deepest relevant `Caused by` entry and first project-owned stack frame

Use the evidence to repair the failure, rerun the same smoke test, and state where interactive testing remains useful for visual or player-driven behavior.
