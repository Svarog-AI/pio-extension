# Accumulated Decisions (through Step 2)

## Nesting Structure (from Dimension 1)

- **Subgoal workspace path:** `S{NN}/subgoals/<name>/` — subgoals live inside parent step directories under the `subgoals/` marker. All downstream dimensions must assume this structure.
- **cwd derivation requires no change:** Existing `indexOf("/goals/")` + `path.dirname()` correctly handles all nesting depths. Confirmed by Steps 1–2 research.
- **`steps()` regex requires no change:** The `subgoals/` directory marker does not match `/^S(\d+)$/`. Scanner is safe.
- **`resolveGoalDir` requires new logic:** Add optional `parentStepDir` parameter for nested resolution (non-breaking extension). Downstream: state machine transitions may need to pass parent-aware paths.

## Queue Keying (from Dimension 2)

- **Hierarchical keys with `__` delimiters** (Strategy A). Format: `task-parent__S03__nested.json` for subgoals, `task-my-feature.json` for flat goals (unchanged). Backward compatible — flat goals produce identical filenames.
- **`deriveQueueKey(goalDir, cwd)` helper function** proposed as the canonical key derivation mechanism. Strips `.pio/goals/` prefix, filters out `subgoals/` markers, joins remaining segments with `__`.
- **Slug-only goal names** assumed to prevent delimiter collisions.
