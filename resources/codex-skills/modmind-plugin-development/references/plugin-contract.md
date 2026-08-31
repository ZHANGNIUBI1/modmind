# ModMind Plugin Contract

## Manifest

- ID: 3-64 lowercase letters, digits, or hyphens; no leading or trailing hyphen.
- Version: semantic version.
- Relative entry paths only; no traversal, drive, or absolute paths.
- Declare at least one backend, panel, or overlay surface.
- Backend tool names use lowercase letters, digits, underscores, or hyphens and must be unique.

Current host permissions are `project.read`, `storage`, `net.fetch`, and `clipboard.write`. Request only those used by the implementation.

## Panel and overlay bridge

Panels send `ready`, `invokeTool`, `getProjectInfo`, `netFetch`, `copyToClipboard`, or `log` messages through the host contract. Correlate calls with unique request IDs and handle `ok: false` results. The panel CSP prevents direct network connections; use host-mediated `netFetch` with permission.

Never render unsanitized external HTML. Keep layout usable in both themes and handle a missing active project.

## Backend

Register exactly the handlers declared by `backend.tools`. Validate input again inside handlers even when JSON Schema exists. Return serializable values and bounded errors. Avoid logging secrets or complete environment data.

The backend is trusted Node code, not an OS sandbox. Host permissions do not restrict direct Node APIs, so authority must also be controlled by implementation review.

## Dynamic MCP tools

The public name is `modmind_plugin_<plugin-id>_<tool-name>`. Read-only annotations determine availability in read-only sessions. After reload, MCP clients discover the latest descriptors on `tools/list` without restarting the MCP server. Verify both descriptor refresh and tool execution.
