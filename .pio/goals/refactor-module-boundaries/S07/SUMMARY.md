# Summary: Update `src/index.ts` imports

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/index.ts` — Updated two import paths:
  - `"./capabilities/validation"` → `"./guards/validation"` (line 25)
  - `"./capabilities/turn-guard"` → `"./guards/turn-guard"` (line 26)

## Files Deleted
- (none)

## Decisions Made
- None. This was a straightforward import path update with no architectural decisions required.

## Test Coverage
- `grep 'setupValidation' src/index.ts` — confirms `"./guards/validation"` path
- `grep 'setupTurnGuard' src/index.ts` — confirms `"./guards/turn-guard"` path
- `grep -c 'capabilities/validation\|capabilities/turn-guard' src/index.ts` — returns 0 (no old references remain)
- `npm run check` — TypeScript type checking passes with zero errors
- `npm test` — all 14 test files pass (218 tests total)
