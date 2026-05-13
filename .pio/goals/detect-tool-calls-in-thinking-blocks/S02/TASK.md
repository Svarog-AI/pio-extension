# Task: Wire turn-guard into the extension entry point

Import `setupTurnGuard` from `./capabilities/turn-guard` in `src/index.ts` and call it so the dead-turn detection handlers are registered for every Pio session.

## Context

Step 1 created `src/capabilities/turn-guard.ts` with a self-contained `setupTurnGuard(pi: ExtensionAPI)` function. It registers two event handlers (`resources_discover` and `turn_end`) but they do nothing until the function is actually called. Step 2 wires it into the extension entry point so all Pio sub-sessions benefit from dead-turn detection automatically.

## What to Build

Modify `src/index.ts` to import and call `setupTurnGuard(pi)` in the default export function. This follows the exact same pattern as every other capability: import the `setup*` function at the top, call it with `pi` inside the default export.

### Code Components

No new functions or modules. Two small edits to `src/index.ts`:

1. **Import statement:** Add `import { setupTurnGuard } from "./capabilities/turn-guard";` alongside the existing capability imports (e.g., near `setupCapability` and `setupValidation`).
2. **Function call:** Add `setupTurnGuard(pi);` inside the default export function, alongside the existing `setupCapability(pi)` and `setupValidation(pi)` calls.

### Approach and Decisions

- **Placement of import:** Group with the other capability imports (the block starting with `import { setupInit } from "./capabilities/init";`). Order is not strictly enforced, but placing it near `setupCapability` / `setupValidation` makes sense since turn-guard is a session-wide handler like those two.
- **Placement of call:** Place `setupTurnGuard(pi)` after `setupCapability(pi)` and `setupValidation(pi)`. The PLAN.md notes that the `resources_discover` handler in turn-guard must fire before `turn_end` events — this is guaranteed by framework lifecycle, but placing it near other session-capability setup calls keeps related initialization grouped.
- **No shared state risk:** Step 1's REVIEW.md confirms the module-level flag (`isActivePioSession`) is per-extension-instance. Each sub-session gets its own runtime — no cross-session contamination.

## Dependencies

- **Step 1 (COMPLETED):** `src/capabilities/turn-guard.ts` must exist and export `setupTurnGuard`. Verified: file exists, approved by review.

## Files Affected

- `src/index.ts` — modified: add import for `setupTurnGuard`, call `setupTurnGuard(pi)` inside the default export function

## Acceptance Criteria

- [ ] `npm run check` (`npx tsc --noEmit`) reports no type errors
- [ ] `setupTurnGuard(pi)` is called in the default export function of `src/index.ts`
- [ ] No circular import dependencies introduced (verify no import cycle between `turn-guard.ts`, `validation.ts`, and `session-capability.ts`)

## Risks and Edge Cases

- **Import order:** TypeScript module resolution is not order-dependent, but keeping related imports grouped improves readability. The executor should place the new import near other session-level setup imports (`setupCapability`, `setupValidation`).
- **Call order:** Event handler registration order does not affect correctness here — `resources_discover` always fires before `turn_end` by framework design. However, placing `setupTurnGuard(pi)` after `setupCapability(pi)` and `setupValidation(pi)` keeps initialization logically grouped.
