# DECISIONS.md should exclude decisions from the current step being specified

## Problem

The evolve-plan specification writer sometimes includes decisions about what the *current* step will do in `DECISIONS.md`. Since DECISIONS.md is meant for downstream steps to consume, including current-step details adds noise and contradicts the "forward-looking only" principle.

## Example (from Step 5 of multi-file-project-context)

Step 5 was the last step in the plan. The specification writer included a "Skill Documentation References" section describing what Step 5 would modify — but since there were no downstream steps, this was pure noise. Even if future steps existed, these details are already documented in TASK.md; DECISIONS.md shouldn't duplicate them.

## Root cause

The evolve-plan prompt says:

> "Selective accumulation — forward-looking only: Include only decisions that may impact future steps."

But it doesn't explicitly say **"Exclude decisions about the current step itself."** The writer needs to filter out decisions from `SUMMARY.md`'s "Decisions Made" section that are fully self-contained within the completed step and have no downstream impact — and also avoid adding new entries based on what the current specification is producing.

## Proposed fix

In the evolve-plan system prompt (`src/prompts/evolve-plan.md` or wherever the DECISIONS.md instructions live), add explicit language:

- **"DECISIONS.md records accumulated decisions from *prior* steps only. Do not include decisions about the current step (N) — those belong in TASK.md."**
- **"When merging, filter out prior-step decisions that are fully self-contained (e.g., a skill doc was updated but no future step references that skill)."**

This prevents both: (a) forward-leaking current-step details, and (b) keeping stale entries from steps whose outputs have no downstream consumers.

## Category

improvement

## Context

Related file: evolve-plan system prompt (DECISIONS.md generation instructions). Observed in S05/DECISIONS.md of multi-file-project-context goal.
