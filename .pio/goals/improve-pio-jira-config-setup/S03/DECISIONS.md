# Accumulated Decisions (through Step 2)

## Script Arguments (Plan Deviation)

- **`site` field added to config and script.** The `setup-config.sh` script requires `SITE` as the first argument: `setup-config.sh SITE PROJECT_KEY [DEFAULT_TYPE]`. The YAML output contains three fields: `site`, `projectKey`, `defaultType`. This was user-requested during Step 1. **Downstream impact:** REFERENCE.md (Step 3) and Push protocol updates (Step 4) must document the `SITE` argument and the `site` field in config examples.

## Script Path

- Script lives at `src/skills/pio-jira/scripts/setup-config.sh` — in a `scripts/` subdirectory per write-a-skill conventions. **Downstream impact:** REFERENCE.md must reference this path correctly, including the `scripts/` subdirectory.

## Config Setup Trigger Scope (Plan Deviation)

- User broadened trigger scope from "During Push" to "**Before any Jira operation**" when config is missing. SKILL.md now reads "Before any Jira operation, when `.pio/jira-config.yaml` is missing." **Downstream impact:** REFERENCE.md execution reference should reflect this broader scope — not limited to Push. Step 4 still adds Push-specific integration (the concrete chain: Push → config missing? → Setup → Push continues).

## Two ask_user Calls

- SKILL.md instructs two separate `ask_user` calls: site URL first, then project key. **Downstream impact:** REFERENCE.md example payload should show the pattern for one call (site) — the second follows the same pattern for project key.

## Epic Linking (`--parent`)

- `--parent` support is a Push-time concern only (via `acli jira workitem create --parent`), not a config setup concern. **Downstream impact:** Step 4 should cover `--parent` during Push protocol integration. Step 3 (config setup reference) does NOT need to mention `--parent`.
