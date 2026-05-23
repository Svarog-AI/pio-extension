---
totalSteps: 3
steps:
  - name: rename-module-to-session-guard
    complexity: task
  - name: add-completion-tracking
    complexity: task
  - name: add-agent-end-warning
    complexity: task
---

# Plan: Session Run End Guard

Add a guard to `session-guard.ts` (renamed from `turn-guard.ts`) that warns at `agent_end` when an agent run terminates without calling `pio_mark_complete`.

## Prerequisites

None. All referenced files already exist and are covered by existing tests.

## Steps

### Step 1: Rename turn-guard to session-guard

Rename the guard module to reflect that it handles session-level events beyond just turns:

- **Rename** `src/guards/turn-guard.ts` → `src/guards/session-guard.ts`
- **Rename** `src/guards/turn-guard.test.ts` → `src/guards/session-guard.test.ts`
- **Rename exported function** `setupTurnGuard` → `setupSessionGuard`
- **Update imports** in `src/index.ts` and `session-guard.test.ts` to match new names/paths

No behavior changes — purely a rename. Existing tests should pass with no modifications beyond the import path.

**Acceptance Criteria:**
- Old files `turn-guard.ts` and `turn-guard.test.ts` no longer exist
- New files `session-guard.ts` and `session-guard.test.ts` exist with equivalent content
- `setupSessionGuard` is exported from the new module path
- `src/index.ts` imports from `./guards/session-guard` and calls `setupSessionGuard(pi)`
- `npx tsc --noEmit` reports no errors
- Existing test suite passes with no regressions

**Files Affected:**
- `src/guards/turn-guard.ts` → `src/guards/session-guard.ts` — rename file, rename exported function
- `src/guards/turn-guard.test.ts` → `src/guards/session-guard.test.ts` — rename file, update import path
- `src/index.ts` — update import from `./guards/session-guard`

### Step 2: Add completion tracking

Add per-run completion tracking to `setupSessionGuard`:

- New module-level boolean `markCompleteCalled`, default `false`
- Export a test accessor `__testSetMarkCompleteCalled(value?: boolean): boolean` following the existing `__testSetActiveSession` pattern
- Register a `tool_call` event handler that sets `markCompleteCalled = true` when `event.toolName === "pio_mark_complete"`
- Reset `markCompleteCalled = false` on `before_agent_start` so each agent run gets a clean slate

The `tool_call` handler should fire regardless of `isActivePioSession` — tracking is harmless and enables accurate state at `agent_end`. The `before_agent_start` handler should guard on `isActivePioSession` to avoid resetting flags in non-pio sessions.

**Acceptance Criteria:**
- `__testSetMarkCompleteCalled()` getter/setter works correctly (can be verified via existing test patterns)
- The `tool_call` handler sets the flag when `pio_mark_complete` is called, and does nothing for other tool names
- The `before_agent_start` handler resets the flag on each new agent run, but only when in a pio session (`isActivePioSession`)
- Existing tests pass with no regressions
- `npx tsc --noEmit` reports no errors

**Files Affected:**
- `src/guards/session-guard.ts` — add completion tracking state, `tool_call` handler, `before_agent_start` reset, and test accessor

### Step 3: Add agent-end warning check

Add the `agent_end` handler to `setupSessionGuard`:

- Register an `agent_end` event handler that checks `markCompleteCalled`
- When the flag is still `false`, send a final warning via `pi.sendUserMessage()` informing the user the session ended without calling `pio_mark_complete`
- Use `deliverAs: "followUp"` so the message is deferred to the next run (avoids injection into the current loop that has already exited)
- Guard on `isActivePioSession` to avoid firing in non-pio sessions

The warning message should be clear and actionable — e.g., noting that the agent completed its run without proper validation. Use a constant string similar to how `RECOVERY_PROMPT` is defined.

**Acceptance Criteria:**
- `agent_end` handler sends a follow-up message via `pi.sendUserMessage()` when `markCompleteCalled` is `false` and `isActivePioSession` is `true`
- `agent_end` handler does nothing when `markCompleteCalled` is `true` (normal completion)
- `agent_end` handler does nothing when not in a pio session (`isActivePioSession` is `false`)
- Warning message uses `{ deliverAs: "followUp" }` delivery mode
- Existing tests pass with no regressions
- `npx tsc --noEmit` reports no errors

**Files Affected:**
- `src/guards/session-guard.ts` — add `agent_end` handler and warning constant

## Notes

- The guard fires once per agent run, at session end only — not at every turn. This avoids mid-run noise for legitimate multi-turn work.
- When `pi.sendUserMessage()` is called from the `agent_end` handler, the agent loop has already exited its outer follow-up check. The message is queued to `_followUpMessages` but will not trigger a new agent run automatically — it becomes context for the next user prompt. No infinite loop possible.
- False positives are acceptable: if an agent pauses to ask the user a question (output text, no tool calls), `agent_end` fires and we warn. This is correct behavior — pio sub-sessions should complete autonomously without asking questions.
- Follow existing patterns: module-level state with `__test*` accessors, pure detection logic where applicable, colocated tests in `session-guard.test.ts`.
