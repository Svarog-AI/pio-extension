# Task: Add types, output schema, and marker creation to `review-task.ts`

Move review-specific frontmatter logic from `src/guards/validation.ts` into `src/capabilities/review-task.ts`, define the review output schema using typebox (single source of truth for runtime validation + TypeScript type), and eliminate the `_private(state)` / `public(goalDir)` function pattern.

## Context

Currently, all review frontmatter types (`RawReviewFrontmatter`, `ReviewFrontmatter`) and functions (`parseReviewFrontmatter`, `validateReviewFrontmatter`, `toReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`) live in `src/guards/validation.ts` — a cross-cutting guard module. This violates ownership boundaries: review-task defines what frontmatter it needs, but parsing logic is scattered elsewhere.

Step 1 created `src/frontmatter.ts` with `extractFrontmatter` and a custom schema-based `validateAndCoerce`. **The schema approach has been retrofitted to use typebox** (see DECISIONS.md for details). Step 1's existing implementation still uses the custom `OutputSchema`, but this step should define review outputs using typebox — the shared module will be updated in a follow-up pass.

## What to Build

### 1. Define `REVIEW_OUTPUT_SCHEMA` (typebox) and derive `ReviewOutputs` type

Add these as **exported** declarations in `src/capabilities/review-task.ts`:

```typescript
import { Type } from "typebox";
import type { Static } from "typebox";

const REVIEW_OUTPUT_SCHEMA = Type.Object({
  decision: Type.Union([Type.Literal("APPROVED"), Type.Literal("REJECTED")]),
  criticalIssues: Type.Integer({ minimum: 0 }),
  highIssues: Type.Integer({ minimum: 0 }),
  mediumIssues: Type.Integer({ minimum: 0 }),
  lowIssues: Type.Integer({ minimum: 0 }),
});

export type ReviewOutputs = Static<typeof REVIEW_OUTPUT_SCHEMA>;
```

- `REVIEW_OUTPUT_SCHEMA` must be **exported** — consumed by Step 5's `postValidate` hook and by any module that needs to validate review frontmatter at runtime.
- `ReviewOutputs` is derived from the schema via `Static<typeof ...>` — no manual interface definition. This is the single source of truth pattern: change the schema, type follows automatically.
- Both must be **exported** — Step 3's `GoalState.getReviewOutputs()` needs the schema for validation and the type for return signatures.

### 2. Move `applyReviewDecision` to `review-task.ts`

Move the function from `src/guards/validation.ts` into `src/capabilities/review-task.ts`. Update the signature:

**Current (in validation.ts):**
```typescript
export function applyReviewDecision(
  workingDir: string,
  stepNumber: number,
  frontmatter: ReviewFrontmatter, // after coercion from RawReviewFrontmatter
): void
```

**Target (in review-task.ts):**
```typescript
export function applyReviewDecision(
  goalDir: string,
  stepNumber: number,
  outputs: ReviewOutputs,
): void
```

The parameter type changes to `ReviewOutputs` — the caller passes validated/coerced data from the shared parser. The function behavior is identical:

- **APPROVED:** create empty `S{NN}/APPROVED`, leave `COMPLETED` intact
- **REJECTED:** create empty `S{NN}/REJECTED`, delete `S{NN}/COMPLETED` (with `force: true`)

The function should:
- Use `stepFolderName(stepNumber)` from `../fs-utils` for path construction
- Ensure the step directory exists (`fs.mkdirSync(stepDir, { recursive: true })`)
- Accept `ReviewOutputs` — TypeScript guarantees correct types at compile time; no runtime type check needed

### 3. Eliminate `_private(state)` / `public(goalDir)` split

Two functions currently use this anti-pattern:

#### `isStepReviewable`

**Before:**
```typescript
function _isReviewable(step: StepStatus): boolean { ... } // private helper
export function isStepReviewable(goalDir: string, stepNumber: number): boolean {
  const state = createGoalState(goalDir);
  const step = state.steps().find(s => s.stepNumber === stepNumber);
  if (!step) return false;
  return _isReviewable(step);
}
```

