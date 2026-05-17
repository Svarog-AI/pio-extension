# Custom Models Per Capability Session

Allow configuring different AI models for different pio capability sub-sessions via a `~/.pi/pio-config.yaml` file. Users define which model each capability uses (e.g., fast/cheap models for planning, more capable models for code review). When no mapping is configured, the session inherits the parent's model - no change to existing behavior.

## Current State

All pio capability sub-sessions inherit whatever model is active in the parent session. There is no mechanism to specify different models for different workflow steps.

**Relevant files and current behavior:**

- **`src/types.ts`** - `CapabilityConfig` defines the configuration passed to a capability sub-session (`capability`, `prompt`, `workingDir`, `validation`, `readOnlyFiles`, `writeAllowlist`, `initialMessage`, `prepareSession`). No model-related field exists.

- **`src/capabilities/session-capability.ts`** - `launchCapability(ctx, config)` creates sub-sessions via `ctx.newSession({ parentSession, setup })`. The session manager's `appendModelChange(provider, modelId)` method is available but never called. Sub-sessions inherit the parent's model through pi's `findInitialModel()` resolution chain.

- **No per-capability configuration file exists.** All capability behavior (prompts, validation rules, file protections) is hardcoded in each capability's `CAPABILITY_CONFIG` export or derived from goal workspace files.

**Upstream constraint:** The pi framework's `NewSessionOptions` supports only `id?: string` and `parentSession?: string` - no model field. This goal uses the existing `appendModelChange()` API as an extension-side workaround. An upstream issue for proper support should be filed separately.

## To-Be State

A new global config file `~/.pi/pio-config.yaml` lets users define a default model for all pio sessions, plus per-capability overrides. This lives in pi's global directory — not project-local — because it's a user preference that applies across all projects using pio.

```yaml
# Default model for ALL pio capability sessions
default:
  provider: j6000
  modelId: qwen3.6-27b-mtp:general

# Per-capability overrides (optional)
capabilities:
  execute-task:
    provider: j6000
    modelId: qwen3.6-27b-mtp:coding
```

**Resolution order (specific beats general):**
1. Is there a per-capability mapping? If yes → use it.
2. Otherwise, is there a `default`? If yes → use it for *all* pio capability sessions.
3. If neither exists → no change from today: inherit parent's model via pi's `findInitialModel()`.

**How it works:** Every time a pio capability launches a sub-session, the extension reads `~/.pi/pio-config.yaml`, looks up the capability name first, falls back to `default` if not found, and applies the resolved model via `appendModelChange(provider, modelId)`. If no model is resolved at all (no config file, no default), behavior is unchanged.

**Key behavior:** With this config, all pio sessions (goal definition, planning, specification writing, review) use `qwen3.6-27b-mtp:general` by default. Only `execute-task` sessions get the `:coding` model override. Users add entries under `capabilities:` only when a capability needs to differ from the baseline.

**Changes required:**

- **New file: `src/config.ts` (or similar)** - Reads `~/.pi/pio-config.yaml`, parses default and per-capability model mappings, provides a lookup function used at launch time. Must resolve the `.pi/` directory path at runtime (e.g., via `os.homedir()` or from pi framework APIs).
- **Modified: `src/types.ts`** - `CapabilityConfig` gains `model?: { provider: string; modelId: string }`. Used internally to pass the resolved model from config reader to `launchCapability()`. Not a user-facing setting.
- **Modified: `src/capabilities/session-capability.ts`** - Before calling `ctx.newSession()`, consult the config reader. If a model mapping exists for the capability, populate `config.model` and call `newSm.appendModelChange()` during setup.

**Open question to resolve during implementation:** Does `appendModelChange()` called during the `setup` callback actually affect the agent's initial model selection, or does pi's `findInitialModel()` run before the session tree is populated? If it doesn't work as expected, the goal may need to be adjusted (e.g., waiting for proper upstream support via `NewSessionOptions.model`).
