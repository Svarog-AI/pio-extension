# Plan Frontmatter

Introduce mandatory YAML frontmatter to PLAN.md with a `totalSteps` field. Every valid PLAN.md must have it — enforced by create-plan's `postValidate` hook. Plans without frontmatter are invalid. This replaces the current heuristic (root-level `COMPLETED` marker written by the Specification Writer agent when it can't find its step in PLAN.md) with explicit, machine-readable declarations and infrastructure-managed completion detection.

## Current State

**Frontmatter infrastructure already exists:**
- `src/frontmatter.ts` exports `extractFrontmatter(filePath)` — reads YAML frontmatter delimited by `---` at the top of a file, parses with `js-yaml`, returns `Record<string, unknown> | null`. Returns `null` for missing files, no frontmatter, or malformed YAML.
- `src/frontmatter.ts` exports `validateAndCoerce<T>(raw, schema)` — validates a parsed object against a TypeBox `TSchema`, coerces to a typed result. Returns `{ data: T }` on success or `{ error: string }` on failure. Strips extra fields not in the schema.
- `src/frontmatter-schemas.ts` is a leaf module (imports only from `typebox`) defining `REVIEW_OUTPUT_SCHEMA` — a TypeBox object schema for REVIEW.md frontmatter fields (`decision`, `criticalIssues`, etc.) with a derived `ReviewOutputs` type via `Static<typeof>`.

**GoalState reads plan step count from headings:**
- `src/goal-state.ts` implements `GoalState` interface with `totalPlanSteps()` method. Currently reads PLAN.md, scans for `## Step N:` patterns, and returns the highest N found. Returns `undefined` if no PLAN.md or no headings. This heading-parsing approach is being replaced entirely by frontmatter.
- `GoalState.currentStepNumber()` does sequential folder scanning: iterates S01, S02, ... and returns the first folder without an `APPROVED` marker (or the first gap). Never uses `totalPlanSteps()`.

**evolve-plan determines "all steps done" via COMPLETED marker:**
- `src/capabilities/evolve-plan.ts` — `validateAndFindNextStep()` checks for a root-level `COMPLETED` file (`<goalDir>/COMPLETED`). If it exists, returns `{ ready: false, error }` blocking relaunch.
- The `COMPLETED` marker is not created by infrastructure. Per `src/prompts/evolve-plan.md` (Step 2), the Specification Writer agent manually creates `<goalDir>/COMPLETED` when it can't find its assigned step in PLAN.md — meaning all steps are already specified.
- This means evolve-plan only knows "all done" after a sub-session runs and the agent discovers it's past the last step.

**review-task transition always routes to evolve-plan:**
- `src/state-machine.ts` — `transitionReviewTask()` checks step status from `GoalState.steps()`. When a step is "approved", it returns `{ capability: "evolve-plan", params: { stepNumber: stepNumber + 1 } }` unconditionally, even after the last step. This is intentional: evolve-plan is the gatekeeper.

**evolve-plan transition always routes to execute-task:**
- `src/state-machine.ts` — `transitionEvolvePlan()` always returns `{ capability: "execute-task" }`. Even when all steps are done and evolve-plan writes COMPLETED, calling `pio_mark_complete` would route to execute-task and enqueue a spurious task for a non-existent step.

**create-plan has no postValidate hook:**
- `src/capabilities/create-plan.ts` — `CAPABILITY_CONFIG` defines validation as `{ files: ["PLAN.md"] }` but has no `postValidate` hook. After the Planning Agent writes PLAN.md, there's no infrastructure check that the content is correct beyond file existence.

**create-plan prompt does not mention frontmatter:**
- `src/prompts/create-plan.md` instructs the Planning Agent to write PLAN.md with specific sections (Prerequisites, Steps, Notes) using `## Step N:` headings. No instruction to include YAML frontmatter.

## To-Be State

### PLAN.md includes mandatory YAML frontmatter with `totalSteps`

