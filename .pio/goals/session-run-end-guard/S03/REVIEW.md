---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---

# Code Review: Add agent-end warning check (Step 3)

## Decision
APPROVED

## Summary
The implementation correctly adds the `agent_end` handler to `setupSessionGuard` with proper guards on both `isActivePioSession` and `markCompleteCalled`. The code is minimal, follows existing patterns exactly, and all tests pass with no regressions. TypeScript compiles cleanly. The mock was updated to capture `sendUserMessage` options, enabling verification of the `{ deliverAs: "followUp" }` delivery mode — a risk explicitly identified in TASK.md.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- (none)

## Test Coverage Analysis
All 7 acceptance criteria and all 4 additional test criteria from TASK.md are covered:

| Acceptance Criterion | Test Coverage |
|---|---|
| Sends warning when `markCompleteCalled=false` + `isActivePioSession=true` | ✓ — asserts `sendUserMessageCalls` has 1 entry with `{ deliverAs: "followUp" }` |
| Does nothing when `markCompleteCalled=true` | ✓ — asserts `sendUserMessageCalls` is empty |
| Does nothing when `isActivePioSession=false` | ✓ — asserts `sendUserMessageCalls` is empty |
| Uses `{ deliverAs: "followUp" }` delivery mode | ✓ — asserts `options` equals `{ deliverAs: "followUp" }` |
| Warning constant is module-level and non-empty | ✓ — verifies content length > 0; constant defined at module level (code inspection) |
| `setupSessionGuard` registers `agent_end` handler | ✓ — asserts `handlers.get("agent_end")` is defined and non-empty |
| No regressions + `tsc --noEmit` passes | ✓ — 650/650 tests pass, `tsc --noEmit` exits clean |

The `beforeEach` state reset (`__testSetActiveSession(false); __testSetMarkCompleteCalled(false)`) ensures test isolation. The mock `SendUserMessageCall` interface correctly captures `{ content, options }` to verify the delivery mode — addressing a risk explicitly flagged in TASK.md ("Mock limitations").

## Gaps Identified
No gaps between GOAL ↔ PLAN ↔ TASK ↔ TESTS ↔ Implementation. The step delivers exactly what was specified: an `agent_end` handler that warns once at session end when `pio_mark_complete` was not called, using follow-up delivery to avoid injection into the exited agent loop.

## Recommendations
N/A — implementation is complete and correct.
