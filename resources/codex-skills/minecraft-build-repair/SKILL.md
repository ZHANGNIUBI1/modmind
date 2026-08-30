---
name: minecraft-build-repair
description: Diagnose and repair Minecraft mod Gradle, compilation, packaging, data-generation, launch, mixin, registry, and runtime failures. Use when builds fail, the game crashes, a mod JAR is invalid, mappings changed, dependencies conflict, or a previous repair did not resolve the same error.
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

## Useful Evidence

- Gradle task and dependency reports
- Full compiler diagnostics
- Loader and mixin logs
- `latest.log`, crash report, and first project-owned stack frame
- Contents and size of the built JAR
- Loader descriptor, entrypoints, refmaps, access wideners, and generated resources
