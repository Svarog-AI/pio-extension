# Summary: Register skill in `src/index.ts`

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/index.ts` — Added `path.join(SKILLS_DIR, "test-driven-development")` as the second element in the `skillPaths` array

## Files Deleted
- (none)

## Decisions Made
- Placed the new entry after `"pio"` to maintain existing ordering convention
- Followed the exact same pattern as the existing entry: `path.join(SKILLS_DIR, "<name>")`
- No imports or other logic changes needed — purely a data-level addition

## Test Coverage
- **Check 1 (skill path present):** `grep -c 'test-driven-development' src/index.ts` → `1` ✓
- **Check 2 (correct pattern):** `grep 'path.join(SKILLS_DIR, "test-driven-development")' src/index.ts` → matched ✓
- **Check 3 (both skills present):** `grep -c 'path.join(SKILLS_DIR,' src/index.ts` → `2` ✓
- **Check 4 (TypeScript compiles):** `npm run check` → exit code 0, no errors ✓
- **Check 5 (no unintended changes):** `git diff` shows exactly one line addition in `skillPaths` array ✓
- **Check 6 (directory exists):** `test -d src/skills/test-driven-development` → "exists" ✓
