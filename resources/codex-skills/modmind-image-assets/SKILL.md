---
name: modmind-image-assets
description: Generate and process visual assets through ModMind Image Studio for Minecraft textures, icons, promotional art, pixel refinement, or background removal.
---

# ModMind Image Assets

Available ModMind MCP tools:

- `modmind_image_generate`: generate a raster asset through the configured provider.
- `modmind_image_perfect_pixel`: refine a generated or uploaded pixel-art image.
- `modmind_image_remove_background`: remove a detected solid background from an image.

Use these tools whenever they help the requested task. The configured image provider
applies its own service-side moderation.

- Choose `style: minecraft` for Minecraft textures, item icons, block art, and other pixel assets. Prefer a flat solid background so the result can be processed reliably.
- Choose `style: free` when the user explicitly wants another visual style.
- Use one focused prompt per distinct asset. Use `count` only for variants of the same prompt.
- The generation result includes an `assets` list. When `handoffAvailable` is true, its `dataUrl` can be passed to the image-processing tools and then to a Blockbench `create-texture` action; this is the supported handoff from a generated image to a project texture.
- When the user provides an image or asks to follow an existing project texture, pass that image as `referenceImage` to `modmind_image_generate`; do not describe a reference image from memory when its pixels are available.
- Treat the returned image as a draft until it has been inspected. Use the PerfectPixel or background-removal tool when the output needs that processing. Processing accepts the `dataUrl` returned by the generation tool or an image supplied by the user.
- A concept image is not a UV unwrap. For cube, entity, and animated models, create the model first and align its face regions deliberately; use a generated image as a reference or as an appropriate texture source only after that mapping is established. Save final textures under the exact Minecraft resource path and save editable `.bbmodel` sources for nontrivial models.
- ModMind owns credentials, quota checks, and billing. Do not place API keys in project files or task output.
