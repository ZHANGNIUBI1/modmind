---
name: minecraft-mod-development
description: Implement complete Minecraft Java Edition mod features across Fabric, Quilt, Forge, and NeoForge. Use for new items, blocks, entities, screens, networking, world generation, commands, gameplay systems, data packs, registrations, or cross-cutting feature work in a mod project.
---

# Minecraft Mod Development

Build the feature as a coherent slice across code, registration, data, resources, and user-visible behavior.

## Workflow

1. Identify the loader, Minecraft version, mappings, Java version, entrypoints, and existing project conventions.
2. Trace the closest existing feature before choosing APIs or structure.
3. Convert the request into observable behavior and identify every affected layer: registration, logic, networking, persistence, assets, recipes, tags, loot, localization, and compatibility.
4. Check exact-version mappings or bytecode when an API name, signature, or lifecycle is uncertain. ModMind mapping tools are useful for this.
5. Implement in vertical slices. Prefer ModMind editing, mapping, dependency, build, test, Blockbench, and progress tools where they apply; use native file and shell tools for missing capabilities.
6. Run the most informative check at each stage: focused compilation, data generation, unit/GameTest, full build, or Minecraft launch.
7. Inspect the produced JAR and runtime logs when packaging or startup behavior matters.
8. Summarize the implemented behavior, important files, verification performed, and remaining manual gameplay checks.

## Loader Awareness

- Follow the active loader's registration and lifecycle model rather than translating another loader mechanically.
- Keep client-only classes behind the loader's client boundary.
- Match mixin configuration, access wideners/transformers, networking, data generation, and metadata to the exact loader/version.
- Prefer the project's existing compatibility abstractions when they already solve the problem.

## ModMind Integrations

Start with `modmind_mapping_search` and `modmind_mapping_class` for exact-version APIs, dependency tools for compatible Modrinth artifacts, Blockbench actions for editable models and textures, and managed build/test tools. Fall back to native commands when the integration does not cover the task.
