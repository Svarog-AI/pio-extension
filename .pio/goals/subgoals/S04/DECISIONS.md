# Accumulated Decisions (through Step 3)

## Nesting Structure (from Dimension 1)

- **Subgoal workspace path:** `S{NN}/subgoals/<name>/` — subgoals live inside parent step directories under the `subgoals/` marker. All downstream dimensions must assume this structure.
- **cwd derivation requires no change:** Existing `indexOf("/goals/")` + `path.dirname()` correctly handles all nesting depths. Confirmed by Steps 1–2 research.
- **`steps()` regex requires no change:** The `subgoals/` directory marker does not match `/^S(\d+)$/`. Scanner is safe.
- **`resolveGoalDir` requires new logic:** Add optional `parentStepDir` parameter for nested resolution (non-breaking extension). Downstream: state machine transitions may need to pass parent-aware paths.

## Queue Keying (from Dimension 2)

- **Hierarchical keys with `__` delimiters** (Strategy A). Format: `task-parent__S03__nested.json` for subgoals, `task-my-feature.json` for flat goals (unchanged). Backward compatible — flat goals produce identical filenames.
- **`deriveQueueKey(goalDir, cwd)` helper function** proposed as the canonical key derivation mechanism. Strips `.pio/goals/` prefix, filters out `subgoals/` markers, joins remaining segments with `__`.
- **Slug-only goal names** assumed to prevent delimiter collisions.

## State Machine Extensions (from Dimension 3)

- **Spawning mechanism:** Approach 1 (new transition in the state machine) recommended over piggyback. `transitionEvolvePlan` routes to `create-goal` with parent context when a step is flagged as a subgoal. Rationale: consistency with pio design, centralized logic, testable pure functions.
- **Lifecycle composition:** Parent implicitly pauses. No active pause/resume protocol. No concurrency support. The parent's queue slot is overwritten by the subgoal's task and restored when the subgoal completes.
- **Completion propagation:** Subgoal's `finalize-goal` routes to the parent's `evolve-plan` (not `review-task`). This is symmetric with the existing `review-task` (approved) → `evolve-plan` transition. The subgoal replaces the `execute-task → review-task` cycle. Subgoal COMPLETED = step COMPLETED.
- **User navigation is separate:** After subgoal completion, user runs `/pio-parent` to switch sessions, then `/pio-next-task` to dequeue the parent's `evolve-plan` task.
- **`finalize-goal` terminal behavior:** Remains terminal (`undefined`) for top-level goals. Becomes non-terminal for subgoals only (discriminated by `parentGoalName` param).
- **No breaking changes:** All modifications are additive — new optional params, new helper functions, extracted inline logic. Existing callers without subgoal params see identical behavior.
