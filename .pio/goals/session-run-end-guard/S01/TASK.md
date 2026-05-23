# Task: Rename turn-guard to session-guard

Rename the guard module from `turn-guard` to `session-guard` to reflect that it will handle session-level events (`agent_end`, `tool_call`) beyond just turns.

## Context

The guard currently lives in `src/guards/turn-guard.ts` and detects thinking-only dead turns at `turn_end`. Steps 2 and 3 will add `tool_call` and `agent_end` handlers to this same module — events that operate at the session level, not per-turn. Renaming now avoids confusion for downstream agents reading this file alongside the plan. This is a purely mechanical rename with no behavior changes.

## What to Build

Rename files, exported function, and update all import references:

### File renames

1. **`src/guards/turn-guard.ts` → `src/guards/session-guard.ts`** — rename the file; inside, rename `setupTurnGuard` to `setupSessionGuard`. All other code (content blocks, `isThinkingOnlyTurn`, `__testSetActiveSession`, `getAssistantContent`, `RECOVERY_PROMPT`) remains identical.
2. **`src/guards/turn-guard.test.ts` → `src/guards/session-guard.test.ts`** — rename the file; update the import path from `"./turn-guard"` to `"./session-guard"`. Update all references to `setupTurnGuard` → `setupSessionGuard` in describe blocks and test calls.

### Import updates

3. **`src/index.ts`** — change `import { setupTurnGuard } from "./guards/turn-guard"` to `import { setupSessionGuard } from "./guards/session-guard"`. Change the call site `setupTurnGuard(pi)` to `setupSessionGuard(pi)`.

After the rename, the old files (`turn-guard.ts`, `turn-guard.test.ts`) must no longer exist on disk.

### Code Components

No new functions or types are introduced. The only symbolic rename is:

- `setupTurnGuard` → `setupSessionGuard` (exported function in the guard module)

All other exports (`isThinkingOnlyTurn`, `__testSetActiveSession`) remain unchanged.

### Approach and Decisions

- Use `git mv` or a shell `mv` to rename files — this preserves git history.
- The test file must import from `"./session-guard"` (the new relative path). All 8 occurrences of `setupTurnGuard` in the test file become `setupSessionGuard`.
- The `describe("setupTurnGuard", ...)` block name should update to `describe("setupSessionGuard", ...)` for clarity.
- No behavior changes: every event handler, detection function, and constant is preserved exactly as-is.

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/guards/turn-guard.ts` → `src/guards/session-guard.ts` — renamed file, `setupTurnGuard` renamed to `setupSessionGuard`
- `src/guards/turn-guard.test.ts` → `src/guards/session-guard.test.ts` — renamed file, import path and function references updated
- `src/index.ts` — import path changed from `./guards/turn-guard` to `./guards/session-guard`; call changed from `setupTurnGuard(pi)` to `setupSessionGuard(pi)`

## Acceptance Criteria

- Old files `src/guards/turn-guard.ts` and `src/guards/turn-guard.test.ts` no longer exist on disk
- New file `src/guards/session-guard.ts` exists with equivalent content (only `setupTurnGuard` → `setupSessionGuard` renamed)
- New file `src/guards/session-guard.test.ts` exists with import path updated to `"./session-guard"` and all references to `setupTurnGuard` changed to `setupSessionGuard`
- `setupSessionGuard` is exported from `src/guards/session-guard.ts`
- `src/index.ts` imports `setupSessionGuard` from `./guards/session-guard` and calls `setupSessionGuard(pi)`
- No other files in the project reference `turn-guard` or `setupTurnGuard` (verifiable via `grep -rn "turn-guard\|setupTurnGuard" src/`)
- `npx tsc --noEmit` reports no type errors
- All existing tests pass with no regressions: `npx vitest run`

## Risks and Edge Cases

- **Orphan references:** Verify no other files (prompts, docs, capabilities) reference `turn-guard` or `setupTurnGuard`. A grep across the full `src/` tree should confirm only the 3 files listed above contain these strings.
- **Git tracking:** If using `mv` instead of `git mv`, ensure the new files appear as new/additions and old files as deletions in git status.
- **Test describe blocks:** The test file has a `describe("setupTurnGuard", ...)` block that should be renamed to `describe("setupSessionGuard", ...)`. This is cosmetic but ensures consistency.
