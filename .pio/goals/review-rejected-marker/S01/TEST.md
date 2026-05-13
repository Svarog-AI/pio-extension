# Tests: Add `prepareSession` lifecycle type and config resolution

## Unit Tests

- **File:** `__tests__/types.test.ts` — new file
- **Test runner:** Vitest (`npx vitest run`)

### `describe('PrepareSessionCallback')`

- **Type compiles:** A callback matching `(workingDir: string, params?: Record<string, unknown>) => void` satisfies `PrepareSessionCallback`. Verify by assigning a conforming function and checking no type error occurs at compile time.
- **Async callback compiles:** A callback returning `Promise<void>` also satisfies `PrepareSessionCallback`. Same compile-time check pattern.

### `describe('StaticCapabilityConfig.prepareSession')`

- **prepareSession is optional:** A `StaticCapabilityConfig` object without `prepareSession` is valid (no type error).
- **prepareSession accepts a callback:** A `StaticCapabilityConfig` with `prepareSession` set to a function matching `PrepareSessionCallback` is valid.

### `describe('resolveCapabilityConfig')`

These tests import `resolveCapabilityConfig` from `src/utils.ts`. Since the function dynamically imports capability modules, mock a fake capability module or use a real one (e.g., `review-code`) to test the resolution behavior.

- **prepareSession is resolved when present:** Given a capability whose `CAPABILITY_CONFIG` defines `prepareSession`, the returned `CapabilityConfig.prepareSession` is the same callback reference (identity check).
- **prepareSession is undefined when absent:** Given a capability without `prepareSession` in its `CAPABILITY_CONFIG`, the returned `CapabilityConfig.prepareSession` is `undefined`.

## Programmatic Verification

- **TypeScript type check passes**
  - **What:** All new types and interfaces compile without errors
  - **How:** `npm run check` (runs `tsc --noEmit`)
  - **Expected result:** Exit code 0, no output

- **PrepareSessionCallback is exported from types.ts**
  - **What:** The type is publicly available for other modules to import
  - **How:** `grep -c 'PrepareSessionCallback' src/types.ts`
  - **Expected result:** Count >= 1 (type declaration) and the name appears in an `export` statement

- **prepareSession is a property of StaticCapabilityConfig**
  - **What:** The optional field exists on the interface
  - **How:** `grep 'prepareSession' src/types.ts`
  - **Expected result:** Appears within the `StaticCapabilityConfig` interface block (optional, with `?`)

- **prepareSession is a property of CapabilityConfig**
  - **What:** The resolved config carries the field downstream
  - **How:** `grep 'prepareSession' src/types.ts`
  - **Expected result:** Appears within the `CapabilityConfig` interface

- **resolveCapabilityConfig returns prepareSession**
  - **What:** The resolver includes `prepareSession` in its return object
  - **How:** `grep 'prepareSession' src/utils.ts`
  - **Expected result:** Appears in the return object literal inside `resolveCapabilityConfig`

## Test Order

1. Unit tests (`__tests__/types.test.ts`) — verify types and config resolution
2. Programmatic verification — `npm run check` confirms no type errors across the full project
