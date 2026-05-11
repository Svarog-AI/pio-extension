# Support custom models per capability session

# Allow configuring different AI models for different capability sessions

## Problem

All pio capability sub-sessions use whatever model is currently active in the parent session. There's no way to specify that, for example:

- Planning sessions should use a fast/cheap model (e.g., Claude Sonnet)
- Code review sessions should use a more capable model (e.g., Claude Opus)
- Implementation sessions should use the default user preference

This is valuable because different workflow steps have different reasoning requirements and cost constraints.

## Current limitations

The pi framework's `NewSessionOptions` supports only `id?: string` and `parentSession?: string` — no model field:

```ts
// dist/core/session-manager.d.ts
export interface NewSessionOptions {
    id?: string;
    parentSession?: string;
}
```

`launchCapability()` in `session-capability.ts` passes `{ parentSession, setup }` to `ctx.newSession()`. The sub-session's agent is created with whatever model pi resolves via `findInitialModel()` (CLI → scoped → session restore → default → first available).

The session manager does support `appendModelChange(provider, modelId)` to record model changes in the session tree, but initial model selection likely happens during `createAgentSession()` before this entry takes effect. The SDK's `CreateAgentSessionOptions.model` accepts an explicit model, but this isn't exposed through the extension API's `newSession()`.

## Proposed solution

### Option A: Framework-level support (preferred)

Request pi add `model?: { provider: string; modelId: string }` to `NewSessionOptions`. When set, the sub-session uses that model instead of inheriting from the parent.

### Option B: Extension-only workaround with `appendModelChange`

Add an optional `model` field to `CapabilityConfig`:

```ts
interface CapabilityConfig {
  capability: string;
  prompt: string;
  workingDir?: string;
  validationRules?: ValidationRule[];
  readOnlyFiles?: string[];
  writeOnlyFiles?: string[];
  initialMessage?: string;
  model?: { provider: string; modelId: string }; // NEW
}
```

In `launchCapability()`, call `newSm.appendModelChange(config.model.provider, config.model.modelId)` during setup. This may not affect the *initial* model selection (if `findInitialModel` runs before reading the session tree), but could work if pi re-evaluates the session tree after setup. **Needs testing to verify.**

### Option C: Configuration-driven defaults

Define capability-to-model mappings in `.pio/config.yaml` or a similar config file:

```yaml
capabilities:
  create-plan:
    model: anthropic/claude-sonnet-4-5
  review-code:
    model: anthropic/claude-opus-4-5
  execute-task:
    model: anthropic/claude-sonnet-4-5  # or omit to inherit
```

The extension reads this config and flows the model through `CapabilityConfig` to `launchCapability()`.

### Option D: Per-goal model overrides

Allow overriding at the goal level in `.pio/goals/<name>/GOAL.md` frontmatter or a separate config:

```yaml
# In GOAL.md frontmatter
models:
  create-plan: anthropic/claude-sonnet-4-5
  execute-task: openai/gpt-4.1-mini
```

## Implementation approach

A pragmatic combination of **B + C** would work today:

1. Add `model?: { provider: string; modelId: string }` to `CapabilityConfig`
2. In `launchCapability()`, call `newSm.appendModelChange()` if model is set
3. Support capability-level defaults via a `.pio/config.yaml` section
4. Allow per-goal overrides (merging with defaults)
5. File an upstream pi issue for Option A (proper `NewSessionOptions.model`)

## Files involved

- `src/types.ts` — Extend `CapabilityConfig` with `model` field
- `src/capabilities/session-capability.ts` — Read model from config, call `appendModelChange()` in setup
- Potentially a new config reader for `.pio/config.yaml` capability model mappings
- All capabilities that construct `CapabilityConfig` (to flow model through)

## Open questions

- Does `appendModelChange()` in `setup` actually affect the agent's initial model? (pi internals)
- Should there be a `/pio-model` command to check/change per-capability model assignments?
- How do we handle model availability (what if the specified model/provider isn't configured)?

## Category

feature

## Category

feature

## Context

pi framework types: `NewSessionOptions` (session-manager.d.ts), `CreateAgentSessionOptions.model` (sdk.d.ts), `SessionManager.appendModelChange()` (session-manager.d.ts). Current implementation: `launchCapability()` in src/capabilities/session-capability.ts only passes `{ parentSession, setup }` to `ctx.newSession()`.
