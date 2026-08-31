# ModMind Blockbench Tool Routing

Use this reference to select a modeling path. Treat the current MCP tool descriptions and input schemas as authoritative when they differ from this guide.

## Start with live state

Call `modmind_blockbench_project_state` before editing. Its revision protects the project from stale mutations. Call `modmind_blockbench_checkpoint` before touching an existing model, and use `modmind_blockbench_restore_history` when a correction sequence makes the model worse.

## Generation paths

### Asset Intent

Use `modmind_asset_compile_intent` first when you need to inspect the deterministic action candidate and diagnostics without touching the workspace. Then use `modmind_asset_preview_intent` and `modmind_asset_apply_intent` for editable, semantic, cuboid-first assets. It is the preferred path for ordinary blocks, items, creatures, and mechanisms that fit named parts such as body, head, limb, tail, wing, fin, and detail.

Use bilateral symmetry only when it is part of the design. Give parts stable IDs, sensible parent relationships, deliberate sizes and offsets, and a texture style that supports the material. Use `hero` only when the design has enough structure to justify the extra detail.

### Asset Refinement

Use `modmind_asset_compile_refinement` first when you need to inspect exact update actions and diagnostics. Then use `modmind_asset_preview_refinement` and `modmind_asset_apply_refinement` for focused changes to compatible named parts in the current project. Prefer it for proportion, position, rotation, inflation, and animation adjustments after inspecting a preview.

Do not use it when topology, UV layout, rig structure, or primitive type must change. Route those changes to Advanced Asset or raw actions.

### Advanced Asset

Use `modmind_asset_compile_advanced` first to inspect editable primitive, rig, animation, and variant diagnostics. Then use `modmind_asset_preview_advanced` and `modmind_asset_apply_advanced` when the model requires primitives beyond cubes, native meshes, curves, a rig, weights, locators, IK, multiple animations, or candidate variants.

Create variants that test meaningful design decisions such as silhouette, scale, taper, or accent placement. Do not create cosmetic duplicates. The base plus up to two variants provides at most three candidates. Use `maxIterations` no greater than 3 and normally set `targetScore` to 82.

The built-in optimizer can improve framing and contrast, but it cannot judge identity, anatomy, appeal, or reference fidelity. Select the candidate using both rendered evidence and the design brief.

### Reference Asset

Use `modmind_asset_compile_reference` first to inspect the extracted profile and palette. Then use `modmind_asset_preview_reference` and `modmind_asset_apply_reference` when a raster image has a clean silhouette suitable for extrusion. Read project images with `modmind_image_project_assets` and `modmind_image_read_project_asset` when the reference already belongs to the project.

Use this path for plaques, emblems, leaves, blades, flat ornaments, profile props, or a deliberate shallow relief. Do not use it as the sole construction method for animals, characters, vehicles, or other subjects whose unseen depth and secondary forms matter.

### Raw Blockbench actions

Use `modmind_blockbench_actions` for exact operations that the compilers do not express cleanly:

- add, update, duplicate, rename, reparent, or delete known elements;
- update individual cube faces and UV rectangles;
- create, assign, paint, and save textures;
- unwrap a mesh;
- add or correct groups, armatures, bones, weights, locators, IK, animations, and keyframes;
- set metadata, save the editable project, and export the final model.

Batch only tightly related operations. Resolve targets by UUID after inspection when duplicate names are possible. Never delete or overwrite elements based on a guessed name.

## Image Studio handoff

Use `modmind_image_generate` for concept art or texture source material only when generative raster content adds value. Use `style: minecraft` for native pixel assets and provide an existing image through `referenceImage` when pixels are available. Inspect every returned image. Use `modmind_image_perfect_pixel` or `modmind_image_remove_background` only when the observed result needs that treatment.

Pass a final returned `dataUrl` to the Blockbench `create-texture` action. Establish geometry and UV intent first. Never assign an arbitrary concept image across all faces and call it a finished texture.

## Evidence tools

- Use `modmind_blockbench_validate` for structure, texture, UV, and animation references.
- Use `modmind_blockbench_capture_views` to inspect exact live views.
- Use `modmind_asset_visual_review` for framing, contrast, detail, symmetry, clipping, and view consistency metrics.
- Use `modmind_blockbench_history` to locate recovery points.

Validation and visual scoring are complementary. Neither replaces direct inspection of the returned captures.
