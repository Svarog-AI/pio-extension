# Summary: Jira Utilities Module (Step 1 — Re-implementation after rejection)

## Status
COMPLETED

## Files Created
- (none — all files existed from previous attempt)

## Files Modified
- `src/jira-utils.ts` — added non-zero exit code check in `runAcli` close handler: when `acli` exits with a non-zero code but produces valid JSON, returns an `AcliError` mentioning the exit code. Includes parsed JSON in error result for diagnostics.
- `src/jira-utils.test.ts` — added test case: "returns AcliError when acli exits non-zero even with valid JSON"
- `.pio/goals/jira-integration/S01/TEST.md` — added test case for non-zero exit code scenario

## Files Deleted
- (none)

## Decisions Made
- Non-zero exit code error includes parsed JSON (`stdout`) in the `AcliError` result so downstream callers can still inspect the response for diagnostics
- Error message format: `acli exited with code N. Stderr: ...` — mentions exit code and includes stderr for context

## Review Issues Addressed
- **[HIGH]** `runAcli` now checks `exitCode !== 0` after JSON parsing and before returning success. Returns `AcliError` with exit code in message and parsed JSON for diagnostics.

## User-Requested Changes
- (none)

## Test Coverage
- 16 tests covering all three functions:
  - `jiraKeyToSlug`: 3 tests (uppercase, mixed-case, single-word)
  - `readJiraConfig`: 6 tests (missing file, empty file, valid YAML, partial fields, malformed YAML, non-string field)
  - `runAcli`: 6 tests (ENOENT, unauthorized in stderr, unauthorized in stdout, valid JSON, non-JSON, **non-zero exit with valid JSON**)
  - Module exports: 1 test (verifies all 3 functions are exported)
- `npm run check` passes (tsc --noEmit, zero errors)
- Full test suite passes (751/751 tests, zero regressions)
