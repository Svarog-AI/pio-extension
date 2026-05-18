# Task: Verify all changes integrate correctly

Final verification that the four prompt guardrails from Steps 1 and 2 work together as a coherent, non-contradictory set of instructions in `src/prompts/review-task.md`.

## Context

Steps 1 and 2 modified `src/prompts/review-task.md` to add anti-rationalization guardrails:
- **Step 1** added three subsections to Step 5: explicit table lookup requirement, downgrading language prohibition, and common mistakes section.
- **Step 2** rewrote Step 6 to use default-reject framing with explicit absence verification.

No TypeScript code or build configuration was changed — only the prompt file content. This step confirms all four changes coexist correctly, don't contradict each other, and produce no regressions in the test suite.

## What to Build

This is a **verification-only step**. No files are created, modified, or deleted. The task consists of three verification activities:

1. **Run the full test suite** — confirm all existing tests pass with no regressions from the prompt file changes.
2. **Run type checking** — confirm `npm run check` reports no type errors.
3. **Review prompt coherence** — read `src/prompts/review-task.md` in its entirety and verify that all four guardrails are present, properly ordered, and non-contradictory.

### Verification Checklist

Verify the following conditions in `src/prompts/review-task.md`:

1. **Step 5 contains the explicit table lookup subsection** — `#### Before classifying: match every issue to the severity table` with the `[issue] → matches [category] because [quote]` format.
2. **Step 5 contains the downgrading language prohibition** — `#### Prohibited downgrading language` listing banned words: "minor," "harmless," "cosmetic," "small," "test-only."
3. **Step 5 contains the common mistakes section** — `#### Common mistakes to avoid` with at least 3 specific rationalization patterns (dead code in tests, unused-as-style, production-vs-test severity confusion).
4. **Step 6 uses default-reject framing** — begins with "start by assuming this review is **REJECTED**" and requires explicit absence verification for each severity level before approving.
5. **No contradictions between guardrails** — the table lookup requirement in Step 5 doesn't conflict with the default-reject framing in Step 6. The downgrading prohibition doesn't override or duplicate existing rules. The common mistakes section reinforces rather than contradicts the severity classification table.
6. **Existing severity classification table is preserved unchanged** — CRITICAL/HIGH/MEDIUM/LOW definitions and reference table are intact from the original file.

## Approach and Decisions

- Use `npm test` to run the full Vitest suite (327 expected tests across 14 files). Confirm exit code 0.
- Use `npm run check` to run TypeScript type checking (`tsc --noEmit`). Confirm exit code 0.
- Read `src/prompts/review-task.md` in full and manually verify coherence. Check section ordering: Step 5 severity definitions → reference table → Rules → new guardrail subsections → Step 6 default-reject framing → Step 7 REVIEW.md format.
- Verify that the four guardrails form a logical pipeline: Step 5 forces explicit matching (table lookup) → prohibits rationalization language → calls out common mistakes → Step 6 enforces default-reject with absence verification.

## Dependencies

- Step 1 must be completed (guardrail subsections added to Step 5).
- Step 2 must be completed (default-reject framing applied to Step 6).

## Files Affected

- (verification only — no file changes)

## Acceptance Criteria

- [ ] `npm run test` passes with no regressions (all existing tests pass)
- [ ] `npm run check` reports no type errors
- [ ] Review of `src/prompts/review-task.md` confirms all four guardrails are present and non-contradictory: explicit table lookup, downgrading ban, common mistakes section, and default-reject framing

## Risks and Edge Cases

- If the test suite count differs from 327 tests (e.g., new tests were added by unrelated work), that's acceptable as long as all tests pass.
- The prompt file is loaded at runtime by `session-capability.ts` — no compile-time validation exists for prompt content itself. Type checking verifies TypeScript code, not markdown content. Content correctness must be verified by reading the file.
