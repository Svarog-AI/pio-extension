---
totalSteps: 9
---

# Plan: Subgoals Feasibility Study

Produce `FEASIBILITY.md` — a structured feasibility analysis of nested subgoals in pio, covering all 9 dimensions defined in GOAL.md. Each step researches one dimension and appends its findings to the document.

## Prerequisites

- GOAL.md exists at `.pio/goals/subgoals/GOAL.md` (already confirmed).
- All source files referenced in GOAL.md are available for reading. No code changes or build commands required — this is a research-and-documentation goal only.

## Steps

## Step 1: Dimension 1 — Nesting structure on disk

**Description**

Evaluate how subgoal workspaces live relative to parent goal/step folders per the user preference of **nested-in-step-dirs** (e.g., `.pio/goals/parent/S03/subgoals/nested-feature/`). Cover recursive nesting depth, the `subgoals/` directory convention versus alternatives, and implications for `GoalState` path resolution in `src/goal-state.ts` and `resolveGoalDir` in `src/fs-utils.ts`.

Key findings from research:
- `resolveGoalDir(cwd, name)` always resolves flat to `<cwd>/.pio/goals/<name>/`. A nested subgoal would need a different resolution strategy (e.g., relative-to-step-dir or path-based).
- `createGoalState(goalDir)` derives cwd by splitting on `/goals/`, which breaks for nested paths. The `steps()` method scans the goal dir with `/^S(\d+)$/` — this regex would conflict if subgoals sit inside step folders (a parent's `S03/` also contains `subgoals/`).
- Recursive nesting depth: each level adds path segments. With `subgoals/` as a fixed directory marker, depth is trackable via path traversal.

**Acceptance Criteria**

- `FEASIBILITY.md` exists and contains a "Dimension 1: Nesting structure on disk" section.
- Section documents the recommended nesting approach (`S{NN}/subgoals/<name>/`) with justification.
- Section identifies required changes to `src/fs-utils.ts` (`resolveGoalDir`) and `src/goal-state.ts` (cwd derivation, `steps()` regex).
- Categorizes each change as new fields, new logic, or breaking change.

**Files Affected**

- `.pio/goals/subgoals/FEASIBILITY.md` — new file: Dimension 1 analysis section

## Step 2: Dimension 2 — Queue keying strategy

**Description**

Analyze per-goal single-slot queue (`src/queues.ts`) and evaluate strategies for unique subgoal queue slots without colliding with parents or siblings. Options: hierarchical keys (e.g., `task-parent__S03__nested.json`), path-based keys, or multi-slot queues. Determine if concurrent parent+subgoal execution is desirable or if serialization is acceptable.

Key findings from research:
- Queue key is `goalName` (basename of goal dir). With nested paths like `parent/S03/subgoals/nested/`, the basename would be `nested` — no collision, but sibling subgoals with same name under different parents would collide.
- `listPendingGoals()` strips `task-` prefix and `.json` to extract goal names. Hierarchical keys must survive this round-trip or the extraction logic changes.
- Single-slot design means at most one pending task per goal — serialization is the existing default.

**Acceptance Criteria**

- `FEASIBILITY.md` contains a "Dimension 2: Queue keying strategy" section.
- Section evaluates at least two keying strategies with trade-offs.
- Section recommends a specific approach (e.g., path-based keys) and justifies it.
- Section identifies required changes to `src/queues.ts` (`enqueueTask`, `readPendingTask`, `listPendingGoals`).

**Files Affected**

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 2 analysis section

## Step 3: Dimension 3 — State machine extensions

**Description**

Analyze current transitions in `src/state-machine.ts` and document how subgoal lifecycles compose with parent goals. Cover: how a step spawns a subgoal (new transition? piggyback on existing?), the subgoal lifecycle relative to the parent's, and what happens when a subgoal completes (transition back to parent's `review-task`, auto-mark parent step `COMPLETED`, or manual intervention?).

Key findings from research:
- Transitions are pure functions dispatching on capability name. Current flow: `create-goal → create-plan → evolve-plan → execute-task → review-task → evolve-plan` (cycle).
- `resolveTransition(capability, state, params)` is the single entry point — no concept of parent-child relationships.
- When `evolve-plan` encounters a subgoal-type step, it could either: (a) skip TASK.md/TEST.md and spawn create-goal for the subgoal directly, or (b) produce wrapper specs that delegate to the subgoal.
- The `finalize-goal` transition returns `undefined` (terminal). Subgoal completion needs a non-terminal path back to the parent.

**Acceptance Criteria**

- `FEASIBILITY.md` contains a "Dimension 3: State machine extensions" section.
- Section documents how subgoal spawning integrates with existing transitions (new capability vs. piggyback).
- Section specifies the lifecycle composition model (parent pauses, runs concurrently, or delegates entirely).
- Section identifies changes to `src/state-machine.ts` (new transition functions, params for parent tracking).

