# Summary: Wire turn-guard into the extension entry point

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/index.ts` — added `import { setupTurnGuard } from "./capabilities/turn-guard";` and called `setupTurnGuard(pi)` in the default export function

## Files Deleted
- (none)

## Decisions Made
- Placed import alongside `setupCapability` and `setupValidation` imports (line 26) to keep session-level handlers grouped together.
- Placed `setupTurnGuard(pi)` call after `setupCapability(pi)` and `setupValidation(pi)` (line 48) within the "Shared session capability handlers" block, maintaining logical grouping with other session-wide event handler registrations.

## Test Coverage
- No new unit tests required (wiring change — behavioral logic tested in Step 1's `__tests__/turn-guard.test.ts` with 13 tests).
- Verification:
  - `npm run check` (`tsc --noEmit`) passes with zero type errors
  - `grep -n 'setupTurnGuard' src/index.ts` returns exactly 2 matches (import + call)
  - `grep -n 'from.*capabilities/' src/capabilities/turn-guard.ts` returns zero matches (no circular imports)
