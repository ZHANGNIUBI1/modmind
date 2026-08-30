# ModMind

Electron-based workspace for AI-assisted Minecraft mod development.

## Versioning

The current product development line is `1.3.0-beta`. Stable patch releases increment
only the patch component (`1.3.1`, `1.3.2`, and so on).
Run `npm.cmd run version:patch` once for each future change set; it updates both
`package.json` and `package-lock.json` without creating a Git tag.

## Development

```powershell
npm.cmd install
npm.cmd run dev
```

Device authorization uses the site configured in `MODMIND_SITE_URL`. Release builds can
instead set `siteUrl` in `resources/service-config.json`; electron-builder copies that file
next to the packaged application resources. The value must be an HTTPS origin without a
path, query, or embedded credentials. The desktop protocol is registered as `mcdev://`.
Windows auto-update artifacts are served from `updateUrl` in the same configuration file
(or `MODMIND_UPDATE_URL`). The update URL must use HTTPS.

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

The test runner downloads managed Java, Minecraft assets, and the selected Fabric, Quilt,
Forge, or NeoForge loader only when needed. Starting a test performs a real Gradle Wrapper build,
syncs the project JAR without removing user-added dependency mods, and launches with a
deterministic offline profile.

ModMind runs the project's pinned Wrapper directly: `.\gradlew.bat build` on Windows and
`./gradlew build` on macOS/Linux. ModMind does not install or fall back to a separate Gradle
runtime. The Wrapper itself resolves the distribution configured by the project when needed.

Run `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` before packaging with
`npm.cmd run dist:win`. The signed release command fails if no valid Windows signing identity
is configured. It produces both `ModMind Setup <version>.exe` (NSIS installer)
and the matching update metadata. On Windows systems without symbolic-link privileges, use
`npm.cmd run dist:win:unsigned` for explicitly labeled local unsigned artifacts. Both commands
verify artifact size, version, signature policy, and write `release/SHA256SUMS.txt`.

After a Windows package succeeds, upload all three files from `release/update` to the root of
the configured object-storage bucket. Stable builds contain `latest.yml`; prerelease builds
contain `beta.yml` and must not overwrite `latest.yml`. Upload the installer and blockmap first,
then upload the YAML metadata last so clients never observe a partially published release. Keep
older versioned installers and blockmaps available so skipped-version differential updates can
reuse the current installation's blocks.
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
