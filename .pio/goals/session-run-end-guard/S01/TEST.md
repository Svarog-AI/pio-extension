# Tests: Rename turn-guard to session-guard

This verifies that the guard module is correctly renamed from `turn-guard` to `session-guard`, including file renames, function name changes, and import updates.

## Unit Tests

No new unit tests are required — this is a mechanical rename with no behavior changes. All existing 13 tests in `session-guard.test.ts` must continue to pass with identical assertions after updating imports and function references.

## Programmatic Verification

Given the file `src/guards/turn-guard.ts` after the rename when it is checked for existence then it no longer exists on disk.
Given the file `src/guards/turn-guard.test.ts` after the rename when it is checked for existence then it no longer exists on disk.
Given the file `src/guards/session-guard.ts` after the rename when it is checked for existence then it exists with `setupSessionGuard` exported.
Given the file `src/guards/session-guard.test.ts` after the rename when it is checked for existence then it exists and imports from `"./session-guard"`.
Given `src/index.ts` after the rename when it is searched for `setupSessionGuard` then it imports from `./guards/session-guard` and calls `setupSessionGuard(pi)`.
Given the `src/` directory after the rename when grep searches for `turn-guard` or `setupTurnGuard` then no matches are found.
Given the TypeScript project after the rename when `npx tsc --noEmit` is run then it exits with code 0.
Given the test suite after the rename when `npx vitest run` is executed then all tests pass with no regressions.
