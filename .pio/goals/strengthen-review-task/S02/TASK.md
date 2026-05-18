# Task: Strengthen review prompt with new severity classification rules

Rewrite `src/prompts/review-task.md` to replace lenient, open-ended review criteria with concrete severity classifications that actually reject low-quality implementations.

## Context

The current `review-task.md` (renamed in Step 1, content unchanged) uses vague severity guidance: "at reviewer's discretion" for medium issues, no explicit treatment of test quality, and no classification for security risks, code smells, or accidental scope changes. Per the user, this lets many quality issues slip through — things go through that shouldn't. The new rules are defined in GOAL.md's "To-Be State" sections 2–7 and PLAN.md Step 2.

## What to Build

Rewrite the issue categorization section (Step 5 of the prompt process) and the approval decision rules (Step 6) in `src/prompts/review-task.md`. The existing prompt structure — process steps, YAML frontmatter format, REVIEW.md template, guidelines — must be preserved. Only the severity classification content and approval logic change.

### Code Components

This step modifies a single file: `src/prompts/review-task.md`. The changes are textual/instructional — no TypeScript code is affected. However, the new prompt instructions must be precise enough that the review agent can execute them unambiguously.

#### 1. Medium issues require mandatory user confirmation (replaces Step 5 rules)

Replace the current rule:
> "Low and medium issues are at your discretion. You may approve despite them if they don't affect correctness. When in doubt, use `ask_user` to decide."

With a mandatory handoff: when medium-severity issues exist (and no critical/high exist), the agent **must** call `ask_user` to present findings and get explicit REJECT or ACCEPT direction before writing REVIEW.md. The agent cannot unilaterally approve or reject on medium issues alone. High and critical remain mandatory REJECT without consultation — no change needed for these.

#### 2. CRITICAL severity — test quality deviations

Add a new CRITICAL category for test-related issues:
- Tests that deviate from what TEST.md specifies (the design spec)
- Meaningless tests — tests that don't actually verify behavior (e.g., checking cosmetic properties, presence of text lines, or trivial assertions)
- Tests that don't make sense for the domain being tested
- Absence of good tests covering important behavior (when the task requires tests)

These are CRITICAL — immediate REJECT. This elevates test quality from a general "coverage" check to an explicit gate.

#### 3. HIGH severity — code smells and unnecessary complexity

Classify as HIGH:
- Over-engineering and unnecessary abstractions
- Dead code (unused functions, unreachable branches)
- Overly complex implementations when simpler solutions satisfy requirements

HIGH = mandatory REJECT. Replace vague "simplicity and quality" guidance with this explicit assignment.

#### 4. HIGH severity — security risks

Classify as HIGH:
- Injection vulnerabilities
- Improper input validation
- Exposed credentials or secrets
- Unsafe deserialization
- Path traversal
- Any other security risk the agent identifies

Enumerate examples but instruct the agent to flag any security risk it finds, not just listed ones. HIGH = mandatory REJECT.

#### 5. HIGH severity — accidental changes to unrelated files

Classify as HIGH:
- Modifications to files or behavior unrelated to the task scope (as defined in TASK.md)
- The agent must compare SUMMARY.md's "Files Modified" list against what TASK.md says should change
- Flag any unauthorized modifications as HIGH

HIGH = mandatory REJECT. This prevents silent regressions and scope creep.

#### 6. MEDIUM severity — design flaws and code duplication

Classify as MEDIUM:
- DRY violations (code duplication)
- Inappropriate abstractions (not over-engineering, but wrong abstraction choices)
- Coupling issues between modules
- Interface design problems

These trigger mandatory user confirmation per rule 1 above.

#### 7. Severity classification table or list

Add a clear reference mapping — a table or structured list — that the review agent can quickly consult. It should map concrete patterns to severity levels:

| Pattern | Severity | Action |
|---------|----------|--------|
| Fundamentally wrong implementation | CRITICAL | REJECT |
| Test deviations from TEST.md | CRITICAL | REJECT |
| Meaningless or absent tests | CRITICAL | REJECT |
| Code smells / over-engineering | HIGH | REJECT |
| Security risks | HIGH | REJECT |
| Accidental scope changes | HIGH | REJECT |
| Design flaws / duplication | MEDIUM | ask_user |
| Style / naming improvements | LOW | At discretion |

### Approach and Decisions

- **Preserve existing structure:** The prompt's 8-step process, YAML frontmatter format, REVIEW.md template, and guidelines section should remain. Only rewrite Step 5 (Categorize issues) and Step 6 (Make the approval decision).
- **Follow current tone:** The prompt uses imperative, direct language ("Your only job is...", "Do not skip ahead."). Maintain this voice.
- **Reference DECISIONS.md:** As noted in `S02/DECISIONS.md`, the prompt file was renamed in Step 1 but content is unchanged — it still has old lenient rules. You're rewriting against the full existing prompt structure (which you should read from disk to confirm before editing).

## Dependencies

- **Step 1 must be completed:** The prompt file must already be renamed to `src/prompts/review-task.md` (done in Step 1). This step modifies its content only.

## Files Affected

- `src/prompts/review-task.md` — rewrite Step 5 (issue categorization rules) and Step 6 (approval decision rules); add severity classification table

## Acceptance Criteria

- [ ] `src/prompts/review-task.md` exists and contains severity classification guidance
- [ ] Prompt explicitly states medium issues require `ask_user` for mandatory user confirmation (searchable: "ask_user" appears in context about medium issues)
- [ ] Prompt classifies test quality deviations as CRITICAL level (test-related patterns appear under a CRITICAL section or reference)
- [ ] Prompt classifies code smells/complexity as HIGH level
- [ ] Prompt classifies security risks as HIGH level
- [ ] Prompt classifies accidental changes to unrelated files as HIGH level
- [ ] Prompt classifies design flaws/duplication as MEDIUM level
- [ ] `npx tsc --noEmit` reports no errors (no TypeScript impact, but verifies overall health)

## Risks and Edge Cases

- **Prompt structure drift:** The existing prompt may have been modified by Step 1 beyond what we expect. Read the full file before editing to confirm current structure.
- **No TypeScript code changes:** This step only modifies a markdown prompt file. It should not affect type checking, but running `npx tsc --noEmit` is still required to verify overall health.
- **No new tests needed:** The prompt is consumed at runtime by the review agent — there are no unit tests for prompt content. Verification is via text search and manual reading.
