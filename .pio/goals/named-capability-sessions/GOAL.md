# Named Capability Sessions

Add human-readable session IDs to all capability sub-sessions launched by the pio extension. Each session name follows the pattern `<goal-name>-<capability>` (e.g., `my-feature-create-plan`) or just `<capability>` for non-goal sessions (e.g., `project-context`). This makes it possible to identify what each session is doing in the session tree, debug session hierarchies, and reference sessions by meaningful names.

## Current State

When capability sub-sessions are launched, no explicit session identifier is provided to `ctx.newSession()`. The pi framework's `NewSessionOptions` supports an optional `id?: string`, but pio doesn't use it.

The current flow:

1. **All capabilities** that launch sessions follow the same pattern: call `resolveCapabilityConfig(cwd, params)` from `src/utils.ts` to build a `CapabilityConfig`, then pass it to `launchCapability(ctx, config)` in `src/capabilities/session-capability.ts`.

2. **`launchCapability()`** (`src/capabilities/session-capability.ts`, line 30) calls `ctx.newSession()` with only two fields:
   - `parentSession` — the session file path of the calling session
   - `setup` — appends `pio-config` (the `CapabilityConfig`) as a custom entry

   It does not pass an `id` field. The resulting sessions appear without identifiable names in the session tree.

3. **`resolveCapabilityConfig()`** (`src/utils.ts`, line 143) builds the full `CapabilityConfig` from the static `CAPABILITY_CONFIG` export of each capability module + runtime params (goalName, stepNumber, initialMessage). The resulting config already carries `capability` (string) and `sessionParams` (which includes `goalName`). This is the ideal place to derive a session ID.

4. **`CapabilityConfig`** (`src/types.ts`) defines the shape of all config passed to sessions. It currently has no `sessionId` or similar field.

5. **All callers** flow through `resolveCapabilityConfig` → `launchCapability`. No capability calls `ctx.newSession()` directly. The session launch is centralized in `launchCapability()`.

6. **Goal names can contain special characters.** The goal workspace name is user-provided (e.g., via `/pio-create-goal my-feature`). Currently nothing restricts characters — goal names with spaces, slashes, or other non-slug-safe characters are possible.

## To-Be State

Every capability sub-session will have a human-readable `id` passed to `ctx.newSession()`. The naming convention:

- **Goal-scoped sessions:** `<goal-name>-<capability>` — e.g., `my-feature-create-plan`, `my-feature-evolve-plan`, `my-feature-execute-task`, `my-feature-review-code`
- **Non-goal sessions:** `<capability>` — e.g., `project-context`

Concrete changes:

1. **`src/types.ts`** — Add an optional `sessionId?: string` field to `CapabilityConfig`.

2. **`src/utils.ts`** — In `resolveCapabilityConfig()`, derive the session ID from `goalName` + `capability`:
   - Concatenate as `${goalName}-${cap}` when `goalName` is present
   - Use just `cap` for non-goal capabilities
   - Slugify: replace spaces with hyphens, remove invalid characters (keep lowercase alphanumerics and hyphens)

3. **`src/capabilities/session-capability.ts`** — Modify `launchCapability()` to read `config.sessionId` and pass it as `id` to `ctx.newSession()`. When `sessionId` is undefined (backward compat), omit the field entirely.

4. **All callers remain unchanged** — Since `resolveCapabilityConfig()` automatically computes the session ID, no individual capability needs modification. The change flows through the centralized config resolution.

5. **Edge cases handled:**
   - Goal names with spaces → hyphens (e.g., `my feature` → `my-feature-create-goal`)
   - Goal names with uppercase → lowercase
   - Goal names with special chars (`/`, `.`, etc.) → stripped or replaced with hyphens
   - Empty or missing goal name → fall back to just the capability name

Files involved:
- `src/capabilities/session-capability.ts` — `launchCapability()` signature and `ctx.newSession()` call
- `src/utils.ts` — Add session ID derivation inside `resolveCapabilityConfig()` (or a helper it calls)
- `src/types.ts` — Add `sessionId?: string` to `CapabilityConfig`
