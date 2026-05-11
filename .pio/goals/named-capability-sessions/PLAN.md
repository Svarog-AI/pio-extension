# Plan: Named Capability Sessions

Add human-readable session names to all pio sub-sessions using `setSessionName()` in the `withSession` callback, so sessions appear as `<goal-name> <capability>` (e.g., `my-feature create-plan`) or `<goal-name> <capability> s{N}` with step number (e.g., `my-feature evolve-plan s3`). Non-goal sessions use just `<capability>` (e.g., `project-context`). Goal names and capability names are used as-is — no slugification.

## Prerequisites

None.

## Steps

### Step 1: Add `sessionName` field to `CapabilityConfig`

**Description:** Add an optional `sessionName?: string` field to the `CapabilityConfig` interface in `src/types.ts`. This carries the human-readable name that will be applied to each sub-session via `setSessionName()`.

**Acceptance criteria:**
- [ ] `CapabilityConfig` in `src/types.ts` has a new optional field `sessionName?: string` with a JSDoc comment explaining its purpose
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/types.ts` — add `sessionName?: string` to `CapabilityConfig` interface

### Step 2: Derive session name in `resolveCapabilityConfig()`

**Description:** Inside `resolveCapabilityConfig()` in `src/utils.ts`, compute the session name from `goalName` + `capability` + optional `stepNumber` before building the returned `CapabilityConfig`. Introduce a small helper function `deriveSessionName(goalName: string, capability: string, stepNumber?: number): string` that:
- Returns `<goal-name> <capability> s{N}` when both `goalName` and `stepNumber` are present
- Returns `<goal-name> <capability>` when only `goalName` is present
- Returns just `<capability>` for non-goal sessions (empty or missing `goalName`)
- Uses spaces as separators between components — goal names and capability names are used as-is, with no slugification, lowercasing, or character replacement

The helper should be placed alongside the existing utility functions in `src/utils.ts`. After computing the session name, include it as `sessionName` in the returned `CapabilityConfig` object. The `stepNumber` is already available from `params.stepNumber` for capabilities like `evolve-plan`, `execute-task`, and `review-code`.

**Acceptance criteria:**
- [ ] `deriveSessionName("my-feature", "create-plan")` returns `"my-feature create-plan"`
- [ ] `deriveSessionName("", "project-context")` returns `"project-context"`
- [ ] `deriveSessionName("my feature", "create-goal")` returns `"my feature create-goal"` (goal name preserved as-is)
- [ ] `deriveSessionName("My-Feature.Name!", "evolve-plan")` returns `"My-Feature.Name! evolve-plan"` (no slugification, case and special chars preserved)
- [ ] `deriveSessionName("my-feature", "evolve-plan", 3)` returns `"my-feature evolve-plan s3"` (step number included)
- [ ] `deriveSessionName("my_feature", "execute-task", 1)` returns `"my_feature execute-task s1"`
- [ ] `deriveSessionName("my_feature", "review-code", 2)` returns `"my_feature review-code s2"`
- [ ] The returned `CapabilityConfig` from `resolveCapabilityConfig()` includes the derived `sessionName` when `goalName` is present
- [ ] The step number is forwarded from `params.stepNumber` to the helper when it exists
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/utils.ts` — add `deriveSessionName` helper function and use it in `resolveCapabilityConfig()`

### Step 3: Apply session name in `launchCapability()`

**Description:** Modify `launchCapability()` in `src/capabilities/session-capability.ts` to call `_newCtx.setSessionName(config.sessionName)` inside the existing `withSession` callback when `config.sessionName` is defined. When undefined (backward compat), skip the call entirely — existing behavior is preserved.

The change goes inside the `withSession` callback, before the existing `sendUserMessage` call. This ensures the session name is set as early as possible in the new session lifecycle.

**Acceptance criteria:**
- [ ] When `config.sessionName` is defined, `_newCtx.setSessionName(config.sessionName)` is called in the `withSession` callback
- [ ] When `config.sessionName` is undefined, no `setSessionName` call is made (no-op)
- [ ] The existing `sendUserMessage(config.initialMessage)` logic continues to work unchanged
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/capabilities/session-capability.ts` — add `setSessionName` call inside the `withSession` callback of `launchCapability()`

## Notes

- **No pi framework changes needed.** We use `setSessionName()` (available on `ReplacedSessionContext`) instead of passing `id` to `ctx.newSession()`. The latter is not currently forwarded by the extension runtime (`agent-session-runtime.js` drops the `id` field).
- **Backward compatibility:** All three changes are additive/optional. If any code path constructs a `CapabilityConfig` without `sessionName`, behavior is identical to today (no name set).
- **No slugification:** Goal names are used verbatim. A goal named "my feature" produces session name "my feature create-plan". Spaces in goal names are preserved as-is within the session display name (pi's `setSessionName()` handles arbitrary strings).
- **All callers unchanged.** Since `resolveCapabilityConfig()` automatically computes the session name, every capability (`create-goal`, `create-plan`, `evolve-plan`, `execute-task`, `review-code`, `project-context`, etc.) gets named sessions without any per-capability modifications.
- **Step number disambiguation:** Capabilities that pass `stepNumber` in params (`evolve-plan`, `execute-task`, `review-code`) get a ` s{N}` suffix (space + s + number). No capability-specific logic needed — it's purely driven by whether `params.stepNumber` is a number.
