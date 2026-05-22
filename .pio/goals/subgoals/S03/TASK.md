# Task: Dimension 3 — State machine extensions

Analyze `src/state-machine.ts` and document how subgoal lifecycles compose with parent goals, covering spawning mechanisms, lifecycle composition models, completion propagation hooks, and required transition changes.

## Context

The feasibility study is a research-and-documentation goal. Step 3 covers Dimension 3 from GOAL.md: **State machine extensions**. This step appends to `FEASIBILITY.md` (already created by Steps 1–2). No source code is modified — only analysis and documentation output.

The current state machine (`src/state-machine.ts`) is a pure transition resolver with linear transitions within a single goal. It has no concept of parent-child relationships, subgoal spawning, or hierarchical goal lifecycles. This dimension must determine how to extend these transitions to support nested subgoals.

## What to Build

Append a "Dimension 3: State machine extensions" section to `FEASIBILITY.md`. The analysis must cover:

### Subgoal spawning mechanism

How does a step spawn a subgoal? Evaluate and compare two approaches:

1. **New transition in the state machine:** Add a dedicated subgoal-spawning transition (e.g., `evolve-plan → create-goal` for the subgoal). This would mean when `evolve-plan` encounters a step marked as a subgoal, it routes to `create-goal` with params identifying the subgoal name and parent context.

2. **Piggyback on existing transitions:** Use an existing transition but add metadata/params to indicate this is a subgoal spawn. For example, `evolve-plan → create-goal` already exists conceptually (via the pio lifecycle: `create-goal → create-plan → evolve-plan`). The question is whether the state machine needs explicit awareness or if subgoal spawning happens at the capability layer (e.g., evolve-plan's prompt tells the spec writer to write a marker, and mark_complete detects it).

For each approach, document required changes to `src/state-machine.ts` (new transition functions, param additions for parent tracking) and their impact on existing transitions.

### Lifecycle composition model

How does the subgoal lifecycle compose with the parent's? Evaluate three models:

1. **Parent pauses:** Parent step waits (step status = pending) until subgoal completes. Subgoal runs through full lifecycle independently. When done, parent step resumes.
2. **Concurrent execution:** Parent and subgoal sessions run independently but serialized via queue slots. State machine must track both contexts.
3. **Full delegation:** The step effectively _becomes_ the subgoal — no wrapper logic in the parent. Step completion is synonymous with subgoal completion.

For each model, specify what happens at key lifecycle events: when subgoal starts, during subgoal execution, and when subgoal completes.

### Subgoal completion → parent resumption

When a subgoal completes (subgoal's `finalize-goal` or subgoal `COMPLETED` marker), how does this propagate back to the parent? Evaluate:

1. **Automatic transition:** `finalize-goal` for a subgoal detects it has a parent and transitions back to the parent's `review-task`. Requires parent context in params.
2. **PostExecute hook on finalize-goal:** After subgoal finalization, a hook writes `COMPLETED` + `SUMMARY.md` in the parent's `S{NN}/`. This uses existing capability config mechanisms (`postExecute` in `CAPABILITY_CONFIG`).
3. **Manual intervention:** User must explicitly trigger parent resumption (e.g., `/pio-next-task` on parent goal).

For each option, document: required state machine changes, required params propagation, and impact on the `finalize-goal` terminal behavior (currently returns `undefined`).

### Changes to `src/state-machine.ts`

Identify specific functions that need modification or creation:

- **`resolveTransition()`:** Does it need a new case for subgoal-aware routing? Or does the existing switch handle it via param enrichment?
- **`transitionEvolvePlan()`:** This is where evolve-plan detects plan completion and routes to `finalize-goal`. For subgoals, it may need to route to `create-goal` instead when a step is flagged as a subgoal.
- **`transitionFinalizeGoal()`:** Currently hardcoded to return `undefined` (terminal). For subgoals, it needs a non-terminal path back to the parent.
- **New transition functions:** Are new transitions needed (e.g., `transitionSubgoalComplete`, `transitionSpawnSubgoal`)?

For each change, categorize as: **new fields** (new params), **new logic** (behavior changes in existing functions), or **breaking change**.

### Cross-references to other dimensions

Explicitly note how this dimension connects to:
- Dimension 1: The `S{NN}/subgoals/<name>/` nesting structure determines where subgoal workspaces live relative to the parent step — this affects how transitions pass `goalDir` for subgoals.
- Dimension 2: Queue keying strategy (hierarchical keys with `__`) enables independent queue slots for parent and subgoal — this affects how state machine transitions enqueue tasks.
- Dimension 4: Subgoal trigger mechanism determines _when_ the state machine encounters a subgoal step — evolve-plan detection vs execute-task mid-flight request.
- Dimension 7: Completion propagation overlaps with subgoal completion → parent resumption in this dimension.

## Dependencies

- **Step 1 (Dimension 1):** Completed. The nesting structure (`S{NN}/subgoals/<name>/`) is the assumed physical layout. Read S01/SUMMARY.md for details.
- **Step 2 (Dimension 2):** Completed. Queue keying strategy (hierarchical keys) enables independent parent+subgoal queues. Read S02/DECISIONS.md for accumulated decisions.
- **FEASIBILITY.md exists:** Steps 1 and 2 have already appended Dimensions 1 and 2 to `FEASIBILITY.md`. Step 3 appends Dimension 3.

## Files Affected

- `.pio/goals/subgoals/FEASIBILITY.md` — append: "Dimension 3: State machine extensions" section
- `src/state-machine.ts` — read-only research target (analyze transitions)
- `src/capabilities/session-capability.ts` — read-only research target (analyze `pio_mark_complete` lifecycle, transition routing via `resolveTransition()`)
- `src/goal-state.ts` — read-only research target (analyze `goalCompleted()` and how subgoals would integrate)

## Acceptance Criteria

- `FEASIBILITY.md` contains a "Dimension 3: State machine extensions" section.
- Section documents how subgoal spawning integrates with existing transitions (new capability vs. piggyback). At least two approaches evaluated with trade-offs.
- Section specifies the lifecycle composition model (parent pauses, runs concurrently, or delegates entirely). All three models evaluated.
- Section identifies changes to `src/state-machine.ts` (specific functions: `resolveTransition`, `transitionEvolvePlan`, `transitionFinalizeGoal`). Each categorized as new fields, new logic, or breaking change.
- Section documents the subgoal completion → parent resumption mechanism with at least two options evaluated.
- Cross-references to Dimensions 1, 2, 4, and 7 are present.

## Risks and Edge Cases

- **Circular transitions:** If a subgoal spawns another subgoal (recursive nesting), the state machine must not create infinite loops. Each level has its own goal workspace and independent lifecycle — but this must be explicitly verified in the analysis.
- **Param pollution:** Parent context params (e.g., `parentGoalName`, `parentStepNumber`) could leak into downstream transitions unintentionally. The analysis should note how to scope params correctly.
- **Terminal behavior change:** Making `finalize-goal` non-terminal for subgoals is a significant behavioral change. The analysis must distinguish between top-level goals (terminal) and subgoals (non-terminal).
