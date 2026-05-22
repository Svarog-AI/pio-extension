# Tests: Dimension 5 — File protection scope

This is a research-and-documentation step. No source code is modified. All verification is programmatic (file content checks) plus TypeScript compilation to ensure no regressions.

## Programmatic Verification

1. **FEASIBILITY.md exists**
   - **What:** `FEASIBILITY.md` file exists at the goal workspace root
   - **How:** `test -f .pio/goals/subgoals/FEASIBILITY.md && echo PASS || echo FAIL`
   - **Expected result:** `PASS`

2. **Dimension 5 section heading present**
   - **What:** The "Dimension 5: File protection scope" heading exists in FEASIBILITY.md
   - **How:** `grep -c "Dimension 5.*File protection scope" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 1

3. **Current validation behavior analyzed**
   - **What:** Section proves or disproves correctness of the `tp.startsWith(workingDir + path.sep)` check for nested paths
   - **How:** `grep -ci "startsWith\|workingDir.*path\|write.*restrict" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 2 (analysis of the prefix check with concrete path examples)

4. **workingDir assignment gap documented**
   - **What:** Section identifies that `resolveGoalDir` produces flat paths and cannot resolve nested subgoal workingDirs
   - **How:** `grep -ci "resolveGoalDir\|workingDir.*nested\|flat.*path" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 2 (explicitly references the gap between flat resolution and nested paths)

5. **Write-allowlist behavior analyzed**
   - **What:** Section analyzes how `writeAllowlistPaths` handles parent-level file writes for subgoal sessions
   - **How:** `grep -ci "allowlist\|writeAllowlist\|parent.*file.*write" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 1

6. **Read-access requirements addressed**
   - **What:** Section documents what parent files a subgoal session needs to READ (GOAL.md, PLAN.md, step context)
   - **How:** `grep -ci "read.*access\|parent.*read\|read.*GOAL\|read.*PLAN" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 1

7. **Parent context injection approaches evaluated**
   - **What:** Section evaluates at least two approaches for providing parent context to subgoal sessions (prepareSession hook vs. no injection)
   - **How:** `grep -ci "prepareSession\|inject.*context\|parent.*context" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 2

8. **Scoping recommendations present**
   - **What:** Section contains explicit recommendations for scoping changes (or explicitly states no changes needed with justification)
   - **How:** `grep -ci "recommend\|scoping.*change" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 1

9. **Source file references**
   - **What:** Section references specific source files requiring analysis (`validation.ts`, `capability-config.ts`)
   - **How:** `grep -c "validation.ts\|capability-config.ts" .pio/goals/subgoals/FEASIBILITY.md`
   - **Expected result:** Output ≥ 2

10. **Change categorizations present**
    - **What:** Changes are categorized as new fields, new logic, or breaking change
    - **How:** `grep -ci "new fields\|new logic\|breaking" .pio/goals/subgoals/FEASIBILITY.md`
    - **Expected result:** Output ≥ 1

11. **Cross-references to other dimensions**
    - **What:** Section cross-references at least 2 other dimensions by number
    - **How:** `grep -c "Dimension [0-9]" .pio/goals/subgoals/FEASIBILITY.md` — verify count includes references within the Dimension 5 section
    - **Expected result:** Section contains ≥ 2 cross-references to other dimensions (especially Dimensions 1, 3, and 8)

12. **TypeScript compilation passes**
    - **What:** No TypeScript errors introduced (this step is documentation-only, but compilation must still pass)
    - **How:** `npm run check` from the project root
    - **Expected result:** Exit code 0, no type errors

## Manual Verification

1. **Path analysis correctness**
   - **What:** The section includes concrete path examples proving that `tp.startsWith(workingDir + path.sep)` correctly blocks writes to parent/sibling directories while allowing writes within the subgoal's own directory
   - **How:** Read the validation behavior subsection. Verify it includes at least 3 concrete path examples with pass/fail outcomes (e.g., nested workingDir write → allowed, sibling subgoal write → blocked, parent step file write → blocked)

2. **workingDir gap: failure mode clarity**
   - **What:** The workingDir assignment gap section clearly explains what happens when a subgoal session launches WITHOUT an explicit `params.workingDir` (wrong flat directory, incorrect permission scope)
   - **How:** Read the section. Is there a clear "if X is not set, then Y fails" chain? Does it connect to Dimension 3's spawning transition responsibility?

3. **Read-access: complete and practical**
   - **What:** The read-access analysis lists specific parent files (GOAL.md, PLAN.md) and provides a pragmatic recommendation for how subgoal sessions obtain parent context
   - **How:** Read the read-access subsection. Are specific file names mentioned? Is there a clear recommendation (e.g., "no changes needed — reads are unrestricted") or a proposed mechanism?

## Test Order

Execute in this priority: programmatic checks 1–11 (content validation), then check 12 (TypeScript compilation), then manual verification items.
