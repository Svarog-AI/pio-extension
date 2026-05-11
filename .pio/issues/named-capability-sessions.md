# Give capability sessions identifiable names when launched

## Problem

When capability sub-sessions are launched (via `launchCapability()` → `ctx.newSession()`), no explicit session identifier is provided. The pi framework's `NewSessionOptions` supports an optional `id?: string`, but we don't use it. This makes it hard to:

- Identify what a given session is doing in the session tree
- Debug session hierarchies
- Reference sessions by meaningful names (e.g., for navigation or coordination)

## Proposed solution

Pass a human-readable `id` to `ctx.newSession()` derived from the capability context. A good naming convention would be:

```
<goal-name>-<capability>
```

For example:
- `my-feature-create-plan` — planning session for goal "my-feature"
- `my-feature-evolve-plan` — spec-writing session for goal "my-feature"  
- `my-feature-execute-task` — implementation session for goal "my-feature"
- `my-feature-review-code` — code review session for goal "my-feature"

For non-goal capabilities (e.g., `project-context`):
```
<capability>
```

## Implementation points

1. **`session-capability.ts`** — Modify `launchCapability()` to accept and pass an optional `sessionId` to `ctx.newSession()`.

2. **`utils.ts`** — In `resolveCapabilityConfig()` (or a new helper), generate the session ID from `capability` + `goalName`:
   ```ts
   const sessionId = goalName ? `${goalName}-${cap}` : cap;
   ```

3. **All callers** — Ensure every capability that calls `launchCapability()` flows the config (which now includes `sessionId`) through to the session launch.

4. **Edge cases** — Handle special characters in goal names that might not be valid session IDs (e.g., spaces, slashes). Slugify if needed.

## Files involved

- `src/capabilities/session-capability.ts` — `launchCapability()` signature and `ctx.newSession()` call
- `src/utils.ts` — `resolveCapabilityConfig()` or new helper
- Potentially all capabilities that launch sessions (they should already flow through config)

## Category

improvement

## Context

The pi framework API supports `id?: string` in `NewSessionOptions` (`/home/aleksj/.nvm/versions/node/v22.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts`). Currently `launchCapability()` in `src/capabilities/session-capability.ts` only passes `parentSession` and `setup` to `ctx.newSession()`.
