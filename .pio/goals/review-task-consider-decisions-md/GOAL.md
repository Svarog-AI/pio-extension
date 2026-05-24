# Review Task Should Consider DECISIONS.md and SUMMARY.md User-Requested Changes

The `review-task` capability should read and consider two additional sources of context when reviewing a step implementation: (1) `DECISIONS.md` for Step 2+, which documents accumulated architectural decisions from prior steps, and (2) the **User-Requested Changes** section of `SUMMARY.md`, which records explicit user feedback applied during implementation. This ensures the reviewer can verify implementations align with all decisions made during the goal lifecycle — not just the original PLAN.md and TASK.md.

## Current State

The `review-task` capability reviews step implementations by reading a fixed set of read-only files: `GOAL.md`, `PLAN.md`, `TASK.md`, `TEST.md`, and `SUMMARY.md` from the step folder. This is configured in `resolveReviewReadOnlyFiles()` at `src/capabilities/review-task.ts` (line ~72), which returns these files unconditionally regardless of step number.

The `review-task.md` prompt (`src/prompts/review-task.md`) instructs the review agent to read TASK.md, TEST.md, and SUMMARY.md in Step 2, then analyze implementation files. There is no mention of `DECISIONS.md`.

Meanwhile, other capabilities already handle `DECISIONS.md`:
- **`evolve-plan.ts`** (`src/capabilities/evolve-plan.ts`) — defines `DECISIONS_FILE = "DECISIONS.md"` and conditionally includes it in validation files and write allowlist when `stepNumber > 1`. The conditional pattern is: collect prior step's DECISIONS.md, include the current step folder's DECISIONS.md for Step 2+.
- **`execute-task.md`** (`src/prompts/execute-task.md`, line ~40) — Step 2 instructs the agent to read `DECISIONS.md` when present (Step 2+), treating it as supplementary context for accumulated architectural decisions. The prompt notes: "For Step 1 (`S01/`), this file will not exist; proceed using only `TASK.md`."
- **`finalize-goal.md`** (`src/prompts/finalize-goal.md`, line ~52) — reads all DECISIONS.md files to accumulate decisions across the goal lifecycle.

The reviewer has no visibility into decisions made during specification (evolve-plan), implementation (execute-task), or user feedback during the execute-task session. When a step deviates from the original plan — e.g., file placements change, new abstractions are introduced — these deviations are documented in `DECISIONS.md` but the reviewer cannot see them. This can cause false-positive rejections when the reviewer compares implementation against PLAN.md alone.

Additionally, `SUMMARY.md` includes a **User-Requested Changes** section (see `src/prompts/execute-task.md`, Step 9) where the execute-task agent records changes explicitly requested by the user during the implementation session — for example: "can you also do X", "merge this file into another". The reviewer reads SUMMARY.md but has no instructions to treat these user-requested changes as valid justification for deviations from TASK.md. This means legitimate user-approved changes can be incorrectly flagged as scope creep or accidental modifications.

## To-Be State

### `src/capabilities/review-task.ts`

Add `DECISIONS.md` to `resolveReviewReadOnlyFiles()` conditionally for Step 2+, following the same pattern as `evolve-plan.ts`. The function should:
- Define `DECISIONS_FILE = "DECISIONS.md"` as a constant (or import/shared with evolve-plan if appropriate).
- When `stepNumber > 1`, include `${folder}/DECISIONS.md` in the returned read-only files array.
- When `stepNumber === 1`, exclude it (file does not exist for Step 1).

### `src/prompts/review-task.md`

Update Step 2 ("Read TASK.md, TEST.md, and SUMMARY.md") to cover both DECISIONS.md and user-requested changes:
- Add a paragraph explaining that `S{NN}/DECISIONS.md` may exist alongside other step files for Step 2+.
- Explain it contains accumulated architectural decisions from preceding steps — file placement changes, departures from the original plan, interface choices.
- Instruct the reviewer to treat it as supplementary context for evaluating whether implementation aligns with actual decisions made during the goal lifecycle.
- Note that for Step 1 (`S01/`), this file will not exist; proceed using only TASK.md.
- Add instructions regarding SUMMARY.md's **User-Requested Changes** section: when present, treat listed changes as explicit user-approved scope extensions. The reviewer should NOT flag files or behaviors introduced by these changes as unauthorized modifications (HIGH severity). Instead, verify they were applied correctly and note them in the review.

Update the alignment check section (currently checks GOAL ↔ PLAN, PLAN ↔ TASK, TASK ↔ TESTS, TASK ↔ Implementation) to add two new alignment dimensions:
- **TASK ↔ DECISIONS** — verify that architectural decisions and plan deviations documented in `DECISIONS.md` are respected by the implementation.
- **TASK ↔ User-Requested Changes** — when SUMMARY.md's "User-Requested Changes" section lists changes, treat those changes as explicit scope extensions approved by the user. The reviewer should not flag files or behaviors introduced solely by user-requested changes as "accidental changes to unrelated files" (HIGH) or scope creep. Instead, verify that the user-requested change was applied correctly and document it in the review.

### `src/capabilities/review-task.test.ts`

Add tests verifying the conditional `DECISIONS.md` inclusion in `readOnlyFiles`:
- For Step 1 (`stepNumber: 1`): `DECISIONS.md` should NOT appear in read-only files.
- For Step 2+ (`stepNumber: 2` and higher): `DECISIONS.md` SHOULD appear in read-only files.

Follow the existing test patterns in `src/capabilities/evolve-plan.test.ts` (line ~132) which tests the same conditional logic for evolve-plan, and the existing review-task config tests that already verify `readOnlyFiles` composition.

### No changes to other files

This goal does not modify `evolve-plan.ts`, `execute-task.ts`, `execute-task.md`, `finalize-goal.md`, or any other capability. The scope is strictly limited to the review-task capability and prompt.
