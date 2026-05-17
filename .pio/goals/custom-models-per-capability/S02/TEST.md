# Tests: Modify `src/capabilities/session-capability.ts` — wire model switching into `before_agent_start`

## Unit Tests

### File: `src/capabilities/session-capability.test.ts` (add new describe blocks)

**Test runner:** Vitest (already configured in `vitest.config.ts`)

### New describe block: "model resolution — setupCapability and before_agent_start"

This tests the integration between `setupCapability()`, the `before_agent_start` handler, and model resolution. Since `setupCapability()` registers event handlers on a `pi` object (ExtensionAPI), we mock the pi API to capture handler registrations, then invoke handlers manually with controlled context.

**Test strategy:**
1. Use `vi.mock("../model-config")` at the top of the test file (or in this describe block) to control what `resolveModelForCapability` returns.
2. Create a mock `pi` object that captures handlers registered via `pi.on()`.
3. Call `setupCapability(mockPi)` to register handlers.
4. Trigger the captured `resources_discover` handler with a config containing a capability name.
5. Trigger the captured `before_agent_start` handler with a context containing a mock `modelRegistry`.
6. Assert that `pi.setModel()` is called (or not called) based on config state.

**Test setup pattern:**
```ts
// Mock model-config to control resolution output
const resolveModelMock = vi.fn();
vi.mock("../model-config", () => ({
  resolveModelForCapability: resolveModelMock,
}));

// Capture handlers registered via pi.on()
const registeredHandlers: Record<string, Function> = {};
const mockPi = {
  on: (event, handler) => { registeredHandlers[event] = handler; },
  setModel: vi.fn().mockResolvedValue(true),
};
```

**Test cases:**

1. `describe("model resolution integration"): "calls pi.setModel() when config has a model override"` — Set up a capability session with `"create-goal"`, mock `resolveModelForCapability` to return `{ provider: "j6000", modelId: "general" }`, mock `ctx.modelRegistry.find()` to return a Model object, mock `ctx.model` to be a different model. Trigger both `resources_discover` and `before_agent_start`. Assert `pi.setModel()` was called once with the resolved model.

2. `"skips pi.setModel() when current model already matches"` — Same setup but `ctx.model` has matching `provider` and `id`. Assert `pi.setModel()` was NOT called.

3. `"skips resolution when capabilityName is undefined"` — Don't trigger `resources_discover` (so capabilityName stays undefined). Trigger `before_agent_start`. Assert `resolveModelForCapability` was NOT called.

4. `"skips resolution when resolveModelForCapability returns undefined"` — Capability defined, but mock returns `undefined` (no config file). Assert `pi.setModel()` was NOT called.

5. `"skips setModel() when modelRegistry.find() returns undefined"` — Config resolves a model, but `ctx.modelRegistry.find()` returns `undefined` (model not in registry). Assert `pi.setModel()` was NOT called. Verify `console.warn` was called.

6. `"capabilityName is captured from config.capability during resources_discover"` — Trigger `resources_discover` with config.capability = "execute-task". Import and verify the internal state reflects this. Since module-level variables aren't exported, test indirectly: trigger `before_agent_start` and verify `resolveModelForCapability("execute-task")` was called (verifying the captured name is used correctly).

**Test setup considerations:**
- Use `vi.resetModules()` in `beforeEach` to get a fresh session-capability module instance.
- Set `process.env.PIO_CONFIG_TEST_HOME` to a temp dir so model-config tests don't hit real filesystem.
- After each test, restore env var and clean up temp dir.

### New describe block: "model resolution — backwards compatibility"

These verify that existing behavior is preserved when no config exists.

1. `"no setModel call when PIO_CONFIG_TEST_HOME has no config file"` — Ensure `resolveModelForCapability` returns undefined (no file) and the session proceeds normally.
2. `"prompt injection still works alongside model resolution"` — Trigger `before_agent_start` with a valid prompt file and verify both prompt injection return value AND model resolution logic execute correctly.

## Programmatic Verification

- **What:** TypeScript compilation succeeds with no errors after adding the new import and handler changes
  **How:** `npm run check` (runs `tsc --noEmit`)
  **Expected result:** Exit code 0, no output

- **What:** All existing tests pass (no regressions from session-capability.ts changes)
  **How:** `npm run test` (vitest)
  **Expected result:** All 285+ tests pass with exit code 0

- **What:** New import of `resolveModelForCapability` is present in session-capability.ts
  **How:** `grep 'resolveModelForCapability' src/capabilities/session-capability.ts`
  **Expected result:** At least one match (the import line)

## Manual Verification

No manual verification needed — all acceptance criteria are covered by unit tests and type checking.

## Test Order

1. Programmatic verification (`npm run check`) — fast fail on type errors
2. Unit tests for model resolution integration — verify handler logic with mocked pi API
3. Unit tests for backwards compatibility — prove existing behavior is preserved
4. Full test suite (`npm run test`) — confirm no regressions
