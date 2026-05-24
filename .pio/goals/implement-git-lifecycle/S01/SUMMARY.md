# Summary: Add Branch Checkout and PR Creation protocols to pio-git skill (revised)

## Status
COMPLETED

## Files Created
- `src/skills/pio-git/REFERENCE.md` — Edge case details for both protocols (split from SKILL.md per write-a-skill conventions to keep SKILL.md ≤100 lines). Contains tables for Branch Checkout edge cases (no git repo, detached HEAD, uncommitted changes, shallow clone) and PR Creation edge cases (gh not installed, not authenticated, network failure, branch not pushed, no changes, existing PR, not a GitHub repo, re-finalize).

## Files Modified
- `src/skills/pio-git/SKILL.md` — Rewrote to follow write-a-skill conventions (≤100 lines). Moved edge case details to REFERENCE.md with progressive disclosure links. Tightened Staged Commit Protocol description. Updated Future Extensibility git worktree note to reference SPECIFICATION.md §4 explicitly. Final line count: 85 lines (was 112).

## Files Deleted
- (none)

## Decisions Made
- **Loaded write-a-skill skill before implementing** — followed the review checklist: SKILL.md under 100 lines, references one level deep, consistent terminology, concrete examples preserved.
- **Split edge cases to REFERENCE.md** — both protocol edge case tables moved to REFERENCE.md; SKILL.md references via `[REFERENCE.md](REFERENCE.md)` links per write-a-skill progressive disclosure pattern.
- **Tightened Staged Commit Protocol** — condensed staging strategy from multi-line list items to compact inline descriptions, moved execution code block reference to REFERENCE.md.
- **SPECIFICATION.md §4 reference** — Future Extensibility worktree note now explicitly references "SPECIFICATION.md §4" as required by TASK.md acceptance criteria.
- **Graceful failure language preserved** — "warn and skip" semantics maintained throughout both protocols.

## User-Requested Changes
- (none)

## Test Coverage
- No unit tests (content-only change to markdown skill files — per TDD skill, content-based tests for `.md` files are not appropriate).
- Programmatic verification confirms:
  - SKILL.md is 85 lines (≤100, write-a-skill convention) ✅
  - REFERENCE.md exists with edge case tables for both protocols ✅
  - Both protocol sections present with correct headings ✅
  - All 14 required shell commands present in correct protocols ✅
  - Subgoal detection (`/subgoals/`) appears in both protocols (2 occurrences) ✅
  - `ask_user` referenced in Branch Checkout collision resolution ✅
  - REFERENCE.md referenced from SKILL.md (3 occurrences) ✅
  - Future Extensibility updated — old items removed, new items added ✅
  - Git worktree note references SPECIFICATION.md §4 ✅
  - Section ordering correct: Convention Lookup Rule → Staged Commit Protocol → Branch Checkout Protocol → PR Creation Protocol → Graceful Failure Semantics → Future Extensibility ✅
  - Graceful failure language present throughout ✅
  - TypeScript type check passes (`tsc --noEmit`) ✅
  - All 670 existing tests pass (4 pre-existing failures in session-guard.test.ts, unrelated) ✅
