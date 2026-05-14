# Summary: Move `validation.ts`, `turn-guard.ts` to `src/guards/` + update validation imports

## Status
COMPLETED

## Files Created
- `src/guards/validation.ts` — moved from `src/capabilities/validation.ts` with updated imports to point to decomposed modules (`../transitions`, `../queues`, `../fs-utils`) and `../capabilities/session-capability`
- `src/guards/turn-guard.ts` — moved from `src/capabilities/turn-guard.ts` as-is (no internal changes, zero utils dependencies)

## Files Modified
- `__tests__/validation.test.ts` — updated import from `../src/capabilities/validation` to `../src/guards/validation`; removed bad test `"non-review-code path is unaffected"` which read source code from disk to verify implementation details
- `__tests__/turn-guard.test.ts` — updated import from `../src/capabilities/turn-guard` to `../src/guards/turn-guard`

## Files Deleted
- (none — old files at `src/capabilities/validation.ts` and `src/capabilities/turn-guard.ts` remain for backward compatibility during migration; deletion is Step 8)

## Decisions Made
- **Import paths use `../` not `../../`:** TASK.md specified `../../transitions` etc., but `src/guards/` is one level below `src/`, so `../transitions` correctly resolves to `src/transitions.ts`. Fixed this discrepancy.
- **`stepFolderName` imported from `../fs-utils` not `../transitions`:** Although GOAL.md planned `stepFolderName` in transitions, the actual implementation (Steps 1-4) placed it in `src/fs-utils.ts`. Transitions imports it internally but doesn't re-export. Correctly imported from `../fs-utils`.

## Test Coverage
- All 41 validation tests pass (was 42 — one bad test removed as specified)
- All 13 turn-guard tests pass (unchanged behavior, import path updated)
- Full suite: 14 test files, 218 total tests pass
- `npm run check` reports zero TypeScript errors
