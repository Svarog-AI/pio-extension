# No way to mark a goal as COMPLETED after all steps are done

## Problem

Once all steps in a plan have been executed, reviewed, and approved, there is no mechanism to mark the **goal itself** as complete. The workflow has markers for individual step states but nothing at the goal level.

### Current markers (per-step)

- `S{NN}/COMPLETED` — empty placeholder file written by `execute-task` when a step is done
- `S{NN}/BLOCKED` — empty placeholder file when a step is blocked
- `S{NN}/APPROVED` — empty placeholder file written by `review-code` on approval (triggers `evolve-plan` for the next step)
- `PLANNED` — empty placeholder file written by `evolve-plan` when all steps are already specified

### What's missing

When the last step is approved and `evolve-plan` writes `PLANNED`, the state machine has no transition defined (the `CAPABILITY_TRANSITIONS` map in `utils.ts` has no entry for what happens after `PLANNED`). There's no file like `COMPLETED` at the goal root to signal "this goal is fully done."

### Impact

- No programmatic way to query which goals are finished
- Nothing tells a subsequent session or human observer that the goal's work is complete
- The auto-enqueue loop in `validation.ts` (post-completion transition) has no terminal state — it could keep trying to enqueue tasks indefinitely
- No way to list "in-progress" vs "done" goals across `.pio/goals/`

## Suggested fix

Introduce a `COMPLETED` placeholder file at the goal workspace root (next to `GOAL.md`, `PLAN.md`). This should be written when:

1. The last step is approved by `review-code`, AND
2. `evolve-plan` detects no more steps remain (writes `PLANNED`)

Options for who writes it:

- **Option A:** `review-code` — after approving the last step (detected by checking if there's a next step in PLAN.md), write `COMPLETED` at goal root
- **Option B:** `evolve-plan` — when it would write `PLANNED` and detects all steps are both specified AND approved, also write `COMPLETED`  
- **Option C:** A dedicated tool/command like `/pio-complete-goal <name>` that humans or agents explicitly call

Regardless of who writes it:
- `discoverNextStep` and transition logic should check for this file and stop auto-enqueueing
- The capability transitions in `utils.ts` should treat goal completion as a terminal state (return `undefined` from `resolveNextCapability`)

## Files involved

- `src/utils.ts` — `CAPABILITY_TRANSITIONS`, `discoverNextStep`, `resolveNextCapability`
- `src/capabilities/evolve-plan.ts` — writes `PLANNED` when all steps specified
- `src/capabilities/review-code.ts` — approves steps, triggers next-step transitions
- `src/prompts/evolve-plan.md` — Step 2 (the PLANNED file logic)
- `src/prompts/review-code.md` — approval workflow

## Category

improvement

## Context

Per-step `COMPLETED` marker exists (`execute-task.ts:55`, `review-code.ts:71`) but no goal-level completion signal. The `PLANNED` file from evolve-plan only means "all steps are specified," not "all steps are implemented and approved." Related: existing issue `evolve-plan-not-scheduling-next-task.md` may touch transition logic.
