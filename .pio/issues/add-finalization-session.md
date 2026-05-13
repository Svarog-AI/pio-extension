# Add a goal-level finalization session triggered when all plan steps are complete

# Add a goal-level finalization session

Introduce a new capability — `finalize-goal` — that runs after a goal's plan is fully completed. It is triggered when the `COMPLETED` marker is written at the goal workspace root (signaling all steps have been specified). The session handles post-goal activities: creating pull requests, running cleanups, updating documentation, and other closing work using specific skills.

## Motivation

Currently, when all plan steps are done, the `COMPLETED` marker appears in `.pio/goals/<name>/` but nothing happens next. The developer manually has to create PRs, cleanup branches, update docs, etc. A dedicated finalization session automates this last mile — it's the natural capstone of the pio workflow (goal → plan → evolve → execute → review → **finalize**).

## What it does

- A new capability module `src/capabilities/finalize-goal.ts` with `CAPABILITY_CONFIG`, tool/command registration, and `setupFinalizeGoal(pi)`.
- A new prompt `src/prompts/finalize-goal.md` with instructions for post-goal activities: PR creation, branch cleanup, documentation updates, skill reviews, and any other project-specific closeout.
- The trigger: when the `COMPLETED` marker is written, a finalization task is auto-enqueued into `.pio/session-queue/`.
- The agent can use specific skills during finalization — e.g., a PR-writing skill, a cleanup skill, or project-specific skills defined in `src/skills/`.
- The user runs `/pio-next-task` to start the session (same pattern as all other capabilities).

## Trigger point

The `COMPLETED` marker is currently written by the `evolve-plan` session when it determines no more steps remain. The logic should be:

1. After writing `COMPLETED`, enqueue a `finalize-goal` task in `.pio/session-queue/`.
2. Alternatively (if completion detection moves to another capability), hook into wherever the `COMPLETED` file is created and auto-enqueue from there.

## Files to create/modify

- **New:** `src/capabilities/finalize-goal.ts` — capability module with tool, command, and config
- **New:** `src/prompts/finalize-goal.md` — finalization agent system prompt
- **Modify:** `src/capabilities/evolve-plan.ts` — after writing `COMPLETED`, enqueue a finalize-goal task
- **Modify:** `src/utils.ts` — add `"finalize-goal"` to `CAPABILITY_TRANSITIONS` (evolve-plan → finalize-goal, or execute-task → finalize-goal)
- **Modify:** `src/index.ts` — wire up the new capability

## Open questions

- Should finalization be auto-triggered (auto-enqueued on `COMPLETED`) or opt-in (`/pio-finalize-goal <name>` command only)?
- Which skills should be available during finalization? PR creation, git operations, documentation updates?
- Should there be a configurable list of cleanup tasks per-project, or is it all defined in the prompt?
- Is this strictly post-evolve-plan (all steps specified), or post-execute-task (all steps implemented)? Likely the latter — when all steps are both specified AND implemented.

## Category

feature

## Context

Relevant files:
- `src/capabilities/evolve-plan.ts` — writes COMPLETED marker at goal root, detects "no more steps" in validateAndFindNextStep
- `src/utils.ts` — CAPABILITY_TRANSITIONS, enqueueTask, shared utilities
- `src/index.ts` — extension entry point wiring all capabilities
- `src/prompts/evolve-plan.md` — current specification writer prompt (understands completion flow)
- `.pio/goals/<name>/COMPLETED` — marker file proving all steps are done
