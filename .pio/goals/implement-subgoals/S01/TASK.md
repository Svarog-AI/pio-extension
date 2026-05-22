# Task: Path resolution infrastructure

Extend path resolution to support nested subgoal directories, keeping flat-goal behavior identical.

## Context

pio currently resolves goal directories as flat paths: `<cwd>/.pio/goals/<name>/`. Nested subgoals require a new nesting structure where subgoal workspaces live at `S{NN}/subgoals/<name>/` inside a parent step directory. This task adds the path resolution infrastructure so downstream steps (queue keying, state machine transitions, evolve-plan integration) can build on it.

## What to Build

### 1. Extend `resolveGoalDir` with optional `parentStepDir`

Add an optional third parameter `parentStepDir?: string` to `resolveGoalDir(cwd: string, name: string, parentStepDir?: string): string`.

- **When `parentStepDir` is omitted (existing callers):** Return the flat path `<cwd>/.pio/goals/<name>` — identical current behavior.
- **When `parentStepDir` is provided:** Return `path.join(parentStepDir, "subgoals", name)` — resolving relative to the parent step directory instead of the global goals root.

The signature change is backward compatible: all 17 existing call sites pass only `(cwd, name)` and will continue to work unchanged.

### 2. Extend `deriveSessionName` to format hierarchical names

Update `deriveSessionName(goalName: string, capability: string, stepNumber?: number): string` so that when `goalName` contains `__` delimiters (produced by hierarchical queue keys from Step 2), they are replaced with `/` in the display name.

- `"my-feature"` → `"my-feature create-plan"` (unchanged)
- `"parent__S03__nested"` → `"parent/S03/nested execute-task s1"` (new behavior for subgoal sessions)

The replacement is a simple string substitution: `goalName.replace(/__/g, "/")`. Apply it before concatenating with the capability name. When `goalName` is empty/undefined, return unchanged.

## Code Components

### `resolveGoalDir` signature change

```typescript
// Before
export function resolveGoalDir(cwd: string, name: string): string;

// After
export function resolveGoalDir(cwd: string, name: string, parentStepDir?: string): string;
```

Behavior:
- No `parentStepDir`: `path.join(cwd, ".pio", "goals", name)`
- With `parentStepDir`: `path.join(parentStepDir, "subgoals", name)`

### `deriveSessionName` formatting change

Inside the function body, before building the display string, normalize `goalName`:

```typescript
// Replace __ delimiters with / for display
let displayName = goalName ? goalName.replace(/__/g, "/") : "";
```

Then build the rest of the name as usual using `displayName` instead of `goalName`.

### Approach and Decisions

- Follow the existing function signatures and coding conventions in `fs-utils.ts` (JSDoc comments, no default parameter values).
- The `parentStepDir` parameter is optional — use TypeScript optional parameter (`?: string`), not a default value. This ensures existing call sites compile unchanged.
- Use `path.join` for path construction — ensures platform-independent separators.
- The `__` → `/` replacement in `deriveSessionName` is cosmetic only (display formatting). The raw `goalName` passed in may contain `__` from queue keys (Step 2). Don't introduce a new function — keep the change inline to minimize surface area.
- Validate if unsure using the docs/plans/subgoals FEASIBILITY.md and SYNTHESIS.md files.

## Dependencies

None. This is Step 1 with no prerequisite steps.

## Files Affected

- `src/fs-utils.ts` — add optional `parentStepDir` param to `resolveGoalDir`; update `deriveSessionName` formatting for `__` → `/`
- `src/fs-utils.test.ts` — add tests for nested path resolution, backward compatibility, and session name formatting

## Acceptance Criteria

- `npx tsc --noEmit` reports no errors
- Running existing test suite (`npm test`) passes with no regressions
- `resolveGoalDir(cwd, "my-feature")` returns the same flat path as before (backward compatible)
- `resolveGoalDir(cwd, "nested", parentStepDir)` returns `<parentStepDir>/subgoals/nested`

## Risks and Edge Cases

- **Re-export in state-machine.ts:** `src/state-machine.ts` line 29 re-exports `resolveGoalDir` from `fs-utils`. The re-export must continue to work with the new signature. Since it's a simple named re-export (`export { resolveGoalDir }`), TypeScript will automatically pick up the updated signature — no change needed.
- **17 existing call sites:** All current callers pass only `(cwd, name)`. Adding an optional parameter is backward compatible at the TypeScript level. Verify with `npm run check`.
- **Platform separators:** Use `path.join` consistently to avoid hard-coded `/` on Windows. The test suite runs on Linux CI; tests should use `path.join` for assertions rather than string literals containing separators where possible.
