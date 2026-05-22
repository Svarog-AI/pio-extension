# Task: Dimension 7 — Completion propagation

Document how subgoal completion propagates back to the parent step, specifying the recommended propagation mechanism, parent step marker behavior, and required changes to finalize-goal and the state machine.

## Context

When a subgoal completes (subgoal's `finalize-goal` or subgoal workspace gets a `COMPLETED` marker), the parent step must somehow be notified so the parent goal can continue. This is a critical lifecycle boundary: the transition point where control returns from the nested subgoal back to the parent workflow. The user's stated preference is authoritative: "the subgoal, like any goal, has a COMPLETED marker. This is what counts."

This builds on Dimension 3 (state machine extensions) which already recommended that `finalize-goal` routes to the parent's `evolve-plan`. Dimension 7 must specify the detailed mechanics: what exactly happens at the propagation boundary, who writes what files, how queue slots are restored, and what changes are needed in each affected module.

Prior decisions (from DECISIONS.md):
- Subgoal workspace path: `S{NN}/subgoals/<name>/`
- Hierarchical queue keys with `__` delimiters (Strategy A)
- `finalize-goal` remains terminal for top-level goals, non-terminal for subgoals (via `parentGoalName` param)
- Parent implicitly pauses — no active coordination
- Spawning uses state machine transitions (Approach 1)

## What to Build

Append the "Dimension 7: Completion propagation" section to `FEASIBILITY.md`. The analysis covers four parts:

### Part A: Subgoal COMPLETED marker semantics

Analyze the COMPLETED marker as the authoritative completion signal. Document its role in both regular goals and subgoals:
- **Regular goal:** `COMPLETED` at `<goalDir>/COMPLETED` is written by `evolve-plan` when all steps are specified (no more incomplete steps). `goalCompleted()` returns true. This triggers `finalize-goal`.
- **Subgoal:** The same marker mechanism applies. When a subgoal's COMPLETED marker appears, the subgoal is done. But unlike regular goals where `finalize-goal` is terminal (`undefined`), subgoal completion must propagate up.
- **User preference analysis:** "the subgoal, like any goal, has a COMPLETED marker. This is what counts." — analyze what this means for the propagation mechanism. The COMPLETED marker is the single source of truth. No additional parent-level markers need to be written by the subgoal session itself.

### Part B: Recommended propagation mechanism

Document the recommended approach for propagating subgoal completion to the parent. Analyze at least three mechanisms:

1. **State machine routing (`finalize-goal` → parent's `evolve-plan`):** `transitionFinalizeGoal` detects `parentGoalName` in params and returns a non-terminal transition to the parent's `evolve-plan`. The COMPLETED marker is checked by the subgoal's own `finalize-goal` (existing behavior). Upon completion, state machine enqueues the parent's next task.
2. **postExecute hook on finalize-goal:** The `finalize-goal` capability registers a `postExecute` hook that detects subgoal sessions (via params) and writes parent-level markers or enqueues parent tasks. This keeps the state machine terminal but adds lifecycle logic at the capability layer.
3. **User-initiated propagation:** Subgoal completion does not automatically propagate. The user must manually run `/pio-parent` and then trigger a parent-level action (e.g., `/pio-next-task`) to resume. This is the most manual approach.

For each, document trade-offs, required code changes, and how they interact with existing lifecycle mechanics. Recommend one approach with justification. Based on Dimension 3's recommendation, Approach 1 should be strongly favored — verify this holds under detailed analysis.

### Part C: Parent step marker behavior

Specify what happens to parent step markers when a subgoal completes:
- **Parent step COMPLETED:** Does the parent `S{NN}/` directory get a `COMPLETED` marker? Who writes it — the subgoal session, the state machine transition, or the parent's next `evolve-plan` session? Analyze the implications of each. The user preference suggests the subgoal's own COMPLETED is authoritative — does this mean the parent step doesn't need its own marker?
- **Parent step SUMMARY.md:** The `execute-task` agent writes `SUMMARY.md` upon completion. A subgoal replaces `execute-task` in the lifecycle. Should the subgoal write a SUMMARY.md to the parent's `S{NN}/`? Should the parent's `evolve-plan` generate one from subgoal outputs? Or is no wrapper summary needed (subgoal COMPLETED = step COMPLETED)?
- **APPROVED marker:** After `review-task` approves, it writes `APPROVED`. For a subgoal step, does `APPROVED` still apply? If the subgoal lifecycle replaces `execute-task → review-task`, there's no review for the parent step. Should `APPROVED` be written automatically when the subgoal completes (bypassing review)?
- **LAST_TASK.json:** `writeLastTask()` records the completed task in the goal directory. How does this work for subgoals — does it record in the subgoal dir or the parent dir?

### Part D: Required code changes and integration points

For the recommended mechanism, specify all required changes with categorization:
- **`src/state-machine.ts`:** `transitionFinalizeGoal` function (new), modifications to `resolveTransition`. How does it detect subgoal vs top-level goal? How does it construct the parent transition params?
- **`src/capabilities/finalize-goal.ts`:** Does `validateFinalizeGoal` need changes for subgoals? The COMPLETED marker check should work for nested paths if `resolveGoalDir` can resolve them. If not, explicit `params.goalDir` is the workaround.
- **`src/capabilities/session-capability.ts`:** `pio_mark_complete` handles the enqueueing. When `finalize-goal` transitions to `evolve-plan` for the parent, `enqueueTask` must use the parent's queue key (not the subgoal's). Analyze how `goalName` from `state.goalName` vs params interacts with hierarchical keys.
- **`src/goal-state.ts`:** Does `goalCompleted()` work correctly for nested paths? It checks `<goalDir>/COMPLETED` — if `goalDir` is resolved correctly, this works. Verify no additional changes needed.

Include a summary table of all file/function changes and categorize each as new fields, new logic, or breaking change.

### Part E: Cross-references to other dimensions

Cross-reference how completion propagation interacts with:
- **Dimension 3:** `finalize-goal` routing recommendation (already analyzed at high level). Dimension 7 provides the detailed mechanics.
- **Dimension 5:** Can the subgoal session write to parent files? If parent step markers are written by the subgoal session, file protection is a concern.
- **Dimension 2:** Queue keying — when the subgoal completes, the parent's queue slot must be restored with the correct key.
- **Dimension 8:** Path resolution — `resolveGoalDir` and `createGoalState` for nested paths affect how COMPLETED markers are checked.

## Code Components

### Analysis targets (existing code to read)

- **`src/state-machine.ts`:** Lines 107–145 — `transitionEvolvePlan` with the `goalCompleted()` check that routes to `finalize-goal`. Line 172 — `resolveTransition` returns `undefined` for `finalize-goal` (terminal). These are the key code points for non-terminal finalize-goal behavior.
- **`src/capabilities/finalize-goal.ts`:** Full file — `validateFinalizeGoal` checks `state.goalCompleted()`. `CAPABILITY_CONFIG` defines write allowlist and initial message. Does not currently have a `postExecute` hook.
- **`src/goal-state.ts`:** Lines 150–158 — `goalCompleted()` checks `<goalDir>/COMPLETED`. Line 123 — `createStepStatus.status()` returns `"implemented"` when `COMPLETED` marker exists in step folder.
- **`src/capabilities/session-capability.ts`:** Lines 70–140 — `pio_mark_complete` execute handler: reads config, validates, resolves transition, enqueues next task. This is where the enqueueing of the parent's task happens after subgoal completion.
- **`src/queues.ts`:** `enqueueTask(cwd, goalName, task)` — constructs queue file path from `goalName`. For parent task restoration, must use the parent's key.

### New code to analyze (from pi docs)

- Pi extensions docs — verify no constraints on session termination (`terminate: true` in tool response) that would prevent non-terminal finalize-goal transitions.

## Approach and Decisions

- **Follow the pattern of Dimensions 1–6:** Each dimension produces a self-contained analysis section with problem statement, evaluation of options, recommendation, change categorization, and cross-references.
- **Reference DECISIONS.md:** Dimension 3 already recommended `finalize-goal` → parent's `evolve-plan`. This analysis should verify this holds under detailed examination and fill in the mechanics (parent markers, queue restoration, file protection).
- **User preference is authoritative:** "the subgoal, like any goal, has a COMPLETED marker. This is what counts." — design the propagation mechanism around this principle. The subgoal's own COMPLETED is the signal; no additional parent-level markers are required from the subgoal session itself.
- **Focus on evidence from actual code:** Read `state-machine.ts` (finalize-goal handling), `finalize-goal.ts` (validation), `session-capability.ts` (mark_complete lifecycle), and `goal-state.ts` (COMPLETED marker detection). Ground conclusions in specific code references.

## Dependencies

- **Dimension 3 (State machine extensions):** Dimension 3 recommended the propagation mechanism (`finalize-goal` → parent's `evolve-plan`). Dimension 7 specifies detailed mechanics. Must align with Dimension 3's recommendation but is allowed to refine it based on detailed analysis.
- **Dimension 2 (Queue keying):** Parent queue slot restoration uses hierarchical keys from Dimension 2.
- **Dimension 5 (File protection):** If subgoal sessions need to write parent-level files, file protection scope is relevant.
- **Steps 1–6 must be completed** — FEASIBILITY.md must already contain Dimensions 1–6 sections.

## Files Affected

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 7 analysis section

## Acceptance Criteria

- `FEASIBILITY.md` contains a "Dimension 7: Completion propagation" section.
- Section documents the recommended propagation mechanism aligned with user preference (subgoal COMPLETED marker is authoritative).
- Section specifies what happens to parent step markers (`COMPLETED`, `SUMMARY.md`, `APPROVED`) when subgoal completes.
- Section identifies changes to `src/state-machine.ts` (`transitionFinalizeGoal`, `resolveTransition`).
- Section identifies changes to `src/capabilities/finalize-goal.ts` (if any).
- Section analyzes how `pio_mark_complete` in `session-capability.ts` handles the enqueueing of parent tasks after subgoal completion.
- Section covers at least three propagation mechanisms with trade-offs.
- Source file references are present (`state-machine.ts`, `finalize-goal.ts`, `session-capability.ts`, `goal-state.ts`).
- Changes are categorized as new fields, new logic, or breaking change.
- Cross-references to Dimensions 2, 3, 5, and 8 are included.

## Risks and Edge Cases

- **Subgoal fails without COMPLETED:** If a subgoal is `BLOCKED` instead of `COMPLETED`, the propagation mechanism should not trigger. Document how the system handles partial or failed subgoals.
- **Multiple subgoals per step (future consideration):** Currently one subgoal per step. If multiple subgoals are needed per step in the future, completion semantics change. Note this as a future constraint.
- **SUMMARY.md content gap:** The parent's `S{NN}/` directory may lack a SUMMARY.md if the subgoal doesn't write one and no wrapper generates it. This affects downstream sessions that expect step summaries (e.g., `finalize-goal` reads per-step summaries).
- **APPROVED marker semantics:** If the subgoal lifecycle bypasses `review-task`, the parent step never gets reviewed. Is automatic approval acceptable? Or should a review be required even for subgoal steps?
- **Queue slot timing:** The subgoal's queue slot must be cleaned up and the parent's restored. Ensure no race conditions or stale entries in the queue directory.
