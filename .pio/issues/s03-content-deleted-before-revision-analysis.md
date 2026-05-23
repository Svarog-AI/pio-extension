# S03 content deleted before revise-plan agent could analyze revision trigger

## Problem

During the `revise-plan` session for `implement-subgoals`, the cleanup process deleted the S03/ folder before the Plan Revision Agent could inspect its contents to understand why `REVISE_PLAN_NEEDED` was triggered.

## Expected behavior

The Plan Revision Agent needs access to:
- **S03/TASK.md** — what step 3 was supposed to do
- **S03/TEST.md** — test specifications
- **S03/DECISIONS.md** — decisions made during spec or execution
- **S03/REVISE_PLAN_NEEDED** — the marker and any notes explaining why revision was needed

These files contain critical context about:
1. What went wrong during step 3 execution/specification
2. What decisions were made that invalidated future steps
3. What scope changes or architectural pivots were discovered

## Actual behavior

S03/ was deleted as part of the cleanup process. Only S01/ and S02/ (both APPROVED) remain. The Plan Revision Agent must infer why the revision happened solely from:
- Archived plans (which show what was planned, not why it failed)
- GOAL.md (which doesn't contain execution context)
- Source code changes from S01/S02

## Impact

The new PLAN.md may miss critical lessons learned during S03's specification/execution phase. Without understanding the revision trigger, the revised plan risks:
- Repeating the same architectural mistake
- Missing edge cases discovered during S03
- Failing to incorporate decisions made in S03/DECISIONS.md

## Suggested mitigation

Modify `revise-plan` cleanup behavior to either:
1. **Preserve the trigger step's folder** (the one with REVISE_PLAN_NEEDED) so the revise-plan agent can read it before archiving, or
2. **Archive S03 contents into PLAN_ARCHIVE/** alongside the plan itself, preserving TASK.md, DECISIONS.md, and any reviewer notes

## Category

bug

## Context

- Goal: implement-subgoals (.pio/goals/implement-subgoals/)
- Revision triggered from Step 3 (original plan: "State machine transitions")
- S01/ and S02/ remain with APPROVED markers
- S03/ was deleted during cleanup before revise-plan agent could analyze it
