# Tests: Dimension 1 — Nesting structure on disk

## Programmatic Verification

- **What:** FEASIBILITY.md exists at the correct path.
  - **How:** `test -f .pio/goals/subgoals/FEASIBILITY.md`
  - **Expected result:** Exit code 0 (file exists)

- **What:** FEASIBILITY.md contains a "Dimension 1" heading.
  - **How:** `grep -q "Dimension 1" .pio/goals/subgoals/FEASIBILITY.md`
  - **Expected result:** Exit code 0 (heading found)

- **What:** Section mentions the recommended nesting approach (`S{NN}/subgoals/<name>/`).
  - **How:** `grep -q "subgoals/" .pio/goals/subgoals/FEASIBILITY.md`
  - **Expected result:** Exit code 0 (pattern found)

- **What:** Section references `src/fs-utils.ts` and `resolveGoalDir`.
  - **How:** `grep -q "fs-utils" .pio/goals/subgoals/FEASIBILITY.md && grep -q "resolveGoalDir" .pio/goals/subgoals/FEASIBILITY.md`
  - **Expected result:** Both exit codes 0 (both references found)

- **What:** Section references `src/goal-state.ts` and cwd derivation.
  - **How:** `grep -q "goal-state" .pio/goals/subgoals/FEASIBILITY.md && grep -qi "cwd" .pio/goals/subgoals/FEASIBILITY.md`
  - **Expected result:** Both exit codes 0 (both references found)

- **What:** Section mentions at least one change categorization (new fields, new logic, or breaking change).
  - **How:** `grep -qiE "breaking change|new logic|new field" .pio/goals/subgoals/FEASIBILITY.md`
  - **Expected result:** Exit code 0 (at least one category mentioned)

- **What:** Section discusses recursive nesting depth.
  - **How:** `grep -qiE "recursive.*nest|nest.*depth|multi.?level|deep" .pio/goals/subgoals/FEASIBILITY.md`
  - **Expected result:** Exit code 0 (nesting depth discussed)

- **What:** TypeScript type check still passes (no source code changes should break compilation).
  - **How:** `npm run check` (from project root)
  - **Expected result:** Exit code 0, no errors

## Manual Verification

- **What:** The Dimension 1 section reads as a coherent feasibility analysis with evidence from actual source code.
  - **How:** Read `.pio/goals/subgoals/FEASIBILITY.md` and verify: (a) recommendations are justified with pros/cons, (b) required changes cite specific functions and behaviors from the actual source files, (c) change categorizations are present and accurate.

- **What:** The section structure uses markdown headings that allow later steps to append new sections cleanly.
  - **How:** Verify the section starts with a clear heading (e.g., `## Dimension 1: ...`) and does not use top-level `#` headings that would conflict with subsequent sections.

## Test Order

1. File existence checks (FEASIBILITY.md exists)
2. Content checks (grep for required references and patterns)
3. TypeScript type check (`npm run check`)
4. Manual review of document quality and structure
