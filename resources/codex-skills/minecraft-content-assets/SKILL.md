---
name: minecraft-content-assets
description: Create and integrate Minecraft mod content assets, including item and block models, textures, blockstates, entity geometry, animations, language entries, recipes, loot tables, tags, sounds, particles, and data resources. Use when a feature needs coordinated visual or data-driven content.
---

# Minecraft Content Assets

Treat assets, data, and code references as one connected feature rather than isolated files.

## Workflow

1. Inventory every registry ID and derive the expected resource paths from the active Minecraft version and loader.
2. Inspect neighboring project assets for naming, palette, resolution, model parent, UV, and data conventions.
3. Choose the right production path: edit text formats directly, use Blockbench for models/textures, use data generators when the project supports them, or create binary assets with an appropriate native tool.
4. Build recognizable silhouettes and material detail at Minecraft's native viewing size. Check transparency, tileability, UV alignment, animation pivots, and texture references.
5. Connect blockstates, models, textures, language, recipes, loot, tags, sounds, particles, and code registrations.
6. Validate JSON and generated resources, then inspect in game when appearance or interaction matters.
7. Keep editable source assets such as `.bbmodel` files when they will help future iteration.

## Blockbench Integration

Start with `modmind_blockbench_actions` for structured model and texture operations inside ModMind. Use native Blockbench, image, audio, and filesystem tools when the integration does not cover the required asset operation.
