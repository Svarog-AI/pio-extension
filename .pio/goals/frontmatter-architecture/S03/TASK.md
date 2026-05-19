# Task: Add `getReviewOutputs(stepNumber)` to `GoalState`

Add a typed method to `GoalState` for reading review frontmatter from `REVIEW.md`, breaking circular dependencies by extracting schemas into a dedicated module.

## Context

`GoalState` currently exposes lazy filesystem queries (`steps()`, `hasGoal()`, `hasPlan()`) but has no awareness of frontmatter content. Consumers must manually read and parse files to get structured data like review decisions. Step 1 created the shared `extractFrontmatter` parser in `src/frontmatter.ts`. Step 2 moved `REVIEW_OUTPUT_SCHEMA` and `ReviewOutputs` into `review-task.ts`. This step wires them together inside `GoalState`.

**Circular dependency risk:** `review-task.ts` imports from `goal-state.ts` (`createGoalState`, `type StepStatus`). If `goal-state.ts` imports back from `review-task.ts`, TypeScript gets a cycle. The solution is to extract schema definitions into a new leaf module.

## What to Build

### 1. Extract schemas into `src/frontmatter-schemas.ts`

Create a new pure-data module that exports capability frontmatter schemas and derived types. This is a leaf module — it imports only from external packages (`typebox`), never from the rest of the codebase.

Move the following out of `review-task.ts` and into `src/frontmatter-schemas.ts`:
- `REVIEW_OUTPUT_SCHEMA` (typebox schema definition, using `Type.Object(...)`)
- `ReviewOutputs` type (`Static<typeof REVIEW_OUTPUT_SCHEMA>`)

After the move:
- `src/frontmatter-schemas.ts` exports both as named exports
- `src/capabilities/review-task.ts` imports them from `../frontmatter-schemas` instead of defining them locally
- `src/goal-state.ts` can import them without circular dependencies

### 2. Add `getReviewOutputs(stepNumber)` to `GoalState`

Add a new method to the `GoalState` interface and factory:

```typescript
getReviewOutputs: (stepNumber: number) => ReviewOutputs | null;
```

**Behavior:**
1. Resolve the step folder path using `stepFolderName(stepNumber)` from `./fs-utils`
2. Construct the path to `<goalDir>/S{NN}/REVIEW.md`
3. Call `extractFrontmatter(reviewModelPath)` from `../frontmatter`
4. If result is `null` (file missing, no frontmatter, malformed YAML), return `null`
5. Call `validateAndCoerce(raw, REVIEW_OUTPUT_SCHEMA)` from `../frontmatter`
6. On success (`result.data`), return the typed `ReviewOutputs`
7. On validation failure (`result.error`), return `null`

**Lazy evaluation:** No internal caching. Reads fresh from disk on every call, matching the existing `GoalState` pattern.

### 3. Update imports in `review-task.ts`

Change `review-task.ts` to import `REVIEW_OUTPUT_SCHEMA` and `ReviewOutputs` from `../frontmatter-schemas` instead of defining them locally. The rest of `review-task.ts` remains unchanged — `applyReviewDecision`, `CAPABILITY_CONFIG`, validation functions, etc. all stay the same but now reference the re-exported schema.

## Code Components

### `src/frontmatter-schemas.ts` (new file)

**What it does:** Pure data definitions for capability frontmatter schemas. No behavior, no imports from project source.

**Exports:**
- `REVIEW_OUTPUT_SCHEMA` — typebox `TObject` defining review frontmatter fields
- `ReviewOutputs` — type alias derived via `Static<typeof REVIEW_OUTPUT_SCHEMA>`

### `src/goal-state.ts` (modified)

**What changes:** New imports and new method on `GoalState`.

**New imports:**
- `extractFrontmatter, validateAndCoerce` from `./frontmatter`
- `REVIEW_OUTPUT_SCHEMA, type ReviewOutputs` from `./frontmatter-schemas`

**New interface method:** Add `getReviewOutputs: (stepNumber: number) => ReviewOutputs | null;` to the `GoalState` interface.

**New factory method:** Implement inside `createGoalState`, following existing lazy-evaluation pattern (no caching).

### `src/capabilities/review-task.ts` (modified)

**What changes:** Remove local schema/type definitions, import from `../frontmatter-schemas` instead.

## Approach and Decisions

- **Schema extraction is required** to break the circular dependency. `goal-state.ts` → `review-task.ts` → `goal-state.ts` would be a direct cycle. The new `src/frontmatter-schemas.ts` is a leaf module importing only from `typebox`.
- **Follow the typebox pattern** established in Steps 1 and 2: schemas use `Type.Object(...)`, types use `Static<typeof schema>`. See `DECISIONS.md` for details.
- **Lazy evaluation:** Match existing `GoalState` methods — no caching, reads from disk on every call.
- **Error handling:** Return `null` (not throw) for missing files, malformed YAML, or validation failures. This matches how `extractFrontmatter` works and keeps the API simple.
- **Step number zero-padding:** Use `stepFolderName(stepNumber)` from `./fs-utils` (already imported). Step 5 → `S05`.

## Dependencies

- **Step 1 (completed):** `src/frontmatter.ts` must exist with `extractFrontmatter` and `validateAndCoerce`.
- **Step 2 (completed):** `REVIEW_OUTPUT_SCHEMA` is defined in `review-task.ts` and ready to be moved. The typebox-based schema approach is confirmed working.

## Files Affected

- `src/frontmatter-schemas.ts` — **created**: exports `REVIEW_OUTPUT_SCHEMA` and `ReviewOutputs` type (moved from review-task.ts)
- `src/goal-state.ts` — **modified**: add `getReviewOutputs(stepNumber)` method to interface and factory; add imports for frontmatter parser and schemas
- `src/capabilities/review-task.ts` — **modified**: import schema + type from `../frontmatter-schemas` instead of defining locally

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors (no circular dependency)
- [ ] `getReviewOutputs(stepNumber)` returns typed `ReviewOutputs` for valid REVIEW.md with frontmatter
- [ ] Returns `null` when REVIEW.md missing, has no frontmatter, or has invalid frontmatter
- [ ] Step number is correctly zero-padded in path resolution (e.g., step 5 → `S05/REVIEW.md`)
- [ ] Existing tests in `src/goal-state.test.ts` pass with no regressions

## Risks and Edge Cases

- **Circular dependency:** The primary risk. Verify with `npx tsc --noEmit` after implementing. If the cycle persists, inspect all imports carefully — the leaf module (`frontmatter-schemas.ts`) must not import from any project source file.
- **REVIEW.md without frontmatter:** A REVIEW.md might exist but have no YAML frontmatter (just markdown). `extractFrontmatter` returns `null` for this case — the method should propagate `null`.
- **Validation failures:** Invalid decision value, negative counts, or missing fields should all return `null` (not throw). Test with malformed frontmatter data.
- **Step number out of range:** If the step folder doesn't exist, `extractFrontmatter` returns `null` for a missing file — this is correct behavior (returns `null`, no error).
