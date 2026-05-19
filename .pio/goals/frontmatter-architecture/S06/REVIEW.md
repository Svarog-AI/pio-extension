---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---

# Code Review: Move `pio_mark_complete` from `validation.ts` to `session-capability.ts` (Step 6)

## Decision
APPROVED

## Summary
The implementation correctly moves the `pio_mark_complete` tool from `validation.ts` to `session-capability.ts`, where it now orchestrates the full capability exit lifecycle (file validation → postValidate → transition routing → task enqueuing → postExecute → cleanup → terminate). The code follows existing project conventions, all 398 tests pass, TypeScript compiles cleanly with zero errors, and the implementation faithfully matches the TASK.md specification. A notable improvement over the original design is the stepNumber derivation fix: using explicit `sessionParams.stepNumber` before falling back to `state.currentStepNumber()`, which prevents incorrect transitions when postValidate creates APPROVED markers that change the perceived current step.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- (none)

## Test Coverage Analysis
All acceptance criteria from TASK.md are covered by tests:

**Unit tests (`mark-complete.test.ts`)** — 14 tests covering the complete execution flow with mocked dependencies:
- Tool registration verification via `setupCapability`
- File validation failure returns error without terminating
- PostValidate hook: success triggers transitions, failure blocks transitions
- PostExecute ordering (runs after transition routing)
- PostExecute errors don't block termination (non-fatal)
- Cleanup deletes files in `fileCleanup`
- No-config passthrough and missing workingDir passthrough
- Review-task specific behavior: APPROVED creates marker + enqueues evolve-plan, REJECTED creates marker + deletes COMPLETED + enqueues execute-task, invalid frontmatter returns error without markers

**Integration tests (`mark-complete-integration.test.ts`)** — 6 tests exercising real frontmatter parsing, real marker creation, and real transition routing without mocks:
- APPROVED → evolve-plan with step increment
- REJECTED → execute-task with same step + COMPLETED deletion
- Missing decision field, invalid decision value, missing REVIEW.md all return errors
- Non-review capability passes through without postValidate/postExecute

**Integration test (`validation.test.ts`)** — Verifies `setupValidation` no longer calls `registerTool`. Only event handlers are registered.

No coverage gaps identified. All acceptance criteria have corresponding programmatic verification.

## Gaps Identified
- **GOAL ↔ PLAN**: Step 6 plan item aligns with overall goal of moving frontmatter parsing out of the cross-cutting guard module into capability-owned lifecycle hooks.
- **PLAN ↔ TASK**: Task spec faithfully represents the plan step — tool definition, registration, removal from validation.ts, and import dependencies all match.
- **TASK ↔ TESTS**: All acceptance criteria covered by tests (see coverage analysis above).
- **TASK ↔ Implementation**: Code matches task spec exactly. The `markCompleteTool` follows the specified flow, imports are correct, and validation.ts is properly slimmed down.

One deviation worth noting: TASK.md suggested importing `extractGoalName` from `validation.ts`. The implementation instead uses `state.goalName` (from `createGoalState(dir)`), which is cleaner — it leverages the GoalState abstraction as the single source of truth for goal data, consistent with the broader architecture direction.

## Recommendations
N/A
