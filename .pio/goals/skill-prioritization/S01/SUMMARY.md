# Summary: Add `skills` field to types

## Status
COMPLETED

## Files Created
- `src/types.test.ts` — 13 unit tests verifying `CapabilitySkills`, `StaticCapabilityConfig.skills`, and `CapabilityConfig.skills` type correctness
- `S01/TEST.md` — test specification with 10 unit test cases and 2 programmatic verification checks

## Files Modified
- `src/types.ts` — added `CapabilitySkills` interface (with `mandatory?: string[]` and `recommended?: { name: string; condition: string }[]`); added optional `skills?: CapabilitySkills` field to both `StaticCapabilityConfig` and `CapabilityConfig`

## Files Deleted
- (none)

## Decisions Made
- Placed `CapabilitySkills` interface in the "Capability config types" section, before both interfaces that reference it
- Both fields on `CapabilitySkills` are optional — a capability can declare only mandatory, only recommended, or neither
- The `skills` field is optional on both config interfaces for full backward compatibility
- No runtime logic added — pure type declarations only (Steps 2–3 handle propagation and injection)

## User-Requested Changes
- (none)

## Test Coverage
- 13 new tests in `src/types.test.ts` covering:
  - `CapabilitySkills` importability, mandatory-only, recommended-only, both, empty object
  - `mandatory` is an optional string array
  - `recommended` contains objects with `name` and `condition` string fields
  - `StaticCapabilityConfig` with and without `skills` field (backward compatibility)
  - `CapabilityConfig` with and without `skills` field (backward compatibility)
- Full suite: 687 tests pass (was 674, +13 new), 0 regressions
- `npx tsc --noEmit` exits with code 0
