# Tests: Path resolution infrastructure

## Unit Tests

**File:** `src/fs-utils.test.ts` (colocated, append new describe blocks)

**Test runner:** Vitest (`npm test`)

### `describe("resolveGoalDir with parentStepDir")`

- **Flat goal (backward compatible):** `resolveGoalDir("/tmp/proj", "my-feature")` returns `path.join("/tmp/proj", ".pio", "goals", "my-feature")` — identical to current behavior when `parentStepDir` is omitted.
- **Nested subgoal:** `resolveGoalDir("/tmp/proj", "nested-task", "/tmp/proj/.pio/goals/parent/S03")` returns `path.join("/tmp/proj", ".pio", "goals", "parent", "S03", "subgoals", "nested-task")`.
- **Nested subgoal with platform separators:** Verify the returned path contains `"subgoals"` as a segment using `result.split(path.sep).toContain("subgoals")`.
- **Empty parentStepDir edge case:** `resolveGoalDir("/tmp/proj", "nested", "")` — should return `path.join("", "subgoals", "nested")` (delegates to path.join behavior; documents the edge case without asserting specific output).

### `describe("deriveSessionName with hierarchical goal names")`

- **Flat goal name unchanged:** `deriveSessionName("my-feature", "create-plan")` returns `"my-feature create-plan"`.
- **Hierarchical goal name formatted:** `deriveSessionName("parent__S03__nested", "execute-task", 1)` returns `"parent/S03/nested execute-task s1"`.
- **Single delimiter:** `deriveSessionName("a__b", "review-task")` returns `"a/b review-task"`.
- **No delimiters (existing behavior preserved):** `deriveSessionName("my-goal", "create-goal")` returns `"my-goal create-goal"`.
- **Empty goal name with delimiters in capability:** `deriveSessionName("", "some-cap")` returns `"some-cap"` — the empty check short-circuits before replacement.

## Programmatic Verification

- **TypeScript compilation:** Run `npm run check` (`tsc --noEmit`). Must report 0 errors. The new optional parameter must not break any of the 17 existing call sites.
- **Existing tests still pass:** Run `npm test`. All pre-existing test cases in `src/fs-utils.test.ts` must continue to pass without modification (backward compatibility).
- **Re-export compiles:** Verify `src/state-machine.ts` (line 29: `export { stepFolderName, resolveGoalDir } from "./fs-utils"`) still type-checks. This is covered by `npm run check`.

## Test Order

1. Unit tests (`npm test`) — verify both functions with new and existing behavior
2. Programmatic verification (`npm run check`) — confirm no TypeScript errors across the codebase
