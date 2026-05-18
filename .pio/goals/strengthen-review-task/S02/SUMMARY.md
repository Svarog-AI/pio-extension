# Summary: Strengthen review prompt with new severity classification rules

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/review-task.md` — Rewrote Step 5 (Categorize issues) and Step 6 (Make the approval decision) with concrete severity classification rules

## Files Deleted
- (none)

## Changes Detail

### Step 5: Categorize issues (rewritten)
- **CRITICAL** now explicitly includes: test quality deviations from TEST.md, meaningless tests, tests that don't make sense for the domain, and absence of tests covering important behavior
- **HIGH** now explicitly includes: code smells/unnecessary complexity (over-engineering, dead code), security risks (injection, credentials, path traversal, etc.), and accidental changes to unrelated files (scope comparison against TASK.md)
- **MEDIUM** now explicitly includes: design flaws and code duplication (DRY violations, coupling issues, interface design problems). These now require mandatory `ask_user` instead of "at reviewer's discretion"
- **LOW** remains: style improvements, naming suggestions
- Added a **Severity Classification Reference** table mapping concrete patterns to severity levels and actions
- Replaced "at your discretion" policy for medium issues with mandatory `ask_user` requirement

### Step 6: Make the approval decision (rewritten)
- APPROVE condition tightened: no critical, high, OR medium issues (previously only critical/high blocked approval)
- REJECT conditions expanded to include test deviations from TEST.md
- Added explicit "Medium issues require `ask_user`" section with procedural instructions
- Agent must present findings and get explicit REJECT/ACCEPT direction from user when medium issues are the highest severity

## Decisions Made
- Preserved existing prompt structure: Steps 1-4, 7-8, YAML frontmatter format, REVIEW.md template, and Guidelines section are unchanged
- Maintained the existing imperative, direct tone ("Your only job is...", "Do not skip ahead.")
- Added a severity classification reference table for quick consultation by the review agent
- Kept LOW issues "at your discretion" — only MEDIUM was elevated to require user confirmation
- Security risk examples are illustrative, not exhaustive — agent instructed to flag any security concern

## Test Coverage
- No TypeScript code was modified — this step only changes a markdown prompt file
- All 310 existing tests pass (no regressions)
- `npx tsc --noEmit` passes (no type errors)
- Verification via programmatic text searches (all pass):
  - File existence: `src/prompts/review-task.md` exists, `src/prompts/review-code.md` removed
  - `ask_user` appears in medium-issue context (4 matches)
  - Test quality classified as CRITICAL (4 matches)
  - Code smells classified as HIGH (1 match in table)
  - Security risks classified as HIGH (1 match in table)
  - Accidental changes classified as HIGH (1 match in table)
  - Design flaws classified as MEDIUM (1 match in table)
  - Old "at your discretion" policy removed for medium (only appears in LOW context)
  - Severity level mentions increased from 4 to 16
