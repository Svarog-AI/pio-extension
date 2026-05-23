# Decisions (carried forward from Steps 1–5)

## Architecture Decisions

- **Optional-parameter guard pattern:** Use `!== undefined` (not truthy checks) to distinguish "explicitly passed empty string" from "omitted". Established by Step 1 for `parentStepDir`, followed by Step 2 for `qualifiedName`. Downstream optional parameters should follow this convention.
- **`__` as queue-key delimiter:** Hierarchical queue keys join path segments with `__`. Display names convert `__` back to `/` via `deriveSessionName`. Flat goals produce identical output — no migration needed.
- **`steps` is mandatory in PLAN_FRONTMATTER_SCHEMA:** Every new plan must include a `steps` array. TypeBox enforces this at the schema level (`Type.Array`, not `Type.Optional`). Old on-disk plans without `steps` fail validation but degrade gracefully — `GoalState.planMetadata()` returns null, `getMetadata()` returns null, and existing workflows continue.
- **`complexity` defaults to `"task"` in runtime code:** The TypeBox schema makes `complexity` optional; defaulting is applied via `entry.complexity ?? "task"` at call sites (`GoalState.getMetadata()`, state machine transitions).
- **`steps()` derives from `planMetadata()` instead of scanning folders:** Single source of truth for step definitions. Every step defined in PLAN.md frontmatter produces a `StepStatus`, even if the folder doesn't exist yet on disk.
- **TASK.md is the universal step input artifact:** Both `execute-task` and `create-goal` (for subgoals) read TASK.md. TEST.md is no longer an evolve-plan output — tests are derived from acceptance criteria at execute-time. This eliminates conditional logic in evolve-plan based on step type.
- **Execute-task generates tests using TDD skill:** The executor reads TASK.md acceptance criteria and derives test cases using the `test-driven-development` skill methodology (RED→GREEN→REFACTOR, Arrange-Act-Assert). This is an instruction change in the prompt + code readiness checks, not new infrastructure.

## File Placement

- `resolveGoalDir(cwd, name, parentStepDir?)` lives in `src/fs-utils.ts` — extended by Step 1 for nested subgoal paths.
- `deriveQueueKey(goalDir, cwd)` lives in `src/queues.ts`, colocated with `enqueueTask`/`readPendingTask`.

## Plan Deviations

- **`deriveQueueKey` throws on invalid prefix:** TASK.md specified a defensive fallback (`path.basename`), but the implementation throws loudly. Documented in S02/REVIEW.md as medium-severity concern — acceptable since all current callers construct valid paths via `createGoalState`. Downstream code should be aware that `deriveQueueKey` can throw if called with unexpected paths.
- **Removed standalone `getStepMetadata` from state-machine.ts:** The state machine receives a `GoalState` and uses `state.steps()[n].getMetadata()` for subgoal detection. No separate helper that re-reads PLAN.md.
