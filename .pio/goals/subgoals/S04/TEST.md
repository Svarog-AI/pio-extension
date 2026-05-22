# Tests: Dimension 4 — Subgoal trigger mechanism (with abstraction tree)

This is a research-and-documentation step. No source code is modified. All verification is programmatic (file content checks) plus TypeScript compilation to ensure no regressions.

## Programmatic Verification

1. **FEASIBILITY.md exists**
   - **What:** `FEASIBILITY.md` file exists at the goal workspace root
   - **How:** `test -f .pio/goals/subgoals/FEASIBILITY.md && echo PASS || echo FAIL`
   - **Expected result:** `PASS`

2. **Dimension 4 section heading present**
   - **What:** The "Dimension 4: Subgoal trigger mechanism" heading exists in FEASIBILITY.md
   - **How:** `grep -c "Dimension 4.*Subgoal trigger mechanism" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 1

3. **Abstraction tree model defined**
   - **What:** Section describes the abstraction tree concept (root = goal, children = steps, leaves = implementable)
   - **How:** `grep -ci "abstraction.*tree\|abstraction.*level" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 1

4. **Leaf-node criteria discussed**
   - **What:** Section proposes criteria for distinguishing implementable (leaf) steps from composite (subgoal) steps
   - **How:** `grep -ci "leaf\|implementable\|decomposition.*criteria" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 1

5. **Flat tree prevention evaluated**
   - **What:** Section evaluates at least two approaches to prevent flat plans (step count limit, abstraction distance)
   - **How:** `grep -ci "step.*count\|totalSteps\|distance.*metric\|abstraction.*distance\|flat.*tree\|decomposition.*guard" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 2 (mentions of at least two approaches)

6. **All three initiation points evaluated**
   - **What:** Section mentions all three initiation mechanisms (evolve-plan, execute-task, PLAN.md metadata)
   - **How:** `grep -c "evolve.plan\|execute.task" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 2 (at least one mention each for evolve-plan and execute-task; PLAN.md metadata is also expected)

7. **Primary initiation point recommended**
   - **What:** Section contains a clear recommendation for the primary trigger mechanism
   - **How:** `grep -ci "recommend" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 1

8. **Prompt changes documented**
   - **What:** Required prompt changes are identified for the recommended approach
   - **How:** `grep -ci "prompt" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 1

9. **Source file references**
   - **What:** Section references specific source files requiring changes (`evolve-plan.ts`, `execute-task.ts`)
   - **How:** `grep -c "evolve.plan.ts\|execute.task.ts" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 2

10. **Change categorizations present**
    - **What:** Changes are categorized as new fields, new logic, or breaking change
    - **How:** `grep -ci "new fields\|new logic\|breaking" .pio/goals/subgoals/FEASIBILITY.md`
    - **Expected result:** Output ≥ 1

11. **Cross-references to other dimensions**
    - **What:** Section cross-references at least 2 other dimensions by number
    - **How:** `grep -c "Dimension [0-9]" .pio/goals/subgoals/FEASIBILITY.md` — verify the count includes references within the Dimension 4 section itself
    - **Expected result:** Section contains ≥ 2 cross-references to other dimensions

12. **TypeScript compilation passes**
    - **What:** No TypeScript errors introduced (this step is documentation-only, but compilation must still pass)
    - **How:** `npm run check` from the project root
    - **Expected result:** Exit code 0, no type errors

## Manual Verification

1. **Abstraction tree depth and completeness**
   - **What:** The abstraction tree model is clearly explained with concrete examples (e.g., "a goal to 'build auth' decomposes into steps, some of which are leaves like 'add JWT validation' and composites like 'implement OAuth flow' that need their own plans")
   - **How:** Read the abstraction tree subsection. Verify it includes at least one concrete decomposition example

2. **Leaf-node criteria concreteness**
   - **What:** Leaf-node criteria are specific enough to be encoded as prompt instructions for the planning agent (not just abstract principles)
   - **How:** Read the leaf-node criteria section. Can you extract actionable rules? E.g., "if a step touches more than X files, it needs subgoal decomposition"

3. **Flat tree prevention: pros/cons discussion**
   - **What:** Each prevention approach has explicit trade-offs discussed (not just listed)
   - **How:** Verify both the step-count-limit and distance-metric approaches have dedicated pros/cons analysis with a reasoned recommendation

## Test Order

Execute in this priority: programmatic checks 1–11 (content validation), then check 12 (TypeScript compilation), then manual verification items.
