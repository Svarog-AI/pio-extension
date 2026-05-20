# execute-task should advise user to create a blocker and transition back to evolve-plan with revision message

## Problem

When `review-code` rejects a step, the current workflow routes back to `execute-task` for re-execution. This creates a loop: the agent re-runs with the same broken spec, produces the same broken implementation, and gets rejected again. The reviewer then has to manually approve despite documented deviations, or keep looping.

There's no mechanism for the review process to advise the user to create a **BLOCKED** marker on the step and transition back to `evolve-plan` with a proper message explaining what needs to be revised in the spec.

## Current Behavior

1. `review-task` rejects → writes `S{NN}/REJECTED`, deletes `S{NN}/COMPLETED`
2. `transitionReviewTask()` routes rejected steps back to `execute-task` (same step)
3. `execute-task` re-runs with the same TASK.md/TEST.md
4. Likely produces the same result → review rejects again → loop

## Desired Behavior

When a step is rejected, the system should support:

1. **BLOCKED marker creation:** Write `S{NN}/BLOCKED` to signal the step needs spec revision (not re-execution). `StepStatus.status()` already recognizes "blocked" — it's just never set by the review workflow.
2. **Transition back to evolve-plan:** Instead of routing rejected steps to `execute-task`, route them to `evolve-plan` with feedback from `REVIEW.md`. The Specification Writer can then revise TASK.md/TEST.md based on the reviewer's findings.
3. **User advice:** Display a message explaining that the step is blocked and what needs to be revised.

## Related files

- `src/state-machine.ts` — `transitionReviewTask()` currently routes rejected steps to `execute-task`
- `src/goal-state.ts` — `StepStatus.status()` already supports "blocked" via `BLOCKED` marker
- `src/capabilities/review-code.ts` — write allowlist and validation
- `src/prompts/evolve-plan.md` — prompt could include revision mode instructions

## Acceptance Criteria

- [ ] Rejected steps can be transitioned to `evolve-plan` with REVIEW.md feedback (not just `execute-task`)
- [ ] BLOCKED marker creation is supported in the review workflow
- [ ] evolve-plan receives context about what needs to be revised
- [ ] User is notified when a step is blocked instead of re-executing

## Category

improvement

## Context

Observed during S06 review: rejected, re-executed with same issues, user approved despite deviations to avoid looping. StepStatus already has "blocked" status recognition (BLOCKED marker check) — the infrastructure is partially there but not wired into the review→transition flow.
