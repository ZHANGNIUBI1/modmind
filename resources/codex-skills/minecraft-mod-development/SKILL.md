---
name: minecraft-mod-development
description: Implement complete Minecraft Java Edition mod features across Fabric, Quilt, Forge, and NeoForge. Use for new items, blocks, entities, screens, networking, world generation, commands, gameplay systems, data packs, registrations, ordinary dependencies, or cross-cutting feature work in a Java mod project.
---

# Minecraft Mod Development

Build the feature as a coherent slice across code, registration, data, resources, and user-visible behavior.

## Workflow

1. Identify the loader, Minecraft version, mappings, Java version, entrypoints, and existing project conventions.
2. Trace the closest existing feature before choosing APIs or structure.
3. Convert the request into observable behavior and identify every affected layer: registration, logic, networking, persistence, assets, recipes, tags, loot, localization, and compatibility.
4. Check exact-version mappings or bytecode when an API name, signature, or lifecycle is uncertain. ModMind mapping tools are useful for this.
5. Implement in vertical slices. Route managed dependencies, third-party Mod integrations, assets, and verification through the matching ModMind workflows below.
6. Run the most informative check at each stage: focused compilation, data generation, unit/GameTest, full build, or Minecraft launch.
7. Inspect the produced JAR and runtime logs when packaging or startup behavior matters.
8. Summarize the implemented behavior, important files, verification performed, and remaining manual gameplay checks.

Use `modmind_set_intent` to mark a coding request as engineering work and `modmind_update_todo` to publish a small progress list when the task has multiple dependent slices. Use `modmind_apply_edits` for exact project-relative text edits when it is more reliable than a native editor operation; existing files require an exact single `oldText` match. Use `modmind_rename_project` only for an explicit project rename, passing the intended display name and namespace together so project-owned references migrate coherently.

## Loader Awareness

- Follow the active loader's registration and lifecycle model rather than translating another loader mechanically.
- Keep client-only classes behind the loader's client boundary.
- Match mixin configuration, access wideners/transformers, networking, data generation, and metadata to the exact loader/version.
- Prefer the project's existing compatibility abstractions when they already solve the problem.

## ModMind Integrations

Use `modmind_project_info` and `modmind_project_files` for project context when available.

- Use `modmind_mapping_search` and `modmind_mapping_class` for exact-version Minecraft APIs.
- Use `modmind_dependency_search` and `modmind_dependency_install` for an ordinary compatible Modrinth library or mod dependency.
- Use `modmind_maven_dependency_install` for an ordinary Maven coordinate. Do not hand-edit managed Gradle dependency blocks when this tool applies.
- Invoke `$minecraft-addon-development` and its `modmind_addon_*` tools when the feature extends another mod. Add-on targets are not ordinary dependencies.
- Invoke `$minecraft-content-assets` for coordinated data and resource work, `$modmind-blockbench-modeling` for nontrivial editable models, and `$modmind-image-assets` for generated raster assets.
- Run `modmind_validate_content`, then choose focused `modmind_test_matrix` targets. Use `modmind_build_project` for the final artifact and `modmind_test_minecraft` when startup evidence matters.
- Invoke `$minecraft-release` for a release candidate instead of treating a successful build as release readiness.

Use native file and shell tools only for capabilities the managed integrations do not cover, or after the matching managed operation returns an actual failure.
