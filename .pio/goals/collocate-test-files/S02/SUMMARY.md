# Summary: Simple moves — collocate single-module test files

## Status
COMPLETED

## Files Created
- `src/queues.test.ts` — moved from `__tests__/queues.test.ts`, import updated to `./queues`
- `src/transitions.test.ts` — moved and renamed from `__tests__/transition.test.ts`, imports updated to `./transitions` and `./fs-utils`
- `src/capabilities/session-capability.test.ts` — moved from `__tests__/next-task.test.ts`, mock/import paths updated to `./session-capability` and `./next-task`
- `src/guards/validation.test.ts` — moved from `__tests__/validation.test.ts`, import updated to `./validation`
- `src/guards/turn-guard.test.ts` — moved from `__tests__/turn-guard.test.ts`, import updated to `./turn-guard`

## Files Modified
- (none — only files were moved, with in-place import edits)

## Files Deleted
- (none — originals remain in `__tests__/` for Step 3 to remove)

## Decisions Made
- Used `mv` + in-place `edit` rather than read-and-write to relocate files, preserving content verbatim.
- Only modified relative import paths; no logic, helpers, or assertions were changed.

## Test Coverage
- `src/queues.test.ts` — 16 tests passed
- `src/transitions.test.ts` — 25 tests passed
- `src/capabilities/session-capability.test.ts` — 10 tests passed (vi.mock resolves correctly from new location)
- `src/guards/validation.test.ts` — 41 tests passed
- `src/guards/turn-guard.test.ts` — 13 tests passed
- `npm run check` — no type errors
- No stale `../src/` references remain in any relocated file
