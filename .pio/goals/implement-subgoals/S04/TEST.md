# Tests: State machine transitions

## Unit Tests

**File:** `src/state-machine.test.ts` (existing — append new describe blocks)

### `getStepMetadata` — frontmatter reading

- **Test cases:**
  - "`describe('getStepMetadata')`: given a PLAN.md with valid frontmatter containing a `steps` array, should return `{ name, complexity }` for an in-bounds step number"
  - "should default `complexity` to `'task'` when the field is omitted from the frontmatter entry"
  - "should map step N to index N-1 in the `steps` array"
  - "should return `null` when PLAN.md does not exist"
  - "should return `null` when PLAN.md has no YAML frontmatter block"
  - "should return `null` when frontmatter is valid YAML but fails schema validation (e.g., missing `totalSteps`)"
  - "should return `null` when the `steps` array is absent from frontmatter"
  - "should return `null` when `stepNumber` is out of bounds (greater than steps array length)"
  - "should return `null` when `stepNumber` is 0 or negative"

### Subgoal spawning — `transitionEvolvePlan`

- **Test cases:**
  - "`describe('resolveTransition — evolve-plan → create-goal (subgoal)')`: given a step with `complexity: 'subgoal'` in frontmatter, should route to `create-goal`"
  - "should include `parentGoalName`, `parentStepNumber`, and `subgoalType: true` in returned params"
  - "should include explicit `workingDir` matching `<cwd>/.pio/goals/<parent>/S{NN}/subgoals/<name>` (verify via mocked `process.cwd()`)"
  - "should use the step's `name` from frontmatter as the subgoal `goalName` in params"
  - "should route to `execute-task` when step has `complexity: 'task'` (backward compatible)"
  - "should route to `execute-task` when `getStepMetadata` returns `null` (no frontmatter, backward compatible)"
  - "should route to `revise-plan` when `revisionNeeded()` is true even for subgoal steps (revision check takes priority)"

### Completion propagation — `transitionFinalizeGoal`

- **Test cases:**
  - "`describe('resolveTransition — finalize-goal completion propagation')`: given `parentGoalName` and `parentStepNumber: 3` in params, should route to `evolve-plan` for parent with `stepNumber: 4`"
  - "should use `parentGoalName` as the `goalName` in returned params"
  - "should NOT include `parentGoalName` or `parentStepNumber` in returned params (param pollution prevention)"
  - "should NOT include `subgoalType` in returned params"
  - "given no `parentGoalName` in params, should return `undefined` (top-level goal, backward compatible)"
  - "given `parentGoalName` is not a string (e.g., number), should return `undefined` (type guard)"

### Integration — full subgoal lifecycle through resolveTransition

- **Test cases:**
  - "`describe('resolveTransition — subgoal lifecycle')`: evolve-plan on step with `complexity: 'subgoal'` → create-goal"
  - "create-goal → create-plan (existing, no change needed but verify in chain)"
  - "finalize-goal with parent context → evolve-plan for parent with incremented step number"

### Backward compatibility — existing transitions unaffected

- **Test cases:**
  - "`describe('resolveTransition — backward compatibility')`: `finalize-goal` without `parentGoalName` still returns `undefined`"
  - "`evolve-plan` with explicit `stepNumber` still routes to `execute-task` when no subgoal metadata present"
  - "All existing transition tests continue to pass (no regressions)"

## Programmatic Verification

- **What:** TypeScript compilation passes with no errors
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no error output

- **What:** Existing test suite passes with no regressions
  - **How:** `npm test`
  - **Expected result:** All existing tests pass (count should increase by new tests only)

- **What:** No body-scanning regex for subgoal detection exists
  - **How:** `grep -n '\[subgoal\]' src/state-machine.ts || echo "No match — PASS"`
  - **Expected result:** No match found (no `[subgoal]` regex in state-machine.ts)

- **What:** `getStepMetadata` is exported from state-machine module
  - **How:** `grep 'export function getStepMetadata' src/state-machine.ts`
  - **Expected result:** Line present with correct signature

## Test Order

1. `getStepMetadata` unit tests (isolated, no dependency on transition logic)
2. Subgoal spawning unit tests (depend on `getStepMetadata` working)
3. Completion propagation unit tests (independent of subgoal spawning)
4. Integration lifecycle tests (combine spawning + propagation)
5. Backward compatibility verification (existing tests should pass unchanged)
6. Programmatic checks (type compilation, grep verifications)
