# review-task should consider SUMMARY.md and DECISIONS.md

The `review-task` capability should read and consider `DECISIONS.md` alongside `SUMMARY.md` when reviewing a step implementation.

## Current behavior

- `SUMMARY.md` is already in `readOnlyFiles` and mentioned in the prompt — reviewer reads it.
- `DECISIONS.md` (produced by `evolve-plan` for Step 2+) is **not** loaded as a read-only file and is **not** mentioned in the `review-task.md` prompt.

## Expected behavior

For Step 2+, the reviewer should read `S{NN}/DECISIONS.md` to understand accumulated architectural decisions, plan deviations, and file placement changes before evaluating the implementation. This ensures the reviewer can verify the implementation aligns with the actual decisions made during the goal lifecycle, not just the original plan.

## Changes required

1. **`src/capabilities/review-task.ts`** — Add `DECISIONS.md` to `resolveReviewReadOnlyFiles` for Step 2+ (same pattern as `evolve-plan.ts` which conditionally includes it for `stepNumber > 1`).

2. **`src/prompts/review-task.md`** — Add instructions in Step 2 to read `DECISIONS.md` when present (Step 2+). Add an alignment check for decisions: verify the implementation respects the architectural decisions and plan deviations documented in `DECISIONS.md`.

3. **`src/capabilities/review-task.test.ts`** — Add tests for the conditional `DECISIONS.md` inclusion in `readOnlyFiles` (excluded for Step 1, included for Step 2+).

## References

- `src/capabilities/evolve-plan.ts:21` — `DECISIONS_FILE` constant and conditional inclusion logic
- `src/capabilities/evolve-plan.test.ts:132` — Tests for conditional `DECISIONS.md` handling
- `src/prompts/execute-task.md:40` — How `execute-task` already handles `DECISIONS.md`
- `src/prompts/finalize-goal.md:52` — How `finalize-goal` uses `DECISIONS.md`

## Category

improvement

## Context

File: src/capabilities/review-task.ts — `resolveReviewReadOnlyFiles` at line ~63 does not include DECISIONS.md. Prompt: src/prompts/review-task.md — Step 2 mentions TASK.md, TEST.md, SUMMARY.md but not DECISIONS.md.
