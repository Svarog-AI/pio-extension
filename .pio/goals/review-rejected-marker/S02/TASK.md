# Task: Wire `prepareSession` into the session lifecycle

Invoke the `prepareSession` hook during `resources_discover` in `session-capability.ts`, completing the prepare phase of the lifecycle pattern (prepare → work → markComplete → validateState).

## Context

Step 1 added the `prepareSession` type to both `StaticCapabilityConfig` and `CapabilityConfig`, and wired it through `resolveCapabilityConfig`. However, nothing actually *calls* the hook at runtime. This step plugs the invocation into the session lifecycle so that any capability defining `prepareSession` will have it executed before the agent starts working.

This enables Step 5 (which adds a real `prepareSession` to `review-code`) to function — without this wiring, the callback would resolve correctly but never execute.

## What to Build

In `src/capabilities/session-capability.ts`, add a call to `config.prepareSession(workingDir, enrichedSessionParams)` inside the `resources_discover` handler. The invocation must happen:

1. **After** `enrichedSessionParams` is populated (so the hook has access to the auto-discovered `stepNumber`)
2. **Before** the agent starts (i.e., during `resources_discover`, not in `before_agent_start`)

The hook is optional — guard the call with a simple existence check (`if (config.prepareSession)`). Since `prepareSession` returns `void | Promise<void>`, await it to ensure side effects complete before continuing.

### Code Components

#### `prepareSession` invocation in `resources_discover`

Add this logic to the existing `resources_discover` handler:

- **Where:** After `enrichedSessionParams` is assigned and before the prompt file is loaded
- **What it does:** Calls `await config.prepareSession(workingDir, enrichedSessionParams)` when the field is defined
- **Arguments:** `workingDir` (already computed as `config.workingDir`) and `enrichedSessionParams` (the module-level variable populated earlier in the same handler)
- **Error handling:** If the hook throws or rejects, log a warning but do not crash — continue loading the prompt. This matches the existing pattern where missing prompt files produce warnings without aborting.

### Approach and Decisions

- **Placement:** Insert the invocation right after the `enrichedSessionParams` assignment block (around line 67 in the current file, after the step-number auto-discovery). This ensures the hook has the correct `stepNumber` but runs before prompt loading.
- **Await required:** Since `PrepareSessionCallback` can return `Promise<void>`, always use `await`. The handler is already `async`.
- **Defensive check:** Use `if (config.prepareSession)` — same optional-field pattern used throughout the codebase for `config.validation`, `config.readOnlyFiles`, etc.
- **Warning on failure:** Wrap in `try/catch` and log with `console.warn()` if the hook fails. Don't propagate errors that would prevent the session from starting.
- **Follow existing style:** The handler already uses `console.warn` for non-fatal issues (missing prompt, missing skill-loading instructions). Match this convention.

## Dependencies

- **Step 1** — `prepareSession` must be present on `CapabilityConfig` and resolved by `resolveCapabilityConfig`. Verified by Step 1's APPROVED status.

## Files Affected

- `src/capabilities/session-capability.ts` — modified: add `prepareSession` invocation in the `resources_discover` handler

## Acceptance Criteria

- [ ] `session-capability.ts` calls `config.prepareSession(workingDir, sessionParams)` during `resources_discover` when the field exists
- [ ] The invocation is awaited (handles async callbacks)
- [ ] Capabilities without `prepareSession` continue to work unchanged (optional field guarded by existence check)
- [ ] Errors in `prepareSession` are caught and logged as warnings — they do not crash the session startup
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- **Timing of enrichedSessionParams:** The hook must be called after `enrichedSessionParams` is populated, since it may need `stepNumber` to resolve step folder paths. Verify placement is correct relative to the auto-discovery block.
- **Error propagation:** If `prepareSession` throws, the session should still start — otherwise stale-state cleanup bugs could block all reviews. Always catch and warn.
- **config.workingDir may be undefined:** For project-scoped capabilities (no goalName), `workingDir` is omitted from config. The hook receives whatever `config.workingDir` resolves to — if undefined, the callback should handle it gracefully. This is the same contract as other config callbacks (`readOnlyFiles`, `writeAllowlist`).
