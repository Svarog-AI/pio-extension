# Summary: Switch before_agent_start to systemPrompt delivery

## Status
COMPLETED

## Files Created
- `.pio/goals/overview-injected-every-message/S01/COMPLETED` — completion marker
- `.pio/goals/overview-injected-every-message/S01/TEST.md` — post-hoc test coverage record
- `.pio/goals/overview-injected-every-message/S01/SUMMARY.md` — this file

## Files Modified
- `src/capabilities/session-capability.ts` — changed `before_agent_start` handler to return `{ systemPrompt: _event.systemPrompt + "\n\n" + prompts.join("\n\n") }` instead of `{ message: { customType: "pio-capability-instructions", ... } }`; updated comment block to reflect systemPrompt delivery; removed custom message construction

## Files Deleted
- (none)

## Decisions Made
- Used `_event.systemPrompt + "\n\n" + prompts.join("\n\n")` to preserve pi's base prompt (last-writer-wins semantics in runner.js:728-729)
- Removed `message` field entirely — no dual-delivery
- Kept early return `if (prompts.length === 0) return` unchanged
- Model-switching logic left intact — references same `result` variable
- Existing tests that assert `result.message` are expected to fail; Step 2 will update them

## User-Requested Changes
- (none)

## Test Coverage
- TypeScript compilation (`npx tsc --noEmit`) passes with no errors
- 31 of 36 existing tests still pass (model resolution, queue propagation, skill building, etc.)
- 5 tests fail as expected — they assert `result.message?.customType` which no longer exists (Step 2 will update)
- Acceptance criteria verified programmatically: systemPrompt prefix, no message field, early return preserved, model-switching intact, injection order preserved
