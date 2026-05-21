---
decision: REJECTED
criticalIssues: 0
highIssues: 1
mediumIssues: 0
lowIssues: 0
---

# Code Review: Create revise-plan capability implementation (Step 3)

## Decision
REJECTED

## Summary
The implementation is well-structured and follows the established capability pattern faithfully. All 23 tests pass, TypeScript compiles cleanly, and no regressions exist in the full 520-test suite. However, the `writeAllowlist` callback returns a dead entry (`"PLAN_ARCHIVE/*"`) that can never match any real file write because `path.resolve()` does not expand globs — it resolves to a literal path ending in `*`. This is dead code matching the HIGH severity classification.

## Critical Issues
(none)

## High Issues
- [HIGH] `"PLAN_ARCHIVE/*"` in `resolveReviseWriteAllowlist` (line 137) is dead code. The validation system (`src/guards/validation.ts`, `resources_discover` handler) resolves allowlist entries via `path.resolve()`, which does not expand globs — the literal path `/.../PLAN_ARCHIVE/*` can never match any real file write. Since `prepareSession` handles all archiving before the agent starts and the agent only needs to write `PLAN.md`, this entry serves no purpose. → matches "Code smells and unnecessary complexity: dead code (unused functions, unreachable branches)" because the entry is an unreachable value in the allowlist array that can never match any file operation. — `src/capabilities/revise-plan.ts` (line 137)

## Medium Issues
(none)

## Low Issues
(none)

## Test Coverage Analysis
All acceptance criteria from TASK.md are covered by tests:

- **CAPABILITY_CONFIG structure** (4 tests): prompt, validation files, prepareSession type, defaultInitialMessage content ✅
- **Validation rejects invalid states** (3 tests): missing workspace, missing GOAL.md, missing PLAN.md ✅
- **Validation accepts valid states** (2 tests): both files present, with APPROVED steps ✅
- **prepareSession archiving** (4 tests): timestamped archive creation, directory creation, preserves old archives, handles missing PLAN.md ✅
- **prepareSession cleanup** (4 tests): deletes non-APPROVED, preserves APPROVED, multiple folders, all-APPROVED ✅
- **prepareSession marker cleanup** (3 tests): deletes marker when trigger provided, natural removal without trigger, handles missing marker ✅
- **Config callbacks** (2 tests): writeAllowlist includes PLAN.md, readOnlyFiles is a function ✅
- **Integration test** (1 test): full lifecycle — archive + cleanup + marker removal in one run ✅

No significant gaps identified. Tests use proper temp directories with cleanup in afterEach.

## Gaps Identified
(none)

## Recommendations
Remove the `"PLAN_ARCHIVE/*"` entry from `resolveReviseWriteAllowlist()` at line 137 of `src/capabilities/revise-plan.ts`. The function should return `["PLAN.md"]` — the agent only writes `PLAN.md`; archived files are created by `prepareSession` before the agent starts, and reads to `PLAN_ARCHIVE/` inside the workingDir are automatically permitted (no allowlist entry needed for reads).
