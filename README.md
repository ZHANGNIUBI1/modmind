# ModMind

Electron-based workspace for AI-assisted Minecraft mod development.

## Development

```powershell
npm.cmd install
npm.cmd run dev
```

The current prototype provides local project creation, file editing, idea capture,
project preflight checks, version snapshots, API configuration, embedded Blockbench,
isolated Minecraft test instances, and a version-aware Mappings browser.

The coding agent can search and inspect mappings from `mappings.dev` for the project's
exact Minecraft version. Class indexes and inspected pages are cached locally so repeated
lookups continue to work offline. The manual Mappings view exposes the same data source.

New projects use `modmind.project.json` and `.modmind`. Projects created by earlier
ModTool builds remain supported through the legacy `modtool.project.json` and `.modtool`
layout, and existing application data is migrated on the first ModMind launch.

The test runner downloads managed Java, Gradle, Minecraft assets, and Fabric only when
needed. Starting a test performs a real Gradle build, syncs the project JAR without
removing user-added dependency mods, and launches with a deterministic offline profile.
