# Tests: Create finalize-goal capability module

## Unit Tests

### CAPABILITY_CONFIG structure

- **File:** `src/capabilities/finalize-goal.test.ts`
- **Test runner:** Vitest

- `describe("CAPABILITY_CONFIG")`:
  - `it("prompt is 'finalize-goal.md'")` — expect `CAPABILITY_CONFIG.prompt` to equal `"finalize-goal.md"`
  - `it("writeAllowlist contains exactly 7 file paths")` — expect `CAPABILITY_CONFIG.writeAllowlist?.length` to be 7
  - `it("writeAllowlist includes OVERVIEW.md")` — expect `.pio/PROJECT/OVERVIEW.md` in writeAllowlist
  - `it("writeAllowlist includes DEVELOPMENT.md")` — expect `.pio/PROJECT/DEVELOPMENT.md` in writeAllowlist
  - `it("writeAllowlist includes CONVENTIONS.md")` — expect `.pio/PROJECT/CONVENTIONS.md` in writeAllowlist
  - `it("writeAllowlist includes GIT.md")` — expect `.pio/PROJECT/GIT.md` in writeAllowlist
  - `it("writeAllowlist includes ARCHITECTURE.md")` — expect `.pio/PROJECT/ARCHITECTURE.md` in writeAllowlist
  - `it("writeAllowlist includes DEPENDENCIES.md")` — expect `.pio/PROJECT/DEPENDENCIES.md` in writeAllowlist
  - `it("writeAllowlist includes GLOSSARY.md")` — expect `.pio/PROJECT/GLOSSARY.md` in writeAllowlist
  - `it("validation is undefined (no file validation)")` — expect `CAPABILITY_CONFIG.validation` to be `undefined`

### defaultInitialMessage

- **File:** `src/capabilities/finalize-goal.test.ts`
- **Test runner:** Vitest

- `describe("CAPABILITY_CONFIG.defaultInitialMessage")`:
  - `it("returns a non-empty string when goalDir is provided")` — call with `/tmp/test` and `{ goalDir: "/abs/goal/dir" }`, expect string length > 0
  - `it("includes the goal directory path in the message")` — verify the returned message contains the absolute goal dir path passed via params.goalDir
  - `it("includes the word 'goal' or references goal workspace")` — the message should clearly indicate this is about finalizing a goal

### setupFinalizeGoal registration

- **File:** `src/capabilities/finalize-goal.test.ts`
- **Test runner:** Vitest

- `describe("setupFinalizeGoal")`:
  - `it("registers a tool named pio_finalize_goal")` — mock `pi.registerTool`, call `setupFinalizeGoal`, verify the registered tool has `name: "pio_finalize_goal"`
  - `it("registers a command named pio-finalize-goal")` — mock `pi.registerCommand`, call `setupFinalizeGoal`, verify command name is `"pio-finalize-goal"`
  - `it("command description references PROJECT documentation or finalization")` — verify the command description mentions `.pio/PROJECT/` or "finalize"

### Validation function (if extracted)

- **File:** `src/capabilities/finalize-goal.test.ts`
- **Test runner:** Vitest

If validation logic is extracted into a standalone function (e.g., `validateFinalizeGoal(name, cwd)`), test it with temp directory trees:

- `describe("validateFinalizeGoal")`:
  - `it("returns ready: true when goal dir exists and COMPLETED marker is present")` — create temp dir tree with `.pio/goals/<name>/COMPLETED`, expect `{ ready: true }`
  - `it("returns error when goal directory does not exist")` — pass non-existent goal name, expect `ready: false` with error mentioning the goal doesn't exist
  - `it("returns error when COMPLETED marker is missing (goal not complete)")` — create goal dir without COMPLETED, expect `ready: false` with error about goal not being complete
  - `it("returns error when goal dir exists but has no GOAL.md")` — if the validation also checks for GOAL.md existence

Use temp directories (`fs.mkdtempSync` + `os.tmpdir()`) and clean up in `afterEach`. Follow the pattern from `src/capabilities/create-plan.test.ts` — specifically the `createGoalTree()` helper.

## Programmatic Verification

- **What:** TypeScript compilation succeeds with no type errors
- **How:** `npx tsc --noEmit`
- **Expected result:** Exit code 0, no error output

- **What:** All existing tests still pass (no regressions)
- **How:** `npx vitest run`
- **Expected result:** All 451+ existing tests pass. New tests in `finalize-goal.test.ts` also pass.

- **What:** CAPABILITY_CONFIG is exported from the module
- **How:** `grep -c "export const CAPABILITY_CONFIG" src/capabilities/finalize-goal.ts`
- **Expected result:** Match count is 1

- **What:** setupFinalizeGoal is exported as a function
- **How:** `grep -c "export function setupFinalizeGoal" src/capabilities/finalize-goal.ts`
- **Expected result:** Match count is 1

- **What:** Tool is defined with correct name
- **How:** `grep "pio_finalize_goal" src/capabilities/finalize-goal.ts`
- **Expected result:** At least one match (the tool name in defineTool)

- **What:** GoalState.createGoalState and goalCompleted are used for validation
- **How:** `grep -c "goalCompleted" src/capabilities/finalize-goal.ts`
- **Expected result:** At least 1 match — COMPLETED validation uses GoalState

- **What:** GoalState.lastStepDecisions is NOT called (Step 4 deviation)
- **How:** `grep -c "lastStepDecisions" src/capabilities/finalize-goal.ts`
- **Expected result:** 0 matches

## Test Order

1. Unit tests (`src/capabilities/finalize-goal.test.ts`) — CAPABILITY_CONFIG, defaultInitialMessage, setupFinalizeGoal
2. Programmatic verification — TypeScript compilation, test suite pass, grep checks
