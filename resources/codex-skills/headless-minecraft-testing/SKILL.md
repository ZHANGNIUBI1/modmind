---
name: headless-minecraft-testing
description: Plan, run, or diagnose managed and external headless Minecraft Java Edition smoke tests for mods. Use when a task mentions HeadlessMC, no-display launches, ModMind isolated client/server/GameTest verification, automated Loader smoke tests, isolated game directories, process timeouts, or headless crash-log diagnosis.
---

# Headless Minecraft Testing

Prefer ModMind's managed isolated verification when it covers the requested check. Use an external HeadlessMC workflow only for a missing capability or an explicitly external CI setup.

## Choose the path

1. Inspect the project loader, Minecraft version, Java version, test APIs, and CI environment.
2. Check whether ModMind or the repository already implements the needed headless backend and reuse it.
3. Select a build, client, server, or GameTest target that exercises the changed behavior.
4. Build the mod and inspect the produced JAR before launching when packaging is part of the diagnosis.
5. Choose authentication, game directories, artifact acquisition, timeouts, and process management appropriate to the user's environment.

Read [references/integration-assessment.md](references/integration-assessment.md) for ModMind's current runtime boundaries and possible integration points.

## ModMind Route

- Use `modmind_test_matrix` when selecting explicit build, client, server, or GameTest targets.
- Use `modmind_test_minecraft` for the managed isolated startup workflow.
- Read `modmind_runtime_state` after launch, timeout, cancellation, or failure to capture current events and avoid stale conclusions.
- Invoke `$minecraft-server-pack-testing` for modpack server construction, actual HeadlessMC join verification, or bounded console scenarios. Those tools provide stronger evidence than a generic mod smoke test.

Only fall back to native HeadlessMC commands after the matching managed path is unavailable or fails, and preserve the managed failure in the report.

## Capture useful evidence

- Launcher command and environment assumptions
- Minecraft, loader, Java, and mod versions
- stdout, stderr, exit code, timeout state, game log, and crash report
- Ready-line or server-ready evidence
- Deepest relevant `Caused by` entry and first project-owned stack frame

Use the evidence to repair the failure, rerun the same smoke test, and state where interactive testing remains useful for visual or player-driven behavior.
