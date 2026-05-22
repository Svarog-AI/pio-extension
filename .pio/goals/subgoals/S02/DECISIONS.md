# Accumulated Decisions (through Step 1)

## Nesting Structure (from Dimension 1)

- **Subgoal workspace path:** `S{NN}/subgoals/<name>/` — subgoals live inside parent step directories under the `subgoals/` marker. This is the recommended approach and all downstream dimensions must assume this structure.
- **`resolveGoalDir` requires new logic:** An optional `parentStepDir` parameter will be added to support nested resolution (non-breaking extension). Downstream queue keying may need to use this or accept full paths instead of flat goal names.
- **`goalName` derivation needs fully-qualified names:** `path.basename(goalDir)` for nested subgoals yields just the leaf name (e.g., `"nested"`), causing collisions when sibling subgoals share the same name under different parents. This directly impacts queue keying (Dimension 2) — the queue strategy must account for this collision risk.
- **cwd derivation requires no change:** Existing `indexOf("/goals/")` + `path.dirname()` correctly handles all nesting depths. Queue path construction can rely on correct `cwd` resolution.
