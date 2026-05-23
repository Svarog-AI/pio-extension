# Summary: Add turn-count detection to session-guard

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/guards/session-guard.ts` — added `turnCount` state variable, turn-count tracking in `turn_end` handler (increments on every pio session turn, sends nudge at threshold and resets), `turnCount` reset in `before_agent_start`, `readTurnThreshold` import and threshold resolution at setup time, `__testSetTurnCount` test accessor
- `src/guards/session-guard.test.ts` — added 13 test cases covering turn counting, nudge firing, periodic nudges, session scoping, before_agent_start reset, non-thinking turn counting, accessor getter/setter, and threshold boundary

## Files Deleted
- (none)

## Decisions Made
- **Periodic nudges via counter reset:** After each nudge fires, `turnCount` resets to 0 so the guard can fire again if the agent keeps running. This provides repeated reminders rather than a one-time nudge.
- **Turn counting before thinking-only detection:** The counter increments at the top of the `turn_end` handler (after the `isActivePioSession` guard) so it counts ALL turns regardless of content type.
- **Threshold read once at setup:** `readTurnThreshold()` is called inside `setupSessionGuard` and stored in a local constant. Consistent with existing model config pattern.
- **Nudge message content:** Includes the actual turn count value and encourages self-diagnosis: recap goal, evaluate if stuck in a loop, ship work if ready.

## Test Coverage
- 13 new test cases in `session-guard.test.ts`, all passing:
  - `turnCount` increments on `turn_end` when in pio session
  - `turnCount` does NOT increment outside pio sessions
  - Nudge fires at threshold (12 turns with default config)
  - `turnCount` resets to 0 after nudge
  - Nudge uses `{ deliverAs: "followUp" }`
  - Periodic nudges fire again after reset (24 turns → 2 nudges)
  - No nudge below threshold (11 turns → 0 nudges)
  - `before_agent_start` resets `turnCount` in pio sessions
  - `before_agent_start` does NOT reset outside pio sessions
  - Turn counting works for text-only (non-thinking) turns
  - `__testSetTurnCount` getter/setter accessor
  - Threshold boundary fires at exact turn count (not +1)
- Full test suite: 675 tests pass across 23 files
- TypeScript compilation: `npx tsc --noEmit` exits with code 0
