---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 1
lowIssues: 0
---

# Code Review: Jira Utilities Module (Step 1)

## Decision
APPROVED

## Summary
The re-implementation successfully addresses the previous HIGH issue: `runAcli` now checks for non-zero exit codes after JSON parsing and returns an `AcliError` with exit code, stderr, and parsed JSON for diagnostics. All three utility functions (`runAcli`, `readJiraConfig`, `jiraKeyToSlug`) are correctly implemented with proper types, discriminated union error handling, and comprehensive test coverage. All 751 tests pass (16 for this module) and `npm run check` reports zero errors.

## Critical Issues
- (none)

## High Issues
- (none — the previous HIGH issue regarding non-zero exit code handling has been resolved)

## Medium Issues
- [MEDIUM] File placed at `src/jira-utils.ts` instead of `src/capabilities/jira-utils.ts` as specified in TASK.md's "Files Affected" section. This deviates from the project convention that capability files live under `src/capabilities/`. Steps 2 and 3 will import from `../jira-utils` rather than `./jira-utils`. **User confirmed this is acceptable — approved despite deviation.**

**Severity matching:** "Deviation from project conventions. The implementation violates documented conventions in `.pio/PROJECT/CONVENTIONS.md` (naming, structure, patterns, coding standards)."

## Low Issues
- (none)

## Test Coverage Analysis
All acceptance criteria from TASK.md are covered by tests:

| Scenario | Covered |
|----------|---------|
| `jiraKeyToSlug`: PROJ-123 → jira-proj-123 | ✅ |
| `jiraKeyToSlug`: My-Project-456 → jira-my-project-456 (mixed-case) | ✅ |
| `jiraKeyToSlug`: ABC-1 → jira-abc-1 (single-word) | ✅ |
| `readJiraConfig`: missing file → undefined | ✅ |
| `readJiraConfig`: empty file → undefined | ✅ |
| `readJiraConfig`: valid YAML with both fields | ✅ |
| `readJiraConfig`: partial fields (only projectKey) | ✅ |
| `readJiraConfig`: malformed YAML → undefined | ✅ |
| `readJiraConfig`: non-string field → undefined | ✅ |
| `runAcli`: ENOENT → error mentioning installation | ✅ |
| `runAcli`: "unauthorized" in stderr → auth login message | ✅ |
| `runAcli`: "Unauthorized" in stdout (case-insensitive) | ✅ |
| `runAcli`: valid JSON on exit 0 → success with parsed stdout | ✅ |
| `runAcli`: non-JSON text → error with raw output | ✅ |
| `runAcli`: valid JSON on non-zero exit → AcliError (new test) | ✅ |
| Module exports all three functions | ✅ |

## Gaps Identified
- **GOAL ↔ PLAN ↔ TASK ↔ Implementation**: All aligned. The module implements exactly what was specified in the plan step and task spec.
- **TASK ↔ TESTS**: Complete coverage — every acceptance criterion has a corresponding test case.
- **File location**: As noted under Medium Issues, the file lives at `src/jira-utils.ts` rather than `src/capabilities/jira-utils.ts`. This will require Steps 2 and 3 to adjust import paths from `./jira-utils` to `../jira-utils`.

## Recommendations
N/A — approved with user confirmation on the medium issue. Steps 2 and 3 should import from the actual file location (`../jira-utils` relative to `src/capabilities/`).
