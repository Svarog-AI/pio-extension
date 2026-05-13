# Summary: Simplify write allowlist and add `prepareSession` for review-code

## Status
COMPLETED

## Files Created
- `__tests__/review-code-config.test.ts` — 12 unit tests covering `resolveReviewWriteAllowlist` (3 tests) and `CAPABILITY_CONFIG.prepareSession` (9 tests)

## Files Modified
- `src/capabilities/review-code.ts` — Removed `APPROVED` from `resolveReviewWriteAllowlist` return value (now returns only `REVIEW.md`). Added `prepareReviewSession` function that deletes stale `APPROVED` and `REJECTED` markers on startup. Wired it into `CAPABILITY_CONFIG.prepareSession`.
- `__tests__/capability-config.test.ts` — Updated test to expect REVIEW.md-only allowlist (no longer asserts APPROVED is present).
- `__tests__/session-capability.test.ts` — Updated test to expect review-code has `prepareSession` defined (was previously undefined).
- `__tests__/types.test.ts` — Updated test to expect review-code specifically has `prepareSession` while all other capabilities remain undefined.

## Files Deleted
- (none)

## Decisions Made
- Named the standalone function `prepareReviewSession` to follow the existing naming convention (`resolveReviewValidation`, `resolveReviewReadOnlyFiles`, etc.).
- Used `fs.rmSync` with `{ force: true }` for marker deletion — no error if file doesn't exist.
- Throws a descriptive error matching other review-code callbacks when `stepNumber` is missing from params.
- Does NOT delete `COMPLETED`, `REVIEW.md`, or any other files — only `APPROVED` and `REJECTED`.

## Test Coverage
- 12 new unit tests in `__tests__/review-code-config.test.ts` (all pass):
  - Write allowlist returns only REVIEW.md path, excludes APPROVED, throws on missing stepNumber
  - prepareSession is defined as a function, deletes APPROVED/REJECTED markers, preserves COMPLETED and REVIEW.md, handles missing markers gracefully, throws on missing stepNumber, uses zero-padded folder names
- 3 existing tests updated to reflect new behavior (all pass)
- Full suite: 187 tests across 13 files — all passing
- `npm run check` (TypeScript compilation) — no errors
