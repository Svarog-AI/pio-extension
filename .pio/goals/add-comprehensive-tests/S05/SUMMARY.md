# Summary: Test capability config resolution (`capability-config.test.ts`)

## Status
COMPLETED

## Files Created
- `__tests__/capability-config.test.ts` — 21 tests covering `resolveCapabilityConfig(cwd, params)` from `src/utils.ts`

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- Test against real capability modules on disk (no mocking of dynamic imports) — matches production path exactly
- Use simple string `cwd` paths (`"/tmp/proj"`) instead of temp directories since config resolution doesn't perform filesystem I/O
- Suppress `console.warn` in the "unknown capability" test using `vi.spyOn(console, "warn").mockImplementation(() => {})` to keep output clean
- Removed unused `CapabilityConfig` type import (not re-exported from `src/utils`)

## Test Coverage
- **Happy path with static config** (4 tests): create-goal and create-plan resolve correctly; workingDir derives from goalName or falls back to cwd
- **Session name derivation** (3 tests): goal+capability, goal+capability+step, capability-only — all produce expected names via `deriveSessionName`
- **Initial message derivation** (3 tests): default initial messages contain path info; explicit `params.initialMessage` overrides defaults
- **Step-dependent callback resolution** (5 tests): evolve-plan validation/writeAllowlist, execute-task validation/readOnlyFiles, review-code writeAllowlist — all invoke callbacks with correct stepNumber
- **Graceful error handling** (4 tests): missing capability param, undefined params, unknown capability name, sessionParams passthrough
- **Static config passthrough** (2 tests): create-goal validation and writeAllowlist pass through unchanged

All 21 tests pass. `npm run check` (tsc --noEmit) reports no errors. Full suite (5 files, 100 tests) passes with no regressions.
