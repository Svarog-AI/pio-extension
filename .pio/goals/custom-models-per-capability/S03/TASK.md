# Task: Verify compilation and backwards compatibility

Run type checking, the full test suite, and backwards-compatibility checks to confirm the custom-models-per-capability feature introduces no regressions.

## Context

Steps 1 and 2 introduced `src/model-config.ts` (new) and modified `src/capabilities/session-capability.ts` (added model-switching logic in `before_agent_start`). This step verifies that all new imports resolve correctly, the TypeScript compiler reports zero errors, and existing behavior is preserved when no `~/.pi/pio-config.yaml` config file exists.

## What to Build

Nothing — this is a verification-only step. The executor must:

1. Run `npm run check` (`tsc --noEmit`) and confirm zero type errors across the full codebase.
2. Run `npm run test` (`vitest run`) and confirm all tests pass with no regressions.
3. Verify backwards compatibility: when no config file exists, sessions inherit the parent's model as before (no `pi.setModel()` call occurs).

### Verification Components

#### Type Checking
- **What:** Compile-time verification of all TypeScript files.
- **How:** Run `npm run check`.
- **Expected:** Zero errors. No new type imports broken. The import of `resolveModelForCapability` from `../model-config` in `session-capability.ts` resolves correctly.

#### Test Suite
- **What:** Full test suite execution including the 20 new tests from Steps 1 and 2 plus all existing tests.
- **How:** Run `npm run test`.
- **Expected:** All 293+ tests pass. No regressions in unrelated test files (`execute-task.test.ts`, `review-code.test.ts`, `fs-utils.test.ts`, etc.).

#### Backwards Compatibility
- **What:** When `~/.pi/pio-config.yaml` doesn't exist, no model switching occurs — sessions behave exactly as before the feature was added.
- **How:** Verify via existing tests (see TEST.md) that cover: no config file returns `undefined`, `capabilityName` undefined skips resolution, prompt injection still works without model switching.
- **Expected:** All backwards-compatibility tests pass.

### Approach and Decisions

This is a verification step. Reference the decisions in `DECISIONS.md` for context on how the feature was implemented. No new code changes are expected — if type errors or test failures occur, they indicate bugs from Steps 1 or 2 that need fixing (not new features to build).

## Dependencies

- Step 1 (`src/model-config.ts`) must be completed and committed.
- Step 2 (`src/capabilities/session-capability.ts` modification) must be completed and committed.

## Files Affected

No files are created or modified in this step. This is a read-only verification step that validates the state of:

- `src/model-config.ts` — verifies it compiles and its tests pass
- `src/capabilities/session-capability.ts` — verifies the import of `resolveModelForCapability` resolves, new logic compiles, and existing + new tests pass
- `src/model-config.test.ts` — verifies all 20 model-config tests pass
- `src/capabilities/session-capability.test.ts` — verifies all 10 backwards-compatibility + model-resolution tests pass (in addition to the existing 6 getSessionGoalName + 4 handleNextTask tests)

## Acceptance Criteria

- [ ] `npm run check` reports zero type errors
- [ ] No other files in `src/` require changes to compile
- [ ] `npm run test` completes successfully with all tests passing (293+ total, zero failures)
- [ ] Backwards compatibility verified: when no config file exists, `resolveModelForCapability` returns `undefined`, no `pi.setModel()` call occurs, and prompt injection continues working as before

## Risks and Edge Cases

- If `npm run check` reports errors, they likely stem from Steps 1 or 2 (e.g., missing type annotations, incorrect import paths). Fix the source issue, don't work around it.
- The vite warning about dynamic imports in `capability-config.ts` is pre-existing (unrelated to this feature) and does not constitute a failure condition.
- If tests fail due to module caching (`vi.resetModules()`), ensure each test properly resets modules — this was addressed in Step 1's tests but could surface if new tests were added incorrectly.
