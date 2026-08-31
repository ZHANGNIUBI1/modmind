# Add-on Relationship Policy

## Roles

- Required: the add-on cannot provide its promised behavior without the target. Declare and test it as required.
- Optional: base startup and unrelated behavior must work without the target. Isolate class loading and conditional registration.
- Test: use only for verification and never expose it as a published runtime requirement.

Transitive relationships support compilation or testing but are not automatically direct published relationships.

## Evidence priority

1. Exact-version source whose recorded identity matches the runtime artifact.
2. Exact runtime JAR bytecode and descriptors.
3. Official documentation for that exact release.
4. Earlier or later source only as a hypothesis that must be verified against the artifact.

Use the relationship manifest's mod IDs, packages, Loader, side, paths, and hashes. Do not infer them from filenames alone.

## License handling

- Read the recorded source license before copying any source, assets, or data.
- Prefer independent implementation against public APIs.
- Do not copy code when the license is missing, incompatible, or unclear.
- Preserve notices and attribution when permitted copying requires them.
- Report whether source was inspected, copied under license, or used only to understand public behavior.

## Acceptance matrix

- Required target present: build and requested behavior pass.
- Required target missing: loader metadata or startup reports a clear dependency failure.
- Optional target present: integration activates and passes.
- Optional target missing: base mod starts and unrelated behavior passes.
- Wrong target version: compatibility is rejected or fails clearly rather than silently corrupting state.
