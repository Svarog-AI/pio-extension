# Tests: Wire `prepareSession` into the session lifecycle

## Programmatic Verification

- **What:** Type check passes with zero errors after modifying `session-capability.ts`
- **How:** Run `npm run check`
- **Expected result:** Exit code 0, no output (or only pre-existing warnings)

- **What:** `prepareSession` invocation exists in the `resources_discover` handler
- **How:** `grep -n 'prepareSession' src/capabilities/session-capability.ts`
- **Expected result:** At least one line referencing `config.prepareSession` with an `await` call inside the `resources_discover` callback

- **What:** The invocation is guarded by an existence check (optional field)
- **How:** `grep -A2 'prepareSession' src/capabilities/session-capability.ts`
- **Expected result:** The `config.prepareSession` reference appears inside a conditional (`if`) block, not called unconditionally

- **What:** Errors from `prepareSession` are caught (try/catch or .catch pattern)
- **How:** `grep -B2 -A5 'prepareSession' src/capabilities/session-capability.ts`
- **Expected result:** The invocation is wrapped in a `try` block with a `catch` that calls `console.warn`

- **What:** Invocation happens after `enrichedSessionParams` assignment (correct ordering)
- **How:** `grep -n 'enrichedSessionParams\|prepareSession' src/capabilities/session-capability.ts`
- **Expected result:** The line number of the `prepareSession` call is greater than the last `enrichedSessionParams = ...` assignment

- **What:** Invocation uses `await` (handles async callbacks)
- **How:** `grep 'await.*prepareSession' src/capabilities/session-capability.ts`
- **Expected result:** Match found — the call is prefixed with `await`

## Integration Tests

- **File:** `__tests__/session-capability.test.ts` (new file)
- **What:** Verify that existing tests still pass after the modification, proving backward compatibility. Specifically, confirm that capabilities without `prepareSession` (e.g., `create-goal`) still resolve config successfully.
- **Test cases:**
  - "`describe('backward compatibility')`: Resolving a capability without `prepareSession` still produces a valid config" — call `resolveCapabilityConfig` for `"create-goal"` and assert `result.prepareSession` is `undefined`. This imports from `src/utils` but exercises the resolved config shape that `session-capability.ts` consumes.
  - "Existing test suite passes unmodified" — run `npm test` and verify all existing tests still pass (the new code should not break any existing behavior)

## Test Order

1. Programmatic verification (grep checks, type check) — fast, no setup needed
2. Integration tests (`npm test`) — validates backward compatibility and confirms no regressions
