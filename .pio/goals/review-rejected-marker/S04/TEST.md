# Tests: Add re-execution feedback channel in `execute-task`

## Unit Tests

**File:** `__tests__/execute-task-initial-message.test.ts` (new)
**Test runner:** Vitest

### Test helper setup

Reuse the established pattern from `__tests__/step-discovery.test.ts`:
- `createTempDir()` / `cleanup()` for temp filesystem isolation
- `createGoalTree()` to construct goal directories with marker files

Tests should invoke `resolveCapabilityConfig` from `src/utils.ts` with capability `"execute-task"` and inspect the resolved `initialMessage` field. This exercises the full config resolution pipeline including `defaultInitialMessage`. Alternatively, import `CAPABILITY_CONFIG` directly from `../src/capabilities/execute-task` and call `defaultInitialMessage(workingDir, params)` — this is more direct and avoids loading unrelated capability modules.

### Test cases

**`describe("defaultInitialMessage — rejection feedback channel")`:**

1. **"includes REVIEW.md reference when REJECTED marker exists"**
   - Arrange: Create a temp goal tree with `S02/REJECTED` present. Call `defaultInitialMessage(goalDir, { stepNumber: 2 })`.
   - Assert: Message contains `"REVIEW.md"` and contains the step folder name (`"S02"`).

2. **"mentions re-execution context when REJECTED marker exists"**
   - Arrange: Same as above (temp goal tree with `S02/REJECTED`).
   - Assert: Message contains language indicating this is a re-execution (e.g., "rejected", "re-execution", or "previously rejected").

3. **"does not include rejection message when REJECTED marker absent"**
   - Arrange: Create a temp goal tree with `S01/` containing only `TASK.md` and `TEST.md` (no REJECTED). Call `defaultInitialMessage(goalDir, { stepNumber: 1 })`.
   - Assert: Message does NOT contain `"REVIEW.md"`.

4. **"normal message is present when no rejection"**
   - Arrange: Same as above (no REJECTED marker).
   - Assert: Message contains the standard instructions — references `TASK.md`, `TEST.md`, and mentions writing tests first.

5. **"handles missing stepNumber gracefully (error message unchanged)"**
   - Arrange: Call `defaultInitialMessage(goalDir, {})` with no stepNumber.
   - Assert: Returns an error message about missing stepNumber. Should NOT throw or crash when trying to construct the REJECTED path without a valid stepNumber.

6. **"handles non-existent step folder (no REJECTED) — normal message"**
   - Arrange: Create a goal dir but no `S03/` subdirectory at all. Call `defaultInitialMessage(goalDir, { stepNumber: 3 })`.
   - Assert: Returns the normal (non-rejection) message. `fs.existsSync` should return false for a non-existent folder path.

7. **"zero-padded step number in rejection message"**
   - Arrange: Create `S05/REJECTED`. Call with `stepNumber: 5`.
   - Assert: Message references `"S05"` (not `"S5"`), confirming `stepFolderName()` is used for zero-padding.

## Programmatic Verification

- **What:** TypeScript compilation succeeds with no type errors after the change
- **How:** `npm run check`
- **Expected result:** Exits 0, no output about type errors

- **What:** All existing tests still pass (no regressions)
- **How:** `npm run test`
- **Expected result:** All 168+ existing tests pass; new tests add ~7 more passing tests

- **What:** `execute-task.ts` contains the REJECTED detection logic
- **How:** `grep -n "REJECTED" src/capabilities/execute-task.ts`
- **Expected result:** At least one match referencing `"REJECTED"` string literal and a call to `fs.existsSync`

- **What:** `execute-task.ts` references `REVIEW.md` in the initial message
- **How:** `grep -n "REVIEW.md" src/capabilities/execute-task.ts`
- **Expected result:** At least one match inside the `defaultInitialMessage` callback

## Test Order

1. Unit tests (direct `defaultInitialMessage` invocation with temp filesystem)
2. Programmatic verification (`npm run check`, `npm run test`, grep checks)
