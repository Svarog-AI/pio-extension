# Summary: Update all capability files to import from new modules

## Status
COMPLETED

## Files Created
- (none — this step only modified existing files)

## Files Modified
- `src/capabilities/create-goal.ts` — split `../utils` into `../fs-utils`, `../queues`, `../capability-config`
- `src/capabilities/create-issue.ts` — updated: `../utils` → `../fs-utils`
- `src/capabilities/create-plan.ts` — split `../utils` into `../fs-utils`, `../queues`, `../capability-config`
- `src/capabilities/delete-goal.ts` — updated: `../utils` → `../fs-utils`
- `src/capabilities/evolve-plan.ts` — split `../utils` into `../fs-utils`, `../queues`, `../capability-config`
- `src/capabilities/execute-plan.ts` — split `../utils` into `../fs-utils`, `../capability-config`
- `src/capabilities/execute-task.ts` — split `../utils` into `../fs-utils`, `../queues`, `../capability-config`
- `src/capabilities/goal-from-issue.ts` — split `../utils` into `../fs-utils`, `../queues`, `../capability-config`
- `src/capabilities/list-goals.ts` — split `../utils` into `../fs-utils`, `../queues`
- `src/capabilities/next-task.ts` — split `../utils` into `../queues`, `../capability-config`
- `src/capabilities/project-context.ts` — updated: `../utils` → `../capability-config`
- `src/capabilities/review-code.ts` — split `../utils` into `../fs-utils`, `../queues`, `../capability-config`
- `src/capabilities/session-capability.ts` — updated: `../utils` → `../fs-utils`

## Files Deleted
- (none — old files deleted in step 8)

## Decisions Made
- **`enqueueTask` placed in `../queues`, not `../fs-utils`:** TASK.md's per-file examples incorrectly listed `enqueueTask` under `../fs-utils`, but the routing table and actual module layout place it in `../queues`. Followed the correct module location. This affected 6 files: create-goal, create-plan, evolve-plan, execute-task, goal-from-issue, review-code.
- **`stepFolderName` confirmed in `../fs-utils`:** Despite PLAN.md listing it under transitions, actual implementation (verified against `src/guards/validation.ts`) places it in `../fs-utils`. All capability files import from there.

## Test Coverage
- `npm run check` — zero TypeScript errors
- Grep verification — zero residual `from "../utils"` imports in the 13 targeted capability files + session-capability.ts
- Per-file spot-checks — all confirmed correct (stepFolderName, discoverNextStep, SessionQueueTask all from correct modules)
- `npm test` — all 14 test files pass, 218 tests total, zero failures
