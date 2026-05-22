# Tests: Dimension 9 — Planning awareness + synthesis

This is a feasibility study step producing documentation only (no code implementation). Verification consists of programmatic checks against `FEASIBILITY.md` content, cross-references to source code files, and manual review of analysis quality.

## Programmatic Verification

### FEASIBILITY.md structure checks

1. **What:** Dimension 9 section header exists in FEASIBILITY.md
   **How:** `grep -c "Dimension 9.*Planning awareness" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is `1` (exactly one match)

2. **What:** Step-level metadata analysis is present
   **How:** `grep -ic "step-level metadata\|subgoalSteps\|per-step.*metadata\|PLAN_FRONTMATTER_SCHEMA" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 2 (must reference the schema and discuss per-step metadata)

3. **What:** Multiple metadata options are evaluated (Options A-D from TASK.md)
   **How:** `grep -ic "Option [A-C]\|option.*approach\|frontmatter-only\|in-body annotat\|steps array\|post-declaration" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 3 (at least 3 distinct options discussed)

4. **What:** create-plan prompt analysis references `src/prompts/create-plan.md`
   **How:** `grep -c "create-plan\.md\|prompts/create-plan" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 1

5. **What:** evolve-plan behavior divergence analyzes multiple approaches
   **How:** `grep -ic "evolve-plan.*behavior\|skip.*spec\|wrapper spec\|evolve-subgoal\|branching" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 2 (at least 2 approaches discussed)

6. **What:** Frontmatter schema evolution references `src/frontmatter-schemas.ts` and TypeBox
   **How:** `grep -c "frontmatter-schemas\|PLAN_FRONTMATTER_SCHEMA\|Type\.Object\|TypeBox" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 2 (must reference both the file and schema type)

7. **What:** Backward compatibility for frontmatter changes is discussed
   **How:** `grep -ic "backward.*compat\|backwards? compat\|existing plan" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 1 (within Dim 9 section)

### Synthesis section checks

8. **What:** Synthesis or conclusion section exists
   **How:** `grep -ic "## Synthesis\|## Conclusion\|## Final Recommendation\|## Summary" .pio/goals/subgoals/FEASIBILITY.md`
   **Expected result:** Output is ≥ 1

9. **What:** Recommended approach summary references all 9 dimensions
   **How:** Check that the synthesis section mentions each dimension by number: `grep -i "dimension [1-9]\|dim [1-9]" .pio/goals/subgoals/FEASIBILITY.md | grep -ic "[1-9]"`
   **Expected result:** Output is ≥ 5 (synthesis cross-references multiple dimensions)

10. **What:** Complete file modification inventory table exists (master table consolidating all dimensions)
    **How:** `grep -c "|" .pio/goals/subgoals/FEASIBILITY.md` — should show substantial increase from Dim 8 baseline (~286 table lines at end of Dim 8). Then check for consolidation language:
    `grep -ic "master.*table\|consolidat.*inventory\|file modification inventory\|complete.*inventory" .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Table line count increased from ~286 baseline; consolidation keyword match ≥ 1

11. **What:** Identified risks or blockers section exists in synthesis
    **How:** `grep -ic "risk\|blocker\|concern" .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Output is ≥ 3 (risks discussed across dimensions and synthesis)

12. **What:** Clear go/no-go recommendation is stated
    **How:** `grep -ic "go-no-go\|recommendation.*go\|go\b.*condition\|no-go\b" .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Output is ≥ 1 (explicit recommendation)

13. **What:** The go/no-go recommendation includes justification references
    **How:** `grep -ic "justif\|because.*dimension\|based on.*finding\|dim [0-9]" .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Output is ≥ 2 (recommendation justified with specific dimension findings)

### Cross-dimension consistency checks

14. **What:** Cross-references between Dimension 9 and Dimensions 3, 4 are explicit (spawning + trigger mechanism)
    **How:** `grep -A5 -i "dimension [34]\|dim [34]" .pio/goals/subgoals/FEASIBILITY.md | grep -ic "evolve-plan\|create-plan\|trigger\|spawn"` — look for Dim 9 referencing Dim 3/4 decisions
    **Expected result:** Output is ≥ 1 (Dim 9 must reference the spawning mechanism from D3 and trigger criteria from D4)

15. **What:** Leaf-node criteria from Dimension 4 are referenced in planning awareness analysis
    **How:** `grep -ic "leaf.*node\|I/O contract\|encapsulation rule\|abstraction.*distance\|composite" .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Output is ≥ 2 (Dim 9 must apply Dim 4 leaf-node criteria to create-plan prompt design)

