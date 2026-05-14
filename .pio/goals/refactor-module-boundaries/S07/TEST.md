# Tests: Update `src/index.ts` imports

## Programmatic Verification

- **What:** `setupValidation` imports from the new guards path
  - **How:** `grep 'setupValidation' src/index.ts`
  - **Expected result:** Output contains `"./guards/validation"`, not `"./capabilities/validation"`

- **What:** `setupTurnGuard` imports from the new guards path
  - **How:** `grep 'setupTurnGuard' src/index.ts`
  - **Expected result:** Output contains `"./guards/turn-guard"`, not `"./capabilities/turn-guard"`

- **What:** No remaining references to old paths in `src/index.ts`
  - **How:** `grep -c 'capabilities/validation\|capabilities/turn-guard' src/index.ts`
  - **Expected result:** Exit code 1 (no matches) or count of `0`

- **What:** TypeScript type checking passes with zero errors
  - **How:** `npm run check`
  - **Expected result:** Zero exit code, no error output

## Test Order

Run in this order: grep verification first (fast smoke checks), then `npm run check` (full type validation).
