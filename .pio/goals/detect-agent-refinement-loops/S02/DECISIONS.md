# Accumulated Decisions (through Step 1)

## Config Validation

- **Double-validation on `readTurnThreshold()`:** The function performs its own validation (`typeof "number"`, `Number.isInteger()`, `> 0`) rather than relying solely on `readConfig()` parsing. This provides a safety net: even if cached config contains a stale value, the function falls back to the default. Downstream code that calls `readTurnThreshold()` can trust the return value is always a valid positive integer.

- **`guards` block participation in "no recognized entries" check:** A config file containing only `guards: { turnThreshold: 20 }` (with no `default` or `capabilities`) is treated as a valid config, not ignored. This ensures the threshold can be configured standalone without requiring other config keys.

## Type Design

- **`PioGuardsConfig` is extensible:** Designed as an open-ended interface for future guard settings (e.g., `deadTurnLimit`). If additional guard config fields are needed in future steps, extend this interface rather than creating new top-level config keys.
