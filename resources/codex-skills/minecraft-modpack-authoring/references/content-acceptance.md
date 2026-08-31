# Modpack Content Acceptance

Use these checks after installing mods or writing pack content.

## Mod plan and lock

- Require a successful plan before `modmind_modpack_apply_plan`.
- Pass the exact returned plan inside `{ plan: ... }`.
- Require the apply result's lock audit to pass.
- Reconcile every required and optional request with installed, skipped, substituted, or unresolved output.
- Do not use MC Encyclopedia metadata as an automated download source.

## Content inventory

- Use the narrowest correct content kind and scope.
- Keep common content free of client-only classes, keys, or rendering assumptions.
- Keep server content free of client UI and shader assets.
- Reject path traversal, unexpected executable files, unrelated archive roots, and content written outside pack-owned directories.
- Preserve hashes and inventory records returned by managed downloads.

## Quests and guides

- Keep IDs stable, unique, and meaningful.
- Ensure every quest dependency points to an existing quest.
- Ensure tasks and rewards use content available in the resolved pack.
- Keep Patchouli category and entry links valid.
- Validate generated SNBT or JSON through ModMind rather than accepting serialization alone.

## Controls and optimization

- Reject keybind conflicts by default.
- Document any user-approved overlap and the affected actions.
- Apply only declared optimization patches under supported pack paths.
- Treat unresolved optimization mods as warnings unless the selected profile marks them required.
- Re-test startup after changing performance mods or configuration.

## Evidence

Minimum completion evidence is a successful lock audit, content validation, and the most relevant client or server startup check. Add GameTest or a bounded server scenario when behavior, recipes, progression, commands, or world state must be proven.
