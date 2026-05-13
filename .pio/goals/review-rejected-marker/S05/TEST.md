# Tests: Simplify write allowlist and add `prepareSession` for review-code

## Unit Tests

- **File:** `__tests__/review-code-config.test.ts` (new file)
- **Test runner:** Vitest (`npx vitest run --reporter=verbose`)

### `resolveReviewWriteAllowlist` tests

**Test cases:**
- "`describe('resolveReviewWriteAllowlist')`: given a step number, should return array containing only REVIEW.md path" — verify the returned array has length 1 and contains `${folder}/REVIEW.md` (no `APPROVED`).
- "`it('excludes APPROVED from the write allowlist')`: verify `APPROVED` is not in the returned paths" — explicit negative check.
- "`it('throws when stepNumber is missing')`: should throw an Error mentioning stepNumber" — consistent with other review-code callbacks.

### `prepareSession` tests

**Test cases:**
- "`describe('CAPABILITY_CONFIG.prepareSession')`: should be defined as a function" — basic existence check.
- "`it('deletes stale APPROVED marker')`: create temp dir with S01/APPROVED, invoke prepareSession, verify file is gone."
- "`it('deletes stale REJECTED marker')`: create temp dir with S02/REJECTED, invoke prepareSession, verify file is gone."
- "`it('deletes both APPROVED and REJECTED when both exist')`: create both markers in same step folder, invoke prepareSession, verify both are gone."
- "`it('does not delete COMPLETED marker')`: create S01/COMPLETED alongside APPROVED, invoke prepareSession, verify COMPLETED still exists."
- "`it('does not delete REVIEW.md')`: create S01/REVIEW.md alongside APPROVED, invoke prepareSession, verify REVIEW.md still exists."
- "`it('handles missing markers gracefully (no error)')`: clean step folder with no APPROVED or REJECTED, invoke prepareSession — should not throw."
- "`it('throws when stepNumber is missing from params')`: call with empty params `{}` — should throw a descriptive Error."
- "`it('uses zero-padded step folder names')`: given stepNumber 5, should look for markers in `S05/` not `S5/`."

### Shared temp-dir helpers

Follow the established pattern from `__tests__/execute-task-initial-message.test.ts` and `__tests__/validation.test.ts`:
- `createTempDir()` using `fs.mkdtempSync(path.join(os.tmpdir(), "pio-review-test-"))`
- `cleanup(tempDir)` using `fs.rmSync(tempDir, { recursive: true, force: true })`
- Helper to create a goal directory tree with optional marker files in the step folder (mirror the `createGoalTree` pattern from `execute-task-initial-message.test.ts`)

## Programmatic Verification

- **What:** TypeScript compilation succeeds with no type errors after changes
- **How:** `npm run check`
- **Expected result:** Exit code 0, no output indicating type errors

- **What:** `resolveReviewWriteAllowlist` returns exactly one path ending in `REVIEW.md`
- **How:** `grep -A2 'return \[' src/capabilities/review-code.ts | grep resolveReviewWriteAllowlist` (or inspect the function body)
- **Expected result:** The return statement contains only `REVIEW_FILE`, no reference to `APPROVED`

- **What:** `prepareSession` is present in `CAPABILITY_CONFIG`
- **How:** `grep 'prepareSession' src/capabilities/review-code.ts`
- **Expected result:** At least two matches — the function definition and its assignment in `CAPABILITY_CONFIG`

## Test Order

1. Unit tests (`__tests__/review-code-config.test.ts`) — verify allowlist and prepareSession behavior
2. Programmatic verification — `npm run check` confirms no type regressions
