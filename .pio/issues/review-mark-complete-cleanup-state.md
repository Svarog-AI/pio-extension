# pio_mark_complete should clean up existing review markers before applying a new decision

## Problem

When `pio_mark_complete` runs for a `review-code` session, `applyReviewDecision()` creates `APPROVED` or `REJECTED` markers but never removes the opposite marker first. If an `APPROVED` marker already exists (from a previous approval attempt in the same step) and the agent writes a new `REJECTED` decision, both markers coexist on disk.

The subsequent `validateReviewState()` check then fails because it requires exactly one of `APPROVED`/`REJECTED`:
```
if (approvedExists && rejectedExists) return false;
```

This causes `pio_mark_complete` to error with: "Review state is inconsistent after automation." — forcing manual cleanup of stale markers via bash.

## Reproduction

1. Run review-code for step N, approve it → `S{NN}/APPROVED` created
2. Manually remove `COMPLETED` (or re-run review), change decision to REJECTED in REVIEW.md
3. Call `pio_mark_complete` → fails with inconsistent state because both `APPROVED` and `REJECTED` exist

## Fix

In `applyReviewDecision()` (`src/guards/validation.ts` line ~186), before creating a new marker, remove the opposite one:

```typescript
if (frontmatter.decision === "APPROVED") {
  fs.rmSync(path.join(stepDir, "REJECTED"), { force: true }); // cleanup
  fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
} else {
  fs.rmSync(path.join(stepDir, "APPROVED"), { force: true }); // cleanup
  fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");
  fs.rmSync(path.join(stepDir, "COMPLETED"), { force: true });
}
```

Alternatively, clean up both markers before creating the new one — idempotent and safer for re-runs.

## Category

bug

## Context

File: src/guards/validation.ts, applyReviewDecision() at line ~186-205. Observed during review of Step 2 (elevate-transition-state-machine) where switching from APPROVED to REJECTED left stale APPROVED marker on disk.
