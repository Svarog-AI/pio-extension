# Summary: Jira Utilities Module

## Status
COMPLETED

## Files Created
- `src/capabilities/jira-utils.ts` — new module exporting `runAcli`, `readJiraConfig`, `jiraKeyToSlug` and interfaces `AcliResult`, `AcliError`, `JiraConfig`
- `src/capabilities/jira-utils.test.ts` — 15 unit tests covering all three functions and edge cases
- `.pio/goals/jira-integration/S01/TEST.md` — test specification derived from acceptance criteria

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- Used `spawn` from `node:child_process` with event-based data collection (stdout/stderr buffers) instead of `execFile` — gives full control over chunked output
- Unauthorized detection is case-insensitive via `/unauthorized/i` regex applied to both stdout and stderr
- ENOENT detection checks `err.message.includes("ENOENT")` — cross-platform, no `which` dependency
- `readJiraConfig` follows the exact same pattern as `readConfig()` in `model-config.ts`: existence check → read → parse → validate → return
- Returns `undefined` (not empty object) when config has no recognized string fields, matching the `readConfig()` convention of "no config = undefined"
- `jiraKeyToSlug` is a pure function with no I/O — simple lowercase + prefix

## User-Requested Changes
- (none)

## Test Coverage
- 15 tests covering all three functions:
  - `jiraKeyToSlug`: 3 tests (uppercase, mixed-case, single-word)
  - `readJiraConfig`: 6 tests (missing file, empty file, valid YAML, partial fields, malformed YAML, non-string field)
  - `runAcli`: 5 tests (ENOENT, unauthorized in error event, unauthorized in stdout, valid JSON, non-JSON)
  - Module exports: 1 test (verifies all 3 functions are exported)
- `npm run check` passes (tsc --noEmit, zero errors)
- Full test suite passes (750/750 tests, zero regressions)
