# Code Review: Test pure utilities (`utils.test.ts`) (Step 2)

## Decision
APPROVED

## Summary
High-quality test suite covering all 12 utility functions from `src/utils.ts` with 45 well-structured tests. All tests pass, type-checking is clean, and the full suite (including smoke test) runs without regressions. The implementation follows the task spec faithfully — self-contained fixture helpers, real filesystem operations on temp directories, and comprehensive edge case coverage across all functions.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- [LOW] Test name "returns false for a file (not directory)" in `goalExists` block actually asserts `toBe(true)` because `fs.existsSync` returns true for both files and directories. The comment explains the reasoning, but renaming the test to something like "returns true for a file (fs.existsSync semantics)" would prevent confusion. — `__tests__/utils.test.ts` (line ~92)
- [LOW] `@ts-expect-error` in `deriveSessionName` test suppresses a TypeScript warning for intentionally testing undefined input behavior. This is acceptable for edge-case testing but worth noting the function's type contract (`goalName: string`) is being violated. — `__tests__/utils.test.ts` (line ~260)
- [LOW] The `resolveCapabilityConfig` function from `src/utils.ts` is not tested in this step. This is by design (assigned to Step 5), but it means utils.ts currently has a partially-tested public export. — `src/utils.ts`

## Test Coverage Analysis
All acceptance criteria are fully covered:

| Function | Tests Required | Tests Implemented | Edge Cases |
|---|---|---|---|
| `resolveGoalDir` | Normal names, special chars | 4 ✅ | Hyphens, underscores, dots, platform separators |
| `goalExists` | Existing/missing dir | 3 ✅ | File-vs-dir semantics documented |
| `queueDir` | Correct path, creation, idempotent | 3 ✅ | — |
| `findIssuePath` | Absolute, filename, slug, missing | 5 ✅ | All four code paths covered |
| `readIssue` | Content read, missing, multiline | 3 ✅ | Newline preservation verified |
| `enqueueTask` | File path, JSON, overwrite, indent | 4 ✅ | Idempotent overwrite + formatting |
| `readPendingTask` | Parse, missing, round-trip | 3 ✅ | Deep equality on round-trip |
| `listPendingGoals` | Empty, scan, non-task files | 4 ✅ | Prefix/suffix extraction correct |
| `writeLastTask` | File creation, JSON content | 2 ✅ | — |
| `deriveSessionName` | All three format variants | 5 ✅ | Undefined input, zero step |
| `stepFolderName` | Padding, two-digit, zero | 3 ✅ | S01-S09, S10+, S00 |
| `discoverNextStep` | Empty, sequential, gaps | 6 ✅ | Missing TEST.md, gap scanning, COMPLETED marker |

**Total: 45 tests across all 12 functions.** No coverage gaps relative to TASK.md requirements. The one untested function (`resolveCapabilityConfig`) is correctly deferred to Step 5.

## Gaps Identified
- **GOAL ↔ PLAN ↔ TASK ↔ Implementation:** Fully aligned. Step 2 scope (pure utility tests) matches the GOAL's Tier 1 objective. No deviations.
- **`resolveCapabilityConfig` exclusion:** Correctly excluded per TASK.md ("This function is tested in Step 5, not Step 2 — don't test it here."). No gap.

## Recommendations
N/A — no changes required. The low issues are cosmetic and can be addressed during any future maintenance pass.
