# Simplify evolve-plan step selection — "last defined + 1"

Replace the "find next uncompleted step" logic with a simpler approach: find the highest-numbered step folder (`S{NN}/`) that has `TASK.md` and `TEST.md`, then assign the next step. No completion checks, no state machine enforcement — just sequential progression. The user should be free to evolve specs ahead of execution if they want to.

## Current State

The step-finding logic in `src/capabilities/evolve-plan.ts` uses `isStepSpecComplete()` to check whether a step folder has both `TASK.md` and `TEST.md`. Then `validateAndFindNextStep()` loops starting at step 1 and returns the first step where this check returns `false`.

This approach was already broken (the original bug: it assigned Step 1 even when `S01/COMPLETED` existed). More fundamentally, the semantics are wrong. evolve-plan's job is to write specs. It should not care whether a previous step was executed, reviewed, or completed — only whether its spec already exists.

Additionally, the prompt (`src/prompts/evolve-plan.md`) does not instruct the agent to read outputs from previous steps (like `SUMMARY.md` and `REVIEW.md`). This would be valuable context for writing better specs but is currently missing.

**Files involved:**
- `src/capabilities/evolve-plan.ts` — `isStepSpecComplete()`, `validateAndFindNextStep()`
- `src/prompts/evolve-plan.md` — Specification Writer prompt (no mention of reading previous step outputs)

## To-Be State

**Replace the completion check with a simple "find last defined + 1" scan in `src/capabilities/evolve-plan.ts`:**

1. **Remove `isStepSpecComplete()`** — no longer needed.

2. **Rewrite `validateAndFindNextStep()`** to find the highest step number `N` where `S{NN}/` exists and contains both `TASK.md` and `TEST.md`, then return `N + 1`. If no step folders exist, return 1. The loop should scan sequentially (or list directories and sort) — but the key change is that it looks for the *last* defined step, not the first incomplete one.

3. **Update `src/prompts/evolve-plan.md`** to instruct the agent to read previous step context when available: if `S{NN-1}/SUMMARY.md`, `S{NN-1}/REVIEW.md`, and related files exist, read them for background before writing the new spec. Proceed gracefully (no errors, no blocking) if they don't — this is optional enrichment, not a prerequisite.

After the change: running `/pio-evolve-plan <goal-name>` finds the last step with a spec and creates the next one. Users can freely evolve specs ahead of execution. Previous step outputs are read for context when available but never block progress.
