# Summary: Draft specification document

## Status
COMPLETED

## Files Created
- `.pio/goals/git-lifecycle/SPECIFICATION.md` — complete specification document covering all five dimensions (branch checkout, PR creation, subgoal branching, worktrees, implementation plan)
- `docs/git-lifecycle-specification.md` — copy of the specification for project-wide discoverability
- `.pio/goals/git-lifecycle/S03/TEST.md` — test specification with programmatic verification criteria

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- **Five-section structure:** Specification organized as §1–§5 matching GOAL.md dimensions exactly
- **Consolidation approach:** Research from S01/SPECIFICATION.md (Sections 1–2 draft) was reorganized into the five-dimension structure, not copied verbatim. Edge cases moved to relevant dimension sections.
- **Branch collision strategy:** `ask_user` for top-level goals, auto-suffix for subgoals (from Step 2 analysis)
- **Subgoal branching:** Top-level goals only (Option 3 from Step 2). Subgoals commit inline, no independent branches or PRs
- **Worktrees:** Explicitly excluded with preserved rationale statement
- **No capability code changes:** Both protocols implemented via skill + prompt only, consistent with Steps 1–2 decisions
- **Implementation plan:** 5 proposed steps for follow-up goal (add protocols to skill, inject into prompts, end-to-end validation)

## User-Requested Changes
- **Commands belong in the skill, not the spec.** User clarified that bash scripts and shell commands should be located in the pio-git skill, not presented inline in the spec. Reframed protocol sections as "Steps (to be written into the skill)" with a closing note that executable commands are the skill's responsibility. Modified `SPECIFICATION.md`, `docs/git-lifecycle-specification.md`.
- **GIT.md is the authority for formats.** User clarified that PR title format, PR body format, and other formatting conventions should defer to `.pio/PROJECT/GIT.md`, not be prescribed by the spec. Removed hardcoded format templates; spec now says "read GIT.md for the format." Modified `SPECIFICATION.md`, `docs/git-lifecycle-specification.md`.
- **Prompts define WHAT, skills define HOW.** User requested explicit statement of this core pio principle. Added a prominent statement at the top of the spec and reinforced it in §5 prompt change descriptions. Modified `SPECIFICATION.md`, `docs/git-lifecycle-specification.md`.

## Test Coverage
- No unit tests (documentation-only task per TDD methodology)
- Programmatic verification:
  - SPECIFICATION.md exists at goal workspace root (338 lines, 17KB) ✓
  - docs/ copy exists with identical content (diff confirms) ✓
  - All five sections (§1–§5) present with concrete content ✓
  - §1 specifies: Branch Checkout Protocol, GIT.md lookup, collision resolution, non-main handling, file changes ✓
  - §2 specifies: PR Creation Protocol, `gh pr create` with flags, title/body format, pre-creation checks, file changes ✓
  - §3 specifies: top-level-only recommendation, `/subgoals/` detection, no PR for subgoals ✓
  - §4 contains: explicit exclusion statement with 5-point rationale ✓
  - §5 specifies: concrete changes to all three target files + 5 proposed plan steps ✓
  - Graceful failure semantics preserved throughout (warn-and-continue on all git operations) ✓
  - No capability code changes recommended ✓
  - All file paths reference actual codebase files ✓
  - `npm run check` (`tsc --noEmit`) exits with code 0 ✓
  - `npm test` passes: 674 tests, 0 failures ✓
