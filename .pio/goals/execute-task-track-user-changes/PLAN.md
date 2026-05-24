---
totalSteps: 1
steps:
  - name: add-user-change-tracking-instructions
    complexity: task
---

# Plan: Execute-Task Track User Changes

Add user-requested change tracking instructions to the execute-task prompt so `SUMMARY.md` is updated incrementally during a session, reflecting all mid-session modifications.

## Prerequisites

None.

## Steps

### Step 1: Add user change tracking instructions to execute-task prompt

Modify `src/prompts/execute-task.md` to instruct the executor to recognize and track user-requested changes, and to update `SUMMARY.md` incrementally with those changes.

**Description:**

Insert two changes into `src/prompts/execute-task.md`:

1. **New instructions after Step 8** (before Step 9): A sub-step or guideline block instructing the executor that after initial implementation is complete, any user message requesting changes should be treated as a user-requested change (distinct from the original TASK.md scope). After applying each such change, the executor must update `SUMMARY.md` to record:
   - What the user requested
   - Which files were created or modified as a result
   This prevents `SUMMARY.md` from going stale across multiple feedback iterations.

2. **Updated SUMMARY.md template in Step 9:** Add a new "User-Requested Changes" section between "Decisions Made" and "Test Coverage" in the success template. When no user changes occurred, the section lists "(none)". When changes did occur, each entry describes the request and affected files. Also add this section to the BLOCKED template for consistency.

**Acceptance Criteria:**

- `src/prompts/execute-task.md` contains instructions (between Steps 8 and 9) telling the executor to recognize user feedback as distinct from original TASK.md scope
- The instructions require updating `SUMMARY.md` after each user-requested change, recording what was requested and which files were affected
- The `SUMMARY.md` success template in Step 9 includes a "User-Requested Changes" section positioned between "Decisions Made" and "Test Coverage"
- The "User-Requested Changes" section defaults to "(none)" when no changes occurred
- The BLOCKED template also includes the "User-Requested Changes" section for consistency
- `npm run check` (`tsc --noEmit`) exits with code 0 (TypeScript correctness preserved)

**Files Affected:**

- `src/prompts/execute-task.md` — add user feedback tracking instructions after Step 8; update both success and BLOCKED SUMMARY.md templates to include "User-Requested Changes" section

## Notes

- This is a prompt-only change. No TypeScript code modifications are required — `execute-task.ts` already validates `SUMMARY.md` existence, no additional logic needed there.
- The executor detects user feedback by recognizing conversational intent (e.g., "can you also do X", "change this approach"). This is an LLM-level capability, not a code-based mechanism.
- Existing tests in `execute-task.test.ts` cover the capability layer (readiness gates), not prompt content — no test file changes are expected.