**Files Affected**

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 3 analysis section

## Step 4: Dimension 4 — Subgoal trigger mechanism

**Description**

Evaluate how a subgoal is initiated. Three initiation points: (a) during `evolve-plan` (specification writer decides a step needs its own goal), (b) during `execute-task` (implementer requests decomposition), or (c) via PLAN.md metadata (pre-declared subgoal steps). For each, document what information flows into subgoal creation and what prompt/config changes are needed.

Key findings from research:
- `evolve-plan.ts`: The specification writer reads PLAN.md and current step context. It could detect a step-level marker or metadata flag indicating "this step is a subgoal."
- `execute-task.ts`: Implementer has TASK.md + TEST.md. Requesting decomposition mid-execution would require a new mechanism (e.g., writing a special marker file that gets picked up on mark_complete).
- PLAN.md pre-declaration: requires frontmatter or body syntax to mark certain steps as subgoals — ties into Dimension 9.

**Acceptance Criteria**

- `FEASIBILITY.md` contains a "Dimension 4: Subgoal trigger mechanism" section.
- Section evaluates all three initiation points (evolve-plan, execute-task, PLAN.md metadata).
- Section recommends a primary initiation point with justification.
- Section documents required prompt changes and information flow for the recommended approach.

**Files Affected**

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 4 analysis section

## Step 5: Dimension 5 — File protection scope

**Description**

Analyze `src/guards/validation.ts` and verify correctness of write restrictions for nested subgoal sessions. A subgoal session's `workingDir` would be nested inside the parent goal workspace. Document whether explicit scoping changes are needed to prevent subgoal sessions from writing to parent-level files outside their own directory.

Key findings from research:
- Current protection: `tp.startsWith(workingDir + path.sep) || tp === workingDir` allows writes within `workingDir`. For a subgoal at `parent/S03/subgoals/nested/`, this would allow writes within that sub-directory only.
- Gap: A subgoal session could write to sibling subgoal directories or parent step files if those paths are siblings of `workingDir` — but the current check already blocks these since they don't start with the subgoal's `workingDir`.
- Question: Should a subgoal session be able to read (not just write) parent-level PLAN.md, GOAL.md for context? Read protection is separate from write protection.

**Acceptance Criteria**

- `FEASIBILITY.md` contains a "Dimension 5: File protection scope" section.
- Section analyzes current validation behavior for nested paths (prove correctness or identify gaps).
- Section recommends any explicit scoping changes needed to `src/guards/validation.ts`.
- Section addresses read-access requirements (should subgoal sessions access parent PLAN.md, GOAL.md?).

**Files Affected**

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 5 analysis section

## Step 6: Dimension 6 — Session hierarchy and navigation

**Description**

Assess session tree deepening with subgoals: root → parent goal → parent step → subgoal create-goal → .... Evaluate whether pi's `parentSession` tracking supports arbitrary depth, how `/pio-parent` (in `src/capabilities/parent.ts`) navigates through multiple levels, and whether the user needs visibility into the nesting chain.

Key findings from research:
- `launchCapability()` in `session-capability.ts` uses `ctx.newSession({ parentSession })` with no documented depth limit.
- `/pio-parent` (in `src/capabilities/parent.ts`) switches back to parent session — presumably one level at a time. Multiple nested subgoals would require multiple invocations.
- Session names are derived via `deriveSessionName(goalName, capability, stepNumber)` in `src/fs-utils.ts`. With hierarchical goal names, the display name needs to reflect nesting clearly.

**Acceptance Criteria**

- `FEASIBILITY.md` contains a "Dimension 6: Session hierarchy and navigation" section.
- Section confirms whether pi's `parentSession` supports arbitrary depth (with evidence from code or API docs).
- Section analyzes `/pio-parent` behavior for multi-level nesting (single hop vs. chain traversal).
- Section recommends any changes to session naming (`deriveSessionName`) or user visibility.

**Files Affected**

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 6 analysis section

## Step 7: Dimension 7 — Completion propagation

**Description**

Document how subgoal completion propagates back to the parent step. Options: automatic `COMPLETED` + `SUMMARY.md` writing in parent's `S{NN}/`, returning control to parent's `review-task`, or requiring user intervention. User preference: "the subgoal, like any goal, has a COMPLETED marker. This is what counts."

Key findings from research:
- `finalize-goal` currently returns `undefined` (terminal) in the state machine. For subgoals, completion must propagate up.
- When a subgoal's `COMPLETED` marker appears, the parent step needs to be notified. Mechanisms: file watchers (impractical for agent sessions), postExecute hook on finalize, or explicit user action.
- The `review-task` transition checks step status via `GoalState.steps()`. If a subgoal marks its parent step as `COMPLETED`, review-task would process it normally.

