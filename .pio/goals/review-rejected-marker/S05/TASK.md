# Task: Simplify write allowlist and add `prepareSession` for review-code

Two changes in `src/capabilities/review-code.ts`: simplify the write allowlist to permit only `REVIEW.md`, and add a `prepareSession` hook that deletes stale marker files on startup.

## Context

Currently, the review agent manually writes `APPROVED` (and relies on absence of it for rejection). With the new automation (Step 7), `pio_mark_complete` will create marker files automatically based on YAML frontmatter in `REVIEW.md`. The agent no longer needs — or should — write markers directly. Additionally, when a review session restarts (e.g., after a crash or manual re-run), old marker files from the previous attempt can cause state ambiguity.

Step 1 added the `prepareSession` type to `StaticCapabilityConfig`. Step 2 wired it into `session-capability.ts` so hooks run during `resources_discover`. This step applies both concepts to the `review-code` capability.

## What to Build

### 1. Simplify `resolveReviewWriteAllowlist`

Remove `APPROVED` from the write allowlist. The function should return only `[`${folder}/REVIEW.md`]`. Marker files (`APPROVED`, `REJECTED`) are now created automatically by `pio_mark_complete` (Step 7), so the agent no longer writes them manually.

**Current code:**
```typescript
return [`${folder}/${REVIEW_FILE}`, `${folder}/APPROVED`];
```

**New code:**
```typescript
return [`${folder}/${REVIEW_FILE}`];
```

### 2. Add `prepareSession` to `CAPABILITY_CONFIG`

Define a `prepareSession` callback that deletes stale marker files from the step folder on startup. This ensures each new review session starts from a clean state — old `APPROVED` or `REJECTED` markers from a previous review attempt are removed before the agent begins work.

**Behavior:**
- Compute the step folder path from `params.stepNumber` (using `stepFolderName()`)
- Delete `S{NN}/APPROVED` if it exists (use `fs.rmSync` with `{ force: true }`)
- Delete `S{NN}/REJECTED` if it exists (use `fs.rmSync` with `{ force: true }`)
- Do NOT delete `COMPLETED` — that marker is set by `execute-task` and reviewed-by-absence, not by the review session itself
- If `stepNumber` is missing from params, throw an error (consistent with existing callbacks like `resolveReviewValidation`)
- The function signature: `(workingDir: string, params?: Record<string, unknown>) => void`

Add this callback as the `prepareSession` property on `CAPABILITY_CONFIG`.

### Code Components

#### Modified `resolveReviewWriteAllowlist` function

Same function, one-line change. Remove `${folder}/APPROVED` from the returned array. Keep the existing error handling for missing `stepNumber` unchanged.

#### New `prepareReviewSession` callback (or inline in CAPABILITY_CONFIG)

A standalone function following the naming convention of existing callbacks (`resolveReviewValidation`, `resolveReviewReadOnlyFiles`, etc.). It:
1. Extracts `stepNumber` from params — throws if missing
2. Constructs paths for `APPROVED` and `REJECTED` inside the step folder
3. Calls `fs.rmSync(path, { force: true })` for each — `{ force: true }` means no error if the file doesn't exist

Follow the pattern established by other review-code callbacks: use `stepFolderName()` from `../utils`, and throw with a descriptive message if `stepNumber` is absent.

### Approach and Decisions

- **Use existing imports:** `fs` and `path` are already imported in `review-code.ts`. `stepFolderName()` is already imported from `../utils`. No new imports needed.
- **Consistent error handling:** All review-code config callbacks throw when `stepNumber` is missing. The new `prepareSession` should follow the same pattern — throw a descriptive `Error` rather than silently skip cleanup.
- **Force-delete markers:** Use `{ force: true }` with `fs.rmSync` so missing files don't cause errors. A fresh review session might have no stale markers, and that's a valid state.
- **Do not delete REVIEW.md:** Only `APPROVED` and `REJECTED` are stale markers. `REVIEW.md` from a previous attempt should be left alone — the agent will overwrite it if needed.
- **Do not delete COMPLETED:** The `COMPLETED` marker indicates the step was implemented. The review session doesn't manage its lifecycle — that's `execute-task`'s responsibility (and now also Step 7's automation for rejections).

## Dependencies

- **Step 1 (completed):** `StaticCapabilityConfig` has the optional `prepareSession` property with correct callback type (`PrepareSessionCallback`).
- **Step 2 (completed):** `session-capability.ts` invokes `config.prepareSession(workingDir, enrichedSessionParams)` during `resources_discover`.
- Steps 3, 4, 6, and 7 are independent — they don't need to be complete for this step to work.

## Files Affected

- `src/capabilities/review-code.ts` — simplify `resolveReviewWriteAllowlist` (remove `APPROVED`); add `prepareSession` to `CAPABILITY_CONFIG`

## Acceptance Criteria

- [ ] `resolveReviewWriteAllowlist` returns only `[S{NN}/REVIEW.md]` (no longer includes `APPROVED`)
- [ ] `prepareSession` is defined and assigned to `CAPABILITY_CONFIG.prepareSession`
- [ ] `prepareSession` deletes both `APPROVED` and `REJECTED` if they exist in the step folder
- [ ] `prepareSession` does NOT delete `COMPLETED`, `REVIEW.md`, or any other files
- [ ] `prepareSession` throws a descriptive error when `stepNumber` is missing from params
- [ ] `prepareSession` uses `{ force: true }` so missing marker files don't cause errors
- [ ] The callback follows the naming and error-handling convention of existing review-code callbacks
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- **File-protection interaction:** Removing `APPROVED` from the write allowlist means the agent can't write it. However, `validation.ts` permits writes inside the session's own workingDir (goal workspace). If an old prompt still instructs the agent to write `APPROVED`, the default-deny check in validation.ts would allow it anyway (it's inside the goal workspace). The explicit allowlist restriction would block it unless the workingDir exception applies. Verify this behavior — the Notes section of PLAN.md addresses this: "the default-deny rule permits writes within workingDir."
- **Race condition with concurrent sessions:** If two review sessions for the same step run simultaneously (unlikely but possible), one could delete markers the other just created. This is an edge case of manual misuse, not normal operation.
- **Stale REVIEW.md from old prompt:** After Step 6 updates the prompt, agents will write YAML frontmatter. Until then, any in-progress reviews using the old prompt won't have frontmatter — but that's a Step 7 concern, not this step's problem.
