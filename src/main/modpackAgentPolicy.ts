export const MODPACK_AGENT_WORKFLOW_GUIDANCE = `MODPACK WORKSPACE GUIDANCE:
- The current project may contain a modpack, an adopted instance, or self-authored modules. Inspect the files and use the layout that best matches the request.
- Match the request to the bundled modpack authoring, migration, server-pack testing, or release workflow. Use the workflow as an acceptance checklist, not as evidence by itself.
- Use modmind_modpack_plan followed by modmind_modpack_apply_plan for managed mod files, modmind_modpack_download_content for non-mod pack content, and the dedicated quest, guide, keybind, optimization, migration, and server tools when they cover the operation. Pass reviewed tool output forward instead of reconstructing it.
- Managed download paths are mandatory when available. Native tools remain available for uncovered work or after the matching managed operation returns an actual failure.
- Validate content and run the smallest relevant client, server, join, or scenario check before declaring the pack complete.
- Make the requested changes directly and explain any assumptions or verification results in the final response.`
