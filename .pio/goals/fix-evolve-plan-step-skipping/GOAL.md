# Fix evolve-plan to skip completed steps

`pio_evolve_plan` should advance to the next uncompleted step in a plan, but it can reassign already-completed steps. The step-finding logic in `src/capabilities/evolve-plan.ts` determines completion by checking only for `TASK.md` and `TEST.md`, which is incorrect — these files exist as soon as evolve-plan itself creates them, not when the step is fully executed. Fix the "next uncompleted step" algorithm so it correctly identifies finished steps (marked by a `COMPLETED` file) and advances past them.

## Current State

The step-finding logic lives in `src/capabilities/evolve-plan.ts`. The function `isStepSpecComplete()` checks whether a step folder contains both `TASK.md` and `TEST.md`:

```typescript
function isStepSpecComplete(goalDir: string, stepNumber: number): boolean {
  const folder = stepFolderName(stepNumber);  // e.g. "S01"
  const stepDir = path.join(goalDir, folder);
  if (!fs.existsSync(stepDir)) return false;

  return (
    fs.existsSync(path.join(stepDir, TASK_FILE)) &&
    fs.existsSync(path.join(stepDir, TEST_FILE))
  );
}
```

The `validateAndFindNextStep()` function loops starting at step 1 and returns the first step where `isStepSpecComplete` returns `false`. This is called by both the tool handler (`pio_evolve_plan`) and the command handler (`/pio-evolve-plan`).

A completed step folder typically contains: `TASK.md`, `TEST.md`, `SUMMARY.md`, and a `COMPLETED` marker file (created when `pio_execute_task` finishes a step successfully). The current check only looks for `TASK.md` and `TEST.md`, which means it considers a step "complete" as soon as the spec is written — before it's even executed.

**Observed bug:** Running `/pio-evolve-plan code-review-capability` launched an evolve-plan session for Step 1 even though `S01/` already contained `TASK.md`, `TEST.md`, `SUMMARY.md`, and a `COMPLETED` marker. The agent was told to work on Step 1 instead of advancing to Step 2 (`S02/`).

The prompt (`src/prompts/evolve-plan.md`) does not instruct the agent to skip completed steps — that responsibility lies entirely in the capability code before the sub-session starts.

**Files involved:**
- `src/capabilities/evolve-plan.ts` — contains `isStepSpecComplete()` and `validateAndFindNextStep()`
- `src/prompts/evolve-plan.md` — system prompt for the Specification Writer (no skipping logic)

## To-Be State

The "next uncompleted step" algorithm must correctly identify which steps have been fully completed and advance past them. A step is considered complete only when its folder contains a `COMPLETED` marker file.

**Concrete changes to `src/capabilities/evolve-plan.ts`:**

1. **Fix `isStepSpecComplete()`** (or rename it to something clearer) to check for the `COMPLETED` marker file. The function should return `true` only when `S{NN}/COMPLETED` exists, indicating the step was executed to finish.

2. **Update `validateAndFindNextStep()`** to skip steps that are truly complete (have `COMPLETED` marker) and stop at the first step that lacks it. This ensures evolve-plan advances past finished work.

3. **Handle partial specs correctly:** If a step has `TASK.md` and `TEST.md` but no `COMPLETED` marker, evolve-plan should still advance past it (the spec exists, no need to regenerate) — unless the user explicitly wants to regenerate specs. The default behavior: skip any step that has both `TASK.md` and `TEST.md`, regardless of `COMPLETED` status, since those files are the direct output of evolve-plan itself.

**Optional safeguard in `src/prompts/evolve-plan.md`:** Add a note instructing the agent to detect if its assigned step already has `COMPLETED` or existing spec files, and self-correct by working on the next step instead. This provides a backup if the pre-launch logic somehow assigns a wrong step.

After the fix: running `/pio-evolve-plan <goal-name>` when `S01/COMPLETED` exists should correctly assign Step 2 (`S02/`). The loop should advance past all completed steps and stop at the first incomplete one.
