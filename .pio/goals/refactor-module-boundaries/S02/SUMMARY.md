# Summary: Extract `src/queues.ts` + update dependent tests

## Status
COMPLETED

## Files Created
- `src/queues.ts` — Session queue subsystem extracted from `src/utils.ts`: `SessionQueueTask`, `queueDir()`, `enqueueTask()`, `readPendingTask()`, `listPendingGoals()`, `writeLastTask()`
- `__tests__/queues.test.ts` — 16 tests moved from `utils.test.ts`, importing from `../src/queues`

## Files Modified
- `src/utils.ts` — Removed queue function/type definitions; added re-exports from `./queues` for backward compatibility during migration
- `__tests__/utils.test.ts` — Removed queue-related imports (`queueDir`, `enqueueTask`, `readPendingTask`, `listPendingGoals`, `writeLastTask`, `SessionQueueTask`) and removed 5 queue `describe` blocks (16 tests). Remaining: 29 tests covering goal dir, issues, session naming, step folder, and step discovery.

## Files Deleted
- (none)

## Decisions Made
- Exact verbatim extraction: Queue functions copied as-is from `utils.ts` with no behavioral changes
- Local temp-dir helpers re-defined in `queues.test.ts` rather than extracted to a shared test-utils module (consistent with `transition.test.ts` pattern)
- Re-export strategy preserves backward compatibility for capability files still importing from `../utils` until Step 6 updates them

## Test Coverage
- `__tests__/queues.test.ts`: 16 tests pass (5 describe blocks: queueDir, enqueueTask, readPendingTask, listPendingGoals, writeLastTask)
- `__tests__/utils.test.ts`: 29 remaining tests pass (no regressions from removal of queue blocks)
- Full suite: 216 tests across 14 files — same total count as before refactoring (tests moved, not deleted)
- `npm run check`: TypeScript compiles with zero errors
