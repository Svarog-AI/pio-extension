# Summary: Add Branch Checkout and PR Creation protocols to pio-git skill

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/skills/pio-git/SKILL.md` — Added "Branch Checkout Protocol" section (subgoal detection, git repo/user verification, convention lookup, branch name construction, current branch detection, non-main branch handling, collision resolution with ask_user, checkout command, edge cases). Added "PR Creation Protocol" section (subgoal detection, git repo verification, gh CLI/auth verification, target branch determination, existing PR check, changes check, branch push, PR title/body construction, gh pr create command, edge cases). Updated "Future Extensibility" section (removed branch checkout/PR creation entries, added cherry-pick protocol, tag creation on release, git worktree exclusion note).

## Files Deleted
- (none)

## Decisions Made
- Both protocols use concise step-by-step format matching the existing Staged Commit Protocol structure
- Edge cases are listed inline (bold paragraph) rather than in tables to save lines
- SKILL.md is 112 lines total, well under the 200-line limit — no REFERENCE.md split needed
- Base branch tracking for non-main branches: Branch Checkout Protocol instructs agent to "note this branch as the PR target for downstream PR creation"; PR Creation Protocol re-detects from GIT.md or uses recorded context
- Graceful failure language consistent throughout: "On failure: warn and skip"

## User-Requested Changes
- (none)

## Test Coverage
- No unit tests (content-only change to a markdown skill file — per TDD skill, content-based tests for .md files are not appropriate)
- Programmatic verification confirms:
  - Both protocol sections present with correct headings
  - All required shell commands present (git rev-parse, git config, git symbolic-ref, git rev-parse --verify, git checkout -b, command -v gh, gh auth status, gh pr list, git diff --shortstat, git push -u origin, gh pr create)
  - Subgoal detection (`/subgoals/`) appears in both protocols
  - ask_user referenced in Branch Checkout Protocol collision resolution
  - Future Extensibility updated (old items removed, new items added)
  - Section ordering correct: Convention Lookup Rule → Staged Commit Protocol → Branch Checkout Protocol → PR Creation Protocol → Graceful Failure Semantics → Future Extensibility
  - File stays under 200 lines (112 lines)
  - TypeScript type check passes (tsc --noEmit)
  - All 674 existing tests pass (no regressions)
