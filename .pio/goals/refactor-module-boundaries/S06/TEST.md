# Tests: Update all capability files to import from new modules

This step is a purely structural refactoring — no new behavior, no new functions. All verification confirms that import paths are correct and existing code still compiles and runs identically. No new test files are created; existing tests serve as regression proof.

## Programmatic Verification

### TypeScript compilation — `npm run check`

- **What:** Verifies all imports resolve correctly after the refactor
- **How:** Run `npm run check` (which runs `tsc --noEmit`)
- **Expected result:** Zero TypeScript errors. Exit code 0.
- **Why this is the primary gate:** Every broken import produces a compile error immediately. This catches:
  - Importing a symbol from the wrong module (e.g., `stepFolderName` from `../transitions` instead of `../fs-utils`)
  - Typos in import paths
  - Missing exports

### Grep for residual `../utils` imports

- **What:** Confirms zero files in `src/capabilities/` still reference the old barrel file
- **How:** Run `grep -rn 'from ["\x27]\.\.\/utils["\x27]' src/capabilities/`
- **Expected result:** No output (zero matches). Exit code 1 (grep finds nothing).

### Per-file import verification

Verify each file imports from the correct new module:

- **What:** Spot-check critical files that had complex splits or the `stepFolderName` discrepancy
- **How:** Run individual grep checks:
  - `grep 'from ["\x27]\.\.\/fs-utils["\x27]' src/capabilities/evolve-plan.ts` — should match (contains `enqueueTask`, `resolveGoalDir`, `stepFolderName`, `discoverNextStep`)
  - `grep 'from ["\x27]\.\.\/capability-config["\x27]' src/capabilities/evolve-plan.ts` — should match (contains `resolveCapabilityConfig`, `StaticCapabilityConfig`)
  - `grep 'from ["\x27]\.\.\/fs-utils["\x27]' src/capabilities/execute-task.ts` — should match (contains `stepFolderName`)
  - `grep 'from ["\x27]\.\.\/fs-utils["\x27]' src/capabilities/review-code.ts` — should match (contains `stepFolderName`)
  - `grep 'from ["\x27]\.\.\/queues["\x27]' src/capabilities/next-task.ts` — should match (contains `queueDir`, `SessionQueueTask`)
  - `grep 'from ["\x27]\.\.\/fs-utils["\x27]' src/capabilities/session-capability.ts` — should match (contains `discoverNextStep`)
- **Expected result:** Each grep returns exactly one matching line

### Full test suite — `npm test`

- **What:** Regressions check — proves no behavioral changes occurred despite import restructuring
- **How:** Run `npm test` (vitest run)
- **Expected result:** All tests pass with identical results to pre-refactor. 14 test files, ~218 total tests passing. Exit code 0.
- **Scope:** This is a regression suite, not new testing. If imports are correct, the runtime behavior of every capability file is identical — same symbols resolved from the same source modules, just via different import paths.

## Test Order

1. `npm run check` — fast gate; catches broken imports before running tests
2. Grep for residual `../utils` — ensures complete migration (backward-compat re-exports could mask incomplete work)
3. Per-file grep spot-checks — verify the `stepFolderName` discrepancy is handled correctly (`../fs-utils`, not `../transitions`)
4. `npm test` — full regression suite; confirms no behavioral regressions
