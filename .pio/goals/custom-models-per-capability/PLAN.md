# Plan: Custom Models Per Capability

Read `~/.pi/pio-config.yaml` at sub-session launch and use `pi.setModel(model)` in the `before_agent_start` handler to apply per-capability model overrides before each agent turn. When no mapping is configured, behavior is unchanged — sessions inherit the parent's model.

## Prerequisites

- `js-yaml` is already a dependency (in `package.json`) for YAML parsing — no new packages needed.
- The `~/.pi/` directory must exist on the user's machine (created by pi itself during normal operation).

## Steps

### Step 1: Create `src/model-config.ts` — config reader and resolver

**Description:** New module responsible for reading `~/.pi/pio-config.yaml`, parsing it, and providing a lookup function. The config shape is:

```yaml
default:
  provider: j6000
  modelId: qwen3.6-27b-mtp:general

capabilities:
  execute-task:
    provider: j6000
    modelId: qwen3.6-27b-mtp:coding
```

The module exports a `resolveModelForCapability(capabilityName: string): { provider: string; modelId: string } | undefined` function that implements the resolution order: per-capability override first, then default, then undefined (no change).

The config file path is resolved at runtime via `os.homedir()` + `.pi/pio-config.yaml`. Reading and parsing happens lazily on first call, then cached for the session lifetime. If the file doesn't exist, is malformed, or is empty, the resolver returns `undefined` — no error thrown, just no model override.

**Interface signature:**

```ts
export interface PioModelEntry {
  provider: string;
  modelId: string;
}

export interface PioConfig {
  default?: PioModelEntry;
  capabilities?: Record<string, PioModelEntry>;
}

/** Returns the resolved model for a capability name, or undefined if no mapping exists. */
export function resolveModelForCapability(capabilityName: string): PioModelEntry | undefined;
```

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] `resolveModelForCapability` is exported and importable from `src/model-config.ts`
- [ ] When config file doesn't exist, `resolveModelForCapability("any-capability")` returns `undefined` without throwing
- [ ] When only `default:` is set, `resolveModelForCapability("any-capability")` returns that default
- [ ] When a per-capability override exists, it takes precedence over `default:`
- [ ] The config path resolves correctly via `os.homedir() + "/.pi/pio-config.yaml"`

**Files affected:**
- `src/model-config.ts` — new file: YAML reader, cache, and resolver function

### Step 2: Modify `src/capabilities/session-capability.ts` — wire model switching into `before_agent_start`

**Description:** In the existing `before_agent_start` handler (already registered in `setupCapability`), add model resolution logic. The handler already has access to `pi` (the `ExtensionAPI`) and reads `pio-config` during `resources_discover` (where `capabilityName` is available).

After the existing prompt injection logic, check for a configured model:

1. Import `resolveModelForCapability` from `../model-config`.
2. During `before_agent_start`, if `capabilityName` is known, call `resolveModelForCapability(capabilityName)`.
3. If a model entry is resolved and the current model (from `pi.getModel()`) doesn't already match the target provider/modelId, call `pi.setModel({ provider, id: modelId })` to switch the live agent model before the LLM call.

The `capabilityName` variable is already available as a module-level in `session-capability.ts` (captured during `resources_discover`). If it's `undefined`, skip model resolution — this happens for non-capability sessions where no pio-config exists.

**Key timing:** This runs inside `prompt()` (agent-session.js:776), after `findInitialModel()` has already set the initial model but before the LLM call. Calling `pi.setModel()` at this point directly sets `agent.state.model`, which takes effect for the current turn. On session resume, `before_agent_start` fires on the first prompt() of the resumed session, re-applying the configured model.

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] The import of `resolveModelForCapability` from `../model-config` compiles correctly
- [ ] Model resolution only runs when `capabilityName` is defined (no crash on non-capability sessions)
- [ ] If the current model already matches the configured model, no redundant `pi.setModel()` call occurs
- [ ] No changes to existing behavior: when `~/.pi/pio-config.yaml` doesn't exist or has no mapping for a capability, sessions inherit parent's model as before

**Files affected:**
- `src/capabilities/session-capability.ts` — add import and model-switching logic in the existing `before_agent_start` handler

### Step 3: Verify compilation and backwards compatibility

**Description:** Run type checking to confirm all new imports resolve correctly and no regressions are introduced. The changes only touch two files (`model-config.ts` (new) and `session-capability.ts` (modified)) and don't affect any other capability, the public API surface, or existing behavior when the config file is absent.

**Acceptance criteria:**
- [ ] `npm run check` reports zero type errors
- [ ] No other files in `src/` require changes to compile
- [ ] Existing test suite passes with no regressions: `npm run test` completes successfully

## Notes

- **Model object shape for `pi.setModel()`:** The `ExtensionAPI.setModel()` method expects a model object with at least `{ provider: string, id: string }`. We construct this directly from the config values (`modelId` in YAML → `id` in the call). If pi's internal auth validation rejects it (e.g., `hasConfiguredAuth` fails), an error will be thrown — this is expected behavior that signals a misconfiguration.
- **Config caching:** The config file is read once per session lifetime (lazy load on first call to `resolveModelForCapability`). This avoids repeated filesystem I/O. If the user edits the config mid-session, changes take effect on the next sub-session launch.
- **Error handling:** If the YAML file is malformed or missing, `resolveModelForCapability` returns `undefined` silently. No model switch occurs. This ensures backwards compatibility — existing behavior (inherit parent model) is preserved when no config exists.
- **Upstream concern:** The GOAL.md mentions an "open question" about whether `appendModelChange()` in setup actually works. Our approach bypasses this entirely by using `pi.setModel()` in `before_agent_start`, which directly modifies `agent.state.model` right before the LLM call. This has been confirmed effective by tracing pi's source code (`agent-session.js:1080-1095`).
