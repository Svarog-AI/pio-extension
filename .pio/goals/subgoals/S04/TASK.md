# Task: Dimension 4 — Subgoal trigger mechanism (with abstraction tree)

Evaluate how subgoals are initiated, but critically: **how do we decide a step should be a subgoal at all?** This requires an "abstraction tree" model with leaf-node criteria and decomposition guards.

## Context

GOAL.md defines nine dimensions for the subgoals feasibility study. Step 4 covers Dimension 4: **Subgoal trigger mechanism**. The feasibility study is produced as `FEASIBILITY.md` in the goal workspace root, written incrementally across steps 1–9. Previous steps (Dimensions 1–3) have already been appended.

Prior decisions from Steps 1–3 (in `DECISIONS.md`) are relevant: the nesting structure is `S{NN}/subgoals/<name>/`, the state machine uses a new transition approach for spawning, and parent lifecycle implicitly pauses while subgoals run.

### The core problem: "Where" is secondary to "How do we decide?"

Three initiation points exist (evolve-plan, execute-task, PLAN.md metadata), but these address **where** a subgoal is triggered. The harder question is **how do we determine that a step warrants subgoal decomposition at all?** Without this, the planner produces flat plans with 20+ steps and no subgoals — defeating the purpose of recursive nesting.

The abstraction tree model frames this correctly:
- Root = top-level goal
- Children = immediate plan steps
- Each child is either a **leaf** (implementable directly) or a **subgoal** (needs its own plan → specs → implementation cycle)

Two fundamental questions must be answered:

1. **What defines a leaf node?** How concrete is sufficient for a step to be considered implementable? What criteria distinguish "this can be done in one execute-task session" from "this needs its own goal with multiple steps"?

2. **How do we prevent flat trees?** Without guards, any planner (human or AI) will produce a single-level tree with N large steps instead of a properly nested abstraction. Two approaches:
   - **Step count limit:** Crude and artificial, but simple. E.g., "if totalSteps > 8, you must decompose."
   - **Abstraction distance metric:** Define a notion of "distance" between a parent goal's scope and a child step's scope. If the distance exceeds a threshold, the step is too far removed from the parent's abstraction level — it needs its own subgoal.

## What to Build

Produce the "Dimension 4: Subgoal trigger mechanism" section of `FEASIBILITY.md`. This is a **research-and-documentation output only** — no code implementation.

The analysis must cover two major parts:

### Part A: The abstraction tree model

1. **Define the abstraction tree concept:** Root = goal, children = plan steps, leaves = directly implementable steps. Document how this maps to the pio lifecycle (goal → plan → steps → subgoals → nested plans).

2. **Leaf-node criteria:** Propose concrete criteria for determining when a step is "leaf-level" (implementable in one `execute-task` session) vs. "composite" (needs subgoal decomposition). Consider:
   - Estimated scope/complexity (number of files, number of behaviors)
   - Cohesion — does the step involve multiple independent concerns?
   - Session time budget — can an AI agent complete this in one session?
   - Dependencies on external services or manual intervention

