---
name: modmind-plugin-development
description: Create, inspect, update, reload, and verify trusted ModMind application plugins with panels, MCP tools, or both. Use when the request concerns ModMind plugin.json manifests, plugin backend handlers, sandboxed panel messaging, host permissions, dynamic modmind_plugin_* tools, plugin source repair, or the ModMind global plugin directory. Do not use for Codex plugins, Blockbench plugins, or Minecraft mods.
---

# ModMind Plugin Development

Build against the ModMind plugin host contract and keep authority explicit. Read [plugin-contract.md](references/plugin-contract.md) before writing a manifest, panel, or backend.

## Rules

- Distinguish ModMind plugins from Codex plugins, Blockbench plugins, and Minecraft Loader mods.
- Use `modmind_plugins_scaffold` only for a new plugin. Choose `panel-only`, `tools-only`, or `panel-and-tools` from required capabilities.
- Use `modmind_plugins_read_source` before modifying an installed plugin. Do not scaffold over an existing ID.
- Use `modmind_plugins_write_files` only for plugin-relative text files and tightly related edits.
- Call `modmind_plugins_reload` after each coherent change and inspect reload/runtime errors before further edits.
- Declare the minimum host permissions. Permissions describe host bridge conveniences; they do not sandbox backend Node code.
- Treat backend code as fully trusted local Node code after user confirmation. Never add process execution, arbitrary filesystem access, or unrestricted networking unless the feature explicitly requires it and the user understands the authority.
- Keep panel code inside the panel messaging contract and CSP. Do not bypass the host bridge.
- Define precise JSON Schemas and truthful annotations for every MCP tool.
- Preserve source returned before editing so a failed reload can be repaired with an exact follow-up write.

## Workflow

### 1. Design the surface

Choose:

- panel-only for visual project information and host-mediated actions;
- tools-only for agent-callable backend capabilities;
- panel-and-tools when the panel invokes the same backend tools;
- an existing overlay plugin only when updating a plugin that already declares an overlay, because the scaffold tool does not create overlay variants.

List required host permissions and reject permissions unsupported by the actual feature.

### 2. Scaffold or inspect

For a new plugin, call `modmind_plugins_scaffold` with a stable lowercase hyphenated ID, human name, description, author, and tool declarations when applicable. For an existing plugin, call `modmind_plugins_read_source` and inspect every manifest entry and entrypoint before editing.

### 3. Implement the contract

Keep `plugin.json` IDs, tool declarations, entrypoints, and permissions synchronized with code. Backend handlers must register every declared tool and validate untrusted input. Panel requests must use request IDs and handle both success and error results. Use host-mediated project read, storage, fetch, and clipboard access only when declared.

Tool annotations must match behavior:

- `readOnlyLocal` or `readOnlyRemote` for no state changes;
- `safeStateChange` for bounded reversible host state;
- `managedAction` for reviewed project, network, or other meaningful changes.

### 4. Write and reload

Apply the smallest coherent file set with `modmind_plugins_write_files`, then call `modmind_plugins_reload`. If reload fails, read the current source and repair the reported manifest, syntax, entrypoint, or registration error before adding features.

### 5. Verify end to end

Confirm the plugin reloads without runtime errors. For tools, refresh MCP tool discovery and verify the generated `modmind_plugin_<plugin-id>_<tool-name>` descriptor and a representative call. For panels, verify ready/hostInfo, request/result correlation, theme handling, and failure states. Verify denied capabilities remain unavailable when permissions are absent.

Report plugin ID and kind, permissions, files changed, tools or panel messages, reload result, representative verification, and the backend trust implications.

## Completion Gate

Do not claim success when the manifest is invalid, a declared handler is missing, reload failed, tool schema disagrees with behavior, panel requests bypass the host, or unnecessary high-authority code remains.
