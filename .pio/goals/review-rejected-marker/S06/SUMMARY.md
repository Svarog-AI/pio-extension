# Summary: Require YAML frontmatter in the review prompt

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/review-code.md` — Updated Step 7 to require YAML frontmatter at the top of REVIEW.md with all five fields (`decision`, `criticalIssues`, `highIssues`, `mediumIssues`, `lowIssues`). Updated Step 8 to remove manual marker instructions; agent now writes only REVIEW.md and calls `pio_mark_complete`, with infrastructure handling markers automatically.

## Files Deleted
- (none)

## Decisions Made
- Combined APPROVED/REJECTED into a single frontmatter example using `APPROVED | REJECTED` notation for clarity
- Placed the yaml code block (` ```yaml `) before the full markdown template to emphasize frontmatter comes first
- Used explicit "Do not create or delete marker files manually" language in Step 8 to prevent agent confusion
- Preserved the human-readable `## Decision` body section, noting it must match frontmatter (redundant by design)

## Test Coverage
- 20 programmatic checks pass (verify.sh): YAML block presence, all five fields mentioned, placement guidance, manual marker instructions removed, automation language present, `pio_mark_complete` referenced, `## Decision` preserved, Steps 1-6 unchanged
- TypeScript compilation (`npm run check`) passes with zero errors
