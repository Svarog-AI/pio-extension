# Tests: Test pure utilities (`utils.test.ts`)

## Unit Tests

**File:** `__tests__/utils.test.ts`  
**Test runner:** Vitest (globals mode — `describe`, `it`, `expect` available without imports)

### `resolveGoalDir(cwd, name)`

- **Builds correct path for normal names:** given cwd `/tmp/proj` and name `"my-feature"`, returns `/tmp/proj/.pio/goals/my-feature`
- **Handles names with hyphens and underscores:** name `"my_feature-v2"` → includes full name in path
- **Handles names with dots:** name `"feat.login"` → includes dot in path
- **Uses `path.join` (platform-independent):** returned path uses correct separator for the platform

### `goalExists(goalDir)`

- **Returns true for existing directory:** create a temp dir, pass its path → returns `true`
- **Returns false for non-existent path:** pass a path that doesn't exist → returns `false`
- **Returns false for a file (not directory):** create a temp file at the path → returns `false` (or `true` depending on `fs.existsSync` semantics — verify actual behavior and test against it)

### `queueDir(cwd)`

- **Returns correct path:** given cwd `/tmp/proj`, returns `/tmp/proj/.pio/session-queue`
- **Creates directory if missing:** before call, dir doesn't exist → after call, `fs.existsSync(dir)` is `true`
- **Idempotent — no error on repeated calls:** call twice with same cwd → both return the same path, no exception

### `findIssuePath(cwd, identifier)`

- **Resolves absolute path when file exists:** create a file at an absolute temp path, pass that path → returns the same path
- **Returns undefined for non-existent absolute path:** pass absolute path to a non-existent file → returns `undefined`
- **Resolves exact filename (`my-issue.md`):** create `.pio/issues/my-issue.md` in temp dir, pass `"my-issue.md"` → returns full path
- **Appends .md for bare slug (`my-issue`):** create `.pio/issues/my-issue.md`, pass `"my-issue"` → returns full path
- **Returns undefined for non-existent slug:** no matching file exists → returns `undefined`

### `readIssue(cwd, identifier)`

- **Returns file contents for existing issue:** write `"test content"` to an issue file → returns `"test content"`
- **Returns undefined for missing issue:** pass a non-existent identifier → returns `undefined`
- **Reads multiline content correctly:** write multi-line markdown → returned string contains newlines

### `enqueueTask(cwd, goalName, task)`

- **Creates correct file path:** after calling with goal `"my-goal"`, file `.pio/session-queue/task-my-goal.json` exists
- **Writes valid JSON:** read the file and parse — result has correct `capability` and `params` fields
- **Overwrites existing task:** call twice with same goalName but different task content → file contains the second task only
- **Uses 2-space indentation:** raw file content matches `JSON.stringify(task, null, 2)`

### `readPendingTask(cwd, goalName)`

- **Returns parsed object for existing task:** enqueue a task first, then read it back → returns object with correct fields
- **Returns undefined for missing task:** call without enqueuing → returns `undefined`
- **Round-trip preserves data:** enqueue `{ capability: "create-goal", params: { goalName: "x" } }`, read back → deep equal to original

### `listPendingGoals(cwd)`

- **Returns empty array when no queue dir exists:** don't create `.pio/session-queue/` → returns `[]`
- **Returns empty array for empty queue dir:** create dir but no files → returns `[]`
- **Extracts goal names correctly:** enqueue tasks for `"feat-a"` and `"feat-b"` → returns `["feat-a", "feat-b"]` (order may vary, use inclusion checks)
- **Ignores non-task files:** place a `task-my-goal.json` alongside other files (`readme.txt`, `other.json`) → only goal name is returned

### `writeLastTask(goalDir, task)`

- **Creates LAST_TASK.json in goal dir:** call with temp goalDir → `<goalDir>/LAST_TASK.json` exists
- **Writes valid JSON content:** read and parse the file → result matches the input task object

### `deriveSessionName(goalName, capability, stepNumber?)`

- **Empty goalName returns capability only:** `deriveSessionName("", "create-goal")` → `"create-goal"`
- **Undefined goalName returns capability only:** `deriveSessionName(undefined, "create-goal")` → `"create-goal"`
- **Goal + capability (no step):** `deriveSessionName("my-feature", "create-plan")` → `"my-feature create-plan"`
- **All three params:** `deriveSessionName("my-feature", "execute-task", 3)` → `"my-feature execute-task s3"`
- **Step number zero:** `deriveSessionName("my-feature", "execute-task", 0)` → `"my-feature execute-task s0"`

### `stepFolderName(stepNumber)`

- **Zero-pads single digits (1-9):** inputs 1, 5, 9 → `"S01"`, `"S05"`, `"S09"`
- **No padding for two-digit numbers:** inputs 10, 25, 100 → `"S10"`, `"S25"`, `"S100"`
- **Edge case — zero:** input 0 → `"S00"`

### `discoverNextStep(goalDir)`

- **Empty directory returns 1:** no S* folders exist → returns 1
- **Single complete step returns 2:** S01 with both TASK.md and TEST.md → returns 2
- **Multiple sequential steps return N+1:** S01 and S02 both complete → returns 3
- **Incomplete step (missing TEST.md) not counted as complete:** S01 has only TASK.md → `highestDefined` stays 0, returns 1
- **Scans stops at first missing folder:** S01 exists but S02 doesn't → loop breaks after checking S01, doesn't check S03+
- **Step with only COMPLETED marker but no specs:** S01 has TASK.md + TEST.md + COMPLETED → still counts as defined (has both spec files), returns 2

## Programmatic Verification

### Run the test file in isolation

- **What:** `utils.test.ts` passes all tests
- **How:** `npm test __tests__/utils.test.ts`
- **Expected result:** Exit code 0, all tests passing (Vitest output shows green checkmarks)

### Type checking passes

- **What:** No TypeScript errors introduced by the test file
- **How:** `npm run check`
- **Expected result:** Exit code 0, no error output

### Run full test suite (smoke + utils)

- **What:** New tests don't break the existing smoke test
- **How:** `npm test`
- **Expected result:** Exit code 0, all tests passing (smoke test + utils test)

## Test Order

1. **Unit tests** — run first via `npm test __tests__/utils.test.ts`. Each describe block is independent; order within doesn't matter since each test creates its own temp dir.
2. **Programmatic verification** — after all unit tests pass, run `npm run check` and `npm test` (full suite) to confirm no regressions.
