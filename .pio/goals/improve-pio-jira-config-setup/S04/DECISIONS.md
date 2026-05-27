# Accumulated Decisions (through Step 3)

## Script Arguments (Plan Deviation)

- **`site` field added to config and script.** `setup-config.sh` requires `SITE` as the first argument: `setup-config.sh SITE PROJECT_KEY [DEFAULT_TYPE]`. YAML output contains three fields: `site`, `projectKey`, `defaultType`. User-requested during Step 1. **Downstream impact:** Push protocol docs (Step 4) must show the 3-field config format — the existing 2-field example is stale.

## Script Path

- Script lives at `src/skills/pio-jira/scripts/setup-config.sh` — in a `scripts/` subdirectory. **Downstream impact:** Step 4 must reference this path correctly when wiring setup into Push.

## Config Setup Trigger Scope (Plan Deviation)

- User broadened trigger from "During Push" to "**Before any Jira operation**" when config is missing. **Downstream impact:** Step 4 still adds Push-specific integration (the concrete chain: Push → config missing? → Setup → Push continues) since Push is the primary workflow path agents will follow.

## Epic Linking (`--parent`)

- `--parent` support is a Push-time concern only, not a config setup concern. DECISIONS.md from Step 2 noted Step 4 should cover `--parent` during Push protocol integration.
