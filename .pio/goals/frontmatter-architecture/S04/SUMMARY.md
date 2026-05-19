# Summary: Standardize all lifecycle hooks in types (`types.ts`)

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/types.ts` — added `PostValidateCallback` and `PostExecuteCallback` types; added `postValidate` and `postExecute` optional fields to both `StaticCapabilityConfig` and `CapabilityConfig`; added lifecycle documentation block comment documenting all four phases (PreValidate, Prepare, PostValidate, PostExecute)
- `src/capability-config.test.ts` — added 13 new type verification tests for `PostValidateCallback`, `PostExecuteCallback`, `StaticCapabilityConfig.postValidate/postExecute`, and `CapabilityConfig.postValidate/postExecute`

## Files Deleted
- (none)

## Decisions Made
- Followed existing naming convention: `PrepareSessionCallback` → `PostValidateCallback`, `PostExecuteCallback`
- Both callback types are exported so consumers can reference them directly
- Lifecycle documentation block comment placed between callback type definitions and `StaticCapabilityConfig` for maximum visibility
- `PostValidateCallback` is synchronous (returns `{ success: boolean; message?: string }`) — validation should be fast I/O or pure logic
- `PostExecuteCallback` may be async (`void | Promise<void>`) — may need to perform I/O like writing marker files

## Test Coverage
- 13 new tests added to `src/capability-config.test.ts`:
  - `PostValidateCallback`: 3 tests (sync signature, success false with message, success true without message)
  - `PostExecuteCallback`: 2 tests (sync signature, async returning Promise<void>)
  - `StaticCapabilityConfig.postValidate and postExecute`: 5 tests (optional, accepts callback, sync postExecute, async postExecute, return type with success boolean)
  - `CapabilityConfig.postValidate and postExecute`: 3 tests (optional, accepts postValidate callback, accepts postExecute callback)
- All 360 tests pass (347 original + 13 new)
- `npx tsc --noEmit` reports zero errors
- Both types are exported exactly once from `src/types.ts`
