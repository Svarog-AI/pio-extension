# Summary: Create `src/model-config.ts` — config reader and resolver

## Status
COMPLETED

## Files Created
- `src/model-config.ts` — Config reader and resolver module. Reads `~/.pi/pio-config.yaml`, parses YAML, caches result, and provides `resolveModelForCapability()` lookup.
- `src/model-config.test.ts` — 16 unit tests covering path resolution, config parsing (missing/empty/malformed/valid), caching, and model resolution (no config, default-only, per-capability override).

## Files Modified
(none — this is Step 1 with no prior dependencies)

## Files Deleted
(none)

## Decisions Made
- **Test isolation strategy:** Use `PIO_CONFIG_TEST_HOME` env var instead of mocking `os.homedir()` via `vi.spyOn`. This avoids issues with mocking native module exports in ESM and is cleaner for temp-dir-based filesystem tests.
- **`vi.resetModules()` per test group:** Each `beforeEach` resets modules so every test gets a fresh module instance with a clean cache, preventing cross-test contamination.
- **Synchronous file I/O:** Config is read once per session and cached — `fs.readFileSync` is acceptable for a small static config file.

## Review Issues Addressed (re-execution)
- **[LOW] Redundant ternary on line 65:** Simplified `return _cachedConfig === undefined ? undefined : _cachedConfig` to `return _cachedConfig`.
- **[LOW] Empty object returned for unrecognized keys:** Added guard after building config — if neither `default` nor `capabilities` were populated, returns `undefined` instead of `{}`.
- **[NEW TEST] Unrecognized keys:** Added test `"returns undefined when config has only unrecognized keys"` to verify the fix.

## Test Coverage
| Criterion | Verification | Status |
|-----------|-------------|--------|
| `npm run check` no type errors | `tsc --noEmit` exit code 0 | ✅ PASS |
| `resolveModelForCapability` exported/importable | Used in all resolver tests | ✅ PASS |
| Missing file → `undefined` without throwing | Test: "returns undefined when file doesn't exist" | ✅ PASS |
| Only `default:` set → returns default | Tests: create-plan, execute-task, review-code (3 tests) | ✅ PASS |
| Per-capability override beats `default:` | Test: "per-capability entry takes precedence over default" | ✅ PASS |
| Config path via `os.homedir()` | Test: "returns path containing os.homedir(), .pi, and pio-config.yaml" | ✅ PASS |
| Unrecognized keys → `undefined` | Test: "returns undefined when config has only unrecognized keys" | ✅ PASS |
| `npm run test` passes | 285/285 tests green (12 files) | ✅ PASS |
