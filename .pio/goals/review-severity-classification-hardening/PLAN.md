# Plan: Harden review severity classification against LLM rationalization

Add four anti-rationalization guardrails to `src/prompts/review-task.md` (Steps 5 and 6) so the code review agent faithfully applies the severity classification table instead of downgrading issues through language like "minor," "harmless," or "cosmetic."

## Prerequisites

None.

## Steps

### Step 1: Add anti-rationalization guardrails to Step 5 (Categorize issues)

**Description:** Insert three new subsections into Step 5 of `src/prompts/review-task.md` — the existing severity classification rules and table remain unchanged. These additions sit after the severity reference table and Rules but before Step 6:

1. **Explicit table lookup requirement.** A new sub-step instructing the model to match every issue to a specific severity category by quoting the matching bullet from the classification rules. Format: `[issue description] → matches [exact severity category name] because [quote the matching bullet from the rules].` This forces structured reasoning before classification.

2. **Downgrading language prohibition.** An explicit ban against qualifying words when justifying severity: "minor," "harmless," "cosmetic," "small," "test-only." State that if an issue matches a HIGH or CRITICAL bullet, it is that severity regardless of location or perceived impact size.

3. **"Common mistakes to avoid" section.** A named section calling out observed rationalization traps: dead code in test files is still HIGH not LOW; unused functions are never "style improvements"; severity does not change based on whether code is production or test.

**Acceptance criteria:**
- [ ] `src/prompts/review-task.md` contains a new subsection after the severity reference table requiring explicit issue-to-table matching with quoted justification
- [ ] The prompt contains an explicit prohibition against downgrading language ("minor," "harmless," "cosmetic," "small," "test-only")
- [ ] A "Common mistakes to avoid" section exists naming at least 3 specific rationalization patterns (dead code in tests, unused-as-style, production-vs-test severity confusion)
- [ ] The existing severity classification table and rules are preserved unchanged
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/prompts/review-task.md` — add three new subsections within Step 5 (after severity reference table, before Rules or at end of Step 5)

### Step 2: Invert approval framing in Step 6 to default-reject

**Description:** Modify Step 6 ("Make the approval decision") in `src/prompts/review-task.md` to shift from justify-rejection to justify-approval. Change the step to begin with a REJECTED assumption and require explicit verification of absence before approving. The new framing: "Start by assuming the review is REJECTED. To change this to APPROVED, you must explicitly verify each condition:" followed by checklist items ("No critical issues found. No high issues found. No medium issues found.") and concluding "Therefore: APPROVED." This forces the model to actively confirm absence of issues rather than justify exceptions.

**Acceptance criteria:**
- [ ] Step 6 begins with a default-reject framing (start assuming REJECTED)
- [ ] Step 6 requires explicit absence verification for each severity level before approving ("No critical issues found," "No high issues found," etc.)
- [ ] The mandatory REJECT conditions (any critical or high issues) remain preserved
- [ ] The `ask_user` requirement for medium-only scenarios remains preserved
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/prompts/review-task.md` — rewrite Step 6 approval framing while preserving all existing decision rules

### Step 3: Verify all changes integrate correctly

**Description:** Final verification that the four prompt changes work together as a coherent set of guardrails. Confirm the full Step 5 → Step 6 flow reads naturally, section ordering makes sense, and no instructions contradict each other. Run the full test suite to ensure no regressions from the prompt file changes (prompt content is loaded at runtime — tests should pass unchanged).

**Acceptance criteria:**
- [ ] `npm run test` passes with no regressions (all existing tests pass)
- [ ] `npm run check` reports no type errors
- [ ] Review of `src/prompts/review-task.md` confirms all four guardrails are present and non-contradictory: explicit table lookup, downgrading ban, common mistakes section, and default-reject framing

**Files affected:**
- (verification only — no file changes)

## Notes

- This is a prompt-only change. No TypeScript code, tests, or build configuration is modified. The `review-task.md` file is loaded at runtime by the session infrastructure (`session-capability.ts`) and injected as system prompt text for review sub-sessions.
- The existing severity classification table (CRITICAL/HIGH/MEDIUM/LOW rules) and reference table must remain exactly as-is — these additions are guardrails around existing logic, not rewrites.
- When inserting new content into Step 5, place it after the severity reference table to preserve the flow: definitions → reference → guardrails → rules → next step.
