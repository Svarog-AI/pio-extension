# Plan: Auto-use session goal in /pio-next-task

When `/pio-next-task` is invoked without arguments from a capability sub-session, automatically use the current session's `goalName` from `pio-config` instead of scanning all pending tasks.

## Prerequisites

None.

## Steps

### Step 1: Read session pio-config to auto-resolve goal name in handleNextTask

**Description:** In `handleNextTask`, insert a new check between the "explicit arg provided" case and the "scan all pending goals" fallback. The check calls `getSessionParams()` (already exported from `session-capability.ts`) to get the enriched session params populated during `resources_discover`. If `goalName` is present, call `readPendingTask(cwd, goalName)` directly to launch that task — no scanning, no user prompt.

`getSessionParams()` is already used by `validation.ts` and returns `{ goalName, stepNumber, ... }` or `undefined`. No new helper needed — just import and use the existing function.

The new logic flows as:
1. **Arg provided** → use it directly (unchanged, Case 1)
2. **No arg, session has goalName from getSessionParams()** → use that goalName directly (new Case 2)
3. **No arg, no session goalName** → scan all pending goals, auto-launch if one, prompt if multiple (unchanged, existing Case 2/3)

**Acceptance criteria:**
- [ ] `npm run check` (`npx tsc --noEmit`) reports no type errors
- [ ] When invoked without args from a session with `goalName` in session params, the command reads that goal name and launches its pending task directly (no scanning of `listPendingGoals`)
- [ ] When invoked without args from a session with no `goalName` (e.g. parent session), the command falls back to scanning all pending goals (existing behavior preserved)
- [ ] When invoked with an explicit goal arg, behavior is unchanged (explicit arg still takes priority)

**Files affected:**
- `src/capabilities/next-task.ts` — import `getSessionParams` from `./session-capability`, insert new case in `handleNextTask` using the existing helper

## Notes

- `getSessionParams()` is already used by `validation.ts` — importing it in `next-task.ts` follows an established pattern.
- `sessionParams` is typed as `Record<string, unknown>`, so `goalName` must be checked with `typeof === "string"` (already done elsewhere in the codebase).
- Keep changes minimal and localized — no refactoring of unrelated code, no new files.
