# Harden review severity classification against LLM rationalization

Add anti-rationalization guardrails to the `review-task.md` prompt so that the code review agent faithfully applies the severity classification table instead of downgrading issues through language like "minor," "harmless," or "cosmetic." The goal is four targeted prompt changes to Steps 5 and 6.

## Current State

The code review prompt lives at `src/prompts/review-task.md`. It instructs an LLM agent to review step implementations and classify findings by severity: CRITICAL, HIGH, MEDIUM, LOW.

**Step 5 (Categorize issues)** contains the severity classification rules as bullet lists under each severity heading, plus a summary reference table mapping patterns to severities. For example, "dead code (unused functions, unreachable branches)" is explicitly listed as HIGH — Mandatory REJECT. The rules section states critical and high issues must never be ignored.

**Step 6 (Make the approval decision)** provides APPROVE/REJECT conditions based on severity counts. APPROVE requires no critical, high, or medium issues. REJECT is mandatory when any critical or high issues exist. Medium issues require `ask_user`.

The classification infrastructure and rules are complete. The problem is behavioral: in practice, the LLM rationalizes around the explicit rules. Observed example during S02 review of `create-goal-asks-workspace-name`: an unused `extractSection()` function was classified as LOW "style improvement" instead of HIGH (dead code), justified with language like "minor dead code" and "harmless."

No structured intermediate step forces the model to explicitly match issues to table entries before classification. Nothing prohibits downgrading language in justifications. No anti-rationalization patterns are anticipated. The approval decision does not default to reject-and-verify.

## To-Be State

Four prompt changes to `src/prompts/review-task.md`:

**1. Force explicit table lookup before classification.** Insert a structured intermediate step before Step 6 (or within Step 5) requiring each issue to be matched to the severity table with quoted justification: `[issue description] → matches [exact severity category name] because [quote the matching bullet from the rules].` The model must complete this for every issue before proceeding to write REVIEW.md. This forces looking at the table instead of relying on gut feel.

**2. Ban downgrading language.** Add an explicit prohibition against qualifying words when justifying severity: "minor," "harmless," "cosmetic," "small," "test-only." State that if an issue matches a HIGH or CRITICAL bullet in the rules, it is that severity regardless of location or perceived impact size.

**3. Anticipate specific rationalization paths.** Add a "Common mistakes to avoid" section naming observed traps: dead code in test files is still HIGH not LOW; unused functions are never "style improvements"; severity does not change based on whether code is production or test.

**4. Invert the approval framing to default-reject.** Change Step 6 to begin assuming REJECTED. Require explicit verification of absence before changing to APPROVED: "No critical issues found. No high issues found. No medium issues found. Therefore: APPROVED." This shifts the burden from justify-rejection to justify-approval.

The severity classification table and rules remain unchanged — these additions are guardrails around existing logic, not rewrites of the classification system itself.
