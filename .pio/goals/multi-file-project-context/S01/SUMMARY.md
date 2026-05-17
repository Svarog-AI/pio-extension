# Summary: Update session loader to read `.pio/PROJECT/OVERVIEW.md`

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/session-capability.ts` — Extracted `resolveProjectContextPath(cwd: string): string` as a pure exported function that returns `.pio/PROJECT/OVERVIEW.md`. Updated `before_agent_start` handler to call this function instead of inline `path.join`.
- `src/capabilities/session-capability.test.ts` — Added `resolveProjectContextPath` import. Replaced complex integration tests (with `vi.resetModules()` + fs mocking) with simple unit tests for the extracted function. Moved `getSessionGoalName` import to top of file.

## Files Deleted
- (none)

## Decisions Made
- Extracted path resolution into a pure exported function `resolveProjectContextPath` instead of keeping it inline. This avoids the module-level `projectContext` cache leaking between tests (which required complex `vi.resetModules()` + fs spying).
- The `before_agent_start` handler still uses the module-level `projectContext` cache — only the path resolution was extracted. This preserves the "read once per session" behavior.

## Test Coverage
- `resolveProjectContextPath` unit tests verify the correct path is returned (`.pio/PROJECT/OVERVIEW.md`) and that `path.join` is used for cross-platform separators.
- All 20 existing tests continue to pass, including model resolution, `getSessionGoalName`, and `handleNextTask` tests.
