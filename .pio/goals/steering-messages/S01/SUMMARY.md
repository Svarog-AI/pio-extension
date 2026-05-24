# Summary: Swap deliverAs from "followUp" to "steer" for turn_end guards

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/guards/session-guard.ts` — changed `deliverAs` from `"followUp"` to `"steer"` on agent loop nudge (line ~139) and thinking-only recovery (line ~150)
- `src/model-config.ts` — changed `DEFAULT_TURN_THRESHOLD` from `12` to `15`
- `src/guards/session-guard.test.ts` — renamed nudge test to reference `"steer"`, updated assertion; added `deliverAs: "steer"` assertion to recovery test; updated all hardcoded threshold values (12→15, 24→30, 11→14); renamed boundary test
- `src/model-config.test.ts` — updated `DEFAULT_TURN_THRESHOLD` test from `equals 12` to `equals 15`

## Files Deleted
- (none)

## Decisions Made
- The `agent_end` handler remains unchanged with `deliverAs: "followUp"` as specified — no runtime difference at `agent_end` but preserves semantic clarity
- Updated `src/model-config.test.ts` which was not listed in TASK.md's "Files Affected" but had a hardcoded assertion for the old threshold value

## User-Requested Changes
- (none)

## Test Coverage
- All 674 tests pass across 23 test files
- `npx tsc --noEmit` reports no type errors
- Nudge test renamed to `"nudge message uses { deliverAs: \"steer\" }"` and asserts `{ deliverAs: "steer" }`
- Recovery test asserts `sendUserMessageCalls[0].options` equals `{ deliverAs: "steer" }`
- `agent_end` handler test still asserts `{ deliverAs: "followUp" }` (unchanged)
- Nudge fires at turn 15 (updated from 12), periodic nudges fire every 15 turns (30 turns = 2 nudges)
- `DEFAULT_TURN_THRESHOLD` test updated to assert value equals 15
