# Summary: Step 2 — Wire model switching into `before_agent_start`

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/session-capability.ts` — Added import of `resolveModelForCapability` from `../model-config`, added module-level `capabilityName` variable captured during `resources_discover`, and added model-switching logic in the `before_agent_start` handler. The handler now resolves the configured model per capability, looks it up via `ctx.modelRegistry.find()`, compares against the current model to skip redundant switches, and calls `pi.setModel()` when a switch is needed.
- `src/capabilities/session-capability.test.ts` — Added top-level `vi.mock("../model-config")` for testable resolution, plus two new describe blocks: "model resolution — setupCapability and before_agent_start" (6 tests) and "model resolution — backwards compatibility" (2 tests). Tests verify setModel is called correctly, skipped when matching, skipped when capabilityName/registry/model are missing, and that existing behavior is preserved.

## Files Deleted
- (none)

## Decisions Made
- Guarded against `ctx.modelRegistry` being undefined (`if (capabilityName && ctx.modelRegistry)`) to handle edge cases where the handler fires without a proper context (e.g., during certain test scenarios or non-capability sessions).
- Model resolution runs after prompt injection but before returning from `before_agent_start`. The return value (prompt injection message) is computed first, then model switching happens alongside it. This ensures both operations complete in a single handler invocation.
- Used `ctx.model?.provider` and `ctx.model?.id` for safe property access when comparing against the resolved target model.

## Test Coverage
- 8 new unit tests added (18 total in session-capability.test.ts):
  - `calls pi.setModel() when config has a model override` — verifies the happy path: resolution → registry lookup → setModel call
  - `skips pi.setModel() when current model already matches` — no redundant calls
  - `skips resolution when capabilityName is undefined` — non-capability sessions unaffected
  - `skips setModel() when resolveModelForCapability returns undefined` — no config = no change
  - `skips setModel() when modelRegistry.find() returns undefined and logs warning` — graceful degradation
  - `capabilityName is captured from config.capability during resources_discover` — indirect verification via mock call args
  - `no setModel call when config returns undefined (no config file)` — backwards compatibility
  - `prompt injection still works alongside model resolution` — no interference with existing behavior
- Full test suite: 293 tests pass across 12 test files
- TypeScript compilation: zero errors (`npm run check`)
