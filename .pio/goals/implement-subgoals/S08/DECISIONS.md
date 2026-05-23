# Decisions (carried forward from Steps 1–7)

## Architecture Decisions

- **Optional-parameter guard pattern:** Use `!== undefined` or `typeof x === "string"` (not truthy checks) to distinguish "explicitly passed" from "omitted". Established across Steps 1–6 for all optional parameters.
- **`__` as queue-key delimiter:** Hierarchical queue keys join path segments with `__`. Display names convert `__` back to `/` via `deriveSessionName`. Flat goals produce identical output.
- **`steps` is mandatory in PLAN_FRONTMATTER_SCHEMA:** Every new plan must include a `steps` array. TypeBox enforces this at the schema level. Old plans degrade gracefully — `planMetadata()` returns null, `getMetadata()` returns null.
- **`complexity` defaults to `"task"` in runtime code:** Applied via `entry.complexity ?? "task"` at call sites. The TypeBox schema makes it optional.
- **`steps()` derives from `planMetadata()`:** Single source of truth for step definitions. Every step defined in PLAN.md frontmatter produces a `StepStatus`, even if the folder doesn't exist on disk.
- **TASK.md is the universal step input artifact:** Both `execute-task` and `create-goal` (for subgoals) read TASK.md. TEST.md is no longer an evolve-plan output — tests are derived from acceptance criteria at execute-time.
- **Frontmatter-based subgoal detection only:** Subgoal metadata lives exclusively in PLAN.md frontmatter (`steps` array with `name` + `complexity`). No regex heading parsing or `[subgoal]` body annotations.
- **Execute-task generates tests using TDD skill:** Executor reads TASK.md acceptance criteria and derives test cases using the `test-driven-development` skill methodology (RED→GREEN→REFACTOR).

## Subgoal Lifecycle Decisions (Steps 4–6)

- **`transitionEvolvePlan` passes `initialMessage`:** Constructs a relative path from subgoal workspace to parent step's TASK.md using `path.relative()`. No file I/O in the state machine.
- **`pio_mark_complete` uses transition's adjusted `params.goalName`:** For subgoals, this is the parent goal name — enables parent queue slot restoration on completion.
- **Param scoping:** `parentGoalName` and `parentStepNumber` are top-level params on subgoal sessions only. Checked explicitly, never recursed into `_sessionContext`.

## File Placement

- `resolveGoalDir(cwd, name, parentStepDir?)` in `src/fs-utils.ts`
- `deriveQueueKey(goalDir, cwd)` in `src/queues.ts`, colocated with `enqueueTask`/`readPendingTask`

## Create-plan Validation (Step 7)

- **Duplicate detection algorithm:** Linear scan with `Set` deduplication — sufficient for small step counts (< 20). Collects all duplicates for the error message.
- **Cross-type duplicates allowed:** A subgoal and a regular task can share the same name — only subgoal-to-subgoal duplicates are rejected, since only subgoals create disk directories.

## Plan Deviations

- **`deriveQueueKey` throws on invalid prefix:** Implementation throws loudly instead of falling back to `path.basename`. Acceptable since all callers construct valid paths via `createGoalState`.
- **Frontmatter-only subgoal detection (no in-body annotations):** Original GOAL.md specified `[subgoal]` body annotations as primary. Plan chose frontmatter-only (`steps` array with `complexity`) for cleaner schema enforcement. All downstream code follows this decision.
