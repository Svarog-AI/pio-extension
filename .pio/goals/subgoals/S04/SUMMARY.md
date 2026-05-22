# Summary: Dimension 4 — Subgoal trigger mechanism (with abstraction tree)

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `.pio/goals/subgoals/FEASIBILITY.md` — rewritten "Dimension 4: Subgoal trigger mechanism" section (~250 lines)

## Files Deleted
- (none)

## Decisions Made
- **Abstraction tree model adopted:** Root = goal, children = plan steps, leaves = directly implementable steps. Composite nodes spawn subgoals. Concrete example: "build auth" → JWT (leaf), OAuth (composite), rate limiting (leaf), dashboard (composite).
- **Leaf-node criteria: I/O contract test.** Single principle — "can you state the output without listing internal sub-outputs?" If yes → leaf. If no → composite. Domain-agnostic (works for code, research, design). Replaces the old 5-point checklist.
- **Subgoal boundary: encapsulation rule.** Parent plan operates at the deliverable level. Subgoals encapsulate process steps. Test: "does the parent need to know how this is built?" If no → subgoal. If yes → flatten.
- **Hybrid flat-tree prevention recommended:** Step count limit (`totalSteps > 8`) as a hard guard + abstraction distance heuristic as skill guidance. Count limit catches obvious flat plans; distance heuristic catches edge cases.
- **create-plan is the primary initiation point:** The planning agent evaluates all steps against leaf-node criteria upfront. Single decision point, declarative and auditable. `evolve-plan` is a correction fallback. `execute-task` is not involved in decomposition decisions.
- **Signaling mechanism NOT yet decided:** Two options evaluated — Mechanism A (PLAN.md metadata, declarative) and Mechanism B (runtime marker file). The choice is deferred to Dimension 9 (planning awareness), which will design the PLAN.md metadata schema. The feasibility analysis covers both options.
- **pio-planning skill separation maintained:** Leaf-node criteria and decomposition guards are HOW (in `pio-planning/SKILL.md`, reusable by both `create-plan` and `revise-plan`). Capability prompts say WHAT to do and reference the skill.
- **No breaking changes:** All modifications are additive — new skill instructions, new prompt references, new state machine routing.

## Test Coverage
- All 12 programmatic verification checks pass:
  - FEASIBILITY.md exists ✓
  - Dimension 4 section heading present ✓
  - Abstraction tree model defined (8 matches) ✓
  - Leaf-node criteria discussed (31 matches) ✓
  - Flat tree prevention evaluated (23 matches, ≥2 approaches) ✓
  - All three initiation points evaluated (83 matches for evolve-plan/execute-task) ✓
  - Primary initiation point recommended (21 matches) ✓
  - Prompt references documented (16 matches) ✓
  - Source file references present (8 matches for evolve-plan.ts/execute-task.ts) ✓
  - Change categorizations present (79 matches for new fields/new logic/breaking) ✓
  - Cross-references to other dimensions (44 matches, includes Dimensions 1, 2, 3, 5, 7, 9) ✓
  - TypeScript compilation passes (exit code 0) ✓
- Manual verification:
  - Abstraction tree includes concrete decomposition example (build auth → 4 steps with leaf/composite classification) ✓
  - Leaf-node criteria are specific and actionable (5 concrete rules with heuristics) ✓
  - Both flat-tree prevention approaches have dedicated pros/cons analysis with reasoned hybrid recommendation ✓
