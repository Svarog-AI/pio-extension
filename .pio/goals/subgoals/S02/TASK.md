# Task: Dimension 2 — Queue keying strategy

Analyze the per-goal single-slot queue (`src/queues.ts`) and determine how subgoal sessions get unique queue slots without colliding with parent goals or sibling subgoals.

## Context

The feasibility study evaluates nested subgoals using the `S{NN}/subgoals/<name>/` directory structure (Dimension 1 decision). Currently, `src/queues.ts` provides a per-goal single-slot FIFO queue at `.pio/session-queue/task-{goalName}.json`. The key is derived from `goalName` — a flat string like `"my-feature"`. With nested subgoals, the basename of a goal dir (e.g., `.../subgoals/nested/`) is just `"nested"`, which collides if multiple parents have subgoals with the same name. This dimension determines the queue keying strategy to resolve this collision while maintaining backward compatibility with flat goals.

## What to Build

Produce a "Dimension 2: Queue keying strategy" section for `FEASIBILITY.md` that analyzes current queue behavior, evaluates multiple keying strategies, and recommends a concrete approach.

### Code Components

The analysis must cover every function in `src/queues.ts`:

- **`enqueueTask(cwd, goalName, task)`:** How does the filename `task-{goalName}.json` change under each keying strategy? Does it need to accept hierarchical names or full paths?
- **`readPendingTask(cwd, goalName)`:** Same question — how does lookup work with hierarchical keys?
- **`listPendingGoals(cwd)`:** Scans for `task-*.json` and strips the prefix/suffix to extract goal names. How does extraction change with new key formats? Can downstream code (e.g., `/pio-list-goals`) still derive meaningful goal identifiers?
- **`writeLastTask(goalDir, task)`:** Writes `LAST_TASK.json` inside a goal dir. Is this affected by queue keying changes?

### Approach and Decisions

1. **Evaluate at least two strategies:** Document trade-offs for each option. Candidate strategies include:
   - **Hierarchical keys with delimiters:** e.g., `task-parent__S03__nested.json` — encodes parent path in the filename using a delimiter (`__`)
   - **Path-based (relative) keys:** e.g., derive key from the relative goal path `.pio/goals/parent/S03/subgoals/nested` → encode as a safe filename
   - **Hashed paths:** Use a hash of the full goal path to guarantee uniqueness at the cost of readability
   - **Multi-slot queues:** Allow multiple tasks per "goal name" using array-based JSON instead of per-file slots

2. **Consider serialization vs concurrency:** The single-slot design serializes execution (one pending task per goal). Evaluate whether concurrent parent+subgoal execution is desirable, and if so, what the keying implications are.

3. **Backward compatibility:** Ensure flat goals (no nesting) continue to work with existing filenames. Any strategy must not break `task-{flat-goal-name}.json` for non-nested goals.

4. **Downstream integration:** Analyze how queue keys interact with `GoalState.pendingTask()` in `src/goal-state.ts`, capability config resolution in `src/capability-config.ts`, and session naming in `deriveSessionName()` from `src/fs-utils.ts`. Dimension 1 already identified that `goalName` (from `path.basename`) loses parent context — the queue strategy is the primary mechanism to recover it.

### Referencing prior decisions

From DECISIONS.md:
- **Subgoal path:** Assume `S{NN}/subgoals/<name>/` structure for all analysis.
- **`goalName` collision risk:** Sibling subgoals with same basename collide — this is the core problem to solve.
- **cwd derivation works correctly:** Queue directory resolution (`queueDir`) is unaffected by nesting; focus on filename/key generation only.

## Dependencies

- **Step 1 (Dimension 1):** Must be completed first. The recommended nesting approach (`S{NN}/subgoals/<name>/`) is a prerequisite assumption for all keying strategies evaluated here.

## Files Affected

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 2 analysis section

## Acceptance Criteria

- `FEASIBILITY.md` contains a "Dimension 2: Queue keying strategy" section.
- Section evaluates at least two keying strategies with trade-offs (pros/cons for each).
- Section recommends a specific approach and justifies it.
- Section identifies required changes to `src/queues.ts` (`enqueueTask`, `readPendingTask`, `listPendingGoals`) — categorizing each as new fields, new logic, or breaking change.
- Section addresses backward compatibility (flat goals must still work).
- Section addresses downstream integration points (`GoalState.pendingTask()`, capability config resolution, session naming).

## Risks and Edge Cases

- **Filename length:** Hierarchical keys could produce long filenames. Check OS limits (~255 bytes per filename on most filesystems).
- **Special characters in goal names:** If goal names contain path separators or special characters, encoding strategy must handle them safely.
- **Round-trip fidelity:** `listPendingGoals()` extracts goal names from filenames. The extraction must reliably reconstruct the key used by `enqueueTask`/`readPendingTask`.
- **Migration considerations:** If flat goals are renamed to hierarchical format, existing queue files would become orphaned.
