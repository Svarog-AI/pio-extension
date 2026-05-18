# Tests: Verify all changes integrate correctly

This is a verification-only step. No new test code is written. Testing consists of running the existing test suite, type checking, and verifying prompt content coherence.

## Programmatic Verification

### Full test suite — no regressions

- **What:** All existing Vitest tests pass. Prompt file changes (markdown only) should not affect any TypeScript test.
- **How:** `npm test` (runs `vitest run`)
- **Expected result:** Exit code 0. All 327+ tests across all test files pass with no failures or errors.

### Type checking — no type errors

- **What:** TypeScript compiler reports no type errors. Prompt file is markdown and doesn't affect compilation, but running check confirms no side effects.
- **How:** `npm run check` (runs `tsc --noEmit`)
- **Expected result:** Exit code 0. No diagnostic output.

### Guardrail presence — explicit table lookup

- **What:** Step 5 contains the "Before classifying" subsection requiring issue-to-table matching.
- **How:** `grep -c "Before classifying: match every issue to the severity table" src/prompts/review-task.md`
- **Expected result:** Count is exactly 1. The format `[issue description] → matches [exact severity category name] because [quote the matching bullet from the rules].` is present in the file.

### Guardrail presence — downgrading language prohibition

- **What:** Step 5 contains the "Prohibited downgrading language" subsection.
- **How:** `grep -c "Prohibited downgrading language" src/prompts/review-task.md`
- **Expected result:** Count is exactly 1. All five banned words ("minor," "harmless," "cosmetic," "small," "test-only") appear in the file within a prohibition context.

### Guardrail presence — common mistakes section

- **What:** Step 5 contains the "Common mistakes to avoid" section with at least 3 rationalization patterns.
- **How:** `grep -c "Common mistakes to avoid" src/prompts/review-task.md`
- **Expected result:** Count is exactly 1. The three patterns are present: dead code in tests (HIGH), unused functions not as style improvements, and severity doesn't change based on production vs test context.

### Guardrail presence — default-reject framing

- **What:** Step 6 begins with a default-reject assumption.
- **How:** `grep -c "start by assuming this review is" src/prompts/review-task.md`
- **Expected result:** Count is exactly 1. The text contains "**REJECTED**" as the starting assumption.

### Default-reject — absence verification checklist

- **What:** Step 6 requires explicit absence verification for each severity level.
- **How:** `grep -n "No critical issues found" src/prompts/review-task.md` and `grep -n "No high issues found" src/prompts/review-task.md` and `grep -n "No medium issues found" src/prompts/review-task.md`
- **Expected result:** All three phrases are present (one line each).

### Default-reject — conclusion phrase

- **What:** Step 6 concludes with "Therefore: APPROVED."
- **How:** `grep -c "Therefore: APPROVED" src/prompts/review-task.md`
- **Expected result:** Count is exactly 1. Appears after the absence verification checklist.

### Existing content preserved — severity classification table

- **What:** The original severity classification reference table is unchanged.
- **How:** `grep -c "Severity Classification Reference" src/prompts/review-task.md`
- **Expected result:** Count is exactly 1. The table rows are present (CRITICAL → REJECT, HIGH → REJECT, MEDIUM → ask_user, LOW → At discretion).

### Existing content preserved — mandatory REJECT conditions

- **What:** Mandatory REJECT conditions for critical/high issues are still present in Step 6.
- **How:** `grep -c "Mandatory REJECT" src/prompts/review-task.md`
- **Expected result:** Count is at least 1. The text references both CRITICAL and HIGH issues.

### Existing content preserved — ask_user for medium issues

- **What:** The `ask_user` requirement for medium-only scenarios is preserved in Step 6.
- **How:** `grep -c "ask_user" src/prompts/review-task.md`
- **Expected result:** Count is at least 1. The text appears in the context of MEDIUM severity.

## Manual Verification

### Prompt coherence review

- **What:** All four guardrails form a logical, non-contradictory pipeline when read sequentially from Step 5 through Step 6.
- **How:** Read `src/prompts/review-task.md` in full. Verify:
  1. Section ordering: severity definitions → reference table → Rules → "Before classifying" subsection → "Prohibited downgrading language" → "Common mistakes to avoid" → Step 6 default-reject framing.
  2. No contradictions: the table lookup requirement (match issues to table) doesn't conflict with default-reject (verify absence of each severity). The downgrading prohibition reinforces rather than duplicates existing rules. Common mistakes examples are consistent with severity table entries.
  3. Tone consistency: all guardrails use authoritative language ("must," "prohibited," "mandatory") consistent with the rest of the prompt.

## Test Order

Execute in this priority:

1. **Programmatic: test suite** (`npm test`) — confirm no regressions first
2. **Programmatic: type checking** (`npm run check`) — confirm no type errors
3. **Programmatic: guardrail presence checks** (grep commands) — confirm all four guardrails are present
4. **Programmatic: content preservation checks** (grep commands) — confirm existing rules are intact
5. **Manual: prompt coherence review** — read full file and verify logical flow
