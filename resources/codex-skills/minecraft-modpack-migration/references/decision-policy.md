# Modpack Migration Decision Policy

Use the preview as the only source of candidate and item identifiers.

## Mod decisions

- Prefer an exact compatible official file.
- Use a replacement only when it covers the required behavior and its dependencies and side constraints fit the target.
- Use a manual file only when its identity and compatibility are verified through the supported review path.
- Create a compatibility module only when the missing behavior is bounded, legally implementable, and testable.
- Remove only with explicit acceptance of behavior loss.
- Defer when evidence is insufficient; mark the project incomplete.

Do not copy source from a source-port dossier unless the recorded license permits it. Exact-version source is evidence, not automatic permission.

## Content decisions

- Preserve compatible overrides unchanged.
- Adapt version-bound configs, scripts, quests, datapacks, and resource formats deliberately.
- Keep worlds backed up and test loading separately.
- Treat blocked content as a migration blocker or defer it explicitly.
- Never discard unknown content merely because no parser recognized it.

## Acceptance

Require a migration record, report, backup in backup mode, and an explicit complete or incomplete status. For a complete result, require no deferred required mods or blocked required content plus successful validation and the relevant runtime checks. For an incomplete result, list every remaining decision and do not publish or distribute it as the migrated release.
