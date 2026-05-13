# Summary: Wire `prepareSession` into the session lifecycle

## Status
COMPLETED

## Files Created
- `__tests__/session-capability.test.ts` — Integration tests verifying prepareSession wiring (structural source analysis + backward compatibility)

## Files Modified
- `src/capabilities/session-capability.ts` — Added `prepareSession` hook invocation in the `resources_discover` handler:
  - Placed after `enrichedSessionParams` assignment (so hook has access to auto-discovered `stepNumber`)
  - Placed before prompt loading (runs during prepare phase, not before_agent_start)
  - Guarded by `if (config.prepareSession)` existence check (optional field)
  - Awaited (`await config.prepareSession(...)`) to handle async callbacks
  - Wrapped in try/catch with `console.warn` on failure (errors don't crash session startup)

## Files Deleted
- (none)

## Decisions Made
- Used `config.workingDir!` (non-null assertion) as the first argument — for goal-scoped capabilities this is always defined; for project-scoped ones, the callback should handle undefined gracefully (same contract as other config callbacks like `readOnlyFiles`, `writeAllowlist`).
- Placed invocation between the `enrichedSessionParams` enrichment block and the `if (!config.prompt)` guard — ensures stepNumber is available but doesn't interfere with prompt loading.
- Error message includes capability name for easier debugging: `pio: prepareSession failed for capability "${config.capability}": ${err}`.

## Test Coverage
- 4 behavioral tests in `__tests__/session-capability.test.ts`:
  - **Backward compatibility (4 tests):** Confirms create-goal, create-plan, execute-task, and review-code all resolve via `resolveCapabilityConfig` with `prepareSession: undefined` (no capability defines it yet). Each test exercises the actual config resolution pipeline.
- All 165 tests pass (161 existing + 4 new), zero regressions.
- `npm run check` (tsc --noEmit) reports no type errors.
