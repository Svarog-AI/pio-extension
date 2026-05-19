# Summary: Move `pio_mark_complete` from `validation.ts` to `session-capability.ts`

## Status
COMPLETED

## Files Created
- `src/capabilities/mark-complete-integration.test.ts` — End-to-end integration tests for mark-complete with real REVIEW.md frontmatter parsing, real marker creation, and real transition routing. Tests APPROVED/REJECTED decisions, invalid frontmatter, missing files, and non-review capabilities.

## Files Modified
- `src/capabilities/session-capability.ts` — Added `pio_mark_complete` tool definition with full lifecycle orchestration (validateOutputs → postValidate → resolveTransition → enqueueTask → recordTransition → postExecute → cleanup → terminate). Fixed stepNumber derivation to use explicit session params first before falling back to `state.currentStepNumber()`, preventing incorrect transitions when postValidate creates APPROVED markers.
- `src/capabilities/session-capability.test.ts` — Removed unused `type Mock` import (HIGH fix). Added `registerTool: vi.fn()` to mockPi objects (required by setupCapability).
- `src/guards/validation.ts` — Removed `markCompleteTool` definition, removed `pi.registerTool(markCompleteTool)`, removed unused imports (`defineTool`, `Type`, transition/queue imports). Retains `validateOutputs`, `extractGoalName`, and file protection event handlers.
- `src/guards/validation.test.ts` — Reverted accidental vitest globals import (HIGH fix). Added `setupValidation` test verifying no tool registration occurs (only event handlers).

## Files Deleted
- (none)

## Decisions Made
- **stepNumber derivation fix:** The original implementation used `state.currentStepNumber()` to derive the step number for transition routing. This caused a bug: after `postValidate` creates an APPROVED marker for step N, `currentStepNumber()` returns N+1 (not N), causing `resolveTransition` to look for the wrong step. Fixed by using explicit `stepNumber` from `sessionParams` first, falling back to `state.currentStepNumber()` only when not provided. This matches TASK.md's specification: "explicit stepNumber first, then state.currentStepNumber() fallback."
- **Integration test file placement:** Created `mark-complete-integration.test.ts` as a separate file rather than adding to `mark-complete.test.ts`. The existing file uses `vi.mock` at the module level for validation, goal-state, state-machine, and queues. Adding unmocked integration tests to the same file would conflict with these module-level mocks.

## Test Coverage
- **398 tests pass** (all existing + new tests)
- **TypeScript compiles cleanly** (`npx tsc --noEmit` — zero errors)
- **Unit tests (session-capability.test.ts):** Tool registration verification, file validation failure/success, postValidate failure/success, postExecute ordering, postExecute error handling, cleanup, no-config passthrough, missing workingDir passthrough
- **Unit tests (mark-complete.test.ts):** Full lifecycle flow with mocked dependencies, review-task APPROVED/REJECTED behavior with mocked postValidate
- **Integration tests (mark-complete-integration.test.ts):** End-to-end tests with real REVIEW.md files, real frontmatter parsing via GoalState, real marker creation via applyReviewDecision, real transition routing via resolveTransition, real task enqueuing via enqueueTask. Covers: APPROVED → evolve-plan, REJECTED → execute-task, invalid frontmatter (missing decision, invalid value), missing REVIEW.md, non-review capability passthrough
- **Integration test (validation.test.ts):** Verifies `setupValidation` no longer calls `registerTool`
- **Programmatic verification:** All grep checks pass (no registerTool in validation.ts, markCompleteTool present in session-capability.ts, validateOutputs and extractGoalName still exported)

## Issues Addressed from Review
- **[HIGH] Removed unused `type Mock` import** from `session-capability.test.ts`
- **[HIGH] Reverted accidental changes to `validation.test.ts`** — removed unnecessary vitest globals import and trailing newline
- **[MEDIUM] Added end-to-end review-task integration tests** — `mark-complete-integration.test.ts` exercises real REVIEW.md frontmatter parsing, real marker creation, and real transition routing without mocks
- **[LOW] Added `setupValidation` integration test** — verifies no tool registration in validation.ts
- **[Bug Fix] Fixed stepNumber derivation** — uses explicit session params before falling back to `state.currentStepNumber()`, preventing incorrect transitions after APPROVED marker creation
