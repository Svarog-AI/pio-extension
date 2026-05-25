# Summary: Propagate skills through config resolution

## Status
COMPLETED

## Files Created
- `src/capabilities/test-skills-cap.ts` — test-only capability module with `skills` defined, used to verify the passthrough in `capability-config.test.ts`
- `src/capability-config.test.ts` — added "resolveCapabilityConfig — skills passthrough" test suite (5 new tests)

## Files Modified
- `src/capability-config.ts` — added `skills: config.skills` to the returned `CapabilityConfig` object in `resolveCapabilityConfig()`

## Files Deleted
- (none)

## Decisions Made
- Created a dedicated test capability module (`test-skills-cap.ts`) instead of modifying real capability configs, to avoid module cache pollution and stay within scope (Step 4 will add skills to real capabilities).
- Skills passthrough is a direct copy (`skills: config.skills`) — no deduplication or merging at this stage (belongs in Step 6).

## User-Requested Changes
- (none)

## Test Coverage
- `skills are copied when the static config defines them` — resolves `test-skills-cap` (has skills) and verifies mandatory + recommended arrays are preserved
- `skills are undefined when the static config does not define them` — resolves `create-plan` (no skills) and verifies `skills` is `undefined`
- `CapabilityConfig type accepts skills field` — compile-time + runtime type verification with both mandatory and recommended
- `CapabilityConfig type accepts skills with only mandatory` — verifies partial skills config
- `CapabilityConfig type accepts skills with only recommended` — verifies partial skills config
- Full suite: 692 tests pass, `npx tsc --noEmit` exits cleanly
