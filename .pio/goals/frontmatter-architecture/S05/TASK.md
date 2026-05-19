# Task: Wire `postValidate` and `postExecute` through `capability-config.ts`

Update `resolveCapabilityConfig` to pass through both lifecycle callbacks, add an errors-capable overload to `GoalState.getReviewOutputs()`, and implement the review-task `CAPABILITY_CONFIG.postValidate` using `GoalState` (not raw frontmatter calls).

## Context

Steps 1–3 created the shared frontmatter parsing infrastructure (`src/frontmatter.ts`, `src/frontmatter-schemas.ts`) and added `getReviewOutputs()` to `GoalState`. Step 4 added `postValidate`/`postExecute` callback types. However, `resolveCapabilityConfig` doesn't pass these callbacks through yet, and `getReviewOutputs()` returns only `T | null` — no error details.

This step connects the wiring so that when `session-capability.ts` later orchestrates the exit lifecycle (Step 6), it can invoke capability-specific post-validation logic through the resolved `CapabilityConfig`. The review-task `postValidate` uses `GoalState.getReviewOutputs()` to avoid duplicating parsing logic.

## What to Build

### 1. Add overload to `GoalState.getReviewOutputs()` in `src/goal-state.ts`

The existing method returns `ReviewOutputs | null`:

```typescript
getReviewOutputs: (stepNumber: number) => ReviewOutputs | null;
```

Add an optional parameter that controls error reporting. Signature with overloads:

```typescript
// Default — backward compatible, returns typed data or null
getReviewOutputs(stepNumber: number): ReviewOutputs | null;

// With errors flag — returns detailed result object
getReviewOutputs(stepNumber: number, options: { errors: true }): { data?: ReviewOutputs; error?: string };
```

Implementation: the internal logic already calls `validateAndCoerce()`, which returns `{ data }` on success or `{ error }` on failure. When `options?.errors` is `true`:
- On success: return `{ data: result.data }`
- On extraction failure (`extractFrontmatter` returned `null`): return `{ error: "could not extract frontmatter from REVIEW.md" }` — a generic message since we don't know if the file was missing, had no delimiters, or had malformed YAML
- On validation failure: return `{ error: result.error }` — the detailed typebox error string

When `options?.errors` is falsy (default), behavior is unchanged — return `data` or `null`.

**Important:** This does not add a new method — it modifies the existing one to handle an optional second parameter. TypeScript function overloads allow both call signatures to coexist safely. The implementation handles both cases in a single function body.

### 2. Update `resolveCapabilityConfig` in `src/capability-config.ts`

Following the existing pattern for `prepareSession`, add passthrough for both `postValidate` and `postExecute`:

```typescript
const postValidate = config.postValidate;
const postExecute = config.postExecute;
```

Include both in the returned `CapabilityConfig` object. These are already functions (or undefined) on `StaticCapabilityConfig` — no callback invocation needed at resolution time, just direct passthrough like `prepareSession`.

### 3. Add `postValidate` to review-task `CAPABILITY_CONFIG`

In `src/capabilities/review-task.ts`, add a `postValidate` callback to `CAPABILITY_CONFIG`. This function:

1. **Resolve step number from params:** Extract `stepNumber` from the `params` argument (same pattern used by `resolveReviewValidation`, `prepareReviewSession`, etc.). Throw if missing — review-task always needs a step number.
2. **Call `GoalState.getReviewOutputs(stepNumber, { errors: true })`:** Creates state internally (`createGoalState(goalDir)`), reads and validates frontmatter through the single parsing path. Returns `{ data?: ReviewOutputs; error?: string }`.
3. **On failure:** Return `{ success: false, message: result.error }` — propagate the detailed error from GoalState (e.g., `"Field 'decision': value must be one of ['APPROVED', 'REJECTED']"`).
4. **On success:** Call `applyReviewDecision(goalDir, stepNumber, result.data!)` to create APPROVED/REJECTED markers. Return `{ success: true }`.

The function signature matches `PostValidateCallback`: `(goalDir: string, params?: Record<string, unknown>) => { success: boolean; message?: string }`.

### Code Components

#### Updated `resolveCapabilityConfig` return value (capability-config.ts)

Add two fields to the returned object. No behavioral change for capabilities that don't define these hooks — they remain `undefined`:

```
postValidate,  // PostValidateCallback | undefined
postExecute,   // PostExecuteCallback | undefined
```

#### Updated `GoalState.getReviewOutputs` implementation (goal-state.ts)

