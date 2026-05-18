# Tests: Add anti-rationalization guardrails to Step 5 (Categorize issues)

This is a prompt-only change. No TypeScript code, tests, or build configuration is modified. Verification relies on programmatic content checks and the existing test suite to confirm no regressions.

## Programmatic Verification

### New subsections exist with required content

- **What:** Explicit table lookup requirement subsection is present
- **How:** `grep -c "matches.*because" src/prompts/review-task.md` (or equivalent pattern matching for the table lookup format)
- **Expected result:** At least 1 match — confirms the subsection contains the issue-to-table matching instruction with the `[issue] → matches [category] because [quote]` format

- **What:** Downgrading language prohibition is present
- **How:** `grep -c "minor" src/prompts/review-task.md && grep -c "harmless" src/prompts/review-task.md && grep -c "cosmetic" src/prompts/review-task.md`
- **Expected result:** Each word appears in a prohibition context (beyond the existing LOW category mention of "cosmetic"). The new prohibition should explicitly list these as banned words. Verify with `grep -n "minor\|harmless\|cosmetic\|small\|test-only" src/prompts/review-task.md` and confirm the new occurrences are in a prohibition/guardrail context, not the original severity definitions.

- **What:** "Common mistakes to avoid" section exists with at least 3 patterns
- **How:** `grep -c "Common mistake" src/prompts/review-task.md`
- **Expected result:** At least 1 match for the section heading. Then verify it contains references to: dead code in tests (HIGH not LOW), unused functions as style improvements, and production-vs-test severity confusion.

### Existing content preserved unchanged

- **What:** Severity reference table is unchanged
- **How:** `grep -c "Severity Classification Reference" src/prompts/review-task.md`
- **Expected result:** Exactly 1 match (the original table heading exists)

- **What:** Rules subsection still present with original rules
- **How:** `grep -c "Critical and high issues must never be ignored" src/prompts/review-task.md`
- **Expected result:** At least 1 match — confirms the original rules are preserved

- **What:** Step 6 approval decision section is unchanged (not modified in this step)
- **How:** `grep -n "Step 6" src/prompts/review-task.md`
- **Expected result:** Step 6 heading exists. Its content should be identical to the original — no default-reject framing yet (that's Step 2).

### Type checking passes

- **What:** No TypeScript type errors introduced by prompt file changes
- **How:** `npm run check`
- **Expected result:** Exit code 0, no type errors

## Existing Test Suite (No Regressions)

- **What:** All existing tests pass unchanged. Prompt content is loaded at runtime — modifying the markdown should not affect test results.
- **How:** `npm test`
- **Expected result:** All tests pass. Specifically, `src/capabilities/review-task.test.ts` and `src/capability-config.test.ts` should pass without modification since they test infrastructure (capability config, step discovery) not prompt content.

## Manual Verification

- **What:** New subsections are placed correctly within Step 5
- **How:** Open `src/prompts/review-task.md`, scroll to Step 5. Verify the three new subsections appear after `#### Rules` and before `### Step 6`. Confirm heading levels use `####` (matching existing Step 5 subsections).

- **What:** Full document reads coherently
- **How:** Read through the complete file from top to bottom. Check that: (a) the new guardrail sections flow naturally after the rules, (b) no existing content was accidentally modified or reformatted, (c) there are no contradictions between new guardrails and existing severity definitions.

## Test Order

1. Programmatic verification — grep checks confirm all required content is present
2. Type checking — `npm run check` passes
3. Existing test suite — `npm test` passes with no regressions
4. Manual verification — review file for correct placement and coherence
