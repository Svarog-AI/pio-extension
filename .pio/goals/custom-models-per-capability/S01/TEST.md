# Tests: Create `src/model-config.ts` — config reader and resolver

## Unit Tests

**File:** `src/model-config.test.ts`  
**Test runner:** Vitest (Node.js environment, globals enabled)

Follow the existing test conventions: colocated `.test.ts`, temp directories for filesystem isolation, `beforeEach`/`afterEach` cleanup.

### `describe('getConfigPath')`

- **Test:** returns path containing `os.homedir()`, `.pi`, and `pio-config.yaml`
  - Arrange: call `getConfigPath()`
  - Assert: result includes `os.homedir()`, `.pi/`, and ends with `pio-config.yaml`

### `describe('readConfig')` — no config file exists

- **Test:** returns `undefined` when file doesn't exist
  - Arrange: ensure temp dir has no `pio-config.yaml` (use `vi.spyOn(os, 'homedir').mockReturnValue(tempDir)`)
  - Act: call `readConfig()`
  - Assert: result is `undefined`

- **Test:** returns `undefined` when file is empty
  - Arrange: create an empty `pio-config.yaml` in temp dir
  - Act: call `readConfig()`
  - Assert: result is `undefined`

- **Test:** returns `undefined` when file contains only whitespace
  - Arrange: write `"   \n  "` to the config file
  - Act: call `readConfig()`
  - Assert: result is `undefined`

### `describe('readConfig')` — malformed YAML

- **Test:** returns `undefined` for syntactically invalid YAML
  - Arrange: write `{ invalid: yaml: broken` to the config file
  - Act: call `readConfig()`
  - Assert: result is `undefined`, no exception thrown

### `describe('readConfig')` — valid config parsing

- **Test:** parses a config with only `default:`
  - Arrange: write YAML with `default:\n  provider: j6000\n  modelId: my-model`
  - Act: call `readConfig()`
  - Assert: returns `{ default: { provider: "j6000", modelId: "my-model" }, capabilities: undefined }`

- **Test:** parses a config with `capabilities:` entries
  - Arrange: write YAML with `default:` + `capabilities:\n  execute-task:\n    provider: j6000\n    modelId: coding-model`
  - Act: call `readConfig()`
  - Assert: `result.capabilities?.["execute-task"]` equals `{ provider: "j6000", modelId: "coding-model" }`

- **Test:** caches result — second call returns same object without re-reading file
  - Arrange: write valid config, spy on `fs.readFileSync`
  - Act: call `readConfig()` twice
  - Assert: `fs.readFileSync` was called only once; both calls return the same parsed config

### `describe('resolveModelForCapability')` — no config

- **Test:** returns `undefined` when no config file exists
  - Arrange: mock homedir to a temp dir with no config
  - Act: call `resolveModelForCapability("create-plan")`
  - Assert: result is `undefined`

### `describe('resolveModelForCapability')` — default only

- **Test:** returns default for any capability name when only `default:` is set
  - Arrange: write config with only `default: { provider: "j6000", modelId: "general" }`
  - Act: call `resolveModelForCapability("create-plan")`, `resolveModelForCapability("execute-task")`, `resolveModelForCapability("review-code")`
  - Assert: all return `{ provider: "j6000", modelId: "general" }`

### `describe('resolveModelForCapability')` — per-capability override

- **Test:** per-capability entry takes precedence over default
  - Arrange: write config with `default: { provider: "j6000", modelId: "general" }` and `capabilities.execute-task: { provider: "j6000", modelId: "coding" }`
  - Act: call `resolveModelForCapability("execute-task")`
  - Assert: returns `{ provider: "j6000", modelId: "coding" }` (the override, not the default)

- **Test:** unmatched capability falls back to default
  - Arrange: same config as above
  - Act: call `resolveModelForCapability("create-plan")` (no override exists for this)
  - Assert: returns `{ provider: "j6000", modelId: "general" }` (the default)

- **Test:** completely unknown capability with only capabilities (no default) returns `undefined`
  - Arrange: write config with only `capabilities:\n  execute-task: ...` and no `default:`
  - Act: call `resolveModelForCapability("unknown-capability")`
  - Assert: returns `undefined`

### `describe('resolveModelForCapability')` — cache invalidation between tests

- **Test:** different calls after clearing cache see new config state
  - Arrange: write config A, call resolver, then modify file to config B
  - Note: Since the module caches internally, tests must account for this. Use `vi.resetModules()` before each test or spy on internal caching behavior. The simplest approach: mock `os.homedir` to different temp dirs per test so each test gets a fresh "first read."

### Shared test setup

Each test group that needs filesystem isolation should:
1. Call `vi.spyOn(os, 'homedir').mockReturnValue(tempDir)` before the test
2. Restore the mock after (`afterEach`)
3. Create/modify `tempDir/.pi/pio-config.yaml` as needed

## Programmatic Verification

- **What:** TypeScript compilation succeeds with no errors
- **How:** Run `npm run check` (which runs `tsc --noEmit`)
- **Expected result:** Exit code 0, no output about type errors

- **What:** `src/model-config.ts` exports the required symbols
- **How:** Run `grep -c 'export' src/model-config.ts` and verify it contains exports for `PioModelEntry`, `PioConfig`, `getConfigPath`, `readConfig`, and `resolveModelForCapability`
- **Expected result:** All five names are present as exported symbols

## Test Order

1. Unit tests: `vitest run src/model-config.test.ts` (all describe blocks)
2. Programmatic verification: `npm run check`

Tests within the file can run in any order. Use `vi.spyOn(os, 'homedir')` to isolate each test's filesystem path so caching doesn't leak between tests.
