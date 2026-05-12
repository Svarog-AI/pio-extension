# Task: Test capability config resolution (`capability-config.test.ts`)

Write tests for `resolveCapabilityConfig(cwd, params)` from `src/utils.ts` to verify that capability modules are dynamically imported, configs are resolved correctly, and derived fields (workingDir, sessionName, initialMessage) behave as expected.

## Context

The pio extension uses a convention-driven config system: each capability module exports a `CAPABILITY_CONFIG` object defining prompt name, validation rules, file protections, and a default message factory. The function `resolveCapabilityConfig(cwd, params)` in `src/utils.ts` dynamically imports these modules at runtime and resolves the full `CapabilityConfig` — including step-dependent callback fields like `validation`, `readOnlyFiles`, and `writeAllowlist`. This is the central wiring point for all sub-sessions and must be tested to ensure configs resolve correctly across all capability types.

Currently zero tests exist for this function. The overall test goal (GOAL.md) requires 80%+ coverage on business logic, making this a critical gap.

## What to Build

A single test file: `__tests__/capability-config.test.ts` with comprehensive tests for `resolveCapabilityConfig`.

### Code Components

#### `resolveCapabilityConfig(cwd, params)` — under test

Imported from `../src/utils`. This async function:
1. Reads `params.capability` (string) to determine which module to import
2. Dynamically imports `./capabilities/{cap}` and reads `CAPABILITY_CONFIG`
3. Derives `workingDir` from `params.goalName` (goal-scoped → `.pio/goals/<name>`) or falls back to `cwd` (project-scoped)
4. Resolves step number from `params.stepNumber`
5. Invokes callbacks for `validation`, `readOnlyFiles`, `writeAllowlist` if they are functions (passing `workingDir, params`)
6. Derives `initialMessage` from `params.initialMessage` or calls `defaultInitialMessage(workingDir, params)`
7. Returns a full `CapabilityConfig` object or `undefined` on failure

#### Two capability patterns to test against

- **Static config:** `create-goal`, `create-plan` — all config fields are plain values (no callbacks). Testing proves basic resolution works.
- **Callback config:** `evolve-plan`, `execute-task`, `review-code` — use function callbacks for step-dependent fields. Testing proves callbacks are invoked with correct args and return expected values.

### Approach and Decisions

- **Test against real modules on disk:** Unlike mocked tests, these import actual capability files (e.g., `"./capabilities/create-goal"`). Vitest's native ESM resolution handles `.ts` imports. This matches the production path exactly — no mocking of module resolution needed.
- **Use `cwd` as a temp directory for goal-scoped tests:** Create temp directories to simulate goal workspace paths. The function calls `resolveGoalDir(cwd, goalName)` internally, so we pass a real temp dir as `cwd`. No need to create actual files — we're testing config resolution, not filesystem I/O.
- **Verify callback invocation indirectly:** When resolving `evolve-plan` with `stepNumber: 3`, verify that `validation.files` contains `"S03/TASK.md"` and `"S03/TEST.md"` — this proves the callback was called with correct params.
- **Follow established patterns:** Use `createTempDir`/`cleanup` helpers consistent with `utils.test.ts`. Use DAMP naming (Descriptive And Meaningful Phrases). One assertion per concept.

## Dependencies

- **Step 1 (Vitest setup):** Must be complete — Vitest must be installed and configured with ESM support.
- **Steps 2–4:** No direct dependency, but they establish the test patterns (temp dirs, naming conventions) that this step follows.

## Files Affected

- `__tests__/capability-config.test.ts` — new file: capability config resolution tests

## Acceptance Criteria

- [ ] `npm test __tests__/capability-config.test.ts` passes with all tests green
- [ ] Happy-path resolution verified (at least 2 known capabilities tested — one static, one callback-based)
- [ ] Graceful handling of missing/unknown capabilities (returns `undefined`)
- [ ] `workingDir`, `sessionName`, and `initialMessage` derivation verified
- [ ] Step-dependent callbacks invoked correctly when `stepNumber` is present
- [ ] `npm run check` reports no errors

## Risks and Edge Cases

- **Dynamic import caching:** Vitest may cache dynamic imports. If testing "unknown capability" after testing a real one, ensure the test doesn't fail due to module cache rather than actual behavior. The function's try/catch should handle this — `import("./capabilities/nonexistent")` will throw.
- **Console warnings:** `resolveCapabilityConfig` calls `console.warn` on failures. Tests may produce warning output — this is expected and not a failure condition. Consider suppressing console output in tests if needed (Vitest supports `silent: true`).
- **Path separators:** `workingDir` uses `path.join` which produces platform-specific separators. Use `path.join` in assertions rather than hardcoded `/` to ensure cross-platform compatibility.