3. **Decomposition prevention (the "flat tree" problem):** Evaluate both approaches:
   - **Step count limit:** Simple heuristic. E.g., `totalSteps > 8` forces subgoal decomposition. Discuss pros (easy to implement and enforce) and cons (arbitrary, doesn't account for step complexity).
   - **Abstraction distance metric:** More nuanced but harder to define. What is the "distance" between parent scope and child scope? Possible formulations: scope ratio (parent covers X features, child covers Y — if Y << X, distance is large), abstraction level difference, or a qualitative heuristic encoded in prompts.
   - Recommend an approach with justification. A hybrid (count limit as hard guard + distance heuristic for prompt guidance) may be optimal.

### Part B: Initiation points (where the trigger fires)

4. Evaluate all three initiation points: evolve-plan (specification writer decides), execute-task (implementer requests decomposition mid-execution), PLAN.md metadata (pre-declared subgoal steps).

5. For each, document what information flows into subgoal creation and what prompt/config changes are needed.

6. **Recommend a primary initiation point** — but ground the recommendation in the abstraction tree model. E.g., "evolve-plan is the natural trigger because the specification writer already analyzes step complexity when writing TASK.md/TEST.md."

7. Identify required changes to specific source files.

### Code Components

No code components — this is a feasibility analysis document. However, the executor should research and reference:

- **`src/capabilities/evolve-plan.ts`:** How the specification writer session works currently. What hooks or validation points could detect subgoal-type steps? Examine `validateAndFindNextStep`, `CAPABILITY_CONFIG`, and the `execute` method.
- **`src/prompts/evolve-plan.md`:** Current prompt instructions for the specification writer. What would need to change to instruct it about the abstraction tree model and leaf-node criteria?
- **`src/capabilities/execute-task.ts`:** How the executor session works. Can an implementer trigger decomposition mid-execution? Examine `CAPABILITY_CONFIG`, validation, and write allowlist — can a "decomposition request" marker be written that gets picked up on `pio_mark_complete`?
- **`src/prompts/execute-task.md`:** Current prompt for the executor. Would need instructions for requesting subgoal decomposition.
- **`src/frontmatter-schemas.ts`:** `PLAN_FRONTMATTER_SCHEMA` currently has only `totalSteps`. Step count limit enforcement or per-step metadata would require schema evolution (ties to Dimension 9).

### Approach and Decisions

- Follow the structure established in previous Dimensions 1–3: analysis → evaluation of options → clear recommendation → change categorization.
- Reference the nesting structure (`S{NN}/subgoals/<name>/`) from Dimension 1 — all initiation points must produce subgoals at this path.
- Reference the state machine spawning mechanism (new transition in `transitionEvolvePlan`) from Dimension 3 — the trigger must feed into this transition.
- **Cross-reference with Dimension 9:** PLAN.md metadata for step-level subgoal declarations is primarily a Dimension 9 topic (planning awareness). Dimension 4 should evaluate it as an initiation point but defer detailed schema design to Dimension 9. Note this overlap explicitly.

## Dependencies

- Step 1 (Dimension 1 — Nesting structure): needed to understand the `S{NN}/subgoals/<name>/` path convention
- Step 3 (Dimension 3 — State machine extensions): needed to understand how subgoal spawning integrates with transitions
- `FEASIBILITY.md` must already exist with Dimensions 1–3 sections from previous steps

## Files Affected

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 4 analysis section

## Acceptance Criteria

- `FEASIBILITY.md` contains a "Dimension 4: Subgoal trigger mechanism" section.
- Section defines the **abstraction tree model** (root = goal, children = steps, leaves = implementable).
- Section proposes concrete **leaf-node criteria** for distinguishing implementable vs. composite steps.
- Section evaluates at least two approaches to **prevent flat trees** (step count limit and abstraction distance metric), with pros/cons for each.
- Section evaluates all three initiation points (evolve-plan, execute-task, PLAN.md metadata).
- Section recommends a primary initiation point with justification grounded in the abstraction tree model.
- Section documents required prompt changes and information flow for the recommended approach.
- Each change is categorized as new fields, new logic, or breaking change.
- Cross-references to at least 2 other dimensions are present (especially Dimensions 1, 3, and 9).

## Risks and Edge Cases

- The "abstraction distance" concept may be hard to quantify for an AI planner. Evaluate whether a purely prompt-based heuristic is sufficient or if it requires programmatic enforcement.
- The PLAN.md metadata initiation point overlaps significantly with Dimension 9 (planning awareness). Avoid duplicating analysis — reference Dimension 9 instead of repeating schema design.
- execute-task decomposition mid-execution may require a novel mechanism (special marker file) not currently in pio. Evaluate feasibility honestly — this doesn't have to be the recommendation.
- Consider edge case: what if evolve-plan encounters a step that is flagged as subgoal-type but no subgoal name is provided? How does the system handle this gap?
- Step count limit: at what threshold? Too low (e.g., 5) forces unnecessary nesting. Too high (e.g., 15) doesn't prevent the flat-tree problem.
