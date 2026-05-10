# Task: Add conditional transition support and sessionParams to utils.ts + types.ts

Extend the capability transition system to support callback-based (conditional) transitions, and propagate original session params through auto-enqueue so downstream capabilities receive full context.

## Context

The current `CAPABILITY_TRANSITIONS` map in `src/utils.ts` is a simple `Record<string, string>` — each capability maps to exactly one next capability. The `pio_mark_complete` tool in `validation.ts` looks up this map directly (`CAPABILITY_TRANSITIONS[capability]`) and enqueues the next task with only `{ goalName }` as params.

For the review-code capability (Step 3+), the transition after review depends on a runtime condition: was the step approved or rejected? This requires conditional logic that a plain string map cannot express. Additionally, downstream capabilities need access to `stepNumber` and other session params, which are currently lost during auto-enqueue.

## What to Build

### A. Conditional transitions

1. **New types in `src/utils.ts`:**
   - `TransitionContext` interface: `{ capability: string; workingDir: string; params?: Record<string, unknown> }` — context passed to transition resolvers.
   - `CapabilityTransitionResolver` type: `(ctx: TransitionContext) => string | undefined` — a function that inspects runtime state and returns the next capability name (or `undefined` to skip).

2. **Change `CAPABILITY_TRANSITIONS` value type** from `Record<string, string>` to `Record<string, string | CapabilityTransitionResolver>`. Existing string entries remain unchanged — only new entries can be callbacks.

3. **New exported function `resolveNextCapability(capability: string, ctx: TransitionContext): string | undefined`:**
   - Reads the entry from `CAPABILITY_TRANSITIONS[capability]`.
   - If the value is a `string`, returns it directly (backwards compatible).
   - If the value is a `CapabilityTransitionResolver`, invokes it with `ctx` and returns the result.
   - Returns `undefined` if no transition is defined for the capability.

4. **Add `"review-code"` transition entry** as a callback that:
   - Reads `ctx.params.stepNumber` (number) to construct the step folder path: `S{NN}/APPROVED`.
   - Checks whether `{workingDir}/S{NN}/APPROVED` exists on disk (`fs.existsSync`).
   - Returns `"evolve-plan"` if APPROVED exists.
   - Returns `"execute-task"` otherwise (including when APPROVED is missing or stepNumber is undefined).

### B. Session params propagation

1. **In `src/types.ts`:** Add an optional field to the `CapabilityConfig` interface:
   ```ts
   /** Original session params passed when this capability was launched. Used for downstream param propagation. */
   sessionParams?: Record<string, unknown>;
   ```

2. **In `src/utils.ts`, inside `resolveCapabilityConfig`:** At the end of the return block, store a copy of the original `params` as `sessionParams`:
   ```ts
   return {
     capability: cap,
     // ... existing fields ...
     sessionParams: params,
   };
   ```

This allows downstream code (validation.ts in Step 2) to access the full set of params that created the session via `config.sessionParams`. The existing `CAPABILITY_CONFIG` export pattern is unaffected — `resolveCapabilityConfig` reads params from its call site and attaches them.

### Code Components

| Component | Location | What it does |
|-----------|----------|--------------|
| `TransitionContext` interface | `src/utils.ts` | Shape of context passed to transition resolvers |
| `CapabilityTransitionResolver` type | `src/utils.ts` | Function type for conditional transitions |
| `CAPABILITY_TRANSITIONS` (modified) | `src/utils.ts` | Now accepts `string \| CapabilityTransitionResolver` values |
| `resolveNextCapability()` (new) | `src/utils.ts` | Resolves next capability, handles both string and callback entries |
| `"review-code"` entry (new) | `src/utils.ts` | Callback checking `S{NN}/APPROVED` for conditional routing |
| `sessionParams` field (new) | `src/types.ts` -> `CapabilityConfig` | Stores original params on resolved config |
| `resolveCapabilityConfig` (modified) | `src/utils.ts` | Attaches `sessionParams: params` to returned config |

### Approach and Decisions

- **Backwards compatibility is critical.** All existing transition entries are plain strings. The resolver must handle `typeof value === "string" ? value : value(ctx)` — zero migration needed for any existing capability.
- **Use the same file system access pattern** as execute-task.ts: `import * as fs from "node:fs"` and `fs.existsSync(...)`. The review-code callback needs `fs` to check for the APPROVED marker file.
- **Follow ESM conventions:** The project uses `"type": "module"`. Imports use bare specifiers without `.ts` extensions (e.g., `import("./capabilities/review-code")`).
- **Keep the resolver synchronous.** The transition decision is a simple file existence check — no async I/O needed. The function signature is `(ctx) => string | undefined`, not async.

## Dependencies

None. This is Step 1 — foundational infrastructure with no prior step requirements.

## Files Affected

- `src/utils.ts` — modified: add `TransitionContext` interface, `CapabilityTransitionResolver` type, change `CAPABILITY_TRANSITIONS` value type, add `resolveNextCapability()` function, add `"review-code"` callback entry, attach `sessionParams` in `resolveCapabilityConfig` return block
- `src/types.ts` — modified: add optional `sessionParams?: Record<string, unknown>` to `CapabilityConfig` interface

## Acceptance Criteria

- [ ] `CAPABILITY_TRANSITIONS` values accept both `string` and callable resolver functions (`CapabilityTransitionResolver`)
- [ ] New exported function `resolveNextCapability(capability, ctx)` resolves transitions (invokes callbacks when present)
- [ ] Existing string-only entries in the map resolve identically through the new function
- [ ] `CapabilityConfig` interface in `types.ts` has optional `sessionParams?: Record<string, unknown>` field
- [ ] `resolveCapabilityConfig` stores original params as `sessionParams` on returned config
- [ ] `"review-code"` transition entry exists as a callback checking for APPROVED file
- [ ] `npm run check` passes (zero type errors)

## Risks and Edge Cases

- **Step number formatting:** The callback must construct `S{NN}` with zero-padding (e.g., `S01`, `S02`) matching the convention in `stepFolderName()` from execute-task.ts. Consider importing or reusing that function, or duplicating the padding logic inline.
- **`fs` import in utils.ts:** `utils.ts` already imports `* as fs from "node:fs"` — no new import needed for the APPROVED file check.
- **Circular dependency risk:** Adding types to `utils.ts` while importing from `types.ts` is safe since `types.ts` has no imports back to `utils.ts` (explicitly designed to break cycles).
- **Type narrowing:** The resolver function must correctly narrow `string | CapabilityTransitionResolver` using `typeof value === "string"` before invoking. TypeScript will enforce this at compile time.
