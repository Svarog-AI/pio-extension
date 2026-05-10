# evolve-plan does not skip already-completed steps — assigned Step 1 when S01/COMPLETED existed

## Problem

Running `/pio-evolve-plan code-review-capability` launched an evolve-plan session for **Step 1** even though `S01/` already contained `TASK.md`, `TEST.md`, `SUMMARY.md`, and a `COMPLETED` marker. The correct behavior is to find the **next uncompleted step** (which would be Step 2 → `S02/`).

## Observed behavior

- Session was told it was responsible for "Step 1"
- Agent read S01/ contents, found TASK.md + TEST.md already present, and validated them without regenerating
- No new files were created; session simply confirmed Step 1 was already done

## Expected behavior

- `evolve-plan` should scan `S01/`, `S02/`, etc. and skip folders that have a `COMPLETED` marker (and existing TASK.md + TEST.md)
- The next incomplete step for this goal is **Step 2** — the session should have created `S02/TASK.md` and `S02/TEST.md`

## Root cause hypothesis

The "next uncompleted step" logic in the evolve-plan capability or its prompt does not properly check for the `COMPLETED` marker (or checks it incorrectly). It may be:
- Always starting from Step 1 regardless of completion state, OR
- Checking for a different marker than `COMPLETED`, OR
- Not finding step folders correctly when they already exist

## Files to investigate

- `src/capabilities/evolve-plan.ts` — look for "next uncompleted step" / step-finding logic
- `src/prompts/evolve-plan.md` — check if the prompt instructs the agent to skip completed steps
- The capability's tool/command handler that determines which step number to use

## Impact

Every time evolve-plan is run, it may reassign already-completed steps instead of advancing, wasting a sub-session and confusing the agent.

## Category

bug

## Context

Goal workspace: .pio/goals/code-review-capability/ — S01/COMPLETED exists, but evolve-plan assigned Step 1 again. PLAN.md has 7 steps total. The fix is needed before Steps 3-7 can be properly sequenced.
