# Summary: Move test generation from evolve-plan to execute-task

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/goal-state.ts` — `status()` returns `"defined"` when TASK.md exists alone (removed TEST.md conjunction check)
- `src/capabilities/evolve-plan.ts` — Removed TEST_FILE from `resolveEvolveValidation`, `resolveEvolveWriteAllowlist`, and `defaultInitialMessage`. Updated tool description and doc comments.
- `src/capabilities/execute-task.ts` — Removed TEST_FILE from `resolveExecuteReadOnlyFiles`. Added TEST_FILE to `resolveExecuteValidation` (exit-gate requires TEST.md + SUMMARY.md). Updated `validateExplicitStep` to check only `hasTask()`. Updated `defaultInitialMessage` to instruct creating TEST.md and writing tests first. Updated tool description and doc comments.
- `src/prompts/evolve-plan.md` — Removed "Write TEST.md" step (Step 6). Updated intro to produce TASK.md only. Updated guidelines to reference TASK.md as the only output.
- `src/prompts/execute-task.md` — Added Step 4: Create TEST.md (concise format with "Given ____ when ____ then ____" pattern). Updated Step 5 to implement tests from TEST.md. Updated step numbering throughout.
- `src/goal-state.test.ts` — Renamed test to reflect new behavior. Added test for TASK.md-only → "defined". Added test for TEST.md-only → "pending".
- `src/capabilities/evolve-plan.test.ts` — Updated validation and allowlist tests to expect TASK.md only (no TEST.md). Added tests for TEST.md exclusion, defaultInitialMessage TASK.md-only, and TASK.md-only folder behavior.
- `src/capabilities/execute-task.test.ts` — Updated "missing TEST.md" test to expect `true` (TASK.md-only is ready). Updated normal message test to assert TEST.md is mentioned. Added TEST.md creation test. Added resolveExecuteReadOnlyFiles test. Added TASK.md-only readiness tests.
- `src/capability-config.test.ts` — Updated evolve-plan validation/allowlist and execute-task readOnlyFiles tests to assert TEST.md is excluded.

## Files Deleted
- (none)

## Decisions Made
- **evolve-plan produces TASK.md only:** TEST.md is no longer an evolve-plan output. TASK.md is the universal step input artifact for both execute-task and create-goal (subgoals).
- **execute-task creates TEST.md first:** As the first step of execution, the executor creates TEST.md with concise test cases in "Given ____ when ____ then ____" format. Then implements tests and code.
- **review-task reads TEST.md (unchanged):** The review agent continues to read TEST.md as input. No changes needed to review-task code or prompt.
- **TASK.md-only readiness:** A step is ready for execution when TASK.md exists alone (no TEST.md required). execute-task creates TEST.md during execution.
- **TEST_FILE constants retained but unused in evolve-plan:** The `TEST_FILE` constant remains defined in evolve-plan.ts but is no longer referenced in validation, allowlist, or message logic.
- **`hasTest()` method retained on StepStatus:** The method remains on the interface and implementation but is no longer used as a readiness gate.
- **`currentStepNumber()` unchanged:** It checks for APPROVED markers, not file status. A step with only TASK.md (no APPROVED) is still the current step.

## Test Coverage
- **611 tests pass** (all existing tests + new tests)
- **TypeScript type check passes** (`npx tsc --noEmit`)
- **GoalState status:** TASK.md-only → "defined", TEST.md-only → "pending", empty → "pending"
- **Evolve-plan validation:** Expects only TASK.md (not TEST.md)
- **Evolve-plan write allowlist:** Does not include TEST.md
- **Evolve-plan defaultInitialMessage:** Mentions TASK.md only, not TEST.md
- **Execute-task readOnlyFiles:** Returns TASK.md only
- **Execute-task validateExplicitStep:** Passes with TASK.md alone
- **Execute-task defaultInitialMessage:** Mentions creating TEST.md and writing tests first
- **Prompt files:** evolve-plan.md no longer instructs writing TEST.md; execute-task.md instructs creating TEST.md first with concise format
