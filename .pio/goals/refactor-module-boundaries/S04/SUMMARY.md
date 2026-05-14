# Summary: Extract `src/capability-config.ts` + update dependent tests

## Status
COMPLETED

## Files Created
- `src/capability-config.ts` — new module containing `resolveCapabilityConfig()` and re-export of `StaticCapabilityConfig`. Imports `resolveGoalDir` and `deriveSessionName` from `./fs-utils`, types from `./types`.

## Files Modified
- `src/utils.ts` — removed `resolveCapabilityConfig` function definition and local imports (`CapabilityConfig`, `StaticCapabilityConfig`, `resolveGoalDir`, `deriveSessionName`). Added re-exports from `./capability-config`. File now contains only re-exports from all four decomposed modules.
- `__tests__/capability-config.test.ts` — updated import: `resolveCapabilityConfig` from `../src/utils` → `../src/capability-config`
- `__tests__/session-capability.test.ts` — updated import: `resolveCapabilityConfig` from `../src/utils` → `../src/capability-config`
- `__tests__/types.test.ts` — updated import: `resolveCapabilityConfig` from `../src/utils` → `../src/capability-config`

## Files Deleted
- (none)

## Decisions Made
- Function body moved verbatim — no behavioral changes, consistent with Steps 1–3 extraction pattern.
- Re-export chain: `utils.ts` → `capability-config.ts` → `types.ts` for `StaticCapabilityConfig`. Double-indirection is intentional for backward compatibility during migration (removed in Step 8).

## Test Coverage
- All 219 tests pass across all 14 test files (zero regressions)
- `capability-config.test.ts`: 21 tests pass — imports from `../src/capability-config`
- `session-capability.test.ts`: 4 tests pass — imports from `../src/capability-config`
- `types.test.ts`: 9 tests pass — imports `resolveCapabilityConfig` from `../src/capability-config`
- `npm run check` reports zero TypeScript errors
