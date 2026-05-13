# Task: Add `prepareSession` lifecycle type and config resolution

Introduce a `prepareSession` hook into the capability configuration types and wire it through the config resolver, enabling any capability to run pre-session setup (e.g., stale-state cleanup) before the agent starts.

## Context

The review-code capability needs to clean up stale marker files (`APPROVED`, `REJECTED`) when a new review session begins. Rather than hardcoding this logic in one place, Step 1 introduces a reusable lifecycle hook (`prepareSession`) into the shared type system. This establishes the foundation for Steps 2–5, which wire and consume the hook. Currently, capability config supports callbacks for `validation`, `readOnlyFiles`, `writeAllowlist`, and `defaultInitialMessage` — but no "before agent starts" hook.

## What to Build

### Code Components

#### 1. New callback type in `src/types.ts`

Add a callback type for the prepareSession hook:

```typescript
export type PrepareSessionCallback = (workingDir: string, params?: Record<string, unknown>) => void | Promise<void>;
```

This matches the existing `ConfigCallback<T>` pattern but with a fixed return type (`void | Promise<void>`) since the hook performs side effects rather than returning config values.

#### 2. Add `prepareSession` to `StaticCapabilityConfig` in `src/types.ts`

Add an optional property:

```typescript
interface StaticCapabilityConfig {
  // ... existing fields ...
  prepareSession?: PrepareSessionCallback;
}
```

The field is optional — capabilities without a prepare hook simply omit it, and the resolver passes through `undefined` naturally.

#### 3. Resolve `prepareSession` in `resolveCapabilityConfig` (`src/utils.ts`)

In the `resolveCapabilityConfig` function, resolve the `prepareSession` field alongside the other config callbacks (`validation`, `readOnlyFiles`, `writeAllowlist`). Since `prepareSession` is always a callback (or undefined) — not a static value — the resolution is straightforward: if present, include it directly in the returned `CapabilityConfig`.

Add `prepareSession` to the return object of `resolveCapabilityConfig`, passing it through from the static config.

### Approach and Decisions

- **Follow existing patterns:** The resolution pattern mirrors how `defaultInitialMessage` is handled — read from `config.prepareSession` directly since it's always a callback (or undefined). No branching between static vs callback needed.
- **Add to `CapabilityConfig`:** The resolved `prepareSession` must be added to the `CapabilityConfig` interface (in `types.ts`) and returned from `resolveCapabilityConfig`, so downstream code (`session-capability.ts` in Step 2) can access it from the config object.
- **Async support:** The return type includes `Promise<void>` since file deletion (the intended use) may be async. The caller (Step 2) must `await` the hook.

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/types.ts` — modified: add `PrepareSessionCallback` type, add `prepareSession` to `StaticCapabilityConfig`, and add `prepareSession` to `CapabilityConfig`
- `src/utils.ts` — modified: resolve `prepareSession` in `resolveCapabilityConfig` return object

## Acceptance Criteria

- [ ] `StaticCapabilityConfig` has an optional `prepareSession` property of the correct callback type `(workingDir: string, params?: Record<string, unknown>) => void | Promise<void>`
- [ ] `CapabilityConfig` includes the resolved `prepareSession` field (same type)
- [ ] `resolveCapabilityConfig` resolves `prepareSession` (passing through from static config since it's always a callback)
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- **Circular dependency safety:** `types.ts` exists specifically to break circular dependencies between `utils.ts`, `validation.ts`, and `session-capability.ts`. Any new types must live in `types.ts` only — never introduce new cross-imports.
- **Backward compatibility:** All existing capabilities lack `prepareSession`. Adding an optional field is safe, but verify that no code destructures `CapabilityConfig` exhaustively without rest-spread (which would break on the new field).
- **TypeScript strict mode:** The project uses strict null checks. Ensure the optional field (`?`) is properly handled throughout — callers must check for existence before invoking.
