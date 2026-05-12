# Summary: Update `execute-task.md` with TDD skill reference

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/execute-task.md` — Added TDD skill reference near top and generalized Step 4 test runner mentions

## Files Deleted
- (none)

## Decisions Made
- Placed the TDD skill reference as a single paragraph after the intro (line 5), before `## Setup`, so agents see it early without disrupting the flow.
- Referenced key TDD concepts by name in the callout: TDD cycle, Prove-It Pattern, Arrange-Act-Assert, DAMP over DRY, assertion patterns, and anti-patterns — giving agents concrete reasons to consult the skill.
- Generalized Step 4 to list multiple ecosystem examples (Jest/Vitest for JS/TS, pytest for Python, cargo test for Rust, go test for Go) framed with "such as" language, preserving the existing behavior of adding a new runner if none exists.

## Test Coverage
- **Skill reference count:** `grep -c 'test-driven-development'` → 1 (exactly one reference) ✓
- **Placement before Setup:** Reference at line 5, `## Setup` at line 7 ✓
- **Instructional language:** "follow the guidance from the `test-driven-development` skill" ✓
- **Framework-agnostic Step 4:** Jest/Vitest mentioned as examples with "such as" framing; includes Python, Rust, Go examples ✓
- **Test runner addition preserved:** "If not but a test runner can be reasonably added, add one" still present ✓
- **TypeScript check:** `npm run check` (tsc --noEmit) exits 0 ✓
- **No unintended changes:** `git diff` confirms only the two specified edits ✓
