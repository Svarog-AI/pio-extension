# Decisions: Step 2 — Wire model switching into `before_agent_start`

## Test Isolation Strategy (carried from Step 1)
- Use `PIO_CONFIG_TEST_HOME` env var to override config path in tests instead of mocking `os.homedir()`. Avoids ESM native module mock issues. **Impact:** Any test that exercises `resolveModelForCapability` through session-capability must also set this env var or expect real filesystem reads.
- Each test group should use `vi.resetModules()` in `beforeEach` to get a fresh module cache for model-config. **Impact:** Ensures tests don't leak cached config across test cases.

## Model Lookup Strategy (new — Step 2)
- Use `ctx.modelRegistry.find(provider, modelId)` from the `ExtensionContext` passed to `before_agent_start` handlers, then call `pi.setModel(model)` with the full resolved `Model` object. **Reason:** `setModel()` expects a complete `Model<any>` with auth validation — constructing one manually would fail type checks and runtime auth validation. The registry provides the canonical model objects.

## Capability Name Capture (new — Step 2)
- Store `capabilityName` at module level during `resources_discover` (from `config.capability`). **Impact:** Enables model resolution in `before_agent_start` without passing state between handlers. Must be `undefined` for non-capability sessions to skip resolution safely.

## Skipping Redundant Switches (new — Step 2)
- Compare current model against resolved target before calling `setModel()`. If provider + id match, skip the call. **Impact:** Avoids unnecessary auth checks and session mutations when the model is already correct.
