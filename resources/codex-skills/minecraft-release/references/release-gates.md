# Minecraft Release Gates

## All projects

- Version and channel match the intended release.
- Changelog describes user-visible changes and compatibility impact.
- License exists or an explicit justified exception is recorded.
- Current source has been validated and tested.
- Artifact path, size, and type are recorded from the latest preflight.
- No credentials, private URLs, local absolute paths, or development-only files are included.

## Java mods

- Build succeeds from current source.
- JAR contains the Loader descriptor and compiled classes.
- Artifact modification time is newer than relevant source and build inputs.
- Minecraft, Loader, Loader version, dependency metadata, mixins, and access rules match the target.
- Required client/server/GameTest evidence passes.

## Modpacks

- Plan and lock audit pass.
- Required mods and local modules are represented.
- Overrides and managed content inventory contain intended files only.
- `.mrpack` generation passes preflight.
- Client startup passes; server verification passes when a server pack is offered.

## Add-on archives

- Archive matches the supported platform format.
- Exact third-party relationships are prepared and publishable for each destination.
- Private or unmatched targets are not represented as public platform dependencies.

## Publication evidence

Readiness evidence is not publication evidence. A completed publication needs a provider-confirmed project/file/release ID or URL from an authorized operation. Never infer success from an uploaded byte count, a local artifact, or preflight readiness.
