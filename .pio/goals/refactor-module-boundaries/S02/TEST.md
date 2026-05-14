# Tests: Extract `src/queues.ts` + update dependent tests

## Unit Tests

### Queue functions — new file `__tests__/queues.test.ts`

**File:** `__tests__/queues.test.ts` (created by moving from `utils.test.ts`)  
**Test runner:** Vitest (`npm test __tests__/queues.test.ts`)  
**Imports:** `../src/queues` (not `../src/utils`)  

All 16 tests are moved verbatim from `__tests__/utils.test.ts`. Each describe block uses its own `beforeEach`/`afterEach` to create/clean temp directories — no shared state between blocks. The temp-dir helpers (`createTempDir`, `cleanup`) should be re-defined locally in the new file:

```typescript
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
```

**Test cases (moved as-is from `utils.test.ts`, no behavioral changes):**

- `describe("queueDir(cwd)")` — 3 tests:
  - "returns correct path" — calls `queueDir(tempDir)`, expects `.pio/session-queue` suffix
  - "creates directory if missing" — asserts dir doesn't exist, calls `queueDir`, asserts it now exists
  - "is idempotent — no error on repeated calls"

- `describe("enqueueTask(cwd, goalName, task)")` — 4 tests:
  - "creates correct file path" — writes task, asserts `task-{goalName}.json` exists
  - "writes valid JSON with correct fields" — reads back, parses JSON, checks `capability` and `params.goalName`
  - "overwrites existing task for the same goal" — enqueue twice, second replaces first
  - "uses 2-space indentation"

- `describe("readPendingTask(cwd, goalName)")` — 3 tests:
  - "returns parsed object for existing task" — enqueue then read back, assert deep equality
  - "returns undefined for missing task" — reads non-existent goal name
  - "round-trip preserves data"

- `describe("listPendingGoals(cwd)")` — 4 tests:
  - "returns empty array when no queue dir exists"
  - "returns empty array for empty queue dir"
  - "extracts goal names correctly from multiple tasks" — enqueue two goals, assert both appear
  - "ignores non-task files" — add `.txt` and non-matching `.json`, only real tasks returned

- `describe("writeLastTask(goalDir, task)")` — 2 tests:
  - "creates LAST_TASK.json in goal dir" — asserts file exists after call
  - "writes valid JSON content matching input" — reads back, parsed JSON equals original object

### Removed from `__tests__/utils.test.ts`

The following describe blocks are **removed** from `utils.test.ts` (now living in `queues.test.ts`):
- `describe("queueDir(cwd)")`
- `describe("enqueueTask(cwd, goalName, task)")`
- `describe("readPendingTask(cwd, goalName)")`
- `describe("listPendingGoals(cwd)")`
- `describe("writeLastTask(goalDir, task)")`

Queue-related imports (`queueDir`, `enqueueTask`, `readPendingTask`, `listPendingGoals`, `writeLastTask`, `SessionQueueTask`) are **removed** from the import statement in `utils.test.ts`. Remaining describe blocks (goal dir, issues, session naming, step folder, step discovery) stay unchanged.

## Programmatic Verification

- **What:** TypeScript type check passes with zero errors after extraction and re-export
  - **How:** `npm run check` (`tsc --noEmit`)
  - **Expected result:** Exit code 0, no error output

- **What:** New dedicated test file runs successfully
  - **How:** `npm test __tests__/queues.test.ts`
  - **Expected result:** 16 tests pass, zero failures

- **What:** Remaining tests in `utils.test.ts` still pass (no regressions from removal)
  - **How:** `npm test __tests__/utils.test.ts`
  - **Expected result:** All remaining describe blocks pass (8 fewer tests than before — the queue ones were moved out)

- **What:** Full suite passes — zero regressions
  - **How:** `npm test`
  - **Expected result:** Same total test count as before refactoring (tests moved, not deleted); one more file in the suite (`queues.test.ts`)

- **What:** `src/queues.ts` exports all required symbols (verifiable via grep)
  - **How:** `grep 'export' src/queues.ts` — verify: `SessionQueueTask`, `queueDir`, `enqueueTask`, `readPendingTask`, `listPendingGoals`, `writeLastTask`
  - **Expected result:** All 6 symbols appear as exports

- **What:** `src/utils.ts` re-exports queue symbols from `./queues` (not redefined locally)
  - **How:** `grep 'from "./queues"' src/utils.ts`
  - **Expected result:** Re-export block present; no duplicate function definitions of queue symbols in utils.ts

- **What:** No remaining original queue definitions in `src/utils.ts`
  - **How:** `grep -n 'function queueDir\|function enqueueTask\|function readPendingTask\|function listPendingGoals\|function writeLastTask' src/utils.ts`
  - **Expected result:** No matches (originals removed, only re-exports remain)

## Test Order

1. Verify `src/queues.ts` exports exist (grep check) — fast sanity gate
2. Run `npm run check` — TypeScript compilation proves imports/resolution work
3. Run `npm test __tests__/queues.test.ts` — new dedicated test file passes
4. Run `npm test __tests__/utils.test.ts` — remaining tests still pass after queue blocks removed
5. Run `npm test` (full suite) — zero regressions, same total test count
