# ModMind

Electron-based workspace for AI-assisted Minecraft mod development.

## Versioning

The stable product version is `1.1.3`. Every subsequent product change increments only
the patch component (`1.1.4`, `1.1.5`, and so on) unless this policy is explicitly changed.
Run `npm.cmd run version:patch` once for each future change set; it updates both
`package.json` and `package-lock.json` without creating a Git tag.

## Development

```powershell
npm.cmd install
npm.cmd run dev
```

ModMind provides Fabric, Quilt, Forge, and NeoForge project creation and migration, Monaco
file editing, VS Code Java language-server/debugger workspace generation, local and remote
Git workflows, restorable project snapshots, locked Modrinth and Maven dependencies,
structured and generic data/asset JSON tools, embedded Blockbench, isolated
client/server/GameTest verification, CI generation, release preflight, and confirmed
publishing to Modrinth, CurseForge, and GitHub Releases.

The coding agent can search and inspect mappings from `mappings.dev` for the project's
exact Minecraft version. Class indexes and inspected pages are cached locally so repeated
lookups continue to work offline. The manual Mappings view exposes the same data source.

New projects use `modmind.project.json` and `.modmind`. Projects created by earlier
ModTool builds remain supported through the legacy `modtool.project.json` and `.modtool`
layout, and existing application data is migrated on the first ModMind launch.

The test runner downloads managed Java, Gradle, Minecraft assets, and the selected Fabric,
Quilt, Forge, or NeoForge loader only when needed. Starting a test performs a real Gradle build,
syncs the project JAR without removing user-added dependency mods, and launches with a
deterministic offline profile.

Projects use their pinned Gradle Wrapper by default. Users who prefer an existing local
installation can enable `优先使用本机 Gradle` in Settings and provide an executable path or
use `gradle` from `PATH`; ModMind warns about version mismatches but honors that preference.

Managed Gradle downloads default to `自动择优`: ModMind samples Huawei Cloud, Tencent Cloud,
and the official Gradle service, then downloads from the fastest reachable source. Users can
instead choose domestic mirrors first or restrict downloads to the official service. Every
managed distribution is verified against the SHA-256 pinned by the project template.

Run `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` before packaging with
`npm.cmd run dist:win`. The signed release command fails if no valid Windows signing identity
is configured. It produces both `ModMind Setup <version>.exe` (NSIS installer)
and `ModMind <version>.exe` (portable build). On Windows systems without symbolic-link
privileges, use `npm.cmd run dist:win:unsigned` for explicitly labeled local unsigned artifacts.
Both commands verify artifact size, version, signature policy, and write `release/SHA256SUMS.txt`.
Linux and macOS test packages are available through `npm run dist:linux` and `npm run dist:mac`.
Publishing always requires encrypted platform tokens, a successful release preflight, and an
explicit confirmation.

## Pushing to GitHub

The repository uses `main` and the `origin` remote points to
`https://github.com/waterpail114514/modmind.git`.

Before pushing a change, run the project checks and review what will be committed:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
git status
git diff
```

Commit and push the change:

```powershell
git add -A
git commit -m "type: short description"
git pull --rebase origin main
git push origin main
```

Use a conventional commit type such as `feat`, `fix`, `docs`, `test`, `build`, or `chore`.
After the upstream branch is configured, `git push` is sufficient. On a new computer, GitHub
may open a browser through Git Credential Manager for the first sign-in. If a token is used,
store it in the credential manager and never put it in the remote URL or a tracked file.
