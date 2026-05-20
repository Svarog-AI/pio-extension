# Task: Fix state machine transition params for finalize-goal

Update `transitionEvolvePlan()` so the goal-completed guard returns `goalDir` and explicit `workingDir` alongside `goalName`, fixing the incorrect directory resolution for finalize-goal sessions.

## Context

When all plan steps complete, `transitionEvolvePlan()` routes to `finalize-goal` with only `{ goalName }`. Downstream, `resolveCapabilityConfig()` sees `goalName` and derives `workingDir = resolveGoalDir(cwd, goalName)`, pointing to `.pio/goals/<name>/`. This breaks finalize-goal because it needs to write `.pio/PROJECT/*.md` relative to the project root, not the goal workspace.

Step 1 (completed) fixed the initial message. This step fixes the params so `workingDir` resolves correctly.

## What to Build

In `src/state-machine.ts`, update `transitionEvolvePlan()`:

1. Import `resolveGoalDir` from `./fs-utils` — a pure path-joining function (`path.join(cwd, ".pio", "goals", name)`) with no filesystem I/O.
2. In the goal-completed guard (`if (state.goalCompleted())`), compute `goalDir` and `workingDir` before returning:
   - `const cwd = process.cwd()`
   - `const goalDir = resolveGoalDir(cwd, goalName!)`
   - Return `{ capability: "finalize-goal", params: { goalName, goalDir, workingDir: cwd } }`

The non-completion paths (evolve-plan → execute-task) remain unchanged.

### Code Components

**Import addition in `state-machine.ts`:**
```typescript
import { resolveGoalDir } from "./fs-utils";
```

**Modified completion guard in `transitionEvolvePlan()`:**
Currently:
```typescript
if (state.goalCompleted()) {
  const goalName = extractGoalName(params);
  return { capability: "finalize-goal", params: { goalName } };
}
```
After change:
- Compute `cwd` via `process.cwd()`
- Compute `goalDir` via `resolveGoalDir(cwd, goalName!)`
- Return `{ goalName, goalDir, workingDir: cwd }` in params

### Approach and Decisions

- **Use `process.cwd()` directly** — matches the existing pattern in `session-capability.ts` (line 151: `enqueueTask(process.cwd(), ...)`) and other capabilities. At transition resolution time, we're always within a pi session context where cwd is well-defined.
- **Import from `./fs-utils` not absolute path** — `resolveGoalDir` is already exported in the same package; use relative import consistent with existing style (`stepFolderName` is already re-exported from `./fs-utils` in this file).
- **Non-null assertion on `goalName`** — inside the completion guard, if `goalCompleted()` is true, a goal name must exist (otherwise there's no goal to complete). This is safe but add a comment noting the assumption.
- **Keep it pure-ish** — the only non-pure aspect is `process.cwd()`, which matches existing patterns in the codebase. No filesystem I/O is introduced by this change.

## Dependencies

Step 1 must be completed (it is — `APPROVED`). No other dependencies.

## Files Affected

- `src/state-machine.ts` — import `resolveGoalDir`, compute `goalDir` and `workingDir` in the completion guard of `transitionEvolvePlan`, return them in params

## Acceptance Criteria

- [ ] When `goalCompleted()` is true, `resolveTransition("evolve-plan", state, { goalName: "feat" })` returns params containing `goalDir`, `goalName`, and `workingDir`
- [ ] The returned `goalDir` equals the resolved goal workspace path (e.g., `<cwd>/.pio/goals/feat`)
- [ ] The returned `workingDir` equals the project root (`process.cwd()`)
- [ ] `npm run check` reports no type errors
- [ ] Non-completion paths (evolve-plan → execute-task) are unaffected — still return `{ goalName, stepNumber }`

## Risks and Edge Cases

- **`goalName` could be `undefined`**: If somehow `goalCompleted()` returns true but `extractGoalName(params)` returns `undefined`, the `resolveGoalDir(cwd, undefined!)` call would produce a path like `.pio/goals/undefined`. The non-null assertion should be safe per the goal lifecycle, but tests should verify the happy path with valid `goalName`.
- **Test mocking of `process.cwd()`**: Existing state-machine tests don't mock `process.cwd()`. New tests for the completion path will need to spy on it (see TEST.md) using the established pattern from `mark-complete-integration.test.ts` (`vi.spyOn(process, "cwd").mockReturnValue(...)`).
- **Circular dependency check**: `fs-utils.ts` imports only `node:fs` and `node:path`. Importing it in `state-machine.ts` introduces no circular dependency.
