# Summary: Update tests for systemPrompt delivery

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/session-capability.test.ts` — Updated 5 test assertions from `result.message?.customType` / `result.message?.content?.[0]?.text` to `result.systemPrompt` (string-based assertions). Added 1 new test verifying `_event.systemPrompt` is preserved as a prefix.

## Files Deleted
- (none)

## Decisions Made
- Used `typeof result.systemPrompt` checks instead of `toBeInstanceOf(String)` since the return value is a primitive string, not a String object.
- Used `.startsWith()` (JS string method) wrapped in `expect(...).toBe(true)` for prefix assertion, since Vitest has no native `.startsWith()` matcher for primitives in this context.
- All existing test setup (mocks, helpers, `vi.resetModules()`) left unchanged — only assertions were modified.

## User-Requested Changes
- (none)

## Test Coverage
- 5 existing tests updated to assert `result.systemPrompt` instead of `result.message`
- 1 new test added: verifies base prompt (`_event.systemPrompt`) is preserved as prefix
- All 37 tests pass (31 unchanged + 5 updated + 1 new)
- TypeScript compilation passes with no errors
- Zero occurrences of old `result.message?.customType` assertions remain
