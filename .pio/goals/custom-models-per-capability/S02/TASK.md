# Task: Modify `src/capabilities/session-capability.ts` — wire model switching into `before_agent_start`

Add per-capability model resolution to the existing `before_agent_start` handler so that pio sub-sessions automatically switch to the configured model before each agent turn.

## Context

Currently all pio capability sub-sessions inherit whatever model is active in the parent session. Step 1 (`src/model-config.ts`) provides a `resolveModelForCapability(capabilityName)` function that reads `~/.pi/pio-config.yaml` and returns the appropriate `{ provider, modelId }` for any capability name — or `undefined` if no mapping exists.

This step wires that resolution into the session lifecycle: before each agent turn, look up the configured model and switch to it via `pi.setModel()`. When no config exists (the default case), behavior is entirely unchanged.

## What to Build

Modify the existing `before_agent_start` handler in `setupCapability()` to perform model resolution after prompt injection. The handler already has access to `pi` (ExtensionAPI) — it needs context (ExtensionContext) to access `modelRegistry.find()`.

### Code Components

#### 1. Module-level variable for capability name

Add a module-level `let` declaration:
```ts
let capabilityName: string | undefined;
```

Populate it during `resources_discover`:
```ts
// Inside resources_discover, after reading config:
capabilityName = config.capability;
```

This stores the capability name (e.g. `"create-goal"`, `"execute-task"`) so it's available in `before_agent_start`.

#### 2. Import `resolveModelForCapability`

Add at the top of `session-capability.ts`:
```ts
import { resolveModelForCapability } from "../model-config";
```

No changes to `types.ts` are needed for this step — the model resolution is purely internal to session-capability.

#### 3. Model-switching logic in `before_agent_start`

After the existing prompt injection logic (the `{ message: { customType: ... } }` return block), add model resolution:

1. If `capabilityName` is `undefined`, skip resolution entirely (non-capability session).
2. Call `resolveModelForCapability(capabilityName)` to get `{ provider, modelId } | undefined`.
3. If resolved, use `ctx.modelRegistry.find(provider, modelId)` to get the full `Model<any>` object from pi's registry.
4. **Skip if current model already matches:** Compare the current model (available as `ctx.model`) against the target — if both `provider` and `id` match, skip the `setModel()` call to avoid redundant work.
5. Call `await pi.setModel(model)` with the resolved model from the registry.

**Important timing considerations:**
- The model switch happens inside `before_agent_start`, which runs after `findInitialModel()` but before the LLM call (pi's agent-session.js:1080). This is confirmed to work by source tracing.
- On session resume, `before_agent_start` fires on the first prompt() of the resumed session, re-applying the configured model.
- If `setModel()` throws (e.g., no API key for that provider), the error propagates naturally — this indicates user misconfiguration and is expected behavior.

**Key implementation detail:** The current handler signature is `async () => { ... }`. To access `ctx.modelRegistry` and `ctx.model`, change it to accept `(event, ctx)` parameters:
```ts
pi.on("before_agent_start", async (_event, ctx) => {
  // existing prompt injection logic...
  // new model-switching logic below...
});
```

This is type-safe — `ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>` is typed as `(event, ctx: ExtensionContext) => ...`.

### Approach and Decisions

- **Use `ctx.modelRegistry.find()` from the handler context:** The `before_agent_start` handler receives `ExtensionContext` as its second parameter. This gives access to `modelRegistry.find(provider, modelId)` for full Model lookup, and `ctx.model` for current-model comparison. Follow the approach documented in DECISIONS.md.
- **Module-level capability name capture:** Consistent with how session-capability already uses module-level state (`systemPrompt`, `projectContext`) shared across `resources_discover` → `before_agent_start`. No architectural change needed.
- **No changes to `launchCapability()`:** Model switching happens in `before_agent_start`, not during session creation. `launchCapability()` remains unchanged.
- **Error tolerance:** If `modelRegistry.find()` returns `undefined` (model not found in registry), skip silently — don't crash the session. Log a warning via `console.warn` for debugging.

## Dependencies

- **Step 1 must be completed:** Requires `src/model-config.ts` with exported `resolveModelForCapability()`. This step depends on Step 1's implementation and types (`PioModelEntry`).

## Files Affected

- `src/capabilities/session-capability.ts` — modified: add import, module-level variable, model-switching logic in `before_agent_start`
- `src/capabilities/session-capability.test.ts` — modified: add tests for model resolution behavior

## Acceptance Criteria

- [ ] `npm run check` reports no type errors
- [ ] `npm run test` passes with all existing tests (no regressions) + new model-resolution tests
- [ ] The import of `resolveModelForCapability` from `../model-config` compiles correctly
- [ ] Model resolution only runs when `capabilityName` is defined (no crash on non-capability sessions)
- [ ] If the current model already matches the configured model, no redundant `pi.setModel()` call occurs
- [ ] When `~/.pi/pio-config.yaml` doesn't exist or has no mapping for a capability, sessions inherit parent's model as before (no behavior change)
- [ ] When model is found in config but `modelRegistry.find()` returns undefined (not in registry), the session continues without crashing — logs a warning

## Risks and Edge Cases

- **Model not in registry:** If the user configures a provider/model combo that doesn't exist in pi's model registry, `find()` returns undefined. Handle gracefully — log warning, skip switch.
- **Auth failure:** If `setModel()` throws because no API key is configured for that provider, this is expected behavior — the error should propagate naturally to surface misconfiguration to the user.
- **Race conditions:** Multiple capabilities sharing module-level state could cause interference if sessions overlap. However, pio sub-sessions are sequential (not concurrent), so this is not a practical concern.
- **Session resume:** On session resume, `before_agent_start` fires on the first prompt(). The model switch re-applies automatically — verify this behavior works correctly with resumed sessions.
