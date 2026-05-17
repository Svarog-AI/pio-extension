# Summary: Update project-context capability config and descriptions

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/project-context.ts` — Removed dead `createProjectContextTool` stub (and its `defineTool`/`Type` imports). Fixed `defaultInitialMessage` to accept and use `workingDir` parameter. Removed `pi.registerTool()` call from `setupProjectContext`.
- `src/capabilities/project-context.test.ts` — Removed `describe("createProjectContextTool")` test block. Added test verifying `defaultInitialMessage` incorporates `workingDir` into output. Updated `setupProjectContext` mocks to no longer expect `registerTool`.

## Files Deleted
- (none)

## Decisions Made
- **Removed `createProjectContextTool` entirely** — The tool was a useless stub that returned a message telling the AI to use a TUI command it cannot run. Removing it eliminates a misleading tool slot and cleans up unused imports (`defineTool`, `Type` from `typebox`).
- **`defaultInitialMessage` now uses `workingDir`** — The callback signature matches the `StaticCapabilityConfig` type contract: `(workingDir: string, params?: Record<string, unknown>) => string`. The message now includes the full path: `${workingDir}/.pio/PROJECT/`.

## Test Coverage
- 14 tests in `project-context.test.ts`: 9 for `writeAllowlist`, 3 for `defaultInitialMessage` (non-empty, multi-file ref, `workingDir` incorporation), 2 for `setupProjectContext` (command registration, description)
- 2 tests in `capability-config.test.ts`: verify `resolveCapabilityConfig` resolves project-context with 7-file `writeAllowlist` and correct `workingDir` fallback
- All 310 tests in the full suite pass (`npm test`)
- TypeScript compilation passes with no errors (`npm run check`)
