# Task: Add turn threshold config reading

Add a `guards.turnThreshold` field to the config schema and provide a function to read it with a hard-coded default fallback.

## Context

Agents can enter refinement loops — repeatedly rewriting files without calling `pio_mark_complete`. Step 1 establishes the configuration plumbing so that Step 2 (turn-count detection in `session-guard.ts`) can read a configurable threshold. The config lives in `~/.pi/pio-config.yaml` and follows the exact same reading pattern as the existing model config (`default`, `capabilities`).

## What to Build

Modify `src/model-config.ts` to add:

1. **`PioGuardsConfig` interface** — a small nested type for guard-related settings:
   ```typescript
   export interface PioGuardsConfig {
     turnThreshold?: number;
   }
   ```

2. **Extend `PioConfig`** — add an optional `guards` field:
   ```typescript
   export interface PioConfig {
     default?: PioModelEntry;
     capabilities?: Record<string, PioModelEntry>;
     guards?: PioGuardsConfig;
   }
   ```

3. **`DEFAULT_TURN_THRESHOLD` constant** — exported, value `12`.

4. **`readTurnThreshold(): number` function** — reads from config via `readConfig()`, extracts `guards?.turnThreshold`, validates it is a positive integer, and falls back to `DEFAULT_TURN_THRESHOLD` on any invalid value. The function must:
   - Call `readConfig()` (re-uses existing cached config — no new file I/O).
   - If config is `undefined` or `guards` is absent/invalid, return the default.
   - If `turnThreshold` is not a positive integer (`> 0` and `Number.isInteger()`), return the default.
   - On valid input, return the configured value.

### Code Components

- **`PioGuardsConfig`** (new interface) — shape of the `guards` config block. Currently only `turnThreshold`, designed to extend with more guard settings in the future (e.g., `deadTurnLimit`).
- **`DEFAULT_TURN_THRESHOLD`** (new constant, value 12) — exported for use by `session-guard.ts` in Step 2 and for reference in tests.
- **`readTurnThreshold()`** (new function) — pure config reader with validation. Returns `number`. Follows the pattern of `resolveModelForCapability()` but simpler: single-value read with integer validation instead of model resolution logic.

### Approach and Decisions

- Re-use `_cachedConfig` via `readConfig()` — no separate cache needed. The existing caching handles file I/O once-per-session.
- Validation is defensive: missing, zero, negative, non-integer (`3.5`), `null`, `undefined`, or string values all fall back to the default. This prevents misconfiguration from breaking the guard.
- `readTurnThreshold()` does NOT read the filesystem directly — it delegates entirely to `readConfig()`. This keeps the config reading centralized and testable via `PIO_CONFIG_TEST_HOME` env var.
- The function returns a `number` (never `undefined`) because there's always a valid default. Callers don't need null checks.

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/model-config.ts` — extend `PioConfig`, add `PioGuardsConfig`, add `DEFAULT_TURN_THRESHOLD`, add `readTurnThreshold()`
- `src/model-config.test.ts` — add test suite for `readTurnThreshold()` covering valid values, fallback cases, and validation edge cases

## Acceptance Criteria

- `PioConfig` interface includes an optional `guards` field of type `PioGuardsConfig | undefined`.
- `PioGuardsConfig` is exported and contains `turnThreshold?: number`.
- `DEFAULT_TURN_THRESHOLD` is exported as a constant with value `12`.
- `readTurnThreshold()` returns the configured value when `~/.pi/pio-config.yaml` contains a valid positive integer under `guards.turnThreshold`.
- `readTurnThreshold()` returns `DEFAULT_TURN_THRESHOLD` (12) when config file is missing, empty, or `turnThreshold` is absent, zero, negative, non-integer (`3.5`), `null`, or a string.
- `readTurnThreshold()` re-uses cached config from `readConfig()` — no additional file I/O.
- `npx tsc --noEmit` reports no type errors.
- `npx vitest run src/model-config.test.ts` passes all tests (existing + new).

## Risks and Edge Cases

- **Config caching interaction:** If a test writes a new config file between calls, the cache must be invalidated. Existing tests use `vi.resetModules()` + `PIO_CONFIG_TEST_HOME` — follow this same pattern for new tests.
- **YAML type coercion:** YAML may parse `12.0` as a number (integer-like float). `Number.isInteger(12.0)` returns `true`, so this should work correctly. However, `Number.isInteger(NaN)`, `Number.isInteger(Infinity)` return `false` — these correctly fall back to default.
- **Negative thresholds:** A value like `-5` is technically a valid integer but not meaningful. Must fall back to default (check `> 0`).
- **Zero threshold:** `0` is an integer but would fire immediately. Must fall back to default.
