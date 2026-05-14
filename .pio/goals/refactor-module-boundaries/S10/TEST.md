# Tests: Final verification — all tests pass

No new test code is written in this step. The task is to execute the existing test suite and type check, verifying zero regressions from the refactoring.

## Programmatic Verification

### TypeScript type check

- **What:** All TypeScript files compile with zero type errors after the module boundary refactoring
- **How:** `npm run check` (runs `tsc --noEmit`)
- **Expected result:** Exit code 0, no error output

### Full test suite — all 14 test files

- **What:** All existing Vitest tests pass with identical results as before refactoring
- **How:** `npm test` (runs `vitest run`, which discovers `__tests__/**/*.test.ts`)
- **Expected result:** Exit code 0, all tests pass, no failures or errors

### Per-test-file verification (subset of `npm test` output)

Each of these should appear as passing in the Vitest output:

- `transition.test.ts` — verifies symbols from `../src/transitions`: `TransitionContext`, `TransitionResult`, `CAPABILITY_TRANSITIONS`, `resolveNextCapability()`, `stepFolderName()`
- `queues.test.ts` — verifies symbols from `../src/queues`: `SessionQueueTask`, `queueDir()`, `enqueueTask()`, `readPendingTask()`, `listPendingGoals()`, `writeLastTask()`
- `fs-utils.test.ts` — verifies symbols from `../src/fs-utils`: `resolveGoalDir()`, `goalExists()`, `issuesDir()`, `findIssuePath()`, `readIssue()`, `discoverNextStep()`, `deriveSessionName()`
- `capability-config.test.ts` — verifies `resolveCapabilityConfig()` from `../src/capability-config` and `StaticCapabilityConfig` from `../src/types`
- `validation.test.ts` — verifies symbols from `../src/guards/validation`: `validateOutputs()`, file protection logic, `pio_mark_complete` tool
- `turn-guard.test.ts` — verifies symbols from `../src/guards/turn-guard`: `isThinkingOnlyTurn()`, `__testSetActiveSession()`
- `evolve-plan.test.ts` — imports `validateOutputs` from `../src/guards/validation` and `resolveCapabilityConfig` from `../src/capability-config`
- `execute-task-initial-message.test.ts` — imports `stepFolderName` from `../src/transitions`
- `review-code-config.test.ts` — imports `stepFolderName` from `../src/transitions`
- `session-capability.test.ts` — imports `resolveCapabilityConfig` from `../src/capability-config`
- `smoke.test.ts` — imports `stepFolderName` from `../src/transitions`
- `step-discovery.test.ts` — imports `discoverNextStep` from `../src/fs-utils` and `stepFolderName` from `../src/transitions`
- `types.test.ts` — imports `resolveCapabilityConfig` from `../src/capability-config` and `StaticCapabilityConfig` from `../src/types`
- `next-task.test.ts` — imports only from `session-capability` (no module boundary changes)

### No stale import references

- **What:** Confirm no file in `src/` or `__tests__/` still references the old module paths (`utils`, `capabilities/validation`, `capabilities/turn-guard`)
- **How:** `grep -r "from.*['\"].*utils['\"]" src/ __tests__/` and `grep -r "from.*['\"].*capabilities/validation['\"]" src/ __tests__/` and `grep -r "from.*['\"].*capabilities/turn-guard['\"]" src/ __tests__/`
- **Expected result:** Each grep returns exit code 1 (no matches)

### Old files are deleted

- **What:** Confirm the three old files no longer exist on disk
- **How:** `test -f src/utils.ts && echo "EXISTS" || echo "DELETED"` and same for `src/capabilities/validation.ts` and `src/capabilities/turn-guard.ts`
- **Expected result:** All three report "DELETED"

## Test Order

1. Run stale import grep checks first (fast, catches obvious issues before expensive type check)
2. Run old file deletion checks (fast)
3. Run `npm run check` (TypeScript compilation — catches type/import errors)
4. Run `npm test` (full Vitest suite — validates runtime behavior)

Execute in this priority: static checks → type check → test suite. If any step fails, stop and report the specific error rather than continuing.
