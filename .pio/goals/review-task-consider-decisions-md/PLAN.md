---
totalSteps: 1
steps:
  - name: review-task-considers-decisions
    complexity: task
---

# Plan: review-task-consider-decisions-md

Make the `review-task` capability aware of accumulated architectural decisions and user-requested changes so reviewers stop flagging legitimate deviations as errors.

## Prerequisites

None.

## Steps

### Step 1: Add DECISIONS.md support to review-task

**Description**

Two co-dependent changes to enable the reviewer to see DECISIONS.md and understand user-requested changes:

1. **`src/capabilities/review-task.ts`** — Modify `resolveReviewReadOnlyFiles()` to conditionally include `${folder}/DECISIONS.md` when `stepNumber > 1`, following the pattern in `evolve-plan.ts`. Define `DECISIONS_FILE = "DECISIONS.md"` as a constant alongside the existing file constants at the bottom of the file.

2. **`src/prompts/review-task.md`** — Update Step 2 to instruct the reviewer about DECISIONS.md (Step 2+, supplementary context) and SUMMARY.md's "User-Requested Changes" section (treat as approved scope extensions, do not flag as unauthorized). Add two new alignment dimensions: **TASK ↔ DECISIONS** and **TASK ↔ User-Requested Changes**.

**Acceptance Criteria**

- `npx tsc --noEmit` reports no errors
- `resolveReviewReadOnlyFiles()` with `stepNumber: 1` does NOT include DECISIONS.md
- `resolveReviewReadOnlyFiles()` with `stepNumber: 2` includes `${folder}/DECISIONS.md`
- `src/prompts/review-task.md` Step 2 contains instructions about reading DECISIONS.md for Step 2+
- `src/prompts/review-task.md` Step 2 contains instructions about treating User-Requested Changes as approved scope extensions
- The alignment check section includes TASK ↔ DECISIONS and TASK ↔ User-Requested Changes dimensions

**Files Affected**

- `src/capabilities/review-task.ts` — add `DECISIONS_FILE` constant, conditionally include in `resolveReviewReadOnlyFiles()` for stepNumber > 1
- `src/prompts/review-task.md` — update Step 2 and alignment check section

## Notes

- Scope is strictly limited to review-task. No changes to evolve-plan.ts, execute-task.ts, or any other file.
- The conditional pattern (`if (stepNumber > 1)`) already exists in `evolve-plan.ts` — copy it directly.
