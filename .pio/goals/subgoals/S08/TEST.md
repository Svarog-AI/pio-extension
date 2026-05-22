# Tests: Dimension 8 — GoalState and path resolution changes

This is a feasibility study step producing documentation only (no code implementation). Verification consists of programmatic checks against the source code to confirm the function inventory is accurate and comprehensive, plus manual review of the analysis quality.

## Programmatic Verification

### FEASIBILITY.md structure checks

1. **What:** Dimension 8 section header exists in FEASIBILITY.md
   **How:** `grep -c "Dimension 8: GoalState and path resolution changes" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is `1` (exactly one match)

2. **What:** Section references `src/goal-state.ts` with function analysis
   **How:** `grep -c "goal-state.ts\|createGoalState" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 1

3. **What:** Section references `src/fs-utils.ts` with resolveGoalDir analysis
   **How:** `grep -c "resolveGoalDir" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 2 (at least one in Dim 1 context + Dim 8 analysis)

4. **What:** Section references `src/capability-config.ts` with workingDir derivation analysis
   **How:** `grep -c "capability-config" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 1

5. **What:** Section references `src/state-machine.ts` transitionEvolvePlan path issue
   **How:** `grep -c "transitionEvolvePlan\|state-machine" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 1 (Dim 8 must document the resolveGoalDir call at ~line 77)

6. **What:** Section references `src/queues.ts` queue keying analysis
   **How:** `grep -c "queues\|enqueueTask\|readPendingTask" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 1

7. **What:** Section references `src/capabilities/list-goals.ts` scanning gap
   **How:** `grep -c "list-goals" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 1

### Function inventory completeness checks

8. **What:** All capability files that call resolveGoalDir are documented
   **How:** For each of: `create-goal.ts`, `create-plan.ts`, `evolve-plan.ts`, `execute-task.ts`, `review-task.ts`, `revise-plan.ts`, `finalize-goal.ts`, check FEASIBILITY.md mentions them.
   **Command per file:** `grep -c "create-goal\|create-plan\|evolve-plan\|execute-task\|review-task\|revise-plan\|finalize-goal" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 6 (at least 6 of the 7 capability files are referenced in Dim 8)

9. **What:** discoverNextStep is documented (even if "no change needed")
   **How:** `grep -c "discoverNextStep" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 1

10. **What:** deriveSessionName is documented with Dim 6 cross-reference
    **How:** `grep -c "deriveSessionName" .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Output is ≥ 1

### Change categorization checks

11. **What:** At least one entry categorized as "new fields"
    **How:** `grep -ic "new field" .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Output is ≥ 1 (in Dim 8 section)

12. **What:** At least one entry categorized as "new logic"
    **How:** `grep -ic "new logic" .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Output is ≥ 1 (in Dim 8 section)

13. **What:** A change summary or table exists (table format or structured list of files → categories)
    **How:** `grep -c "|" .pio/goals/subgoals/FEASIBILITY.md` followed by visual inspection near end of Dim 8 section
    **Expected result:** Markdown table delimiters present, indicating a summary table

### Cross-dimension consistency checks

14. **What:** FEASIBILITY.md contains cross-references between Dimension 8 and earlier dimensions
    **How:** `grep -i "dimension [1-7]\|dim [1-7]\|from dimension\|cross-reference" .pio/goals/subgoals/FEASIBILITY.md | wc -l`
    **Expected result:** Output is ≥ 2 (Dim 8 should reference Dims 1, 2, 5, and/or 6 where same functions are discussed)

15. **What:** Resolution strategy section exists within Dim 8
    **How:** `grep -ic "resolution strategy\|proposed approach\|unified.*strategy" .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Output is ≥ 1 (within the Dim 8 section)

16. **What:** FEASIBILITY.md total line count increased from Step 7 baseline (~2254 lines)
    **How:** `wc -l .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Line count is ≥ 2300 (Dimension 8 section adds substantial content for a comprehensive inventory)

### TypeScript compilation check

17. **What:** Source code still compiles (no syntax errors, no unintended changes)
    **How:** `npm run check`
    **Expected result:** Exit code 0

## Manual Verification

1. **What:** Function inventory is genuinely comprehensive — no source file with path assumptions was overlooked
   **How:** Run `grep -rn "resolveGoalDir\|indexOf.*goals\|\.pio.*goals" src/ --include="*.ts"` and cross-reference every unique file against the FEASIBILITY.md Dim 8 section. Every file should appear in the inventory.

2. **What:** Line numbers referenced in Dim 8 match actual source code
   **How:** Spot-check 3–5 line number references by opening the cited files and verifying the function exists at approximately the stated location.

3. **What:** The resolution strategy is coherent and actionable for Step 9 synthesis
   **How:** Read the Dim 8 section from start to finish. Verify: (a) inventory → strategy flows logically, (b) change categories are consistently applied, (c) the summary table matches the detailed entries above it.

## Test Order

Execute in this priority:
1. Programmatic checks 1–7 (section structure — fast grep checks)
2. Programmatic checks 8–13 (inventory completeness and categorization)
3. Programmatic checks 14–16 (cross-dimension consistency and content size)
4. Programmatic check 17 (TypeScript compilation)
5. Manual verification 1 (completeness audit)
6. Manual verification 2 (line number accuracy)
7. Manual verification 3 (coherence review)
