# Task: Add stale marker cleanup to `applyReviewDecision()`

Make `applyReviewDecision()` idempotent by deleting both `APPROVED` and `REJECTED` markers before writing a new one.

## Context

Currently, `applyReviewDecision()` in `src/capabilities/review-task.ts` (lines 26–45) creates `S{NN}/APPROVED` or `S{NN}/REJECTED` but never removes the opposite marker first. If a step was previously approved and the review decision changes to rejected (e.g., via manual REVIEW.md frontmatter edit + re-run of `postValidateReview()`), both markers coexist on disk. This breaks downstream tooling that expects exactly one marker.

The `prepareReviewSession()` hook already performs this cleanup (lines 87–97) but runs only before a review sub-session starts — it does not protect against marker coexistence when `applyReviewDecision()` is called directly or via `postValidateReview()` outside a fresh session.

## What to Build

Add two lines at the top of `applyReviewDecision()` to delete both `APPROVED` and `REJECTED` markers before the existing `if/else` branch that writes the new marker. This makes the function safe to call multiple times with different decisions.

### Code Components

**Modify `applyReviewDecision()` in `src/capabilities/review-task.ts`:**

- At the start of the function (after `fs.mkdirSync(stepDir, ...)` and before the `if (outputs.decision === "APPROVED")` branch), add:
  - `fs.rmSync(path.join(stepDir, "APPROVED"), { force: true });`
  - `fs.rmSync(path.join(stepDir, "REJECTED"), { force: true });`

- The `{ force: true }` option ensures no error is thrown if the marker doesn't exist — same pattern already used by `prepareReviewSession()` in the same file.

- The existing behavior is fully preserved:
  - APPROVED branch: creates `APPROVED`, leaves `COMPLETED` intact.
  - REJECTED branch: creates `REJECTED`, deletes `COMPLETED`.

### Approach and Decisions

- Remove **both** markers, not just the opposite one. This is simpler and safer — it handles edge cases where both might already coexist from a prior bug or manual file creation.
- Follow the exact pattern from `prepareReviewSession()` (same file, lines 93–94): `fs.rmSync(path.join(stepDir, "APPROVED"), { force: true })` and `fs.rmSync(path.join(stepDir, "REJECTED"), { force: true })`.
- No changes to function signature, imports, or exports.

## Dependencies

None. This is Step 1 with no prior steps.

## Files Affected

- `src/capabilities/review-task.ts` — add stale marker cleanup (2 lines) at the start of `applyReviewDecision()`

## Acceptance Criteria

- `npx tsc --noEmit` reports no type errors
- Running existing test suite (`npm test`) passes with no regressions
- `applyReviewDecision()` deletes both `APPROVED` and `REJECTED` before writing a new marker (verifiable by reading the source code — two `fs.rmSync` calls should appear after `fs.mkdirSync` and before the `if (outputs.decision === "APPROVED")` branch)

## Risks and Edge Cases

- The `{ force: true }` flag on `fs.rmSync` handles missing files gracefully — verify this is the pattern used in `prepareReviewSession()` to stay consistent.
- Ensure the cleanup happens **after** `fs.mkdirSync(stepDir, { recursive: true })` so the step directory exists before any file operations.
- Existing tests call `applyReviewDecision()` with a clean step dir (no pre-existing markers) — these must still pass after adding the cleanup lines.
