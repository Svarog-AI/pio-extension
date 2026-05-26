# Decisions (carried from Step 1)

## Plan Deviations

- **File location:** `jira-utils` lives at `src/jira-utils.ts` instead of the planned `src/capabilities/jira-utils.ts`. Import path from capabilities is `../jira-utils`. User confirmed acceptable during Step 1 review.

## Architecture Decisions

- **Non-zero exit code handling:** `runAcli` returns an `AcliError` (with `error` field) when `acli` exits non-zero, even if stdout parses as valid JSON. The parsed JSON is still included in the error result for diagnostics.
- **Error message format:** `acli exited with code N. Stderr: ...` — mentions exit code and includes stderr.
