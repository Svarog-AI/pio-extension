# Tests: Simple moves — collocate single-module test files

All five existing test files are relocated with updated import paths. Test code content is preserved verbatim (no assertions changed). Verification confirms that every original test still passes from the new location.

## Unit Tests

### `src/queues.test.ts` (moved from `__tests__/queues.test.ts`)

**Test runner:** Vitest (`vitest run src/queues.test.ts`)
**Describe blocks:** 5 — `queueDir(cwd)`, `enqueueTask(cwd, goalName, task)`, `readPendingTask(cwd, goalName)`, `listPendingGoals(cwd)`, `writeLastTask(goalDir, task)`

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `queueDir` — returns correct path | `path.join(cwd, ".pio", "session-queue")` |
| 2 | `queueDir` — creates directory if missing | directory exists after call |
| 3 | `queueDir` — idempotent on repeated calls | same return value |
| 4 | `enqueueTask` — creates correct file path | `task-{goalName}.json` exists |
| 5 | `enqueueTask` — writes valid JSON | parsed JSON has correct fields |
| 6 | `enqueueTask` — overwrites existing task | second write replaces first |
| 7 | `enqueueTask` — uses 2-space indentation | raw content matches `JSON.stringify(task, null, 2)` |
| 8 | `readPendingTask` — returns parsed object | equals enqueued task |
| 9 | `readPendingTask` — returns undefined for missing | `undefined` |
| 10 | `readPendingTask` — round-trip preserves data | read matches written |
| 11 | `listPendingGoals` — empty when no queue dir | `[]` |
| 12 | `listPendingGoals` — empty for empty queue dir | `[]` |
| 13 | `listPendingGoals` — extracts goal names correctly | contains all goal names |
| 14 | `listPendingGoals` — ignores non-task files | only task-*.json matched |
| 15 | `writeLastTask` — creates LAST_TASK.json | file exists |
| 16 | `writeLastTask` — writes valid JSON content | parsed content matches input |

### `src/transitions.test.ts` (moved and renamed from `__tests__/transition.test.ts`)

**Test runner:** Vitest (`vitest run src/transitions.test.ts`)
**Describe blocks:** 9 — `CAPABILITY_TRANSITIONS structure`, `resolveNextCapability — create-goal → create-plan`, `create-plan → evolve-plan`, `evolve-plan → execute-task`, `execute-task → review-code`, `review-code (approval path)`, `review-code (rejection path)`, `review-code (REJECTED marker routing)`, `unknown capabilities`, `TransitionResult shape consistency`

| # | Test case | Expected |
|---|-----------|----------|
| 1–5 | `CAPABILITY_TRANSITIONS structure` — 5 capability mappings verified | correct string or function values |
| 6–7 | `create-goal → create-plan` — params preserved / undefined | TransitionResult with create-plan |
| 8 | `create-plan → evolve-plan` — params preserved | TransitionResult with evolve-plan |
| 9–11 | `evolve-plan → execute-task` — stepNumber present / missing / undefined params | correct TransitionResult in each case |
| 12–13 | `execute-task → review-code` — stepNumber present / missing | correct TransitionResult |
| 14–15 | `review-code (approval)` — APPROVED on disk increments stepNumber | evolve-plan with stepNumber+1 |
| 16–17 | `review-code (rejection)` — no APPROVED falls back to execute-task | execute-task with same stepNumber |
| 18–20 | `review-code (REJECTED)` — REJECTED takes precedence, both markers | execute-task on REJECTED |
| 21–22 | Unknown capabilities return undefined | `undefined` |
| 23–25 | TransitionResult shape consistency — string/callback/immutability | correct wrapping, no mutation |

### `src/capabilities/session-capability.test.ts` (moved from `__tests__/next-task.test.ts`)

**Test runner:** Vitest (`vitest run src/capabilities/session-capability.test.ts`)
**Describe blocks:** 2 — `getSessionGoalName`, `handleNextTask — goal resolution order`

This test file uses `vi.hoisted()` and `vi.mock()` to mock `./session-capability`. After relocation, the mock path must be `"./session-capability"` (not `"../src/capabilities/session-capability"`).

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `getSessionGoalName` — valid string goalName | returns the string |
| 2 | Non-string goalName (123) | `undefined` |
| 3 | Null goalName | `undefined` |
| 4 | Missing goalName key | `undefined` |
| 5 | Undefined params | `undefined` |
| 6 | Empty params `{}` | `undefined` |
| 7 | `handleNextTask` — session goalName used when no explicit arg | correct task consumed |
| 8 | Fallback to scan when getSessionGoalName returns undefined | single pending goal launched |
| 9 | Explicit arg takes priority over session goalName | explicit goal's queue file consumed |
| 10 | Notification when session goalName has no pending task | `ui.notify` called with "No pending task" |

