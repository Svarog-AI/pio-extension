# Summary: Update skill file references

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/skills/pio/SKILL.md` — Updated command table output from `.pio/PROJECT.md` to `.pio/PROJECT/` (7 files). Updated context injection description from `.pio/PROJECT.md` to `.pio/PROJECT/OVERVIEW.md`.
- `src/skills/test-driven-development/SKILL.md` — Added "Project-Specific Conventions" subsection under "Running Tests" with references to `.pio/PROJECT/DEVELOPMENT.md` (test conventions) and `.pio/PROJECT/CONVENTIONS.md` (coding standards).

## Files Deleted
- (none)

## Decisions Made
- Placed the new "Project-Specific Conventions" subsection between "Running Tests" and "Common Rationalizations" in the TDD skill — this is where a developer would naturally look for project-specific test guidance.
- Kept the TDD skill addition minimal (3 bullet lines + 1 note) to avoid restructuring the large existing skill document.
- Used `.pio/PROJECT/` (7 files) in the command table for conciseness while conveying the multi-file output.

## Test Coverage
All 6 programmatic verification checks pass:
1. **Stale reference check:** `grep -rn '\.pio/PROJECT\.md' src/skills/` returns zero matches
2. **OVERVIEW.md reference:** `grep -c '\.pio/PROJECT/OVERVIEW\.md' src/skills/pio/SKILL.md` returns 1
3. **Command table:** Shows `.pio/PROJECT/` (7 files) instead of `.pio/PROJECT.md`
4. **DEVELOPMENT.md reference:** `grep -c '\.pio/PROJECT/DEVELOPMENT\.md' src/skills/test-driven-development/SKILL.md` returns 1
5. **CONVENTIONS.md reference:** `grep -c '\.pio/PROJECT/CONVENTIONS\.md' src/skills/test-driven-development/SKILL.md` returns 1
6. **TypeScript compilation:** `npm run check` exits with code 0, no errors
