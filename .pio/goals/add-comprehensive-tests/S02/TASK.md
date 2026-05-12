# Task: Test pure utilities (`utils.test.ts`)

Write comprehensive tests for all pure utility functions exported from `src/utils.ts`, using temporary directories to simulate filesystem state without side effects.

## Context

The project has zero test coverage on business logic. Step 1 established Vitest as the test runner with native ESM support (Vitest 4.x, `vitest.config.ts`, `"test": "vitest run"`). The smoke test proved TypeScript + ESM imports resolve correctly under Vitest. Step 2 is the first real test file — it covers all 12 pure utility functions in `src/utils.ts`.

These utilities are filesystem-dependent (reading/writing directories, scanning for files) but have no coupling to the pi framework. They are testable using temp directories (`fs.mkdtempSync(os.tmpdir())`) to simulate `.pio/` directory structures without affecting real project state.

## What to Build

A single test file `__tests__/utils.test.ts` with comprehensive coverage of all exported utility functions from `src/utils.ts`. Each function group gets its own `describe` block. Tests use temp directories via `beforeEach`/`afterEach` for isolation and cleanup.

### Code Components

#### 1. `resolveGoalDir(cwd, name)` — path construction
- Given a cwd and goal name, returns `<cwd>/.pio/goals/<name>`
- Test with normal names (`my-feature`), names with hyphens/dashes, and names with special characters (dots, underscores)
- Verify the returned path is absolute when cwd is absolute

#### 2. `goalExists(goalDir)` — directory existence check
- Returns `true` when the directory exists on disk
- Returns `false` when the directory does not exist
- Use temp dirs to create/remove directories dynamically

#### 3. `queueDir(cwd)` — session queue directory
- Returns `<cwd>/.pio/session-queue`
- Creates the directory if it doesn't exist (verify with `fs.existsSync` after call)
- Returns the same path on subsequent calls (idempotent)

#### 4. `findIssuePath(cwd, identifier)` — issue file resolution
- Accepts absolute path → returns as-is if file exists
- Accepts filename (`my-issue.md`) → resolves under `.pio/issues/`
- Accepts bare slug (`my-issue`) → appends `.md` and resolves
- Returns `undefined` for non-existent issues
- Test all four code paths

#### 5. `readIssue(cwd, identifier)` — issue file reading
- Returns file contents as string when issue exists
- Returns `undefined` when issue doesn't exist
- Delegates to `findIssuePath` internally — test the delegation chain

#### 6. `enqueueTask(cwd, goalName, task)` — write task JSON
- Creates `.pio/session-queue/task-{goalName}.json` with correct JSON content
- Overwrites existing task file for the same goal (idempotent)
- Uses `JSON.stringify(task, null, 2)` formatting

#### 7. `readPendingTask(cwd, goalName)` — read task JSON
- Returns parsed `SessionQueueTask` object when file exists
- Returns `undefined` when file doesn't exist
- Verifies round-trip: enqueue then read returns same data

#### 8. `listPendingGoals(cwd)` — scan for pending tasks
- Returns empty array when queue dir is empty or doesn't exist
- Returns correct goal names from `task-{goalName}.json` files
- Correctly extracts goal name (strips `task-` prefix and `.json` suffix)
- Handles multiple pending goals simultaneously

#### 9. `writeLastTask(goalDir, task)` — write LAST_TASK.json
- Writes `<goalDir>/LAST_TASK.json` with JSON-formatted content
- File is readable after write

#### 10. `deriveSessionName(goalName, capability, stepNumber?)` — session naming
- Empty/missing goalName → returns capability name only
- Goal name + capability → returns `"<goal> <capability>"`
- All three params → returns `"<goal> <capability> s<N>"`

#### 11. `stepFolderName(stepNumber)` — zero-padded folder names
- S01–S09: two-character zero-padding
- S10+: natural numbering (no padding beyond the number)
- Edge case: stepNumber = 0 → "S00"

#### 12. `discoverNextStep(goalDir)` — auto-discovery of next step
- Empty goal dir (no S* folders) → returns 1
- Sequential complete steps (S01 with TASK.md+TEST.md, S02 with both) → returns N+1
- Gap in middle (S01 complete, S02 missing files) → handles correctly
- Non-sequential step folders → scans linearly, stops at first missing folder

### Approach and Decisions

- **Temp directory pattern:** Use `fs.mkdtempSync(os.tmpdir())` in `beforeEach`, `fs.rmSync(tempDir, { recursive: true, force: true })` in `afterEach`. Each test gets a clean filesystem.
- **Fixture helpers:** Create helper functions inside the test file (not separate files yet) for common setup: `createGoalTree(tempDir, steps)`, `writeIssueFile(tempDir, slug, content)`. Keep self-contained unless complexity demands extraction.
- **Follow existing patterns:** The smoke test imports from `../src/utils` — follow the same import pattern. Use Vitest globals (`describe`, `it`, `expect`, `beforeEach`, `afterEach`) as configured in `vitest.config.ts`.
- **Arrange-Act-Assert:** Structure each test with clear setup (arrange temp dir state), call the function (act), and verify output (assert).
- **No mocking of fs module:** Use real filesystem operations on temp dirs — this is faster, more reliable, and tests actual behavior per TDD skill guidance ("prefer real implementations over mocks").

## Dependencies

- **Step 1 (Configure Vitest):** Must be completed. Requires `vitest` installed, `vitest.config.ts` present, and `"test": "vitest run"` script in `package.json`.

## Files Affected

- `__tests__/utils.test.ts` — created: comprehensive tests for all 12 utility functions from `src/utils.ts`
- `__tests__/fixtures/` — may be created if fixture helpers become complex enough to warrant extraction (evaluate during implementation)

## Acceptance Criteria

- [ ] `npm test __tests__/utils.test.ts` passes with all tests green
- [ ] All 12 utility functions have test coverage: `resolveGoalDir`, `goalExists`, `queueDir`, `findIssuePath`, `readIssue`, `enqueueTask`, `readPendingTask`, `listPendingGoals`, `writeLastTask`, `deriveSessionName`, `stepFolderName`, `discoverNextStep`
- [ ] Edge cases covered: missing dirs, special characters in names, empty queues, non-existent issues
- [ ] `npm run check` reports no errors
- [ ] No side effects on real `.pio/` directories (all tests use temp dirs)

## Risks and Edge Cases

- **Dynamic imports:** `resolveCapabilityConfig` uses dynamic imports (`import("./capabilities/${cap}")`) which can produce Vite SSR warnings. This function is tested in Step 5, not Step 2 — don't test it here.
- **Path separators:** On all platforms, `path.join` uses the correct separator. Tests should use `path.join` for comparisons rather than hardcoded `/`.
- **Temp dir cleanup:** Ensure `afterEach` runs even if a test throws — Vitest handles this automatically, but verify cleanup in a quick manual run.
- **File encoding:** `fs.writeFileSync` / `readFileSync` use `"utf-8"` — tests should match this encoding when creating temp files.
