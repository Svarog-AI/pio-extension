# Decisions (carried forward from Step 1)

## Architecture Decisions

- **Optional-parameter guard pattern:** `resolveGoalDir` uses `parentStepDir !== undefined` (not a truthy check) to distinguish "explicitly passed empty string" from "omitted". Downstream optional parameters (e.g., `qualifiedName` in `enqueueTask`) should follow the same convention for consistency and predictable edge-case behavior.
- **`__` as queue-key delimiter:** Step 1 established `__` → `/` replacement in `deriveSessionName` for display formatting. This step introduces `__` as the canonical queue-key join separator. The two conventions are linked: hierarchical queue keys use `__` internally, and session display names convert them back to `/`.

## File Placement

- `deriveQueueKey()` lives in `src/queues.ts` (not `src/fs-utils.ts`) — it operates on queue filenames and is a natural peer of `enqueueTask`/`readPendingTask`, not a general path resolver.
- `GoalState.pendingTask()` imports `deriveQueueKey` from `./queues` to compute qualified keys inline, keeping the import unidirectional (goal-state → queues, not the reverse).
