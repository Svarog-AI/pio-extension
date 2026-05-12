# Tests: Update `evolve-plan.md` with TDD skill reference

No test runner is configured in this project; relying on programmatic verification (grep, file inspection) and manual review.

## Programmatic Verification

- **Skill reference present:**
  - **What:** `test-driven-development` is referenced in evolve-plan.md
  - **How:** `grep -c 'test-driven-development' src/prompts/evolve-plan.md`
  - **Expected result:** Returns `1` (exactly one reference)

- **Reference located near TEST.md section:**
  - **What:** The skill mention appears in proximity to the Write TEST.md / Step 6 section
  - **How:** `grep -n 'test-driven-development' src/prompts/evolve-plan.md` and `grep -n 'TEST.md\|Write TEST' src/prompts/evolve-plan.md`; compare line numbers — they should be within ~10 lines of each other
  - **Expected result:** Line numbers are close (within the same section)

- **Relevant TDD principles mentioned:**
  - **What:** The reference mentions key principles relevant to test specification
  - **How:** `grep -i 'arrange.*act.*assert' src/prompts/evolve-plan.md`, `grep -i 'damp' src/prompts/evolve-plan.md`, `grep -i 'one assertion\|one.*concept' src/prompts/evolve-plan.md`
  - **Expected result:** Each grep returns at least one match

- **Reference is brief (not a full rewrite):**
  - **What:** The addition is a single paragraph or callout, not multiple new sections
  - **How:** Count lines added: `git diff src/prompts/evolve-plan.md | grep '^+' | wc -l`
  - **Expected result:** Fewer than 10 added lines

- **No unintended changes:**
  - **What:** Only the TDD skill reference was added; existing TEST.md instructions are preserved
  - **How:** `git diff src/prompts/evolve-plan.md` — inspect that no existing content was removed or significantly reworded
  - **Expected result:** Diff shows only additions (or minimal contextual edits), no deletions of substantive guidance

## Manual Verification

- **Readability and tone:** Open `src/prompts/evolve-plan.md` and read the new reference paragraph. It should flow naturally with the existing prompt style, not feel bolted on or contradictory to surrounding content.
- **Principle relevance check:** Verify that the mentioned principles (Arrange-Act-Assert, DAMP over DRY, one assertion per concept, test pyramid) are actually useful for someone writing a TEST.md specification document — not just implementing code. This is a judgment call but should align with the specification-writing role.

## Test Order

1. Programmatic verification (grep checks, diff inspection)
2. Manual verification (readability and relevance review)