**After:** Keep the helper as an **unexported** module-level function. Rename `_isReviewable` to `isReviewable` (drop the underscore prefix — it's a private utility, not a "private wrapper" in an anti-pattern). The public function already accepts `goalDir` directly — no signature change.

Both `isStepReviewable` and `findMostRecentCompletedStep` need this helper for deduplication. Keep it as a single unexported function.

#### `findMostRecentCompletedStep`

**Before:**
```typescript
function _findMostRecentCompletedStep(state: GoalState): number | undefined { ... } // private helper taking state
export function findMostRecentCompletedStep(goalDir: string): number | undefined {
  return _findMostRecentCompletedStep(createGoalState(goalDir));
}
```

**After:** Inline the logic — create `GoalState` internally. Remove `_findMostRecentCompletedStep`:

```typescript
export function findMostRecentCompletedStep(goalDir: string): number | undefined {
  const state = createGoalState(goalDir);
  const allSteps = state.steps();

  for (let i = allSteps.length - 1; i >= 0; i--) {
    if (isReviewable(allSteps[i])) { // uses the unexported helper
      return allSteps[i].stepNumber;
    }
  }

  return undefined;
}
```

### 4. Remove frontmatter functions from `validation.ts`

From `src/guards/validation.ts`, remove:
- `parseReviewFrontmatter(reviewPath)` — function and export
- `validateReviewFrontmatter(frontmatter)` — function and export
- `toReviewFrontmatter(raw)` — function (internal, no export)
- `applyReviewDecision(workingDir, stepNumber, frontmatter)` — function and export
- `validateReviewState(workingDir, stepNumber, expectedDecision)` — function and export
- `RawReviewFrontmatter` interface — type definition
- `ReviewFrontmatter` interface — type and export

Also remove the `import * as jsyaml from "js-yaml"` from `validation.ts`. It was only used by `parseReviewFrontmatter`. After removal, verify no other code in validation.ts uses `jsyaml`.

Keep in `validation.ts`:
- `validateOutputs` function (pure utility, still used by mark_complete tool)
- `extractGoalName` function (still used by mark_complete tool)
- `ValidationResult` interface and `ValidationRule` re-export
- File protection event handlers (`tool_call`, `resources_discover`)
- The `pio_mark_complete` tool (still here — moves to session-capability.ts in Step 6)
- `import { Type } from "typebox"` — still needed for the mark_complete tool parameters

## Approach and Decisions

- **Follow DECISIONS.md:** This step uses typebox schemas instead of the custom `OutputSchema` that Step 1 implemented. The shared frontmatter module (`src/frontmatter.ts`) will need a follow-up retrofit to accept typebox `TSchema` types. For now, this step's code is self-contained — it defines the review schema in `review-task.ts` and uses it directly for marker creation. Downstream steps (3-5) will also use typebox schemas.
- **Follow existing patterns:** The project already uses `Type.Object(...)` with `Type.Union`, `Type.Literal`, `Type.Integer` everywhere (see every capability's tool parameters). The approach here matches the established convention.
- **Use `typebox/value` for validation when needed at runtime:** Future steps (Step 5's `postValidate`) will use `Value.Check(schema, raw)` and `Value.Errors(schema, raw)` from `import * as Value from "typebox/value"`. This step doesn't need runtime validation yet — that comes in Step 5.

## Dependencies

- **Step 1 must be completed:** `src/frontmatter.ts` must exist with `extractFrontmatter`. However, the current `validateAndCoerce` function uses the custom `OutputSchema` which will be superseded. This step does NOT call `validateAndCoerce` — it only needs `extractFrontmatter` (used later in Step 5 for postValidate).
- **typebox is available:** Already in `package.json` as a dependency (`^1.1.24`). Used by every capability module.

## Files Affected

- `src/capabilities/review-task.ts` — modified: add typebox-based `REVIEW_OUTPUT_SCHEMA`, derive and export `ReviewOutputs` type, add `applyReviewDecision` function; rename `_isReviewable` to `isReviewable`; inline `_findMostRecentCompletedStep` into `findMostRecentCompletedStep`
- `src/guards/validation.ts` — modified: remove frontmatter functions and types (`parseReviewFrontmatter`, `validateReviewFrontmatter`, `toReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`, `RawReviewFrontmatter`, `ReviewFrontmatter`); remove `js-yaml` import

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] `REVIEW_OUTPUT_SCHEMA` is exported from `src/capabilities/review-task.ts` and is a typebox schema (`Type.Object({...})`) with 5 fields: decision (Union of Literals), criticalIssues/highIssues/mediumIssues/lowIssues (Integer with minimum: 0)
- [ ] `ReviewOutputs` type is exported from `src/capabilities/review-task.ts` as `Static<typeof REVIEW_OUTPUT_SCHEMA>` (no manual interface)
- [ ] `applyReviewDecision(goalDir, stepNumber, outputs)` is exported from `review-task.ts`, accepts `ReviewOutputs`, and produces same file side effects as current `validation.ts` implementation (creates APPROVED/REJECTED markers, deletes COMPLETED on REJECT)
- [ ] `isStepReviewable(goalDir, stepNumber)` works correctly — no `_isReviewable` private function exists (helper renamed to `isReviewable`, unexported)
- [ ] `findMostRecentCompletedStep(goalDir)` works correctly — no `_findMostRecentCompletedStep` function exists
- [ ] `src/guards/validation.ts` no longer exports `parseReviewFrontmatter`, `validateReviewFrontmatter`, `applyReviewDecision`, or `validateReviewState`
- [ ] `src/guards/validation.ts` no longer imports `js-yaml`
- [ ] Existing tests in `src/capabilities/review-task.test.ts` pass with no regressions

## Risks and Edge Cases

- **typebox `Integer({ minimum: 0 })` constraint:** Verify that `Value.Check(REVIEW_OUTPUT_SCHEMA, { ..., criticalIssues: -1 })` returns `false`. typebox generates JSON Schema with `minimum`, and `Value.Check` enforces it. Test this in TEST.md.
- **Import of typebox types:** `import type { Static } from "typebox"` works — confirmed by test compilation. However, ensure the executor uses `import type` (not `import`) for `Static` since it's a type-only export.
- **`applyReviewDecision` must remain exported from review-task.ts:** The mark_complete tool in `validation.ts` currently calls `applyReviewDecision`. After removal from validation.ts, the mark_complete handler will be broken until Step 6 moves it to session-capability.ts. However, Steps 2–5 are intermediate states — it's OK for mark_complete to temporarily not work as long as type-checking passes. The executor should import `applyReviewDecision` from `../capabilities/review-task` in validation.ts if needed to keep the build passing. **Actually — check if removing it breaks compilation first.** If validation.ts still references `applyReviewDecision`, the import needs updating (not just removal).
- **Existing test imports:** `src/guards/validation.test.ts` imports `parseReviewFrontmatter`, `validateReviewFrontmatter`, `applyReviewDecision`, and `validateReviewState` from `./validation`. These tests will break when exports are removed. This is expected — migrated in Step 9. Only review-task.test.ts must continue to pass.
- **No `_private` pattern:** After this step, search for `function _` in review-task.ts — should return zero matches. Both private helpers (`_isReviewable`, `_findMostRecentCompletedStep`) are either renamed or inlined.
