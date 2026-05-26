# revise-plan should remove COMPLETED marker and handle revisions after all steps specified

## Problem

`cleanupIncompleteSteps()` in `src/capabilities/revise-plan.ts` deletes non-APPROVED step folders and cleans up the `REVISE_PLAN_NEEDED` marker — but it never removes `<goalDir>/COMPLETED`.

The `COMPLETED` marker is written by evolve-plan when all plan steps are specified (`validateAndFindNextStep()` in `evolve-plan.ts`, line: `if (currentStep > metadata.totalSteps)`). After revision, when evolve-plan runs again, `validateAndFindNextStep()` checks `state.goalCompleted()` first and returns not-ready: `"All plan steps for ... have already been specified."` This blocks the workflow from continuing after a revision.

## Affected scenarios

1. **Revision triggered on the last step:** evolve-plan specifies Step N (the final step). After writing TASK.md, the pre-launch check sees `currentStep > totalSteps` and writes COMPLETED before launch. Agent then decides revision is needed (`REVISE_PLAN_NEEDED`). State machine routes to revise-plan. Revision rewrites PLAN.md with new steps. Next evolve-plan sees stale COMPLETED marker and blocks.

2. **Revision requires additional steps:** Mid-execution, a decision reveals additional plan steps are needed beyond what was originally planned. After revision adds new steps to PLAN.md, evolve-plan should continue specifying them — but the existing COMPLETED marker prevents this.

3. **Manual revision after all steps specified:** User or agent runs `/pio-revise-plan` explicitly after evolution is complete (all TASK.md files written). Revision should allow a fresh round of specification — but COMPLETED blocks it.

## Fix

In `cleanupIncompleteSteps()` (`src/capabilities/revise-plan.ts`), delete `<goalDir>/COMPLETED` alongside the existing cleanup logic:

```ts
// Delete COMPLETED marker at goal root (if exists)
const completedPath = path.join(goalDir, "COMPLETED");
if (fs.existsSync(completedPath)) {
  fs.unlinkSync(completedPath);
}
```

This ensures that after revision, evolve-plan can rescan step folders against the new PLAN.md and continue specification without being blocked by a stale completion signal.

## Files affected

- `src/capabilities/revise-plan.ts` — add COMPLETED marker deletion to `cleanupIncompleteSteps()`

## Related code

- `src/goal-state.ts` — `goalCompleted()` reads `<goalDir>/COMPLETED`; `currentStepNumber()` scans step folders
- `src/capabilities/evolve-plan.ts` — `validateAndFindNextStep()` checks `state.goalCompleted()` first (pre-launch guard), then writes COMPLETED when `currentStep > totalSteps`

## Category

bug

## Context

File: src/capabilities/revise-plan.ts — cleanupIncompleteSteps() (lines ~96-130). File: src/capabilities/evolve-plan.ts — validateAndFindNextStep() writes COMPLETED at line where `currentStep > metadata.totalSteps`. File: src/goal-state.ts — goalCompleted() checks fs.existsSync(path.join(goalDir, "COMPLETED")).
