# Summary: Add turn threshold config reading

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/model-config.ts` — Added `PioGuardsConfig` interface, extended `PioConfig` with optional `guards` field, added `DEFAULT_TURN_THRESHOLD` constant (12), added `readTurnThreshold()` function, updated `readConfig()` to parse the `guards` block from YAML config.
- `src/model-config.test.ts` — Added 12 new test cases covering `DEFAULT_TURN_THRESHOLD` value, valid `readTurnThreshold()` returns, and fallback behavior for missing/invalid config values.

## Files Deleted
- (none)

## Decisions Made
- `readTurnThreshold()` performs its own validation (typeof number, isInteger, > 0) rather than relying solely on `readConfig()` parsing. This provides a double-check: even if the cached config somehow contains a stale or corrupted value, the function still falls back safely.
- The `guards` block is parsed during `readConfig()` so it participates in the "no recognized entries" check — a config with only `guards: { turnThreshold: 20 }` (no `default` or `capabilities`) is treated as a valid config, not ignored.
- `PioGuardsConfig` is designed as an extensible interface for future guard settings (e.g., `deadTurnLimit`), following the same open-ended pattern as `PioConfig`.

## Test Coverage
- 12 new tests added to `src/model-config.test.ts`:
  - `DEFAULT_TURN_THRESHOLD` equals 12
  - `readTurnThreshold()` returns configured value for positive integers (20, 1, alongside other keys)
  - Falls back to default when: no config, empty config, guards without turnThreshold, zero, negative, float, null, string
- All 662 tests pass across 23 test files
- `npx tsc --noEmit` reports no type errors
