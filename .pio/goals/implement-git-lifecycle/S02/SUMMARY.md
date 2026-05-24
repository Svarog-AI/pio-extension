# Summary: Inject branch checkout into create-goal prompt

## Status
COMPLETED

## Files Created
- `.pio/goals/implement-git-lifecycle/S02/TEST.md` — test specification with programmatic verification criteria
- `.pio/goals/implement-git-lifecycle/S02/COMPLETED` — completion marker

## Files Modified
- `src/prompts/create-goal.md` — inserted new Step 4 "Checkout a dedicated branch" between Step 3 ("Fill gaps with targeted questions") and old Step 4 ("Write GOAL.md"). Re-numbered subsequent steps: old Step 4 → Step 5, old Step 5 → Step 6.

## Files Deleted
- (none)

## Decisions Made
- New step text is 4 sentences: instructs branch checkout, references "Branch Checkout Protocol" from "pio-git" skill by name, mentions passing goal name as context, and states graceful failure (proceed on current branch if branching fails).
- No unit tests written per TDD skill guidance: "do not write unit tests that assert specific words or phrases appear in `.md` prompt files."
- Verification is programmatic: grep checks for required references and absence of prohibited content, plus `npm run check` and `npm test`.

## User-Requested Changes
- (none)

## Test Coverage
- No unit tests (content-only change to a prompt file).
- Programmatic verification confirms: Branch Checkout Protocol referenced, pio-git skill referenced, no shell commands/branch naming/collision details leaked into prompt, sequential step numbering (1–6), correct step ordering.
- `npm run check` (tsc --noEmit) passes with exit code 0.
- `npm test` passes with no new failures (4 pre-existing failures in session-guard.test.ts are unrelated).
