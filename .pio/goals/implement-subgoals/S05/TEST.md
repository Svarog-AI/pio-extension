# Tests: Move test generation from evolve-plan to execute-task

## Unit Tests

### File: `src/goal-state.test.ts`

**Test runner:** Vitest (update existing tests)

**Test cases to update:**

- `describe("StepStatus.status()")`: 
  - **Update:** "returns 'defined' when TASK.md + TEST.md exist" → should now pass with TASK.md alone. Rename test to reflect new behavior: "returns 'defined' when TASK.md exists".
  - **Add new test:** "returns 'pending' when only TEST.md exists (no TASK.md)". Create a folder with only `TEST.md` — status should be `"pending"` because TASK.md is the defining artifact.
  - **Verify unchanged:** "returns 'pending' for empty step folder" still passes.

**Test cases to add:**

- "returns 'defined' when only TASK.md exists (no TEST.md)": Create a goal tree with `[{"number": 1, "files": ["TASK.md"]}]`, assert `status() === "defined"`.
- "hasTest() returns true when TEST.md exists": Verify the method still works independently (it's kept on the interface).

### File: `src/capabilities/evolve-plan.test.ts`

**Test runner:** Vitest (update existing tests)

**Test cases to update:**

- `describe("resolveEvolveValidation with DECISIONS_FILE")`:
  - **Update:** Step 1 validation expects `["S01/TASK.md"]` only (not `["S01/TASK.md", "S01/TEST.md"]`). 
  - **Update:** Step 2 validation expects `["S02/TASK.md", "S02/DECISIONS.md"]` only (remove TEST.md).
  - **Update:** Step 3+ validation similarly excludes TEST.md.

- `describe("resolveEvolveWriteAllowlist")`:
  - **Update:** Allowlist should NOT contain `S02/TEST.md`. Verify: `not.toContain("S02/TEST.md")`.
  
- `describe("resolveEvolveWriteAllowlist with DECISIONS_FILE")`:
  - **Update:** Step 1 allowlist length should be 3 (`COMPLETED`, `S01/TASK.md`, `S01/REVISE_PLAN_NEEDED`) instead of 4.
  - **Update:** Step 2 allowlist should not include `S02/TEST.md`. Length adjusts accordingly.

**Test cases to add:**

- "resolveEvolveValidation excludes TEST.md for stepNumber=1": Assert validation files equals `["S01/TASK.md"]` exactly.
- "defaultInitialMessage mentions TASK.md only": Assert message contains "TASK.md" but does NOT contain "TEST.md".

### File: `src/capabilities/execute-task.test.ts`

**Test runner:** Vitest (update existing tests)

**Test cases to update:**

- `describe("isStepReady")`:
  - **Update:** "missing TEST.md → false" test should now expect `true`. A step with only TASK.md is ready. Rename to: "TASK.md only → true".
  - **Verify unchanged:** "TASK.md + TEST.md present, no markers → true" still passes (both files present = defined).
  - **Verify unchanged:** "missing TASK.md → false" still fails (no TASK.md = pending).

- `describe("defaultInitialMessage — rejection feedback channel")`:
  - **Update:** "normal message is present when no rejection" — message should reference deriving tests from TASK.md, not reading TEST.md. Assert message does NOT contain "TEST.md".
  - **Add test:** "normal message instructs TDD methodology": Assert message contains TDD-related language ("TDD", "test-driven", "write tests first", etc.).

**Test cases to add:**

- "resolveExecuteReadOnlyFiles returns TASK.md only": Use `CAPABILITY_CONFIG.readOnlyFiles(goalDir, { stepNumber: 1 })` and assert result is `["S01/TASK.md"]` (not including TEST.md).
- "validateExplicitStep passes with TASK.md alone": Mock a goal state where only TASK.md exists, assert `ready: true`.

## Integration Tests

### File: `src/capabilities/evolve-plan.test.ts`

**What:** Verify the end-to-end validation flow — evolve-plan considers a step complete when only TASK.md exists.

**Test cases:**
- "validateAndFindNextStep with TASK.md-only folder finds next un-defined step": Create S01 with TASK.md (status "defined") and no S02. `currentStepNumber()` should return 2. The step is specified but not yet implemented — evolve-plan moves to the next number.

## Programmatic Verification

- **What:** TypeScript type checking passes
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no errors

- **What:** Full test suite passes
  - **How:** `npm test` (vitest run)
  - **Expected result:** All tests pass, 0 failures, 0 regressions. Verify total test count is consistent with added/updated tests.

- **What:** Evolve-plan validation excludes TEST.md
  - **How:** `grep -c "TEST_FILE\|TEST\.md" src/capabilities/evolve-plan.ts` 
  - **Expected result:** 0 occurrences of TEST_FILE or TEST.md in evolve-plan code (the constant may still exist but should not be referenced in validation/allowlist/message)

- **What:** Execute-task read-only files exclude TEST.md
  - **How:** `grep -n "TEST_FILE\|TEST\.md" src/capabilities/execute-task.ts`
  - **Expected result:** TEST_FILE/TEST.md may exist as a constant but should not appear in `resolveExecuteReadOnlyFiles` return value.

- **What:** GoalState status logic updated
  - **How:** `grep -A2 'TASK_FILE.*TEST_FILE\|fs.existsSync.*TASK.*fs.existsSync.*TEST' src/goal-state.ts`
  - **Expected result:** The "defined" check should use only TASK_FILE existence, not a conjunction with TEST_FILE.

- **What:** Evolve-plan prompt no longer instructs writing TEST.md
  - **How:** `grep -i "test\.md" src/prompts/evolve-plan.md`
  - **Expected result:** No references to producing/writing TEST.md (may still reference TEST.md in test plan context, but not as an output artifact)

- **What:** Execute-task prompt instructs TDD methodology
  - **How:** `grep -i "tdd\|test-driven\|write tests" src/prompts/execute-task.md`
  - **Expected result:** Contains references to TDD or test-driven development, writing tests first based on TASK.md

## Test Order

1. Update `src/goal-state.test.ts` status tests (foundational — other tests depend on correct status behavior)
2. Update `src/capabilities/evolve-plan.test.ts` validation and allowlist tests
3. Update `src/capabilities/execute-task.test.ts` readiness and message tests
4. Run full test suite: `npm test`
5. Run type check: `npx tsc --noEmit`
6. Verify prompt file changes with grep commands
