# Task: Plan frontmatter with per-step metadata and enriched StepStatus

Extend PLAN.md frontmatter schema, validation, and `GoalState` so every step has structured metadata available via `StepStatus.getMetadata()`. Subgoal detection reads from `StepStatus` — no body-scanning of markdown headings.

## Context

pio currently supports only `totalSteps` in PLAN.md frontmatter. Step-level metadata (name, complexity) required for subgoal routing must now live in structured frontmatter. This step introduces a **required** `steps` array into the schema, enriches `GoalState.StepStatus` with a `getMetadata()` accessor, and validates the new field during plan creation. Downstream steps (4–7) will read from `StepStatus.getMetadata()` instead of parsing PLAN.md independently.

Since `steps` is mandatory, existing plans without it will fail schema validation. Backward compatibility is preserved by `postValidateCreatePlan` — which runs only for **newly created** plans — rejecting any new plan that omits `steps`. Existing on-disk plans that lack `steps` are handled gracefully at runtime: `StepStatus.getMetadata()` returns `null` when frontmatter validation fails (no crash, no migration needed).

## What to Build

### Code Components

#### 1. TypeBox schema extension (`src/frontmatter-schemas.ts`)

- Add **required** `steps` array to `PLAN_FRONTMATTER_SCHEMA`.
- Each entry is an object with:
  - `name`: required string (non-empty) — step identifier; becomes subgoal workspace name when `complexity` is `"subgoal"`
  - `complexity`: optional union of `"task"` | `"subgoal"`, defaulting to `"task"` if omitted
- Array position determines step ordering: index + 1 = step number. No explicit `number` field in each entry.
- Export a derived `StepMetadata` type: `{ name: string; complexity: "task" | "subgoal" }`.

**Implementation guidance:** Use `Type.Array(...)` (not `Type.Optional`) for the `steps` field — it is required. Each array entry uses `Type.Object({ name: Type.String({ minLength: 1 }), complexity: Type.Optional(Type.Union([Type.Literal("task"), Type.Literal("subgoal")])) })`. The `StepMetadata` type is derived via `Static<typeof STEP_METADATA_SCHEMA>` or a manual interface — whichever matches existing patterns in the file.

**Backward compatibility note:** Plans on disk that lack `steps` will fail TypeBox validation. This is expected and safe: `GoalState.planMetadata()` already returns `null` when schema validation fails, and downstream callers (`totalPlanSteps()`, `currentStepNumber()`) handle null gracefully. Existing flat goals continue to function — they simply won't have step metadata available.

#### 2. `GoalState` enrichment (`src/goal-state.ts`)

- Add `getMetadata(): StepMetadata | null` to the `StepStatus` interface.
- When PLAN.md frontmatter has a valid `steps` array (TypeBox validation passes) and the step's index (stepNumber - 1) maps to a valid entry, return `{ name, complexity }` (with `complexity` defaulting to `"task"` if omitted).
- Return `null` when: frontmatter extraction fails, schema validation fails (e.g., old plans without `steps`), or the index is out of bounds.
- The `createStepStatus` factory function must accept a closure or parameter providing access to the steps metadata array (populated from PLAN.md frontmatter during `createGoalState`).

