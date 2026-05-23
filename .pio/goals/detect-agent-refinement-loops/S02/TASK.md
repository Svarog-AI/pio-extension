# Task: Add turn-count detection to session-guard

Add a periodic turn-count nudge to `session-guard.ts` that fires whenever an agent exceeds a configurable number of turns in a single run. After firing, the counter resets so the nudge can fire again later if the agent continues running.

## Context

Agents can enter refinement loops — repeatedly rewriting the same file with incremental prose improvements without ever calling `pio_mark_complete`. This was observed during an `evolve-plan` session where the agent rewrote `PLAN.md` ~5 times across many turns. The existing `session-guard.ts` already tracks turns via `turn_end` events and sends recovery prompts for thinking-only turns, but has no turn-count threshold enforcement. Step 1 added config reading (`readTurnThreshold()`) to `model-config.ts`. This step adds the actual detection logic to the guard.

## What to Build

Extend `src/guards/session-guard.ts` with turn-count tracking and a periodic nudge:

1. **State variable:** One module-level variable — `turnCount` (number, starts at 0) — tracking per-run state. No separate "warning fired" flag needed.
2. **Turn counting on `turn_end`:** On every `turn_end` event when `isActivePioSession` is true, increment `turnCount`. When `turnCount >= turnThreshold`, send a nudge message via `pi.sendUserMessage()` and reset `turnCount = 0`.
3. **Reset on `before_agent_start`:** Alongside the existing `markCompleteCalled = false` reset, also reset `turnCount = 0`. This ensures each new agent run starts fresh.
4. **Threshold resolution:** Read the threshold once at guard setup time (inside `setupSessionGuard`) by calling `readTurnThreshold()` from `src/model-config.ts`. Store in a local constant — config changes require extension reload (acceptable for v1, consistent with existing model config behavior).
5. **Test accessors:** Export `__testSetTurnCount(value?: number): number` following the existing accessor pattern.

### Code Components

**State variable (module-level):**
```typescript
let turnCount = 0;
```

**Nudge message constant:** A string constant for the refinement loop warning, referencing the current turn count and encouraging self-diagnosis: recap goal, evaluate if stuck in a loop, ship work if ready. Use a template literal or string concatenation to include the actual `turnCount` value at send time.

**Modified `turn_end` handler:** After the existing `isActivePioSession` guard check (before the thinking-only detection logic), add turn counting:
- Increment `turnCount` by 1 on each `turn_end` when in a pio session.
- Check `if (turnCount >= turnThreshold)` — if true, send nudge and reset `turnCount = 0`.
- The turn counting should happen for ALL turns in the session (not just thinking-only turns). It must run before or alongside the existing thinking-only detection, not inside it.

**Modified `before_agent_start` handler:** Add `turnCount = 0` to the existing reset block. This ensures each new agent run starts fresh.

**Import:** Import `readTurnThreshold` from `../model-config`. Call it once inside `setupSessionGuard` and store the result in a local constant (e.g., `const turnThreshold = readTurnThreshold()`).

**Test accessor:**
```typescript
export function __testSetTurnCount(value?: number): number { ... }
```
Same getter/setter pattern as `__testSetActiveSession` and `__testSetMarkCompleteCalled`.

### Approach and Decisions

- **Periodic nudges via reset:** After each nudge fires, `turnCount` resets to 0 so the guard can fire again if the agent keeps running past another N turns. This is a deliberate design choice — the agent gets repeated reminders rather than a one-time nudge.
- **Follow existing patterns:** State variables, test accessors, and event handler modifications should mirror the existing code style in `session-guard.ts`. No architectural changes — pure additive logic.
- **Turn counting is independent of thinking-only detection:** The counter increments on every `turn_end` in a pio session, regardless of content type (thinking, text, tool calls). This ensures the turn count reflects total session activity, not just dead turns.
- **Threshold read once at setup:** Call `readTurnThreshold()` inside `setupSessionGuard`, not on every turn. This is consistent with how model config works — config is read at startup, changes require reload. See DECISIONS.md for config validation details.
- **Reference prior decisions from DECISIONS.md:** `readTurnThreshold()` always returns a valid positive integer (double-validation). No need for additional guards on the threshold value itself.

## Dependencies

- **Step 1 (add-turn-threshold-config):** Must be completed first. Step 2 imports `readTurnThreshold` and relies on `DEFAULT_TURN_THRESHOLD` from `src/model-config.ts`.

## Files Affected

- `src/guards/session-guard.ts` — modified: add state variable, modify `turn_end` handler, modify `before_agent_start` handler, import `readTurnThreshold`, add test accessor
- `src/guards/session-guard.test.ts` — modified: add tests for turn-count detection logic

## Acceptance Criteria

- `turnCount` increments by 1 on each `turn_end` when `isActivePioSession` is true.
- When `turnCount` reaches the threshold, `pi.sendUserMessage()` is called with a message containing the turn count and loop-detection language, and `turnCount` resets to 0.
- If the agent continues running past another N turns, the nudge fires again (periodic nudges).
- `before_agent_start` resets `turnCount` to 0 when `isActivePioSession` is true.
- The guard does NOT fire in non-pio sessions (`isActivePioSession` is false).
- Turn counting increments on ALL turns (not just thinking-only turns) — a session with only text responses still counts toward the threshold.
- `__testSetTurnCount()` is exported as a getter/setter accessor following the existing pattern.
- The nudge message uses `{ deliverAs: "followUp" }` consistent with existing recovery prompts and agent-end warnings.
- `npx tsc --noEmit` reports no errors.

## Risks and Edge Cases

- **Module state isolation in tests:** `turnCount` is module-level state shared across test runs. Tests must reset it via the new accessor (or use `beforeEach`) to ensure isolation. The existing test file already resets `isActivePioSession` and `markCompleteCalled` — follow that pattern.
- **`setupSessionGuard` called multiple times:** If `setupSessionGuard` is called again (e.g., during tests), the threshold will be re-read but handlers may stack. This is an existing behavior of the guard — don't change it, just ensure turn-count state resets properly.
- **Turn counting vs thinking-only detection ordering:** Ensure the turn counter increments before or at the same level as the existing thinking-only check. The counter should NOT be nested inside the thinking-only `if` block — it must fire for all assistant turns in a pio session.
- **Threshold boundary:** The nudge fires when `turnCount >= turnThreshold`. If threshold is 12, the nudge fires at turn 12 (not 13), and the counter resets to 0 immediately after. Test this boundary explicitly.