16. **What:** postValidateCreatePlan from `create-plan.ts` is referenced in the context of validation changes
    **How:** `grep -c "postValidateCreatePlan\|create-plan\.ts.*validat\|validation.*totalSteps" .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Output is ≥ 1 (Dim 9 must discuss how schema changes affect existing validation)

### Content size check

17. **What:** FEASIBILITY.md total line count increased from Step 8 baseline (~2498 lines)
    **How:** `wc -l .pio/goals/subgoals/FEASIBILITY.md`
    **Expected result:** Line count is ≥ 2800 (Dimension 9 analysis + synthesis adds ~300+ lines)

### SYNTHESIS.md checks

19. **What:** SYNTHESIS.md exists at the goal workspace root
    **How:** `test -f .pio/goals/subgoals/SYNTHESIS.md && echo "exists"`
    **Expected result:** Output is `exists`

20. **What:** SYNTHESIS.md contains a clear recommendation section
    **How:** `grep -ic "recommendation\|go-no-go\|go.*condition\|no-go" .pio/goals/subgoals/SYNTHESIS.md`
    **Expected result:** Output is ≥ 1

21. **What:** SYNTHESIS.md summarizes all 9 dimensions (not just some)
    **How:** `grep -ic "dimension [1-9]\|dim [1-9]" .pio/goals/subgoals/SYNTHESIS.md`
    **Expected result:** Output is ≥ 7 (mentions most or all dimensions by number)

22. **What:** SYNTHESIS.md contains a file inventory table (compact form)
    **How:** `grep -c "|" .pio/goals/subgoals/SYNTHESIS.md`
    **Expected result:** Output is ≥ 4 (at least one small table with headers + rows)

23. **What:** SYNTHESIS.md contains a risks section
    **How:** `grep -ic "risk\|mitigation" .pio/goals/subgoals/SYNTHESIS.md`
    **Expected result:** Output is ≥ 1

24. **What:** SYNTHESIS.md references FEASIBILITY.md for detail
    **How:** `grep -c "FEASIBILITY" .pio/goals/subgoals/SYNTHESIS.md`
    **Expected result:** Output is ≥ 1 (cross-reference to full study)

25. **What:** SYNTHESIS.md line count is reasonable (~1-2 pages, not a copy of FEASIBILITY.md)
    **How:** `wc -l .pio/goals/subgoals/SYNTHESIS.md`
    **Expected result:** Line count is between 50 and 400 (concise summary, not verbose analysis)

### TypeScript compilation check

26. **What:** Source code still compiles (no syntax errors, no unintended changes)
    **How:** `npm run check`
    **Expected result:** Exit code 0

## Manual Verification

1. **What:** Each of the four sub-topics (metadata options, create-plan prompt, evolve-plan behavior, frontmatter schema) evaluates at least 2 distinct approaches with trade-offs
   **How:** Read the Dimension 9 section and verify each sub-topic has multiple options evaluated, not just a single recommendation without alternatives.

2. **What:** The master file modification inventory table consolidates findings from all 9 dimensions — no duplicate entries for the same file
   **How:** Scan the synthesis table and cross-reference against the individual dimension sections. Verify: (a) every file from Dims 1-8 appears, (b) each file has exactly one entry, (c) the "Dimensions Affected" column lists all relevant dimensions.

3. **What:** The go/no-go recommendation is definitive and justified — not vague or hedging
   **How:** Read the final recommendation. It should clearly state GO / CONDITIONAL GO / NO-GO. The justification should reference specific dimension findings (e.g., "All changes are non-breaking per Dimensions 3, 5, and 8" or "Dimension 7 requires breaking changes to finalize-goal").

4. **What:** Dimension 9 recommendations are consistent with accumulated decisions in DECISIONS.md
   **How:** Compare Dim 9 metadata/signaling recommendation against the Decisions from Dims 3 and 4 (spawning mechanism, trigger point). Verify no contradictions — e.g., if Dim 4 says "create-plan is primary initiation," Dim 9 should not recommend a pure runtime decision model without create-plan involvement.

5. **What:** SYNTHESIS.md conclusions are consistent with FEASIBILITY.md
   **How:** Read the recommendation, key decisions, and risks from SYNTHESIS.md. Cross-reference against FEASIBILITY.md synthesis section (Section 2). Verify: (a) go/no-go statement matches, (b) per-dimension summaries don't contradict detailed analysis, (c) file inventory in SYNTHESIS.md is a condensed version of the master table in FEASIBILITY.md.

6. **What:** SYNTHESIS.md is self-contained and readable without FEASIBILITY.md
   **How:** Read SYNTHESIS.md as if you hadn't read the full study. Verify: (a) the recommendation makes sense on its own, (b) key decisions explain "why" not just "what", (c) a stakeholder could make a go/no-go decision from this document alone.

## Test Order

Execute in this priority:
1. Programmatic checks 1–7 (Dimension 9 section structure)
2. Programmatic checks 8–13 (Synthesis section completeness)
3. Programmatic checks 14–16 (Cross-dimension consistency)
4. Programmatic check 17 (Content size — line count ≥ 2800)
5. Programmatic checks 19–25 (SYNTHESIS.md structure and content)
6. Programmatic check 26 (TypeScript compilation)
7. Manual verification 1 (Four sub-topic evaluation)
8. Manual verification 2 (Master inventory table consolidation)
9. Manual verification 3 (Go/no-go recommendation quality)
10. Manual verification 4 (Consistency with accumulated decisions)
11. Manual verification 5 (SYNTHESIS.md consistency with FEASIBILITY.md)
12. Manual verification 6 (SYNTHESIS.md self-containment)
