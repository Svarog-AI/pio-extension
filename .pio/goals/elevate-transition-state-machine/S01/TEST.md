# Tests: Create `GoalState` interface and factory in `src/goal-state.ts`

## Unit Tests

### File: `src/goal-state.test.ts`

**Test runner:** Vitest (`npm run test`)  
**Pattern:** Collocated test file (matches existing `fs-utils.test.ts`, `transitions.test.ts` conventions). Use real filesystem with temp directories — no mocks.

#### describe("createGoalState — construction")

- **Given a valid goal directory path, `goalName` is derived from the basename.**  
  Arrange: create temp dir `.pio/goals/my-feature/`. Act: call `createGoalState(goalDir)`. Assert: `state.goalName === "my-feature"`.

- **Given a deeply nested path, `goalName` extracts only the last segment.**  
  Arrange: goalDir = `/a/b/c/.pio/goals/deeply-nested-goal/`. Assert: `state.goalName === "deeply-nested-goal"`.

- **All methods execute without throwing on an empty goal directory.**  
  Arrange: create empty goal dir (no GOAL.md, no step folders, no queue files). Act: call each method (`hasGoal()`, `hasPlan()`, `totalPlanSteps()`, `steps()`, `currentStepNumber()`, `pendingTask()`, `lastCompleted()`). Assert: none throw; return safe defaults (`false`, `undefined`, `[]`).

#### describe("hasGoal()")

- **Returns true when GOAL.md exists.**  
  Arrange: create `<goalDir>/GOAL.md` with any content. Assert: `state.hasGoal() === true`.

- **Returns false when GOAL.md does not exist.**  
  Arrange: empty goal dir. Assert: `state.hasGoal() === false`.

- **Reflects filesystem changes (no caching).**  
  Arrange: empty goal dir, call `hasGoal()` → false. Create GOAL.md. Call `hasGoal()` again → true.

#### describe("hasPlan()")

- **Returns true when PLAN.md exists.**  
  Arrange: create `<goalDir>/PLAN.md`. Assert: `state.hasPlan() === true`.

- **Returns false when PLAN.md does not exist.**  
  Arrange: empty goal dir. Assert: `state.hasPlan() === false`.

#### describe("totalPlanSteps()")

- **Parses step count from PLAN.md with "## Step N:" headings.**  
  Arrange: write PLAN.md containing `## Step 1: Title A` and `## Step 2: Title B` and `## Step 3: Title C`. Assert: `state.totalPlanSteps() === 3`.

- **Returns undefined when PLAN.md does not exist.**  
  Arrange: no PLAN.md. Assert: `state.totalPlanSteps() === undefined`.

- **Returns undefined for PLAN.md with no step headings.**  
  Arrange: PLAN.md with content but no `## Step N:` lines. Assert: `state.totalPlanSteps() === undefined`.

- **Handles non-sequential step numbers (returns highest N).**  
  Arrange: PLAN.md with `## Step 1:` and `## Step 5:`. Assert: `state.totalPlanSteps() === 5`.

#### describe("steps()")

- **Returns empty array when no S{NN} folders exist.**  
  Arrange: empty goal dir. Assert: `state.steps().length === 0`.

- **Discovers step folders S01, S02, etc. and returns correct count.**  
  Arrange: create S01/, S02/, S03/ directories. Assert: `state.steps().length === 3`.

- **Returns correct stepNumber and folderName for each step.**  
  Arrange: create S01/, S03/. Assert: first has `stepNumber: 1, folderName: "S01"`, second has `stepNumber: 3, folderName: "S03"`.

- **Sorts results by stepNumber ascending.**  
  Arrange: create S03/, S01/, S02/. Assert: returned array order is [1, 2, 3].

- **`StepStatus.status()` returns "pending" for an empty step folder (no files).**  
  Arrange: create S01/ with no files. Assert: `state.steps()[0].status() === "pending"`.

- **`StepStatus.status()` returns "defined" when TASK.md + TEST.md exist but no markers.**  
  Arrange: create S01/TASK.md and S01/TEST.md. Assert: `state.steps()[0].status() === "defined"`.

- **`StepStatus.status()` returns "implemented" when COMPLETED marker exists.**  
  Arrange: create S01/TASK.md, S01/TEST.md, S01/COMPLETED. Assert: `state.steps()[0].status() === "implemented"`.