### `src/guards/validation.test.ts` (moved from `__tests__/validation.test.ts`)

**Test runner:** Vitest (`vitest run src/guards/validation.test.ts`)
**Describe blocks:** 7 — `validateOutputs`, `extractGoalName`, `parseReviewFrontmatter`, `validateReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`, `review-code markComplete automation`

| # | Test case category | Expected |
|---|--------------------|----------|
| 1–6 | `validateOutputs` — all present, all missing, partial, empty rules, undefined files, single file | correct `{ passed, missing }` in each case |
| 7–12 | `extractGoalName` — standard path, no trailing slash, nested path, no /goals/, root-level, empty input, hyphens/underscores | correct extracted name or empty string |
| 13–20 | `parseReviewFrontmatter` — valid APPROVED, valid REJECTED, missing delimiters, malformed YAML, non-existent file, extra fields, leading newline | correct parsed object or `null` |
| 21–26 | `validateReviewFrontmatter` — valid APPROVED/REJECTED, invalid decision, missing field, negative count, non-integer | `null` on valid, error string on invalid |
| 27–31 | `applyReviewDecision` — APPROVED creates marker, REJECTED deletes COMPLETED, REJECTED without COMPLETED (no crash), no cross-contamination, zero-padding | correct filesystem state |
| 32–36 | `validateReviewState` — consistent APPROVED/REJECTED, both markers, neither marker, mismatched expectation | `true` or `false` accordingly |
| 37–40 | Integration — full review-code automation flow (APPROVED, REJECTED, missing frontmatter, invalid decision) | correct end-to-end state |

### `src/guards/turn-guard.test.ts` (moved from `__tests__/turn-guard.test.ts`)

**Test runner:** Vitest (`vitest run src/guards/turn-guard.test.ts`)
**Describe blocks:** 2 — `isThinkingOnlyTurn`, `setupTurnGuard`

| # | Test case | Expected |
|---|-----------|----------|
| 1 | All thinking + empty toolResults → `true` | `true` |
| 2 | Multiple thinking + no toolResults → `true` | `true` |
| 3 | Thinking + text → `false` | `false` |
| 4 | Thinking + toolCall → `false` | `false` |
| 5 | Empty content → `false` | `false` |
| 6 | Text only → `false` | `false` |
| 7 | `setupTurnGuard` registers `resources_discover`, sets flag true with pio-config | `__testSetActiveSession()` is `true` |
| 8 | No pio-config → flag false | `__testSetActiveSession()` is `false` |
| 9 | Registers `turn_end` handler | handler exists |
| 10 | Non-pio session → no recovery message | `sendUserMessageCalls.length === 0` |
| 11 | Non-assistant message → no recovery | `sendUserMessageCalls.length === 0` |
| 12 | Thinking-only turn in pio session → recovery sent | exactly 1 call with non-empty string |

## Programmatic Verification

Each check validates that the relocation was successful from the new location.

| What | How | Expected result |
|------|-----|-----------------|
| All 5 files exist at target paths | `ls src/queues.test.ts src/transitions.test.ts src/capabilities/session-capability.test.ts src/guards/validation.test.ts src/guards/turn-guard.test.ts` | All 5 files listed, no errors |
| No type errors from new test files | `npm run check` | Exit code 0, no diagnostics mentioning the new test files |
| `queues.test.ts` passes from new location | `vitest run src/queues.test.ts` | 16 tests passed, 0 failures |
| `transitions.test.ts` passes from new location | `vitest run src/transitions.test.ts` | All ~27 tests passed, 0 failures |
| `session-capability.test.ts` passes from new location | `vitest run src/capabilities/session-capability.test.ts` | 10 tests passed, 0 failures (mock resolves correctly) |
| `validation.test.ts` passes from new location | `vitest run src/guards/validation.test.ts` | All ~37 tests passed, 0 failures |
| `turn-guard.test.ts` passes from new location | `vitest run src/guards/turn-guard.test.ts` | 12 tests passed, 0 failures |
| Import paths are correct (no stale `../src/` references) | `grep -rn '\.\./src/' src/queues.test.ts src/transitions.test.ts src/capabilities/session-capability.test.ts src/guards/validation.test.ts src/guards/turn-guard.test.ts` | No matches (exit code 1) |

## Test Order

Execute in this priority:

1. **Programmatic — file existence:** Verify all 5 files exist at target paths before running tests
2. **Programmatic — type check:** `npm run check` must pass (catches import path errors early)
3. **Unit tests — individual files:** Run each of the 5 test files with `vitest run <path>` individually to isolate failures
4. **Programmatic — stale import grep:** Confirm no `../src/` references remain in any relocated file