PLAN.md starts with a YAML frontmatter block:

```yaml
---
totalSteps: 5
---
# Plan: <Goal Name>
...
```

`totalSteps` is an integer representing the total number of plan steps. Frontmatter is **mandatory** — enforced by create-plan's `postValidate` hook. Plans without frontmatter are invalid; there is no fallback or backwards compatibility path.

### New TypeBox schema in `src/frontmatter-schemas.ts`

- Add `PLAN_FRONTMATTER_SCHEMA` — a TypeBox object schema with one required field: `totalSteps` as `Type.Integer({ minimum: 1 })`.
- Add derived type: `PlanFrontmatter = Static<typeof PLAN_FRONTMATTER_SCHEMA>`.
- Follows the same pattern as `REVIEW_OUTPUT_SCHEMA` (leaf module, imports only from `typebox`).

### GoalState reads plan frontmatter

- Add a new method `planMetadata()` to the `GoalState` interface. Returns `PlanFrontmatter | null`. Uses `extractFrontmatter` + `validateAndCoerce` with `PLAN_FRONTMATTER_SCHEMA`. Reads fresh from disk on every call — no caching.
- Modify `totalPlanSteps()`: read from frontmatter via `planMetadata()`. If valid, return `totalSteps`. If absent or invalid, return `undefined`. The old heading-parsing logic (`## Step N:` regex scan) is **removed entirely** — frontmatter is the sole source of truth.
- Downstream consumers handle `undefined` as "no valid plan" (same behavior as today when PLAN.md has no step headings).

### create-plan prompt instructs Planning Agent to write frontmatter

- Update `src/prompts/create-plan.md` to instruct the Planning Agent to include YAML frontmatter with `totalSteps` at the top of PLAN.md. The `totalSteps` value must equal the count of steps the agent is creating. The example PLAN.md structure in Step 5 should show the frontmatter block.

### create-plan has a postValidate hook for frontmatter correctness

- `src/capabilities/create-plan.ts` should add a `postValidate` callback to `CAPABILITY_CONFIG`. Runs after file-existence validation (PLAN.md exists) passes but before transition routing.
- Validates: extract frontmatter from PLAN.md via `extractFrontmatter`, validate against `PLAN_FRONTMATTER_SCHEMA`, and verify that `totalSteps` matches the actual count of `## Step N:` headings in the document. On mismatch, return `{ success: false, message: "..." }` to keep the agent in session to fix it.
- Guarantees all valid plans have correct frontmatter.

### evolve-plan uses frontmatter to determine completion and writes COMPLETED marker

**evolve-plan is the gatekeeper.** `transitionReviewTask()` always routes to evolve-plan (no state machine change). evolve-plan checks whether work remains and decides what happens next.

**Tool/command entry point (`validateAndFindNextStep`):**
- Check frontmatter via `GoalState.planMetadata()`. When next step number exceeds `totalSteps`, all steps are specified. Write an empty `<goalDir>/COMPLETED` marker and return a success result (not an error). Infrastructure-managed completion — no agent session needed.
- When next step ≤ `totalSteps`, proceed normally (find step, launch or enqueue).

**No transition on goal completion:**
- Modify `transitionEvolvePlan` in `src/state-machine.ts` to check frontmatter `totalSteps` via `GoalState.planMetadata()`. When all steps are already evolved (`currentStepNumber > totalSteps`), return `undefined` — no transition, no task enqueued. `markCompleteTool` handles `undefined` transitions gracefully: skips enqueuing and terminates the session.
- The existing pre-launch COMPLETED guard in `validateAndFindNextStep()` remains: if `<goalDir>/COMPLETED` exists, refuse to relaunch.

### Downstream consumers of `totalPlanSteps()`

- Code that reads `totalPlanSteps()` for display (e.g., `/pio-list-goals`) now gets values from frontmatter. Returns `undefined` when PLAN.md is missing or has invalid frontmatter — tools should display "no plan" accordingly.