**Acceptance Criteria**

- `FEASIBILITY.md` contains a "Dimension 7: Completion propagation" section.
- Section documents the recommended propagation mechanism aligned with user preference (subgoal COMPLETED marker is authoritative).
- Section specifies what happens to parent step markers (`COMPLETED`, `SUMMARY.md`) when subgoal completes.
- Section identifies changes to `src/state-machine.ts` and/or finalize-goal postExecute hook.

**Files Affected**

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 7 analysis section

## Step 8: Dimension 8 — GoalState and path resolution changes

**Description**

Document required changes to `src/goal-state.ts` (`createGoalState`, cwd derivation, `steps()` scanning), `src/fs-utils.ts` (`resolveGoalDir`, `discoverNextStep`), and any other code that assumes flat goal workspace paths. This is a comprehensive inventory of all path-resolution assumptions broken by nesting.

Key findings from research:
- **`goal-state.ts`:** Cwd derivation via `goalDir.indexOf("/goals/")` + slicing breaks for nested paths. The `steps()` method scans `goalDir` with `/^S(\d+)$/` — safe for subgoals since they live in `subgoals/`, but the cwd derivation must be fixed first.
- **`fs-utils.ts`:** `resolveGoalDir(cwd, name)` always produces flat paths. `discoverNextStep(goalDir)` scans a specific dir — works if given the right dir.
- **`capability-config.ts`:** Derives `workingDir` via `resolveGoalDir(cwd, goalName)`. Needs to handle nested goal names or accept explicit working dirs.
- **`state-machine.ts`:** `transitionEvolvePlan` calls `resolveGoalDir(cwd, goalName!)` — breaks for nested paths.

**Acceptance Criteria**

- `FEASIBILITY.md` contains a "Dimension 8: GoalState and path resolution changes" section.
- Section lists every function/location that assumes flat paths (comprehensive inventory).
- Section proposes the resolution strategy (e.g., accept full paths instead of goal names, or introduce a nested-aware resolver).
- Section categorizes each change as new fields, new logic, or breaking change.

**Files Affected**

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 8 analysis section

## Step 9: Dimension 9 — Planning awareness + synthesis

**Description**

Analyze how `create-plan` and `evolve-plan` distinguish subgoal steps from regular steps. Cover: step-level metadata in PLAN.md, create-plan prompt changes, evolve-plan behavior divergence, and frontmatter schema evolution in `src/frontmatter-schemas.ts`. Then synthesize all 9 dimensions into a cohesive document with risks, file inventory, and go/no-go recommendation.

Key findings from research:
- **PLAN.md frontmatter:** Currently only `totalSteps` in `PLAN_FRONTMATTER_SCHEMA`. Would need per-step or per-plan metadata for subgoals (e.g., `subgoalSteps: [3]` or a steps array).
- **create-plan prompt:** `src/prompts/create-plan.md` produces numbered steps. Needs instructions to flag certain steps as subgoals — requires a heuristic (e.g., "if a step involves multiple independent sub-tasks").
- **evolve-plan behavior:** When encountering a subgoal-type step, `evolve-plan.ts` must either spawn create-goal directly or produce wrapper specs. The `CAPABILITY_CONFIG` validation expects TASK.md + TEST.md — this changes for subgoal steps.
- **Synthesis:** Cross-reference all dimensions, identify shared changes (e.g., path resolution fixes affect Dimensions 1, 8, and others), compile file inventory, assess risks.

**Acceptance Criteria**

- `FEASIBILITY.md` contains a "Dimension 9: Planning awareness" section with analysis of step-level metadata, create-plan/evolve-plan changes, and frontmatter schema evolution.
- `FEASIBILITY.md` contains a synthesis section covering: recommended nesting approach with justification, complete file modification inventory, identified risks or blockers, and clear go/no-go recommendation.
- Each dimension's changes are categorized as new fields, new logic, or breaking change.
- Cross-references between dimensions are explicit (e.g., "Dimension 8 path changes resolve issues identified in Dimension 1").

**Files Affected**

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 9 analysis + synthesis section

## Notes

- This is a feasibility study — no code implementation. All steps produce research and documentation output only.
- Steps 1–8 can theoretically run in parallel (independent dimensions), but are sequenced for clarity. Each appends to the same FEASIBILITY.md file, so an executor must ensure sequential writes or use distinct sections that don't overlap.
- The user preference for nested goals (`S{NN}/subgoals/<name>/`) is stated in GOAL.md — Dimension 1 analysis should evaluate this approach but may recommend alternatives if technical constraints dictate.
- FEASIBILITY.md is written incrementally across steps. Step 9 adds the synthesis section and final recommendation to the same file.
