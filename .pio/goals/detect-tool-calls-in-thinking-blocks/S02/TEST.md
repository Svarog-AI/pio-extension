# Tests: Wire turn-guard into the extension entry point

## Unit Tests

No new unit tests are required for this step. The wiring change (import + function call in `index.ts`) is structural — correctness is verified by type checking and programmatic checks. All behavioral logic lives in `turn-guard.ts`, which is already covered by 13 unit tests from Step 1 (`__tests__/turn-guard.test.ts`).

## Programmatic Verification

- **What:** TypeScript compilation succeeds with zero errors after the import and call are added
- **How:** Run `npm run check` (which executes `npx tsc --noEmit`)
- **Expected result:** Exit code 0, no output indicating type errors

- **What:** `setupTurnGuard` is imported from `./capabilities/turn-guard` in `src/index.ts`
- **How:** `grep -n 'setupTurnGuard' src/index.ts`
- **Expected result:** Exactly 2 matches — one import line and one call site (`setupTurnGuard(pi)`)

- **What:** No circular imports between `turn-guard.ts`, `validation.ts`, and `session-capability.ts`
- **How:** Run `grep -n 'from.*capabilities/' src/capabilities/turn-guard.ts`
- **Expected result:** Zero matches — `turn-guard.ts` should not import from other capability files (it only imports from `@earendil-works/pi-coding-agent`)

## Manual Verification

- **What:** Confirm the import and call follow the existing pattern in `src/index.ts`
- **How:** Open `src/index.ts` visually — verify `import { setupTurnGuard } from "./capabilities/turn-guard";` appears near other capability imports, and `setupTurnGuard(pi);` appears near `setupCapability(pi)` / `setupValidation(pi)` calls inside the default export function

## Test Order

1. Programmatic verification (type check, grep checks)
2. Manual verification (visual inspection of import/call placement)