**Implementation guidance:** In `createGoalState`, extract the `steps` array from plan frontmatter once (via `_planMetadata()`). When TypeBox validation succeeds, the result will always include `steps` (it's required). Pass this into `createStepStatus`. The existing closure pattern (`_planMetadata`) demonstrates how to share extracted data across methods. When validation fails (old plans), `getMetadata()` returns `null` for all steps — never throw.

**Approach and Decisions:**
- Follow the optional-parameter guard pattern (`!== undefined`) from Steps 1–2 (see DECISIONS.md).
- The `steps` frontmatter field may contain entries with `complexity` omitted — default to `"task"` in both validation and runtime code.
- `getMetadata()` is a zero-argument function on `StepStatus`, consistent with the lazy-evaluation pattern (`hasTask()`, `status()`, etc.). However, unlike other methods that read from disk on each call, `getMetadata()` reads from the pre-extracted steps array closure — this is correct since the data source (frontmatter) doesn't change independently of step folder creation.

#### 3. `postValidateCreatePlan` extension (`src/capabilities/create-plan.ts`)

After existing validation (frontmatter parsing, heading count), add **mandatory** `steps` array validation:
1. TypeBox validation will now reject plans without a `steps` field entirely (required schema). If schema validation fails, `postValidateCreatePlan` returns the TypeBox error — this implicitly enforces the `steps` requirement.
2. Array length must equal `totalSteps`. Return failure message: `"steps array has N entries but totalSteps is M"`.
3. Each entry must have a non-empty `name` field. Return failure: `"step entry at index I has an empty name"`.
4. When `complexity` is provided, it must be one of `"task"` | `"subgoal"`. TypeBox validation handles this — `postValidateCreatePlan` produces a user-friendly message referencing the field.

**Implementation guidance:** Import `StepMetadata` from `frontmatter-schemas.ts`. The frontmatter extracted by `state.planMetadata()` will include the `steps` array when schema validation succeeds. Validate length and name constraints manually after schema validation since postValidate needs custom error messages.

### Approach and Decisions

- **Schema-first, not body-scanning.** Subgoal metadata lives exclusively in frontmatter (`steps` array). No regex heading parsing, no `[subgoal]` annotations in markdown body. This is a deliberate departure from GOAL.md's original "in-body annotations" concept — the plan explicitly uses frontmatter-only.
- **Mandatory field = all new plans must include `steps`.** TypeBox enforces this at schema level. Existing on-disk plans without `steps` fail schema validation but continue to function — downstream code handles null metadata gracefully. No migration needed; the planning agent (Step 7 prompts) will write `steps` for all new plans.
- **TypeBox as single source of truth.** Extend the schema, not a separate interface — the type follows automatically via `Static<>`.

## Dependencies

- Step 1 (Path resolution infrastructure): Provides `resolveGoalDir` with `parentStepDir` parameter. Not directly used in this step but establishes backward-compatible extension patterns.
- Step 2 (Queue keying): Extends `GoalState.pendingTask()`. This step further modifies `GoalState`, so the executor must not conflict with existing changes.

## Files Affected

- `src/frontmatter-schemas.ts` — extend `PLAN_FRONTMATTER_SCHEMA` with required `steps` array; add `StepMetadata` type
- `src/goal-state.ts` — enrich `StepStatus` with `getMetadata()` method; populate from frontmatter in `createGoalState`
- `src/capabilities/create-plan.ts` — update `postValidateCreatePlan` to validate `steps` array (mandatory: length matches `totalSteps`, non-empty names)
- `src/capabilities/create-plan.test.ts` — tests for steps array validation (mandatory field, length mismatch, empty names)
- `src/goal-state.test.ts` — tests for `StepStatus.getMetadata()` with and without valid frontmatter

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions (563 tests)
- [ ] TypeBox validation rejects plans without a `steps` field (required)
- [ ] Plans with valid `steps` array pass `postValidateCreatePlan`; entries with `complexity: "subgoal"` are accepted
- [ ] `postValidateCreatePlan` rejects plans where `steps` array length doesn't match `totalSteps`
- [ ] `postValidateCreatePlan` rejects entries with empty `name` or invalid `complexity` value
- [ ] Old plans without `steps`: `GoalState.planMetadata()` returns null (schema failure), but existing goal workflows (`hasPlan()`, `currentStepNumber()`) continue to function
- [ ] `GoalState.steps()` returns `StepStatus` objects with `getMetadata()` populated from frontmatter when schema validation succeeds
- [ ] `getMetadata()` for step N maps to index N-1 in the `steps` array; returns `null` when schema validation fails or index is out of bounds

## Risks and Edge Cases

- **TypeBox schema is now stricter.** Making `steps` required means `validateAndCoerce` will reject any PLAN.md without it. This affects existing on-disk plans — `planMetadata()` returns null, but no code crashes because all consumers handle null gracefully. Verify: `totalPlanSteps()`, `currentStepNumber()`, and all existing tests still pass.
- **Frontmatter extraction timing:** `createGoalState` extracts frontmatter via `_planMetadata()`. If PLAN.md doesn't exist or schema validation fails, the result is null/error. Ensure `getMetadata()` handles this gracefully — returns `null`, never throws.
- **Default complexity values:** When a `steps` entry omits `complexity`, both the schema validator and runtime code must default to `"task"`. Inconsistency here would cause silent misclassification of steps.
- **Existing tests use plans without `steps`.** Many existing tests in `goal-state.test.ts` and `create-plan.test.ts` write PLAN.md with only `totalSteps`. These tests create plans that will now fail schema validation. The executor must update these test fixtures to include a valid `steps` array, or explicitly test the old-format fallback path.
