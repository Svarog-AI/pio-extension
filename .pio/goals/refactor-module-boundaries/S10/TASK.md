# Task: Final verification — all tests pass

Run the full type check and test suite to verify zero regressions across the entire module boundary refactoring.

## Context

Steps 1–9 have completed a multi-file refactoring that decomposed `src/utils.ts` into four focused modules (`transitions.ts`, `queues.ts`, `fs-utils.ts`, `capability-config.ts`), moved infrastructure files from `src/capabilities/` to `src/guards/`, and updated all imports across 14 capability files, `src/index.ts`, and 13 test files. The three old files (`src/utils.ts`, `src/capabilities/validation.ts`, `src/capabilities/turn-guard.ts`) have been deleted.

This is the final gate: prove that everything compiles and all tests pass with no behavioral changes.

## What to Build

No new code. This step executes two verification commands and confirms results:

1. **TypeScript type check** (`npm run check`) — validates all import paths resolve correctly across the entire refactored module graph.
2. **Full test suite** (`npm test`) — runs all 14 Vitest test files to confirm every symbol is exported/imported correctly and produces identical results.

### Verification Targets

- **Type check:** `tsc --noEmit` must report zero errors across `src/**/*.ts` and `__tests__/**/*.ts`.
- **Test suite:** `vitest run` must execute all 14 test files with zero failures:
  - `transition.test.ts` — transition system + step folder naming
  - `queues.test.ts` — session queue operations (renamed from utils.test.ts queue section)
  - `fs-utils.test.ts` — filesystem helpers, issue utilities, step discovery, session naming (renamed from utils.test.ts fs section)
  - `capability-config.test.ts` — dynamic capability config resolution
  - `validation.test.ts` — validation engine + file protection (import path: `../src/guards/validation`)
  - `turn-guard.test.ts` — turn guard logic (import path: `../src/guards/turn-guard`)
  - `evolve-plan.test.ts` — evolve-plan capability config (imports from `guards/validation` and `capability-config`)
  - `execute-task-initial-message.test.ts` — execute-task initial message construction
  - `review-code-config.test.ts` — review-code configuration
  - `session-capability.test.ts` — session capability setup
  - `smoke.test.ts` — smoke tests with `stepFolderName`
  - `step-discovery.test.ts` — step discovery from `fs-utils`, step folder naming from `transitions`
  - `types.test.ts` — type definitions and `resolveCapabilityConfig`
  - `next-task.test.ts` — next-task logic (imports only from `session-capability`, no changes needed)

### Approach and Decisions

- Run `npm run check` first. If it fails, the test suite will also fail — catch import/type errors before running tests.
- Run `npm test` second. This executes all 14 files via Vitest in a single run (`vitest run`).
- Verify exit codes: both commands must return 0.
- If any test fails, examine the failure output to determine if it's an import path issue (from the refactoring) or a pre-existing flaky test. The goal is zero new failures — identical results to before refactoring.

## Dependencies

All previous steps (1–9) must be completed and approved. Specifically:
- Step 8 must have deleted `src/utils.ts`, `src/capabilities/validation.ts`, and `src/capabilities/turn-guard.ts`.
- Step 9 must have confirmed `evolve-plan.test.ts` imports are correct.

## Files Affected

- None (verification step only — no files created, modified, or deleted)

## Acceptance Criteria

- [ ] `npm run check` reports zero TypeScript errors
- [ ] `npm test` passes — all 14 test files execute with no failures
- [ ] No behavioral changes: identical runtime behavior before and after refactoring

## Risks and Edge Cases

- **Stale imports:** If any file still references `../utils`, `./capabilities/validation`, or `./capabilities/turn-guard`, the type check will fail. Steps 6–9 should have caught all of these, but this is the final confirmation.
- **Circular dependencies:** The module dependency chain is: `transitions` → (none), `queues` → (none), `fs-utils` → `transitions`, `capability-config` → `fs-utils`. If any step introduced a back-edge, Vitest may fail to load modules at runtime even if TypeScript passes.
- **Vitest globals:** Tests rely on `globals: true` in `vitest.config.ts` for `describe`/`it`/`expect`. No changes were made to the config — verify it still works as-is.
