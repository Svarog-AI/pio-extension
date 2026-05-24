# Summary: Update test-driven-development skill

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/skills/test-driven-development/SKILL.md` — Added explicit rule against content-based tests for prompts and messages in two locations: "When NOT to use" section (extended with prompt/message testing exception) and "Test Anti-Patterns to Avoid" table (new row with pattern, problem, and fix).

## Files Deleted
- (none)

## Decisions Made
- Added guidance to both "When NOT to use" and "Test Anti-Patterns to Avoid" for maximum agent visibility, as recommended in TASK.md.
- Used concrete examples from the tests removed in Step 1 (`toContain("TASK.md")`, `toMatch(/always\s*confirm/i)`) to make the rule actionable.
- No unit tests written — this is a documentation-only change with no behavioral impact on code logic.

## Test Coverage
- No unit tests apply for this documentation-only change.
- Programmatic verification: `npx tsc --noEmit` exits with code 0, `npx vitest run` passes all 667 tests with no regressions.
