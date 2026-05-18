# Task: Add anti-rationalization guardrails to Step 5 (Categorize issues)

Insert three new subsections into Step 5 of `src/prompts/review-task.md` — the existing severity classification rules and reference table remain unchanged.

## Context

The code review prompt (`src/prompts/review-task.md`) instructs an LLM agent to classify findings by severity: CRITICAL, HIGH, MEDIUM, LOW. In practice, the LLM rationalizes around explicit rules — e.g., classifying dead code as LOW "style improvement" instead of HIGH (dead code), justified with language like "minor" and "harmless." Three guardrails are needed in Step 5 to force faithful application of the classification table.

## What to Build

Add three new subsections to Step 5 of `src/prompts/review-task.md`, placed **after** the severity reference table (`#### Severity Classification Reference`) and the `#### Rules` subsection, but still within Step 5 (before Step 6). The existing content — CRITICAL/HIGH/MEDIUM/LOW bullet lists, reference table, and Rules — must remain exactly as-is.

### Code Components

#### 1. Explicit table lookup requirement

A new sub-step (e.g., `#### Before classifying: match every issue to the severity table`) instructing the model to match each discovered issue to a specific severity category by quoting the matching bullet from the classification rules. The format:

```
[issue description] → matches [exact severity category name] because [quote the matching bullet from the rules].
```

This forces structured reasoning before writing REVIEW.md. The model must complete this matching exercise for every issue it identifies before proceeding to Step 6.

Key points to include:
- This is a mandatory step — do not skip it.
- Each issue must explicitly reference which severity category bullet it matches.
- The model should quote the exact text from the classification rules that justifies the match.
- Only proceed to Step 6 after all issues are matched.

#### 2. Downgrading language prohibition

A new subsection (e.g., `#### Prohibited downgrading language`) explicitly banning qualifying words when justifying severity. The banned words include: "minor," "harmless," "cosmetic," "small," "test-only."

Key points to include:
- If an issue matches a HIGH or CRITICAL bullet in the rules, it is that severity — period.
- Location (production vs test files) and perceived impact size do not change severity.
- Using these qualifying words to downgrade an issue's severity is a violation of the classification rules.

#### 3. "Common mistakes to avoid" section

A named subsection (e.g., `#### Common mistakes to avoid`) calling out specific observed rationalization traps. At minimum, name three patterns:

1. **Dead code in test files is still HIGH, not LOW.** Dead code rules apply regardless of whether the file is a test or production code.
2. **Unused functions are never "style improvements."** An unused function matches the HIGH "dead code" category — not LOW "style."
3. **Severity does not change based on production vs test context.** The classification rules do not distinguish between production and test code. A bug is a bug regardless of file type.

### Approach and Decisions

- Insert new subsections at the end of Step 5, after `#### Rules` but before `### Step 6`. This preserves the existing flow: severity definitions → reference table → rules → guardrails → approval decision.
- Use `####` headings (same level as existing subsections within Step 5) to maintain consistent document structure.
- Do not modify any existing content in the prompt — only append new sections within Step 5.
- The tone should be authoritative and explicit — these are hard rules, not suggestions.

## Dependencies

None. This is the first step and requires no prior changes.

## Files Affected

- `src/prompts/review-task.md` — add three new subsections at the end of Step 5 (after `#### Rules`, before `### Step 6`)

## Acceptance Criteria

- [ ] `src/prompts/review-task.md` contains a new subsection after the severity reference table requiring explicit issue-to-table matching with quoted justification
- [ ] The prompt contains an explicit prohibition against downgrading language ("minor," "harmless," "cosmetic," "small," "test-only")
- [ ] A "Common mistakes to avoid" section exists naming at least 3 specific rationalization patterns (dead code in tests, unused-as-style, production-vs-test severity confusion)
- [ ] The existing severity classification table and rules are preserved unchanged
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- **Accidental modification of existing content.** Be careful to only insert new sections — do not rewrite or reformat existing Step 5 content. Verify the original severity bullets, reference table, and Rules section are identical after the change.
- **Section placement.** The new subsections must appear within Step 5 (before Step 6). Placing them after Step 6 would break the intended flow (guardrails should apply before the approval decision).
- **Heading levels.** Use `####` headings to match existing Step 5 subsection structure. Using `###` would incorrectly make them appear as top-level steps.
