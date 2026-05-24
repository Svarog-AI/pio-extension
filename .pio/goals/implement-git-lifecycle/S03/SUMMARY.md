# Summary: Inject PR creation into finalize-goal prompt

## Status
COMPLETED

## Files Created
- `.pio/goals/implement-git-lifecycle/S03/TEST.md` — test specification with programmatic verification criteria
- `.pio/goals/implement-git-lifecycle/S03/COMPLETED` — completion marker

## Files Modified
- `src/prompts/finalize-goal.md` — inserted new Step 10 "Create a pull request" between Step 9 ("Produce a summary output") and old Step 10 ("Signal completion"). Re-numbered old Step 10 → Step 11.

## Files Deleted
- (none)

## Decisions Made
- New step text is 4 sentences: instructs PR creation, references "PR Creation Protocol" from "pio-git" skill by name, mentions passing goal name and workspace path as context, and states graceful failure (proceed with goal finalization if PR creation fails).
- No unit tests written per TDD skill guidance: "do not write unit tests that assert specific words or phrases appear in `.md` prompt files."
- Verification is programmatic: grep checks for required references and absence of prohibited content, plus `npm run check` and `npm test`.

## User-Requested Changes
- (none)

## Test Coverage
- No unit tests (content-only change to a prompt file).
- Programmatic verification confirms: "PR Creation Protocol" referenced, "pio-git" skill referenced, no `gh pr create`/`gh auth status`/`git push` commands leaked into prompt, sequential step numbering (1–11), correct step ordering (after Step 9, before Step 11), graceful failure language present.
- `npm run check` (tsc --noEmit) passes with exit code 0.
- `npm test` passes with no new failures (4 pre-existing failures in session-guard.test.ts are unrelated).
