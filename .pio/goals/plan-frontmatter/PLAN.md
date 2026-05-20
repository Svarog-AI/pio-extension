# Plan: Plan Frontmatter

Introduce mandatory YAML frontmatter (`totalSteps`) to PLAN.md with schema, GoalState integration, prompt instructions, postValidate enforcement, and completion detection — replacing the heuristic `COMPLETED` marker with explicit machine-readable declarations.

## Prerequisites

None.

## Steps

### Step 1: Add PLAN_FRONTMATTER_SCHEMA to frontmatter-schemas.ts

**Description:** Add a new TypeBox schema for PLAN.md frontmatter following the exact pattern of the existing `REVIEW_OUTPUT_SCHEMA`. The schema defines a single required field `totalSteps` as an integer with minimum value 1. Export both the schema and the derived TypeScript type.

**Acceptance criteria:**
- [ ] `PLAN_FRONTMATTER_SCHEMA` is exported from `src/frontmatter-schemas.ts`
- [ ] Schema validates `{ totalSteps: 3 }` as valid
- [ ] Schema rejects missing `totalSteps`, zero, negative values, floats, and non-integer types
- [ ] `PlanFrontmatter` type is exported as `Static<typeof PLAN_FRONTMATTER_SCHEMA>`
- [ ] Module remains a leaf module — imports only from `typebox`, no internal imports
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/frontmatter-schemas.ts` — add `PLAN_FRONTMATTER_SCHEMA` and `PlanFrontmatter` type


### Step 2: Add planMetadata() to GoalState and replace totalPlanSteps()

**Description:** Add a new `planMetadata()` method to the `GoalState` interface that reads PLAN.md frontmatter using the existing `extractFrontmatter` + `validateAndCoerce` pipeline with `PLAN_FRONTMATTER_SCHEMA`. Returns `PlanFrontmatter | null`. Modify `totalPlanSteps()` to delegate to `planMetadata()` — if valid frontmatter exists, return `totalSteps`; otherwise return `undefined`. Remove the old `## Step N:` heading-parsing regex entirely. Downstream consumers that read `totalPlanSteps()` already handle `undefined` as "no valid plan" — no change needed there.

**Acceptance criteria:**
- [ ] `planMetadata()` method added to `GoalState` interface with correct return type
- [ ] `planMetadata()` returns typed `PlanFrontmatter` when PLAN.md has valid frontmatter
- [ ] `planMetadata()` returns `null` for missing PLAN.md, no frontmatter, or invalid frontmatter
- [ ] `totalPlanSteps()` returns `totalSteps` from frontmatter (not from heading scan)
- [ ] `totalPlanSteps()` returns `undefined` when frontmatter is absent or invalid
- [ ] Old heading-parsing regex (`## Step N:`) is removed from `goal-state.ts`
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/goal-state.ts` — add `planMetadata()` to interface and factory, modify `totalPlanSteps()`, remove heading-parsing logic


### Step 3: Update create-plan prompt to instruct frontmatter writing

**Description:** Update the Planning Agent prompt (`src/prompts/create-plan.md`) to instruct the agent to include YAML frontmatter with `totalSteps` at the top of every PLAN.md. The instructions should specify:
- Frontmatter block must appear before the title
- `totalSteps` must equal the count of steps being created
- Show the frontmatter in the example PLAN.md structure (Step 5 of the prompt)

**Acceptance criteria:**
- [ ] Prompt instructs Planning Agent to include `---\ntotalSteps: N\n---` at the top of PLAN.md
- [ ] Example PLAN.md structure in the prompt shows the frontmatter block before `# Plan: <Goal Name>`
- [ ] Instructions state that `totalSteps` must equal the actual number of steps
- [ ] No other behavior or sections of the prompt are changed

**Files affected:**
- `src/prompts/create-plan.md` — add frontmatter instructions and update example structure


### Step 4: Add postValidate hook to create-plan capability

**Description:** Add a `postValidate` callback to `CAPABILITY_CONFIG` in `src/capabilities/create-plan.ts`. This hook runs after file-existence validation passes (PLAN.md exists) but before transition routing. It must:
1. Extract frontmatter from PLAN.md using `extractFrontmatter`
2. Validate against `PLAN_FRONTMATTER_SCHEMA` using `validateAndCoerce`
3. Count actual `## Step N:` headings in the document
4. Verify that `totalSteps` matches the heading count
5. Return `{ success: false, message }` on any mismatch or validation failure; return `{ success: true }` on success

Follows the pattern established by `postValidateReview` in `review-task.ts`.

