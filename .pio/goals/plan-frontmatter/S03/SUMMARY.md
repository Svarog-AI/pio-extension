# Summary: Update create-plan prompt to instruct frontmatter writing

## Status
COMPLETED

## Files Created
- (none — this step modifies a prompt file only; no TypeScript code was added)

## Files Modified
- `src/prompts/create-plan.md` — added YAML frontmatter instructions and updated the example PLAN.md template in Step 5

## Files Deleted
- (none)

## Decisions Made
- No unit tests created — this is a prompt-only change with no TypeScript logic to test. String-matching tests on markdown content are fragile and don't verify real behavior.
- Verification is programmatic (type check, no regressions) plus manual review of prompt content.

## Verification
- `npm run check` — TypeScript compiles with no errors
- `npm test` — all 420 existing tests pass with no regressions
- `grep -c "totalSteps" src/prompts/create-plan.md` — returns 4 (instructions + example)
- `grep -c "^---$" src/prompts/create-plan.md` — returns 4 (frontmatter delimiters in example)

## Changes to create-plan.md
- Added "**Important:**" paragraph in Step 5 instructing the Planning Agent to include YAML frontmatter with `totalSteps` before the document title
- Added a standalone YAML code block demonstrating the frontmatter format
- Updated the markdown template to show `---\ntotalSteps: 5\n---` before `# Plan: <Goal Name>`
- Added a "Remember" reminder after the template reinforcing the totalSteps constraint