- **`StepStatus.status()` returns "approved" when APPROVED marker exists.**  
  Arrange: create S01/TASK.md, S01/TEST.md, S01/APPROVED. Assert: `state.steps()[0].status() === "approved"`.

- **`StepStatus.status()` returns "rejected" when REJECTED marker exists.**  
  Arrange: create S01/TASK.md, S01/TEST.md, S01/REJECTED. Assert: `state.steps()[0].status() === "rejected"`.

- **`StepStatus.status()` returns "blocked" when BLOCKED marker exists.**  
  Arrange: create S01/TASK.md, S01/TEST.md, S01/BLOCKED. Assert: `state.steps()[0].status() === "blocked"`.

- **Marker precedence: APPROVED > REJECTED > BLOCKED > COMPLETED (when multiple markers exist).**  
  Arrange: create S01/ with both COMPLETED and APPROVED. Assert: `status() === "approved"`.

- **`StepStatus.hasTask()` returns true/false based on TASK.md existence.**  
  Arrange: S01/ without TASK.md → false. Add TASK.md → true.

- **`StepStatus.hasTest()` returns true/false based on TEST.md existence.**  
  Same pattern as above but for TEST.md.

- **`StepStatus.hasSummary()` returns true/false based on SUMMARY.md existence.**  
  Arrange: S01/ without SUMMARY.md → false. Add SUMMARY.md → true.

- **Ignores non-step folders (e.g., "README", "docs").**  
  Arrange: create `S01/` and `docs/` in goal dir. Assert: `steps()` returns only one entry (S01).

#### describe("currentStepNumber()")

- **Returns undefined when no step folders exist.**  
  Arrange: empty goal dir. Assert: `state.currentStepNumber() === undefined`.

- **Returns 1 when S01 has TASK.md + TEST.md (next = 2, but first defined is 1, so next is 2).**  
  Arrange: create S01/TASK.md and S01/TEST.md. Assert: `state.currentStepNumber() === 2`.

- **Returns N+1 where N is highest defined step.**  
  Arrange: S01/TASK.md + TEST.md, S02/TASK.md + TEST.md. Assert: `state.currentStepNumber() === 3`.

- **Incomplete step (missing TEST.md) does not count as defined.**  
  Arrange: S01/TASK.md only (no TEST.md). Assert: `state.currentStepNumber() === 1` (highest defined = 0, next = 1).

#### describe("pendingTask()")

- **Returns parsed task object when queue file exists.**  
  Arrange: create `<cwd>/.pio/session-queue/task-{goalName}.json` with `{"capability":"evolve-plan","params":{"stepNumber":2}}`. Assert: result has correct capability and params.

- **Returns undefined when no pending task file exists.**  
  Arrange: no queue file. Assert: `state.pendingTask() === undefined`.

- **Returns undefined for malformed JSON in queue file.**  
  Arrange: write invalid JSON to queue file. Assert: `state.pendingTask() === undefined` (no throw).

#### describe("lastCompleted()")

- **Returns parsed task object when LAST_TASK.json exists.**  
  Arrange: create `<goalDir>/LAST_TASK.json` with valid JSON. Assert: result matches the written data.

- **Returns undefined when LAST_TASK.json does not exist.**  
  Arrange: no LAST_TASK.json. Assert: `state.lastCompleted() === undefined`.

## Programmatic Verification

- **TypeScript compilation passes.**  
  What: No type errors in the new module.  
  How: `npm run check` (runs `tsc --noEmit`)  
  Expected result: Exit code 0, no output about `src/goal-state.ts`.

- **Module exports are correct.**  
  What: `createGoalState`, `GoalState`, and `StepStatus` are all exported from the module.  
  How: `grep -c "export" src/goal-state.ts` (should show export statements) and verify in test imports.  
  Expected result: Exports exist and are importable from test files.

- **No `node:fs` async operations used.**  
  What: All filesystem reads are sync (`fs.existsSync`, `fs.readFileSync`, `fs.readdirSync`).  
  How: `grep -n "fs\." src/goal-state.ts | grep -v "existsSync\|readFileSync\|readdirSync\|mkdirSync"`  
  Expected result: No async fs calls (no promises, no callbacks).

## Test Order

1. Unit tests — `npm run test src/goal-state.test.ts`
2. Programmatic verification — `npm run check`

The unit tests use real filesystem operations with temp directories (following the established pattern in `fs-utils.test.ts`, `transitions.test.ts`, `queues.test.ts`). No mocks or stubs are needed since `GoalState` is a thin filesystem wrapper.
