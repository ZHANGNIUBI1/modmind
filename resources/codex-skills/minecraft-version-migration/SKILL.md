---
name: minecraft-version-migration
description: Migrate Minecraft mods between game versions, mappings, Java versions, Gradle/plugin versions, or Fabric, Quilt, Forge, and NeoForge loaders. Use for porting, loader conversion, dependency upgrades, metadata changes, API replacements, and migration-related build or runtime failures.
---

# Minecraft Version Migration

Treat migration as a sequence of compatibility layers so failures stay attributable.

## Workflow

1. Record the source and target matrix: Minecraft, loader, loader API, mappings, Java, Gradle, build plugin, and important dependencies.
2. Create a recoverable checkpoint and inspect current entrypoints, metadata, mixins, access rules, networking, registries, rendering, data generation, and resources.
3. Update the build toolchain and project metadata first, then resolve dependencies for the target matrix.
4. Compile to expose API changes. Use exact target-version mappings and class inspection instead of relying on similarly named APIs from another version.
5. Migrate by subsystem: initialization/registration, data components or persistence, networking, events, world generation, rendering, mixins, and data/resources.
6. Run focused checks between subsystems and use the target loader's native patterns where they simplify the result.
7. Build the distributable JAR and launch the target environment. Exercise save loading or data migration when persistent state changed.
8. Summarize behavioral differences, compatibility decisions, and anything intentionally left source-version-specific.

## Loader Conversion

Separate portable gameplay logic from loader integration before replacing lifecycle, event, capability/component, networking, and client registration code. Reuse a project abstraction only when it is simpler than direct target-loader APIs.
