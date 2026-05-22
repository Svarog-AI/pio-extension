# Tests: Dimension 7 — Completion propagation

## Programmatic Verification

This is a research-and-documentation step (feasibility study). No source code is implemented. All verification is programmatic content checks against `FEASIBILITY.md` plus TypeScript compilation to confirm no unintended breakages.

### FEASIBILITY.md content checks

For each check, run the command and verify the expected result:

1. **File existence:**
   - **What:** FEASIBILITY.md exists in the goal workspace
   - **How:** `test -f .pio/goals/subgoals/FEASIBILITY.md && echo PASS || echo FAIL`
   - **Expected result:** `PASS`

2. **Dimension 7 section heading:**
   - **What:** Dimension 7 section is present with correct heading
   - **How:** `grep -c "Dimension 7: Completion propagation" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** ≥1 match

3. **COMPLETED marker semantics analysis:**
   - **What:** Section discusses the COMPLETED marker as authoritative completion signal for both regular goals and subgoals
   - **How:** `grep -ci "completed.*marker\|marker.*authoritative\|completemarker" .pio/goals/subgoals/FEASIBILITY.md` (search within Dimension 7 section boundaries)
   - **Expected result:** ≥3 mentions

4. **Propagation mechanisms evaluated:**
   - **What:** At least three propagation mechanisms are evaluated with trade-offs
   - **How:** `grep -ci "approach\|mechanism\|option" .pio/goals/subgoals/FEASIBILITY.md` (within Dimension 7 section)
   - **Expected result:** ≥3 distinct mechanisms described

5. **Parent step markers analysis:**
   - **What:** Section specifies what happens to parent COMPLETED, SUMMARY.md, and APPROVED markers when subgoal completes
   - **How:** `grep -ci "parent.*completed\|summary\.md\|approved.*marker\|parent.*step" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** ≥3 mentions covering at least two of the three marker types (COMPLETED, SUMMARY.md, APPROVED)

6. **finalize-goal changes identified:**
   - **What:** Section identifies required changes to `src/state-machine.ts` (`transitionFinalizeGoal`, `resolveTransition`) and/or `src/capabilities/finalize-goal.ts`
   - **How:** `grep -ci "transitionFinalizeGoal\|transition.*finalize\|finalize.*goal.*change" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** ≥3 mentions

7. **session-capability.ts / pio_mark_complete analysis:**
   - **What:** Section analyzes how `pio_mark_complete` handles parent task enqueuing after subgoal completion
   - **How:** `grep -ci "mark_complete\|enqueuetask\|parent.*queue\|enqueue.*parent" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** ≥2 mentions

8. **goalCompleted() verification:**
   - **What:** Section verifies whether `goalCompleted()` in `GoalState` works correctly for nested paths
   - **How:** `grep -ci "goalcompleted\|goal.*state" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** ≥2 mentions

9. **Source file references:**
   - **What:** Analysis cites specific source files and code locations
   - **How:** `grep -c "state-machine\.ts\|finalize-goal\.ts\|session-capability\.ts\|goal-state\.ts" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** ≥4 distinct file references

10. **Change categorization:**
    - **What:** Each identified change is categorized as new fields, new logic, or breaking change
    - **How:** `grep -ci "new field\|new logic\|breaking" .pio/goals/subgoals/FEASIBILITY.md` (within Dimension 7 section)
    - **Expected result:** ≥2 categorizations

11. **Cross-references to Dimensions 2, 3, 5, 8:**
    - **What:** Section cross-references related dimensions for integrated analysis
    - **How:** `grep -ci "dimension [2358]\|dim[_.]?[2358]" .pio/goals/subgoals/FEASIBILITY.md` (within Dimension 7 section)
    - **Expected result:** ≥2 distinct dimension references

12. **User preference alignment:**
    - **What:** Section explicitly addresses the user's stated preference: "the subgoal, like any goal, has a COMPLETED marker"
    - **How:** `grep -ci "subgoal.*completed\|completed.*counts\|user.*preference\|authoritative" .pio/goals/subgoals/FEASIBILITY.md`
    - **Expected result:** ≥2 mentions connecting user preference to the recommended mechanism

13. **Edge cases covered:**
    - **What:** Section addresses edge cases (failed subgoal, SUMMARY.md gap, APPROVED semantics, queue timing)
    - **How:** `grep -ci "blocked\|edge case\|failed.*subgoal\|summar y.*gap\|no.*completed" .pio/goals/subgoals/FEASIBILITY.md`
    - **Expected result:** ≥2 edge cases discussed

14. **TypeScript compilation (sanity check):**
    - **What:** No code changes were made; type checking should still pass
    - **How:** `npm run check`
    - **Expected result:** Exit code 0, no errors

## Manual Verification

1. **Propagation mechanism completeness:**
   - **What:** The recommended mechanism provides a complete lifecycle for subgoal completion → parent resumption
   - **How:** Read the Dimension 7 section and verify it answers: (a) who detects subgoal completion, (b) how is the parent notified, (c) what files are written, (d) how does the user navigate back, (e) what happens next

2. **Consistency with Dimensions 3 and 4:**
   - **What:** Dimension 7's recommendation aligns with Dimension 3's `finalize-goal` → parent's `evolve-plan` approach and Dimension 4's trigger mechanism
   - **How:** Cross-read Dimension 3, 4, and 7 sections. Verify no contradictions in the completion flow (e.g., Dimension 3 says X routes to Y, Dimension 7 must not say X routes to Z)

3. **Recommended mechanism justification:**
   - **What:** The recommendation is justified with concrete trade-off analysis, not just a restatement of Dimension 3's conclusion
   - **How:** Verify the section provides new insights beyond Dimension 3 — specific code change details, marker behavior specifications, and integration points that Dimension 3 did not cover

## Test Order

1. File existence check (prerequisite for all other checks)
2. Section heading and content checks (2–13)
3. TypeScript compilation (sanity check, last since it's a full project operation)
4. Manual verification (reads and cross-references)
