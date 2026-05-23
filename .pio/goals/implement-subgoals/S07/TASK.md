# Task: Create-plan validation and list-goals recursion

Two independent supporting features: validate unique subgoal names in `postValidateCreatePlan`, and add recursive subgoal discovery to `list-goals`. Neither depends on Step 6.

## Context

pio now has the core infrastructure for nested subgoals (Steps 1–6): path resolution, queue keying, plan frontmatter with per-step metadata, state machine transitions, test generation moves, and lifecycle wiring. This step rounds out the feature with two quality-of-life additions: ensuring plan authors don't create duplicate subgoal names (which would cause path collisions), and making `/pio-list-goals` aware of nested subgoals so users can see the full goal hierarchy.

## What to Build

### 1. Create-plan validation — unique subgoal names

Extend `postValidateCreatePlan` in `src/capabilities/create-plan.ts` to validate that all steps with `complexity: "subgoal"` have unique `name` values. Duplicate names would cause path collisions when subgoal workspaces are created under `S{NN}/subgoals/<name>/`.

**Behavior:**
- After the existing validation checks (frontmatter, steps array length, non-empty names, heading count), add a check: collect all entries where `complexity === "subgoal"`, extract their `name` values, and verify no duplicates exist.
- On duplicate, return `{ success: false, message: "..." }` with a user-friendly message identifying the duplicate name(s).
- Regular steps (`complexity: "task"` or omitted) do NOT participate in this uniqueness check — only subgoals need unique names since they create disk directories.
- The `STEP_HEADING_RE` regex must NOT be changed — it already matches all `## Step N:` headings correctly. This step adds validation logic only; no regex changes.

### 2. List-goals recursive scan

Update `src/capabilities/list-goals.ts` to discover nested subgoals under each parent goal's step directories.

**Behavior:**
- After scanning top-level goals in `.pio/goals/`, recursively look inside each goal's `S{NN}/subgoals/<name>/` directories for subgoal workspaces (identified by the presence of `GOAL.md`).
- For each subgoal found, compute a hierarchical display name: `<parentGoalName>/<stepFolder>/<subgoalName>` — e.g., `parent-goal/S03/nested-feature`.
- Display in the table with indentation or prefixing to visually distinguish from top-level goals.
- Backward compatible: flat goals (no subgoals) display identically to current behavior.

**Implementation approach:**
- Add a recursive scan function (e.g., `findSubgoals(goalDir, parentPathPrefix)`): scans `S{NN}/subgoals/` for directories containing `GOAL.md`, then recurses into each subgoal to find further nesting.
- The recursive function should support arbitrary nesting depth (each level adds `<stepFolder>/<name>` to the prefix).
- Pass discovered goals through the same `inferPhase` and `readLastTask` pipeline as top-level goals.

## Code Components

### `postValidateCreatePlan` extension (in `src/capabilities/create-plan.ts`)

Add validation logic after existing checks (before the final `return { success: true }`):
- Filter `steps` array for entries where `entry.complexity === "subgoal"`
- Extract `.name` from each subgoal entry
- Use a `Set` or similar to detect duplicates
- On collision, return failure with message listing the duplicate name(s)

### Recursive subgoal discovery (in `src/capabilities/list-goals.ts`)

New helper function:
```typescript
/**
 * Recursively discover subgoals under a goal's step directories.
 * Returns an array of { dir: string, displayName: string } entries.
 */
function findSubgoals(goalDir: string, parentDisplayName: string): Array<{ dir: string; displayName: string }>
```

- Scans for `S{NN}/subgoals/<name>/` patterns inside `goalDir`
- For each directory matching the pattern containing a `GOAL.md`, yields an entry and recurses
- Builds display name by appending `/S{NN}/<name>` to prefix

Updated `handleListGoals`:
- After collecting top-level goals, call `findSubgoals` for each goal dir
- Merge subgoal entries into the table rows (appended after top-level rows, sorted alphabetically by display name)

## Approach and Decisions

- Follow the existing patterns in `list-goals.ts`: simple synchronous file reads via `fs.existsSync`, `fs.readdirSync`, no async operations.
- For `postValidateCreatePlan`, use a straightforward linear scan — step counts are small (typically < 20). No need for complex algorithms.
- The subgoal directory pattern to match: directories named exactly like `S\d{2}` containing a `subgoals/` subdirectory, which itself contains subdirectories with `GOAL.md`.
- Reference S06 DECISIONS.md: frontmatter-based subgoal detection is the authoritative approach — `complexity: "subgoal"` in the `steps` array.
- **No changes to `STEP_HEADING_RE`:** The plan explicitly states this regex should not be modified. It already matches all step headings correctly.

## Dependencies

Step 3 (Plan frontmatter with per-step metadata) — provides the `steps` array and `complexity` field that this validation checks against. Step 6 must also be completed for full lifecycle to work, but these two features are independent of Step 6's specific changes.

## Files Affected

- `src/capabilities/create-plan.ts` — add unique subgoal name validation in `postValidateCreatePlan`
- `src/capabilities/create-plan.test.ts` — tests for duplicate name rejection and valid subgoal names
- `src/capabilities/list-goals.ts` — recursive subgoal discovery; hierarchical display names

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] `postValidateCreatePlan` accepts plans with valid `steps` array including entries with `complexity: "subgoal"` (all unique names)
- [ ] `postValidateCreatePlan` rejects plans with duplicate `name` values among subgoal steps, returning a descriptive error message containing the duplicate name
- [ ] Plans with duplicate names on regular (`complexity: "task"`) steps are accepted — only subgoal names must be unique
- [ ] Flat goals without subgoals display identically in list-goals (backward compatible)
- [ ] Nested subgoals appear in the list-goals table with hierarchical name prefix (e.g., `parent/S03/nested`)
- [ ] Deeply nested subgoals (subgoals within subgoals) are also discovered and displayed
- [ ] `STEP_HEADING_RE` regex is unchanged from its current value

## Risks and Edge Cases

- **No test file for list-goals:** `list-goals.ts` currently has no dedicated test file. The recursive scan logic should be verifiable through the existing test infrastructure or by adding a new test file (`list-goals.test.ts`) if warranted.
- **Subgoal directories without GOAL.md:** A `subgoals/` directory may contain partial workspaces (no GOAL.md yet). Only directories containing `GOAL.md` should be listed as subgoals — this is the same heuristic used for top-level goals.
- **Mixed step/subgoal plans:** Plans can have both regular steps and subgoal steps. The uniqueness check applies only to subgoal entries, not all entries.
- **Empty `subgoals/` directory:** A step's `S{NN}/subgoals/` may exist but be empty (no subgoals created yet). This should not cause errors — the scan simply finds nothing and continues.
