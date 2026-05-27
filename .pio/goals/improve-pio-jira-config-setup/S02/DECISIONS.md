# Accumulated Decisions (through Step 1)

## Script Arguments (Plan Deviation)

- **`site` field added to config and script.** The `setup-config.sh` script now requires `SITE` as the first argument: `setup-config.sh SITE PROJECT_KEY [DEFAULT_TYPE]`. The YAML output contains three fields: `site`, `projectKey`, `defaultType`. This was a user-requested change during Step 1 execution. **Downstream impact:** SKILL.md and REFERENCE.md must document the `SITE` argument and the `site` field in the config format.

## Script Path (matches plan)

- Script lives at `src/skills/pio-jira/scripts/setup-config.sh` — in a `scripts/` subdirectory per write-a-skill conventions. **Downstream impact:** Documentation must reference this path correctly, including the `scripts/` subdirectory.

## Epic Linking (`--parent`)

- `--parent` support for Epic linking was discussed during Step 1 but determined to be a Push-time concern (handled via `acli jira workitem create --parent`), not a config setup concern. No script changes needed — documentation in Steps 2–4 should cover `--parent` usage during Push. **Downstream impact:** Step 4 (Push protocol integration) should mention `--parent`.
