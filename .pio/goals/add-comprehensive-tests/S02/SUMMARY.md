# Summary: Test pure utilities (`utils.test.ts`)

## Status
COMPLETED

## Files Created
- `__tests__/utils.test.ts` — comprehensive tests for all 12 utility functions from `src/utils.ts` (45 tests)

## Files Modified
- (none — no source code changes were needed; this step was test-only)

## Files Deleted
- (none)

## Decisions Made
- **Self-contained fixture helpers:** Helper functions (`createTempDir`, `cleanup`, `createGoalTree`, `createIssueFiles`) are defined inline in the test file rather than extracted to a separate fixtures directory. This keeps things simple and avoids unnecessary module imports for Step 2.
- **Real filesystem over mocks:** Per TDD skill guidance, tests use real `fs` operations on temp directories (`fs.mkdtempSync`) instead of mocking the `fs` module. This provides higher confidence in actual behavior.
- **`goalExists` file semantics:** The function uses `fs.existsSync` directly, which returns `true` for both files and directories. A test documents this actual behavior rather than asserting a stricter contract.
- **No source code changes needed:** All 12 utility functions already exist and behave correctly in `src/utils.ts`. This step was purely about writing comprehensive tests (test-only step).

## Test Coverage
- **resolveGoalDir** — 4 tests: normal names, hyphens/underscores, dots, platform-independent separators
- **goalExists** — 3 tests: existing dir, non-existent path, file vs directory semantics
- **queueDir** — 3 tests: correct path, creates if missing, idempotent
- **findIssuePath** — 5 tests: absolute path, non-existent absolute, exact filename, bare slug, non-existent slug
- **readIssue** — 3 tests: existing content, missing issue, multiline content
- **enqueueTask** — 4 tests: correct file path, valid JSON, overwrite behavior, 2-space indentation
- **readPendingTask** — 3 tests: parsed object, missing task, round-trip preservation
- **listPendingGoals** — 4 tests: no queue dir, empty queue dir, multiple goals, ignores non-task files
- **writeLastTask** — 2 tests: file creation, valid JSON content
- **deriveSessionName** — 5 tests: empty goalName, undefined goalName, goal+capability, all three params, step zero
- **stepFolderName** — 3 tests: single-digit padding, two-digit numbers, zero edge case
- **discoverNextStep** — 6 tests: empty dir, single complete, multiple sequential, incomplete step, gap scanning, COMPLETED marker with specs

Total: **45 tests**, all passing. Each test uses isolated temp directories for full filesystem isolation.
