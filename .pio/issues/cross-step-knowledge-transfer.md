# No mechanism to transfer knowledge between sequential pio sub-sessions

## Problem

Each pio sub-session is isolated — when Step N completes, the agent in Step N+1 starts fresh with no memory of discoveries, decisions, or constraints uncovered during Steps 1–N. Knowledge is lost between sessions.

## Current State

The only cross-step artifacts today are:
- `SUMMARY.md` (written by execute-task, describes what was built)
- `REVIEW.md` (written by review-code, contains review feedback)
- Source code changes on disk

Neither SUMMARY.md nor REVIEW.md is designed to capture **discoveries** — unexpected constraints, timing requirements, design decisions, or things learned about how the system actually works.

## Concrete Example

During specification of Step 3 (review-rejected-marker goal), we discovered:
1. The REJECTED marker must be created **before** `validateOutputs` in `pio_mark_complete`, not after — otherwise validation fails
2. `resolveNextCapability` is called synchronously inside `pio_mark_complete` at line ~132, not at session end
3. The transition resolver is pure filesystem logic — it reads whatever exists at call time

These are critical constraints that Step 7 (which implements the actual marker creation) **must know about**. But the Step 7 specification writer will start in a fresh sub-session with no access to this conversation. It will have to rediscover these facts by reading `validation.ts` and reasoning through the same analysis — or get it wrong.

## Impact

- Duplicate work: each step re-discovers the same constraints
- Inconsistency risk: Step 7 might implement marker creation at the wrong point in the pipeline if the timing constraint isn't documented somewhere accessible
- Lost context: design decisions made by the user during earlier steps (e.g., "REJECTED wins over APPROVED", "no rejectedAfterReview flag needed") are not automatically available to later steps

## Proposed Solution (to be explored)

A lightweight mechanism to persist cross-step knowledge. Options:
1. **Accumulating context file** — e.g., `.pio/goals/<name>/DISCOVERIES.md` or `CONTEXT.md`, appended by each step with decisions and constraints discovered during that session
2. **Enriched SUMMARY.md** — require execute-task to include a "Discoveries/Decisions" section alongside the implementation summary
3. **Prompt injection** — evolve-plan could read previous step REVIEW.md/REVIEW.md summaries and inject them as context into the next step's initial message
4. **Structured decisions log** — JSON or YAML file recording key decisions per step, read by subsequent steps

The right solution should be lightweight (not add ceremony), machine-readable if possible, and automatically consumed by subsequent steps without manual effort from the agent.

## Category

improvement

## Context

Observed during review-rejected-marker goal: Step 3 specification uncovered critical timing constraints for Step 7 implementation. The `pio_mark_complete` execute handler in `src/capabilities/validation.ts` calls `resolveNextCapability` synchronously, meaning markers must exist before that call — specifically before `validateOutputs`. This constraint was discovered through code reading and user discussion, but would be lost to the Step 7 sub-session. Related to existing artifacts: SUMMARY.md (step N), REVIEW.md (step N), TASK.md/TEST.md (step N+1).
