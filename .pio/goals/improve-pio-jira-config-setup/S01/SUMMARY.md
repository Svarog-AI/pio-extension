# Summary: Create setup-config.sh

## Status
COMPLETED

## Files Created
- `src/skills/pio-jira/scripts/setup-config.sh` — POSIX shell script that creates `.pio/jira-config.yaml` with site, project key, and default type
- `src/skills/pio-jira/scripts/setup-config.test.ts` — Vitest test suite (11 tests) verifying argument validation, YAML output format, idempotency, exit codes, shebang, and executable permissions

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- Used `printf` instead of heredoc for YAML writing — more predictable across POSIX shells, handles special characters safely
- Script exits with code 1 and prints usage to stderr when SITE or PROJECT_KEY is empty or unset
- Confirmation message printed to stdout on success includes site and project key for agent verification
- Tests use `child_process.spawnSync` to execute the shell script in temp directories — no filesystem side effects on the real project

## User-Requested Changes
- User requested storing the Jira site URL in the config file so the agent knows how to authenticate. Added `site` field to YAML output and `SITE` as the first required argument to the script. New usage: `setup-config.sh SITE PROJECT_KEY [DEFAULT_TYPE]`. Modified `src/skills/pio-jira/scripts/setup-config.sh` (updated), `src/skills/pio-jira/scripts/setup-config.test.ts` (updated).
- User requested adding `--parent` support for Epic linking. After discussion, this was determined to be a Push-time concern (handled via `acli jira workitem create --parent`), not a setup concern. No config or script changes needed — the skill documentation (Steps 2-4) will cover `--parent` usage during Push.

## Test Coverage
- 11 unit tests covering all acceptance criteria:
  - Correct YAML output with site, projectKey, and default type "Task"
  - Custom default type via third argument
  - Non-zero exit + usage message when no arguments
  - Non-zero exit when site is empty string
  - Non-zero exit when project key is missing
  - Idempotent overwrite (running twice produces identical output)
  - Hyphenated project keys handled correctly
  - Directory creation when .pio doesn't exist
  - Confirmation message on stdout
  - POSIX shebang verification
  - Executable bit verification
- Full test suite (746 tests) passes with no regressions
- `npm run check` (tsc --noEmit) exits with code 0
