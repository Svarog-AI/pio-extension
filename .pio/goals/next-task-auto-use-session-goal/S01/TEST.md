# Tests: Read session pio-config to auto-resolve goal name in handleNextTask

## Unit Tests

- **File:** `__tests__/next-task.test.ts` (new file)
- **Test runner:** Vitest (`vitest run`)

### `describe('getSessionGoalName')` 

Tests the new function added to `session-capability.ts`. Since it reads from module-level state (`enrichedSessionParams`) via `getSessionParams()`, tests need to control that state. The existing test suite imports directly from source — follow the same pattern.

**Approach:** Because `getSessionGoalName()` wraps `getSessionParams()` which reads a private module-level variable, mock at the module level using Vitest's ESM mocking:

```typescript
import { vi, beforeEach } from "vitest";

// Hoist mock factory so it's available across import boundaries
const sessionCapabilityMock = vi.hoisted(() => ({
  getSessionParams: vi.fn(),
}));

vi.mock("../src/capabilities/session-capability", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSessionParams: sessionCapabilityMock.getSessionParams,
    getSessionGoalName: () => {
      // Re-export the real implementation but with mocked dependency
      const params = sessionCapabilityMock.getSessionParams();
      return typeof params?.goalName === "string" ? params.goalName : undefined;
    },
  };
});

import { getSessionGoalName } from "../src/capabilities/session-capability";
```

**Test cases:**

- **Given `{ goalName: "my-feature" }`, returns `"my-feature"`** — mock `getSessionParams()` to return `{ goalName: "my-feature" }`. Assert `getSessionGoalName()` equals `"my-feature"`.
- **Given `{ goalName: 123 }`, returns `undefined`** — non-string rejected. Mock to return `{ goalName: 123 }`. Assert `undefined`.
- **Given `{ goalName: null }`, returns `undefined`** — null rejected. Mock to return `{ goalName: null }`. Assert `undefined`.
- **Given `{ otherKey: "value" }`, returns `undefined`** — no goalName key. Mock to return `{ otherKey: "value" }`. Assert `undefined`.
- **Given `undefined`, returns `undefined`** — no session config. Mock to return `undefined`. Assert `undefined`.
- **Given `{}`, returns `undefined`** — empty params. Mock to return `{}`. Assert `undefined`.

### `describe('handleNextTask — goal resolution order')`

Tests the command handler decision flow: explicit arg → session goalName → scan all. Verifies that the correct code path is taken for each case and that `launchAndCleanup` receives the right goal name.

**Setup:** 
- Mock `session-capability.ts` to control both `getSessionGoalName()` and `launchCapability()`
- Use real temp dirs with queue files (via `fs.mkdtempSync`)
- Since `handleNextTask` is not currently exported, the implementer should either export it or test through a public entry point. The cleanest option: **export `handleNextTask` for testing** (standard practice — the function signature is stable, and tests verify internal behavior).

```typescript
const sessionCapabilityMock = vi.hoisted(() => ({
  getSessionGoalName: vi.fn(),
  launchCapability: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/capabilities/session-capability", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ...sessionCapabilityMock };
});

// After mocking, dynamically import handleNextTask
// (must be done AFTER vi.mock so the mocked module is used)
```

**Test cases:**

#### "passes session goalName to launchAndCleanup when no explicit arg"

- **Arrange:** 
  - Create temp dir with queue files for both `"other-goal"` and `"session-goal"`
  - Mock `getSessionGoalName()` → returns `"other-goal"`
  - Build minimal `ctx`: `{ cwd: tempDir, ui: { notify: vi.fn() } }`
- **Act:** Call `handleNextTask(undefined, ctx)` (no explicit arg)
- **Assert:** 
  - `sessionCapabilityMock.launchCapability` was called (a launch path was taken)
  - Queue file for `"other-goal"` was deleted (`task-other-goal.json` no longer exists)
  - Queue file for `"session-goal"` still exists (not touched — scan was not triggered)
  - `ctx.ui.notify` was NOT called with "Multiple goals" message

#### "falls through to scan when getSessionGoalName returns undefined"

- **Arrange:**
  - Create temp dir with exactly ONE queue file: `task-only-goal.json`
  - Mock `getSessionGoalName()` → returns `undefined`
- **Act:** Call `handleNextTask(undefined, ctx)`
- **Assert:**
  - `sessionCapabilityMock.launchCapability` was called (auto-launched the single pending goal)

#### "falls through to scan when getSessionGoalName has no goalName"

- **Arrange:**
  - Create temp dir with exactly ONE queue file: `task-only-goal.json`
  - Mock `getSessionGoalName()` → returns `undefined` (no session goal context)
- **Act:** Call `handleNextTask(undefined, ctx)`
- **Assert:**
  - `sessionCapabilityMock.launchCapability` was called (scan found one goal, auto-launched)

#### "explicit arg takes priority over session goalName"

- **Arrange:**
  - Create temp dir with queue files for `"explicit-goal"` AND `"session-goal"`
  - Mock `getSessionGoalName()` → returns `"session-goal"`
- **Act:** Call `handleNextTask("explicit-goal", ctx)` (explicit arg)
- **Assert:**
  - Queue file for `"explicit-goal"` was deleted (not `"session-goal"`)

#### "shows notification when session goalName has no pending task"

- **Arrange:**
  - Create temp dir with NO queue files
  - Mock `getSessionGoalName()` → returns `"empty-goal"`
- **Act:** Call `handleNextTask(undefined, ctx)`
- **Assert:**
  - `ctx.ui.notify` was called with message containing `"No pending task"` and `"empty-goal"`
  - `sessionCapabilityMock.launchCapability` was NOT called

## Programmatic Verification

- **What:** TypeScript compiles without errors
  - **How:** `npm run check` (`tsc --noEmit`)
  - **Expected result:** Exit code 0, no type errors

- **What:** All tests pass including new test file
  - **How:** `npm test` (`vitest run`)
  - **Expected result:** Exit code 0, all tests green (including `__tests__/next-task.test.ts`)

- **What:** `getSessionGoalName` is exported from `session-capability.ts`
  - **How:** `grep 'export function getSessionGoalName' src/capabilities/session-capability.ts`
  - **Expected result:** Exactly one match

- **What:** No circular dependency introduced
  - **How:** Verify `session-capability.ts` does NOT import from `next-task.ts`. Run `npm run check` to catch any issues.
  - **Expected result:** No import cycle. Dependency graph: `next-task.ts` → `session-capability.ts` (follows existing pattern used by `validation.ts`).

## Test Order

1. **Unit tests** — `getSessionGoalName` pure logic with mocked `getSessionParams()`
2. **Unit tests** — `handleNextTask` decision flow with mocked session capability
3. **Programmatic verification** — `npm run check`, `npm test`
