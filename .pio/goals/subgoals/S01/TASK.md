# Task: Dimension 1 — Nesting structure on disk

Evaluate and document how subgoal workspaces live on disk relative to parent goal/step folders, recommending the `S{NN}/subgoals/<name>/` nesting convention with justification.

## Context

GOAL.md states user preference for **nested goals** (subgoals inside step directories). Currently, pio assumes flat goal workspaces under `.pio/goals/<name>/`. The `resolveGoalDir(cwd, name)` in `src/fs-utils.ts` always produces flat paths. `createGoalState(goalDir)` in `src/goal-state.ts` derives cwd by splitting on `/goals/`, which breaks for nested paths. The `steps()` method scans a goal dir with `/^S(\d+)$/` — this would conflict if subgoal step folders appear inside a parent's `S{NN}/`.

This task produces the Dimension 1 analysis section of `FEASIBILITY.md` — the first section of the overall feasibility study.

## What to Build

A structured analysis section in `.pio/goals/subgoals/FEASIBILITY.md` covering Dimension 1: Nesting structure on disk. This is research and documentation only — no source code changes.

### Code Components

No code components. The output is a markdown section documenting:

- **Recommended nesting approach:** `S{NN}/subgoals/<name>/` with justification for choosing this over alternatives (e.g., flat naming, path-based keys elsewhere).
- **Recursive nesting depth analysis:** How nested subgoals within subgoals would look on disk. Does the pattern compose recursively? E.g., `.pio/goals/parent/S03/subgoals/nested/S01/subgoals/deep/`. Document depth implications (path length limits, marker collision risks).
- **The `subgoals/` directory convention vs alternatives:** Compare `S{NN}/subgoals/<name>/` against alternatives like flat naming with delimiters (`<parent>__<step>__<name>`), or using a dedicated `.pio/subgoals/` directory. Evaluate trade-offs in discoverability, path resolution complexity, and compatibility with existing code (e.g., `discoverNextStep` scanning).
- **Required changes to `src/fs-utils.ts`:** Document specific changes needed for `resolveGoalDir()` — it currently always produces flat paths `<cwd>/.pio/goals/<name>/`. A nested subgoal would need a different resolution strategy. Categorize: new fields, new logic, or breaking change.
- **Required changes to `src/goal-state.ts`:** Document specific changes for cwd derivation (currently splits on `/goals/` which breaks for nested paths) and the `steps()` regex (`/^S(\d+)$/`). Analyze whether `subgoals/` as a directory marker prevents the regex from matching subgoal step folders inside a parent's `S{NN}/`. Categorize: new fields, new logic, or breaking change.

### Approach and Decisions

- Use evidence from reading actual source files (`src/fs-utils.ts`, `src/goal-state.ts`) to ground analysis — cite specific functions and line-level assumptions.
- Evaluate alternatives before recommending one — this is a feasibility study, not a prescriptive design doc.
- Each required change must be explicitly categorized: **new fields** (adding data structures), **new logic** (changing behavior without breaking existing callers), or **breaking change** (modifying interfaces that would break existing callers).
- FEASIBILITY.md is written incrementally — this is the first section. Use a heading structure that allows other steps to append sections cleanly.

## Dependencies

None. This is Step 1 of 9 and produces the first section of FEASIBILITY.md.

## Files Affected

- `.pio/goals/subgoals/FEASIBILITY.md` — created: Dimension 1 analysis section (first section of the feasibility study document)

## Acceptance Criteria

- `FEASIBILITY.md` exists at `.pio/goals/subgoals/FEASIBILITY.md` and contains a "Dimension 1: Nesting structure on disk" section.
- Section documents the recommended nesting approach (`S{NN}/subgoals/<name>/`) with justification comparing against at least one alternative.
- Section identifies required changes to `src/fs-utils.ts` (`resolveGoalDir`) and categorizes each as new fields, new logic, or breaking change.
- Section identifies required changes to `src/goal-state.ts` (cwd derivation, `steps()` regex) and categorizes each as new fields, new logic, or breaking change.
- Recursive nesting depth is analyzed — document how the pattern composes for multiple levels of nesting.

## Risks and Edge Cases

- FEASIBILITY.md will be written incrementally across 9 steps. This section should use clear markdown headings so later steps can append without conflicts.
- The analysis must cite actual code from `src/fs-utils.ts` and `src/goal-state.ts` — do not invent assumptions about how the code works. Read the files first.
- When discussing required changes, distinguish between what currently exists vs what would need to change. Cite specific function names and behaviors.
