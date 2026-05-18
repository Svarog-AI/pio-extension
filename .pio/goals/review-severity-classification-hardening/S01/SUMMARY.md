# Summary: Add anti-rationalization guardrails to Step 5 (Categorize issues)

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/review-task.md` — Added three new subsections within Step 5 (after `#### Rules`, before `### Step 6`):
  1. **`#### Before classifying: match every issue to the severity table`** — Requires the model to match every issue to a severity table entry using the format `[issue] → matches [category] because [quote]`. Mandatory step before proceeding to Step 6.
  2. **`#### Prohibited downgrading language`** — Bans qualifying words ("minor," "harmless," "cosmetic," "small," "test-only") in severity justifications. States that HIGH/CRITICAL matches are that severity regardless of location or perceived impact.
  3. **`#### Common mistakes to avoid`** — Names three specific rationalization traps: dead code in test files is still HIGH, unused functions are never "style improvements," and severity doesn't change based on production vs test context.

## Files Deleted
- (none)

## Decisions Made
- Placed all three subsections after `#### Rules` and before `### Step 6` to preserve the existing flow: definitions → reference table → rules → guardrails → approval decision.
- Used `####` headings to match existing Step 5 subsection structure.
- Wrote guardrails in authoritative tone ("must," "prohibited," "mandatory") — these are hard rules, not suggestions.
- No existing content was modified — only new sections were appended within Step 5.

## Test Coverage
- **Programmatic verification:** All grep checks confirm required content is present (table lookup format, banned words, common mistakes section).
- **Content preservation:** `diff` against original confirms zero modifications to existing content — only additions.
- **Type checking:** `npm run check` passes with exit code 0.
- **Test suite:** `npm test` passes — all 327 tests across 14 files, no regressions.
