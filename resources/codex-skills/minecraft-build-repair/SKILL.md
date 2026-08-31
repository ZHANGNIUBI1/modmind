---
name: minecraft-build-repair
description: Diagnose and repair Minecraft mod Gradle, Java runtime selection, compilation, packaging, data-generation, launch, mixin, registry, dependency, and runtime failures. Use when builds fail, the game crashes, a JDK is incompatible, a mod JAR is invalid, mappings changed, dependencies conflict, or a previous repair did not resolve the same error.
---

# Minecraft Build Repair

Find the first causal failure, repair it, and use the next run to test the diagnosis rather than repeating speculative edits.

## Workflow

1. Reproduce the smallest useful failing command and retain its complete output.
2. Classify the failure layer: toolchain, dependency resolution, Java compilation, resources/data, packaging, loader bootstrap, mixin application, registration, or gameplay runtime.
3. For compiler failures, start with the first project-owned error. For crashes, start with the deepest relevant `Caused by` and first project-owned frame.
4. Confirm the project's exact Minecraft, loader, mappings, Java, Gradle, and plugin versions.
5. Inspect the referenced API with mapping or class tools when signatures are uncertain.
6. Make the smallest coherent repair, including paired metadata/resource changes when needed.
7. Rerun the focused failing check. Escalate to a full build or Minecraft launch after the focused failure clears.
8. If the same failure remains, revise the diagnosis before changing more code.
9. Report the root cause, repair, evidence, and any environment issue that remains outside the source tree.

## Managed Diagnostic Path

- Use `modmind_test_matrix` for the smallest relevant build, client, server, or GameTest reproduction. Use `modmind_build_project` for managed artifact diagnostics and `modmind_test_minecraft` for isolated startup evidence.
- Read `modmind_runtime_state` after a managed launch to correlate the latest phase, events, timeout, and failure rather than guessing from a stale log.
- Use `modmind_mapping_search` and `modmind_mapping_class` when the first causal error is an exact-version Minecraft API mismatch.
- Route ordinary Modrinth dependencies through `modmind_dependency_search` and `modmind_dependency_install`, Maven coordinates through `modmind_maven_dependency_install`, and third-party Mod extensions through `$minecraft-addon-development`.

## Java Runtime Repair

Change Java preferences only when evidence identifies a runtime or toolchain mismatch.

1. Call `modmind_get_app_settings` and inspect separate `game`, `build`, and `tools` Java preferences.
2. Call `modmind_scan_java_homes` to discover candidates, then `modmind_probe_java_home` for the exact path under consideration.
3. Compare the probed major version with the active Minecraft, Loader, Gradle, and plugin requirements from the project and error output.
4. Call `modmind_set_app_setting` with `key: javaPreferences` and change only the affected lane. Preserve the other lane values. An empty lane restores ModMind automatic management.
5. Re-read settings and rerun the same failing managed check.

Do not set all three lanes to the newest JDK, accept an invalid probe, or claim repair before the original failure clears.

## Useful Evidence

- Gradle task and dependency reports
- Full compiler diagnostics
- Loader and mixin logs
- `latest.log`, crash report, and first project-owned stack frame
- Contents and size of the built JAR
- Loader descriptor, entrypoints, refmaps, access wideners, and generated resources
