# Tests: Refactor `enqueueTask` to per-goal files + add queue utilities

## Programmatic Verification

### 1. Type check passes for utils.ts

- **What:** The refactored `utils.ts` compiles without type errors (ignoring errors in downstream callers, which are expected since they haven't been updated yet).
- **How:** Run `npm run check` and verify that `src/utils.ts` itself has no errors. Errors in other files (capabilities) are expected — they'll be fixed in Steps 3 and 4.
- **Expected result:** `tsc --noEmit` reports no errors originating from `src/utils.ts`. Errors in capability files calling `enqueueTask` with the old 2-arg signature are acceptable at this stage.

### 2. `enqueueTask` signature changed to 3 arguments

- **What:** The exported `enqueueTask` function now accepts `(cwd, goalName, task)`.
- **How:** Inspect the function declaration in `src/utils.ts`:
  ```bash
  grep -A1 'export function enqueueTask' src/utils.ts
  ```
- **Expected result:** Output shows `(cwd: string, goalName: string, task: SessionQueueTask)` as the parameter list.

### 3. `enqueueTask` writes per-goal filename

- **What:** The filename computed inside `enqueueTask` includes `{goalName}` instead of the fixed `"task.json"`.
- **How:** Read `src/utils.ts` and verify the path construction:
  ```bash
  grep 'task-' src/utils.ts
  ```
- **Expected result:** Contains a template literal or string concat producing `task-${goalName}.json` (not `task.json`).

### 4. `readPendingTask` is exported with correct signature

- **What:** New function `readPendingTask` exists and is exported.
- **How:** Inspect the function declaration:
  ```bash
  grep -A1 'export function readPendingTask' src/utils.ts
  ```
- **Expected result:** Output shows `(cwd: string, goalName: string): SessionQueueTask | undefined`.

### 5. `readPendingTask` returns `undefined` for missing files

- **What:** When the queue file for a goal doesn't exist, `readPendingTask` returns `undefined` (not throws).
- **How:** Read the implementation in `src/utils.ts` and verify it guards with `fs.existsSync` or a try/catch before reading. Look for the early return pattern.
- **Expected result:** Code contains an `existsSync` check or equivalent guard that returns `undefined` when the file is absent.

### 6. `listPendingGoals` is exported with correct signature

- **What:** New function `listPendingGoals` exists and is exported.
- **How:** Inspect the function declaration:
  ```bash
  grep -A1 'export function listPendingGoals' src/utils.ts
  ```
- **Expected result:** Output shows `(cwd: string): string[]`.

### 7. `listPendingGoals` scans queue directory for pattern `task-*.json`

- **What:** The implementation reads the queue directory and filters files matching the per-goal naming pattern.
- **How:** Read the function body in `src/utils.ts`. Verify it uses `fs.readdirSync(queueDir(cwd))` (or equivalent) and filters with a pattern like `/^task-(.+)\.json$/` or string checks (`startsWith("task-")` and `endsWith(".json")`).
- **Expected result:** Code shows directory reading + filename filtering + goal name extraction (stripping prefix/suffix).

### 8. `listPendingGoals` returns empty array when no matching files exist

- **What:** Empty queue directory produces an empty result, not an error.
- **How:** Read the implementation — verify there's no bare return of undefined or throw on empty results. The filter/map chain should naturally produce `[]`.
- **Expected result:** Code path for zero matches returns `[]` (e.g., via `.filter().map()` producing an empty array).

### 9. `queueDir(cwd)` is unchanged

- **What:** The existing `queueDir` function still returns `.pio/session-queue/` and hasn't been modified.
- **How:** Read the `queueDir` function in `src/utils.ts`:
  ```bash
  grep -A5 'export function queueDir' src/utils.ts
  ```
- **Expected result:** Function body is identical to the original — returns `path.join(cwd, ".pio", "session-queue")`.

### 10. `SessionQueueTask` interface unchanged

- **What:** The `SessionQueueTask` type definition (`capability` + optional `params`) remains as-is.
- **How:** Read the interface in `src/utils.ts`:
  ```bash
  grep -A3 'export interface SessionQueueTask' src/utils.ts
  ```
- **Expected result:** Shows `{ capability: string; params?: Record<string, unknown>; }` unchanged.

## Test Order

1. Run tests 2–4 first (signature checks) — these verify the basic API contract is correct.
2. Run test 3 next (filename pattern) — confirms enqueueTask behavior.
3. Run tests 5–8 (new function implementations) — validate logic of `readPendingTask` and `listPendingGoals`.
4. Run tests 9–10 (unchanged code) — verify nothing else was accidentally modified.
5. Run test 1 (type check) last — confirms the full file compiles correctly. This will show errors in downstream callers (expected), but `utils.ts` itself must be clean.

## Manual Verification (if any)

None required. All checks are programmatic via source inspection and TypeScript compilation.
