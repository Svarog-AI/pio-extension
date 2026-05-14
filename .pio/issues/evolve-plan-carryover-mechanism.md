# Need explicit carryover mechanism for decisions across evolve-plan steps

## Problem

When `pio_evolve_plan` generates TASK.md + TEST.md for a given step, the Specification Writer reads:
- `GOAL.md` (big picture)
- `PLAN.md` (the plan text)
- Previous step's `SUMMARY.md` and `REVIEW.md` (optional enrichment)

However, **architectural decisions made during implementation of earlier steps are not automatically carried forward**. In the `refactor-module-boundaries` goal:

1. PLAN.md stated `stepFolderName()` would live in `src/transitions.ts`
2. During Step 1 implementation/review, a decision was made to put it in `fs-utils.ts` instead (better semantic fit, cleaner dependency direction)
3. The Step 3 Specification Writer read PLAN.md literally and specified the wrong placement — had to be corrected manually

## Root cause

Decisions that diverge from PLAN.md are documented in `SUMMARY.md` and `REVIEW.md` of individual steps, but:
- The evolve-plan prompt only reads the *immediately previous* step's SUMMARY/REVIEW
- Non-adjacent steps (Step 3 doesn't read Step 1 directly if Step 2 is in between) miss context entirely
- There's no central "decisions log" that accumulates across the plan lifecycle

## Proposed solution

Add a `DECISIONS.md` file to the goal workspace (`.pio/goals/<name>/DECISIONS.md`) that:
- Is created empty when PLAN.md is generated
- Each execute-task/review-code session appends decisions that deviate from or refine PLAN.md
- The evolve-plan prompt reads `DECISIONS.md` alongside GOAL.md and PLAN.md

## Alternative solutions to consider

- Inject previous steps' REVIEW.md content into the evolve-plan prompt (all of them, not just the last)
- Add a "carryover notes" field to PLAN.md that evolves over time
- Have the review-code agent explicitly flag decisions that affect downstream steps

## Category

improvement

## Context

Observed during refactor-module-boundaries Step 3: stepFolderName placement decision from Step 1 was not carried forward. Goal workspace: .pio/goals/refactor-module-boundaries/
