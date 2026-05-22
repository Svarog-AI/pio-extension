# Summary: Dimension 2 — Queue keying strategy

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `.pio/goals/subgoals/FEASIBILITY.md` — appended "Dimension 2: Queue keying strategy" section

## Decisions Made
- **Recommended strategy: Hierarchical keys with `__` delimiters** (Strategy A). Encodes parent path hierarchy in queue filenames: `task-parent__S03__nested.json` for subgoals, `task-my-feature.json` for flat goals (unchanged).
- **Rejected hashed paths** (Strategy C) — not human-readable, requires reverse index infrastructure.
- **Rejected multi-slot queues** (Strategy D) — over-engineering, introduces file locking needs, breaking change.
- **Rejected pure path-based keys** (Strategy B) — includes redundant `subgoals/` segments, couples to directory convention.
- **`deriveQueueKey(goalDir, cwd)` helper function** proposed as the canonical key derivation mechanism. Strips `.pio/goals/` prefix, filters out `subgoals/` markers, joins remaining segments with `__`.
- **Backward compatible by design:** Flat goals produce identical filenames. No migration needed.
- **Slug-only goal names** assumed to prevent delimiter collisions.

## Test Coverage
- FEASIBILITY.md exists at correct path ✓
- Contains "Dimension 2: Queue keying strategy" heading ✓
- Evaluates 4 keying strategies with trade-offs (A: hierarchical, B: path-based, C: hashed, D: multi-slot) ✓
- Contains specific recommendation with justification ✓
- References `src/queues.ts` and all key functions (`enqueueTask`, `readPendingTask`, `listPendingGoals`, `writeLastTask`) ✓
- Change categorizations present (new logic, breaking change, no change) ✓
- Backward compatibility with flat goals discussed ✓
- Collision analysis (sibling subgoals, same-named subgoals) present ✓
- Downstream integration points addressed (`GoalState.pendingTask()`, `capability-config.ts`, `deriveSessionName()`) ✓
- TypeScript compilation clean (`npm run check`) ✓