**Acceptance criteria:**
- [ ] `postValidate` is defined in `CAPABILITY_CONFIG` in `src/capabilities/create-plan.ts`
- [ ] Returns failure when PLAN.md has no frontmatter
- [ ] Returns failure when frontmatter has invalid `totalSteps` (missing, zero, negative, non-integer)
- [ ] Returns failure when `totalSteps` doesn't match actual heading count
- [ ] Returns success when frontmatter is valid and counts match
- [ ] Uses `extractFrontmatter` + `validateAndCoerce` with `PLAN_FRONTMATTER_SCHEMA`
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/capabilities/create-plan.ts` — add `postValidate` callback, import frontmatter utilities and schema


### Step 5: Implement infrastructure-managed completion in evolve-plan

**Description:** Modify `validateAndFindNextStep()` in `src/capabilities/evolve-plan.ts` to use frontmatter for completion detection. Before the existing COMPLETED guard check, read `GoalState.planMetadata()`. When the requested `stepNumber` exceeds `totalSteps`, all steps are already specified:
1. Write an empty `<goalDir>/COMPLETED` marker file (infrastructure-managed)
2. Return `{ ready: false, error }` with a message indicating all steps are complete (not treated as an error condition by infrastructure — the COMPLETED marker causes `validateOutputs` to pass)

The existing pre-launch guard (`if COMPLETED exists, refuse relaunch`) remains unchanged below this new check. The agent-side COMPLETED creation from `evolve-plan.md` prompt is no longer needed for infrastructure purposes but can remain in the prompt as a fallback for edge cases.

**Acceptance criteria:**
- [ ] `validateAndFindNextStep()` checks `GoalState.planMetadata()` for `totalSteps`
- [ ] When `stepNumber > totalSteps`, writes `<goalDir>/COMPLETED` marker and returns not-ready result
- [ ] Existing COMPLETED guard below the new check still prevents relaunch when marker exists
- [ ] Normal flow (step ≤ totalSteps) proceeds unchanged to launch/enqueue
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/capabilities/evolve-plan.ts` — modify `validateAndFindNextStep()` to add frontmatter-based completion detection


### Step 6: Modify transitionEvolvePlan to return undefined when all steps complete

**Description:** Modify `transitionEvolvePlan()` in `src/state-machine.ts` to check whether all plan steps are already evolved. Use `GoalState.planMetadata()` to get `totalSteps`. When `currentStepNumber() > totalSteps`, return `undefined` — no transition, no task enqueued. The `markCompleteTool` handles `undefined` transitions gracefully: skips enqueuing and terminates the session.

This prevents the current issue where evolve-plan completes all steps (writing COMPLETED), calls `pio_mark_complete`, and gets routed to `execute-task` with a non-existent step number. The existing behavior of always routing to `execute-task` remains for the normal case (steps still remaining).

**Acceptance criteria:**
- [ ] `transitionEvolvePlan()` checks `state.planMetadata()?.totalSteps` against `state.currentStepNumber()`
- [ ] Returns `undefined` when all steps are evolved (`currentStepNumber > totalSteps`)
- [ ] Falls back to existing behavior (route to `execute-task`) when frontmatter is unavailable or steps remain
- [ ] `resolveTransition` switch already handles the "evolve-plan" case — modify the internal function, not the switch
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/state-machine.ts` — modify `transitionEvolvePlan()` to check frontmatter-based completion

## Notes

- **Schema first dependency:** Step 1 (schema) must complete before Step 2 (GoalState), which must complete before Steps 4–6 (consumers of the new GoalState method). This ordering is critical.
- **`totalPlanSteps()` backward compatibility:** The method signature remains `() => number | undefined`. Existing callers handle `undefined` as "no valid plan." No downstream code changes are required for this behavior shift.
- **Heading validation in postValidate:** Even though frontmatter is the source of truth, Step 4 validates that `totalSteps` matches actual headings. This catches agent errors (wrong count) but does not use headings as a fallback for reading step count — that's strictly a write-time check.
- **COMPLETED marker persistence:** The `COMPLETED` file at `<goalDir>/COMPLETED` is still used by the pre-launch guard in evolve-plan and by `validateOutputs` in validation.ts (which passes validation when COMPLETED exists). This ensures backward compatibility with the existing exit-gate logic.
- **No changes to evolve-plan.md prompt required:** The prompt's instruction for the agent to create COMPLETED manually is a fallback path. Infrastructure now handles it, but keeping the instruction doesn't cause harm and provides defense-in-depth.
