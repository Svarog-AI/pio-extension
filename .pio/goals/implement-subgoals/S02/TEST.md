# Tests: Queue keying

## Unit Tests

### File: `src/queues.test.ts`

**Test runner:** Vitest (colocated, Node.js environment)

#### `describe("deriveQueueKey(goalDir, cwd)")`

- **Given a flat goal path, it returns the goal basename unchanged.**
  - Arrange: `goalDir = "/repo/.pio/goals/my-feature"`, `cwd = "/repo"`
  - Act: `deriveQueueKey(goalDir, cwd)`
  - Assert: returns `"my-feature"`

- **Given a nested subgoal path, it filters out `subgoals` and joins with `__`.**
  - Arrange: `goalDir = "/repo/.pio/goals/parent/S03/subgoals/nested"`, `cwd = "/repo"`
  - Act: `deriveQueueKey(goalDir, cwd)`
  - Assert: returns `"parent__S03__nested"`

- **Given a deeply nested path (multiple levels), it filters all `subgoals` markers.**
  - Arrange: `goalDir = "/repo/.pio/goals/a/S01/subgoals/b/S02/subgoals/c"`, `cwd = "/repo"`
  - Act: `deriveQueueKey(goalDir, cwd)`
  - Assert: returns `"a__S01__b__S02__c"`

- **Given a goal path with a single-segment name after goals/, it handles gracefully.**
  - Arrange: `goalDir = "/repo/.pio/goals/x"`, `cwd = "/repo"`
  - Act: `deriveQueueKey(goalDir, cwd)`
  - Assert: returns `"x"`

- **Given a goalDir that doesn't contain `.pio/goals/`, it falls back to basename.**
  - Arrange: `goalDir = "/some/random/path"`, `cwd = "/repo"`
  - Act: `deriveQueueKey(goalDir, cwd)`
  - Assert: returns `"path"` (the basename)

#### `describe("enqueueTask with qualifiedName")`

- **When qualifiedName is omitted, it writes to task-{goalName}.json (backward compatible).**
  - Arrange: temp dir with `.pio/session-queue`
  - Act: `enqueueTask(cwd, "my-goal", { capability: "create-plan" })` — no `qualifiedName` arg
  - Assert: file `task-my-goal.json` exists in queue dir

- **When qualifiedName is provided, it writes to task-{qualifiedName}.json.**
  - Arrange: temp dir
  - Act: `enqueueTask(cwd, "nested", { capability: "create-plan" }, "parent__S03__nested")`
  - Assert: file `task-parent__S03__nested.json` exists in queue dir

- **qualifiedName and goalName can differ — both produce separate files.**
  - Arrange: temp dir
  - Act: enqueue with `goalName="a"` (no qualifiedName), then enqueue with `goalName="b"`, `qualifiedName="parent__S03__b"`
  - Assert: `task-a.json` and `task-parent__S03__b.json` both exist independently

- **Empty-string qualifiedName is treated as a valid name (!== undefined check).**
  - Arrange: temp dir
  - Act: `enqueueTask(cwd, "x", task, "")` — empty string, not undefined
  - Assert: file `task-.json` exists (empty string is a valid but unusual key; the guard is `!== undefined`, so it uses the value as-is)

#### `describe("readPendingTask with qualifiedName")`

- **When qualifiedName is omitted, it reads task-{goalName}.json (backward compatible).**
  - Arrange: write `task-my-goal.json` to queue dir via `enqueueTask`
  - Act: `readPendingTask(cwd, "my-goal")` — no `qualifiedName` arg
  - Assert: returns the correct task object

- **When qualifiedName is provided, it reads task-{qualifiedName}.json.**
  - Arrange: write `task-parent__S03__nested.json` to queue dir
  - Act: `readPendingTask(cwd, "nested", "parent__S03__nested")`
  - Assert: returns the correct task object

- **Returns undefined when no file matches the qualifiedName.**
  - Arrange: empty queue dir
  - Act: `readPendingTask(cwd, "x", "nonexistent__key")`
  - Assert: returns `undefined`

#### Verify existing tests still pass (no regressions)

- All existing `enqueueTask` tests (4 cases) pass unchanged — they don't pass `qualifiedName`, so default behavior is tested.
- All existing `readPendingTask` tests (3 cases) pass unchanged.
- All existing `listPendingGoals` tests (4 cases) pass unchanged.
- All existing `queueDir` tests (3 cases) pass unchanged.
- All existing `writeLastTask` tests (2 cases) pass unchanged.

### File: `src/goal-state.test.ts`

**Test runner:** Vitest (colocated, Node.js environment)

#### Verify existing `pendingTask()` tests still pass (no regressions)

- Existing test "returns parsed task object when queue file exists" uses a flat goal name — should pass identically since `deriveQueueKey` for flat goals returns the basename.
- Existing test "returns undefined when no pending task file exists" — passes unchanged.
- Existing test "returns undefined for malformed JSON" — passes unchanged.

#### `describe("pendingTask() with nested subgoal paths")` — new tests

- **Given a nested subgoal goalDir, it reads from the correct qualified queue file.**
  - Arrange: Create a nested directory structure at `<temp>/.pio/goals/parent/S03/subgoals/nested`. Write a queue file named `task-parent__S03__nested.json` with valid task data.
  - Act: `createGoalState(nestedGoalDir).pendingTask()`
  - Assert: returns the correct parsed task object (capability, params)

- **Given a flat goalDir, it reads from task-{basename}.json (backward compatible).**
  - Arrange: Create `<temp>/.pio/goals/my-feature`. Write `task-my-feature.json` with valid data.
  - Act: `createGoalState(flatGoalDir).pendingTask()`
  - Assert: returns the correct parsed task object

- **Given a nested subgoal goalDir with no matching queue file, it returns undefined.**
  - Arrange: Create nested structure but don't write any queue files.
  - Act: `createGoalState(nestedGoalDir).pendingTask()`
  - Assert: returns `undefined`

## Programmatic Verification

- **TypeScript compilation:** Run `npm run check` (`tsc --noEmit`). Expected result: 0 errors across the full codebase.
- **No regressions in existing tests:** Run `npm test`. Expected result: all pre-existing tests pass, plus new tests pass. Total test count increases by ~17 (14 in queues.test.ts + 3 in goal-state.test.ts).
- **`deriveQueueKey` is exported from `src/queues.ts`:** Verify with `grep "export function deriveQueueKey" src/queues.ts`. Expected: exactly one match.
- **`GoalState.pendingTask()` imports `deriveQueueKey`:** Verify with `grep "deriveQueueKey" src/goal-state.ts`. Expected: import + usage.

## Test Order

1. Unit tests for `deriveQueueKey` (pure function — no dependencies)
2. Unit tests for `enqueueTask`/`readPendingTask` with `qualifiedName` (depends on deriveQueueKey being correct)
3. Verify existing queue tests pass unchanged (regression check)
4. New `GoalState.pendingTask()` tests with nested paths (depends on both deriveQueueKey and the updated goal-state implementation)
5. Verify existing `pendingTask()` tests pass unchanged (regression check)
6. Programmatic verification: `npm run check` + `npm test`
