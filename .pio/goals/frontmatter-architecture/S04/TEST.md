# Tests: Standardize all lifecycle hooks in types (`types.ts`)

This step adds only type definitions and documentation to `src/types.ts`. Testing focuses on compile-time type verification (matching the existing pattern for `PrepareSessionCallback` in `src/capability-config.test.ts`) and regression checks.

## Unit Tests

### File: `src/capability-config.test.ts`

**Test runner:** Vitest (colocated `.test.ts`, Node.js environment)

Add two new `describe` blocks following the existing pattern for `prepareSession`:

#### `describe("StaticCapabilityConfig.postValidate and postExecute")`

- **Test case:** "postValidate is optional — config without it is valid"
  - Arrange + Act: Create a `StaticCapabilityConfig` with only required fields (`prompt`, `defaultInitialMessage`). No `postValidate` or `postExecute`.
  - Assert: `config.postValidate` is `undefined`; `config.postExecute` is `undefined`. Type check passes (no TS error).

- **Test case:** "postValidate accepts a matching callback"
  - Arrange: Define `const postValidateCb: PostValidateCallback = (...) => ({ success: true })`.
  - Act: Assign it to `StaticCapabilityConfig.postValidate`.
  - Assert: `config.postValidate === postValidateCb`; `typeof config.postValidate === "function"`.

- **Test case:** "postExecute accepts a matching callback (sync)"
  - Arrange: Define `const postExecuteCb: PostExecuteCallback = () => {}` (synchronous).
  - Act: Assign it to `StaticCapabilityConfig.postExecute`.
  - Assert: `config.postExecute === postExecuteCb`; `typeof config.postExecute === "function"`.

- **Test case:** "postExecute accepts a matching callback (async)"
  - Arrange: Define `const postExecuteCb: PostExecuteCallback = async () => {}` (returns `Promise<void>`).
  - Act: Assign it to `StaticCapabilityConfig.postExecute`.
  - Assert: `config.postExecute === postExecuteCb`; `typeof config.postExecute === "function"`.

- **Test case:** "postValidate return type requires success boolean"
  - Arrange + Act: Define an inline callback returning `{ success: true, message: "ok" }`.
  - Assert: Assignment to `StaticCapabilityConfig.postValidate` is valid. The returned object has both `success: boolean` and optional `message?: string`.

#### `describe("CapabilityConfig.postValidate and postExecute")`

- **Test case:** "postValidate and postExecute are optional on resolved CapabilityConfig"
  - Arrange + Act: Create a `CapabilityConfig` with only `capability: "create-goal"`.
  - Assert: `config.postValidate` is `undefined`; `config.postExecute` is `undefined`.

- **Test case:** "postValidate accepts a callback on resolved CapabilityConfig"
  - Arrange: Define `const cb: PostValidateCallback = () => ({ success: true })`.
  - Act: Assign to `CapabilityConfig.postValidate`.
  - Assert: `config.postValidate === cb`.

- **Test case:** "postExecute accepts a callback on resolved CapabilityConfig"
  - Arrange: Define `const cb: PostExecuteCallback = () => {}`.
  - Act: Assign to `CapabilityConfig.postExecute`.
  - Assert: `config.postExecute === cb`.

## Programmatic Verification

- **What:** TypeScript compilation with no errors (types are correct, no circular dependencies)
- **How:** `npx tsc --noEmit`
- **Expected result:** Zero errors. Exit code 0.

- **What:** Existing test suite passes with no regressions
- **How:** `npx vitest run`
- **Expected result:** All existing tests pass (347+). New type verification tests pass.

- **What:** New callback types are exported from `types.ts`
- **How:** `grep -c "export type PostValidateCallback" src/types.ts && grep -c "export type PostExecuteCallback" src/types.ts`
- **Expected result:** Both return `1` (each exported exactly once).

- **What:** Lifecycle block comment exists in `types.ts`
- **How:** `grep -c "PostValidate" src/types.ts && grep -c "PostExecute" src/types.ts`
- **Expected result:** Both return at least `1` (types + documentation references present).

## Test Order

1. Unit tests (`npx vitest run`) — validates type correctness at compile time
2. Programmatic verification (`npx tsc --noEmit`, grep checks) — confirms build health and exports
