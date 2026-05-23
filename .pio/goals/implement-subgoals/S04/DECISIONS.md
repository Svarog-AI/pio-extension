# Decisions (carried forward from Steps 1–3)

## Architecture Decisions

- **Optional-parameter guard pattern:** Use `!== undefined` (not truthy checks) to distinguish "explicitly passed empty string" from "omitted". Established by Step 1 for `parentStepDir`, followed by Step 2 for `qualifiedName`. Downstream optional parameters should follow this convention.
- **`__` as queue-key delimiter:** Hierarchical queue keys join path segments with `__`. Display names convert `__` back to `/` via `deriveSessionName`. Flat goals produce identical output — no migration needed.
- **`steps` is mandatory in PLAN_FRONTMATTER_SCHEMA:** Every new plan must include a `steps` array. TypeBox enforces this at the schema level (`Type.Array`, not `Type.Optional`). Old on-disk plans without `steps` fail validation but degrade gracefully — `GoalState.planMetadata()` returns null, `getMetadata()` returns null, and existing workflows continue.
- **`complexity` defaults to `"task"` in runtime code:** The TypeBox schema makes `complexity` optional; defaulting is applied via `entry.complexity ?? "task"` at call sites (`GoalState.getMetadata()`, new state-machine helper).

## File Placement

- `resolveGoalDir(cwd, name, parentStepDir?)` lives in `src/fs-utils.ts` — extended by Step 1 for nested subgoal paths.
- `deriveQueueKey(goalDir, cwd)` lives in `src/queues.ts`, colocated with `enqueueTask`/`readPendingTask`.

## Plan Deviations

- **`deriveQueueKey` throws on invalid prefix:** TASK.md specified a defensive fallback (`path.basename`), but the implementation throws loudly. Documented in S02/REVIEW.md as medium-severity concern — acceptable since all current callers construct valid paths via `createGoalState`. Downstream code should be aware that `deriveQueueKey` can throw if called with unexpected paths.