The existing body already calls `extractFrontmatter` → `validateAndCoerce`. Modify it to:
- Accept optional second param `{ errors?: boolean }`
- On `extractFrontmatter` returning `null`: when `errors`, return `{ error: "..." }` instead of `null`; also suppress the `console.warn` in this path (the caller gets the error)
- On validation failure: when `errors`, return `{ error: result.error }` instead of `null`
- On success: return data normally for backward compat, or `{ data }` when errors mode

Update the `GoalState` interface with both overload signatures.

#### Review-task `postValidate` function (review-task.ts)

A module-level function implementing the postValidate logic. Not exported — only referenced in `CAPABILITY_CONFIG`. Uses:
- `createGoalState` from `../goal-state` (to get the state, then call `getReviewOutputs`)
- `applyReviewDecision` (already defined in this module)

**No imports from `frontmatter.ts` or `frontmatter-schemas.ts` needed.** The single parsing path lives in `GoalState`, and `postValidate` delegates to it.

### Approach and Decisions

- **Single parsing path through GoalState:** Per a design discussion, all frontmatter parsing for review-task flows through `GoalState.getReviewOutputs()`. This eliminates the duplicated code path where `postValidate` would call `extractFrontmatter` + `validateAndCoerce` directly. See DECISIONS.md for details.
- **Follow existing callback pattern:** `postValidate` is added to `CAPABILITY_CONFIG` exactly like `prepareSession`, `validation`, `readOnlyFiles`.
- **Pass-through resolution:** Both `postValidate` and `postExecute` are functions that pass through directly from `StaticCapabilityConfig` to `CapabilityConfig`. No invocation at resolution time.
- **Marker creation in `postValidate`, not `postExecute`:** Frontmatter must be valid before creating markers. If validation fails, neither markers nor transitions happen — no stale state cleanup needed. Also, `resolveTransition` reads markers from disk (via `GoalState.step.status()`), so they must exist before transition routing runs.
- **Review-task does not define `postExecute`:** The hook is wired but unassigned. Available for future capabilities that need post-exit behavior beyond marker creation and generic cleanup.

## Dependencies

- **Step 1 (frontmatter module):** Provides `extractFrontmatter` and `validateAndCoerce` (used internally by `getReviewOutputs`)
- **Step 2 (review-task types/schema):** Provides `REVIEW_OUTPUT_SCHEMA`, `ReviewOutputs`, `applyReviewDecision`
- **Step 3 (GoalState.getReviewOutputs):** Provides the method that this step extends with the errors overload
- **Step 4 (lifecycle hook types):** Provides `PostValidateCallback`, `PostExecuteCallback` types in `types.ts`

## Files Affected

- `src/goal-state.ts` — modified: add `{ errors: true }` overload to `getReviewOutputs()` for detailed error reporting
- `src/capability-config.ts` — modified: pass through both `postValidate` and `postExecute` in resolved `CapabilityConfig`
- `src/capabilities/review-task.ts` — modified: add `postValidate` to `CAPABILITY_CONFIG` (uses `GoalState.getReviewOutputs({ errors: true })` + `applyReviewDecision`)

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] `resolveCapabilityConfig` includes both `postValidate` and `postExecute` in the returned `CapabilityConfig` when defined on `CAPABILITY_CONFIG`
- [ ] `review-task.ts` exports `CAPABILITY_CONFIG.postValidate` that validates review frontmatter using `GoalState.getReviewOutputs()` with errors option
- [ ] `postValidate` returns `{ success: false, message }` for missing/invalid frontmatter (with detailed error)
- [ ] `postValidate` returns `{ success: true }` and creates markers (APPROVED/REJECTED) for valid frontmatter
- [ ] `GoalState.getReviewOutputs(stepNumber)` still returns `T | null` (backward compatible)
- [ ] `GoalState.getReviewOutputs(stepNumber, { errors: true })` returns `{ data, error }` object with detailed error on failure
- [ ] Existing test suite passes with no regressions (`npx vitest run`)

## Risks and Edge Cases

- **TypeScript overload resolution:** Ensure both call signatures work correctly. The default (no options) must continue returning `T | null`. Callers using the old signature should not need changes.
- **Step number missing:** If `params.stepNumber` is not a number, the postValidate should throw (following existing review-task callback convention).
- **REVIEW.md exists but has no frontmatter:** `extractFrontmatter` returns `null`. With errors mode, return `{ error: "..." }` — generic message since we don't distinguish between missing file, no delimiters, and malformed YAML.
- **REVIEW.md has valid YAML but wrong fields:** `validateAndCoerce` returns `{ error: "..." }`. Propagate this detailed typebox error through the errors mode result.
- **Import chain:** `review-task.ts → goal-state.ts → frontmatter.ts` and `goal-state.ts → frontmatter-schemas.ts`. No circular dependency — `frontmatter.ts` and `frontmatter-schemas.ts` are leaf modules.
