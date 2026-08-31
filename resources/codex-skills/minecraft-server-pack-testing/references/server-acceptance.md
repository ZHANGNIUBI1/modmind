# Server Pack Acceptance

## Build evidence

- Server manifest matches project Minecraft, Loader, and Loader version.
- Generated launch/runtime files exist.
- Server-side and both-side mods are present.
- Client-only mods are excluded.
- Every unknown-side exclusion is reviewed.
- Overrides are present at the intended server paths.
- ServerPackCreator engine version and log path are recorded.

## Runtime evidence

- The server binds only to the requested loopback test port.
- A server-ready condition occurs before timeout.
- No fatal crash, missing dependency, registry failure, or EULA rejection appears.
- Join verification includes a client transcript and server-side join evidence.
- Offline mode is limited to isolated test automation; authenticated mode requires explicit intent and host-managed credentials.

## Scenario evidence

- Steps are bounded and deterministic.
- Every expected log assertion is observed.
- Failed assertions retain relevant log context.
- The server and client process trees are terminated after success, failure, timeout, or cancellation.

Report build success, startup success, join success, and scenario success as separate facts. One does not imply the others.
