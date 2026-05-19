# Tests: Wire `postValidate` and `postExecute` through `capability-config.ts`

## Unit Tests

### GoalState.getReviewOutputs — errors overload

**File:** `src/goal-state.test.ts` (add new describe block)
**Test runner:** Vitest

#### Test cases

- `describe("getReviewOutputs with { errors: true }")`:
  - **Returns `{ data }` for valid APPROVED frontmatter:** Given a temp goal dir with `S01/REVIEW.md` containing valid APPROVED frontmatter, calling with `{ errors: true }` returns `{ data: { decision: "APPROVED", ... } }`.
    - *Arrange:* Create temp dir with `S01/REVIEW.md` containing `---\ndecision: APPROVED\ncriticalIssues: 0\nhighIssues: 0\nmediumIssues: 0\nlowIssues: 0\n---\n# Review`
    - *Act:* `state.getReviewOutputs(1, { errors: true })`
    - *Assert:* Result has `data.decision === "APPROVED"`; no `error` property
  - **Returns `{ error }` for missing file:** Given no REVIEW.md, returns `{ error: "..." }`.
    - *Arrange:* Temp dir with empty `S02/` folder (no REVIEW.md)
    - *Act:* `state.getReviewOutputs(2, { errors: true })`
    - *Assert:* Result has `error` string; no `data` property
  - **Returns `{ error }` for no frontmatter delimiters:** Given a file without `---` markers, returns `{ error: "..." }`.
    - *Arrange:* Write `S03/REVIEW.md` as plain text with no YAML frontmatter
    - *Act:* `state.getReviewOutputs(3, { errors: true })`
    - *Assert:* Result has `error` string; no `data` property
  - **Returns `{ error }` with typebox details for invalid decision:** Given `decision: UNKNOWN`, the error mentions the "decision" field.
    - *Arrange:* Write REVIEW.md with valid YAML but `decision: UNKNOWN` and valid counts
    - *Act:* `state.getReviewOutputs(4, { errors: true })`
    - *Assert:* Result has `error` string; `error` contains "decision"; no `data` property
  - **Returns `{ error }` for negative count:** Given `criticalIssues: -1`, the error mentions the "criticalIssues" field.
    - *Arrange:* Write REVIEW.md with `criticalIssues: -1`
    - *Act:* `state.getReviewOutputs(5, { errors: true })`
    - *Assert:* Result has `error` string; `error` contains "criticalIssues"; no `data` property

- `describe("getReviewOutputs backward compatibility (no options)")`:
  - **Still returns null for missing file:** Default call without options returns `null` (not an error object).
    - *Arrange:* Temp dir with no REVIEW.md
    - *Act:* `state.getReviewOutputs(1)`
    - *Assert:* Result is `null`
  - **Still returns data for valid frontmatter:** Default call returns the typed object directly.
    - *Arrange:* Valid APPROVED REVIEW.md
    - *Act:* `state.getReviewOutputs(1)`
    - *Assert:* Result has `decision: "APPROVED"` (not wrapped in `{ data }`)

- `describe("suppress console.warn in errors mode")`:
  - **No console.warn when errors=true and file is missing:** The old behavior logs a warning to stderr. With `{ errors: true }`, the caller gets the error — no warning needed.
    - *Arrange:* Spy on `console.warn`; temp dir with no REVIEW.md
    - *Act:* `state.getReviewOutputs(1, { errors: true })`
    - *Assert:* `console.warn` was not called

### resolveCapabilityConfig — postValidate and postExecute passthrough

**File:** `src/capability-config.test.ts` (add new describe blocks)
**Test runner:** Vitest

#### Test cases

- `describe("resolveCapabilityConfig — postValidate/postExecute passthrough")`:
  - **review-task postValidate is defined:** Given `capability: "review-task"` with a valid stepNumber, `resolveCapabilityConfig` returns a config where `postValidate` is a function.
    - *Arrange:* params `{ capability: "review-task", goalName: "my-feature", stepNumber: 1 }`
    - *Act:* call `resolveCapabilityConfig("/tmp/proj", params)`
    - *Assert:* `result.postValidate` is defined, is a function
  - **Non-review capabilities have undefined postValidate:** Given `capability: "create-goal"`, `create-plan`, `execute-task`, the resolved config has `postValidate: undefined`.
    - *Arrange:* loop over capabilities without postValidate
    - *Act:* resolve each capability
    - *Assert:* `result.postValidate` is `undefined`
  - **postExecute is undefined for all capabilities (none define it yet):** Resolving any capability returns `postExecute: undefined`.
    - *Arrange:* resolve review-task and a few others
    - *Assert:* `result.postExecute` is `undefined` for all

### review-task postValidate — functional behavior

**File:** `src/capabilities/review-task.test.ts` (add new describe blocks)
**Test runner:** Vitest

These tests verify the actual postValidate logic by calling it directly via `CAPABILITY_CONFIG.postValidate`.

#### Test cases

- `describe("review-task postValidate — valid frontmatter")`:
  - **Valid APPROVED creates marker and returns success:** Given a temp goal directory with `S01/REVIEW.md` containing valid APPROVED frontmatter, `postValidate` returns `{ success: true }` and creates `S01/APPROVED`.
    - *Arrange:* Create temp dir with structure matching a real goal workspace, with `S01/REVIEW.md` containing valid YAML frontmatter (`decision: APPROVED`, all counts = 0)
    - *Act:* Call `CAPABILITY_CONFIG.postValidate(goalDir, { stepNumber: 1 })`
    - *Assert:* Returns `{ success: true }`; `S01/APPROVED` file exists; no `S01/REJECTED`
  - **Valid REJECTED creates marker and deletes COMPLETED:** Given valid REJECTED frontmatter and a pre-existing `S02/COMPLETED`, `postValidate` returns `{ success: true }`, creates `S02/REJECTED`, and removes `S02/COMPLETED`.
    - *Arrange:* Create temp dir with `S02/REVIEW.md` (decision: REJECTED, counts = 0) and `S02/COMPLETED`
    - *Act:* Call `CAPABILITY_CONFIG.postValidate(goalDir, { stepNumber: 2 })`
    - *Assert:* Returns `{ success: true }`; `S02/REJECTED` exists; `S02/COMPLETED` does not exist

- `describe("review-task postValidate — missing or invalid frontmatter")`:
  - **Missing REVIEW.md returns failure with error message:** Given no `S03/REVIEW.md`, `postValidate` returns `{ success: false, message }`.
    - *Arrange:* Temp dir with no REVIEW.md in step folder
    - *Act:* Call `CAPABILITY_CONFIG.postValidate(goalDir, { stepNumber: 3 })`
    - *Assert:* `success` is `false`; `message` is a non-empty string
  - **REVIEW.md with no frontmatter delimiters returns failure:** Given a file without `---` markers, `postValidate` returns `{ success: false }`.
    - *Arrange:* Write REVIEW.md as plain text without YAML frontmatter
    - *Act:* Call postValidate
    - *Assert:* `success` is `false`; `message` is defined
  - **Invalid decision value returns failure with detailed error:** Given `decision: UNKNOWN`, the error message mentions "decision".
    - *Arrange:* Write REVIEW.md with `decision: UNKNOWN` and valid counts
    - *Act:* Call postValidate
    - *Assert:* `success` is `false`; `message` contains "decision"
  - **Negative issue count returns failure with detailed error:** Given `criticalIssues: -1`, the error mentions "criticalIssues".
    - *Arrange:* Write REVIEW.md with `criticalIssues: -1`
    - *Act:* Call postValidate
    - *Assert:* `success` is `false`; `message` contains "criticalIssues"

- `describe("review-task postValidate — missing stepNumber")`:
  - **Throws when stepNumber is missing:** Following the existing review-task callback convention, all callbacks throw if stepNumber is not a number.
    - *Arrange:* Call with empty params `{}`
    - *Act:* `CAPABILITY_CONFIG.postValidate(goalDir, {})`
    - *Assert:* Throws an error mentioning "stepNumber"

## Programmatic Verification

- **TypeScript compilation:** `npx tsc --noEmit` reports zero errors. Confirms function overloads on `getReviewOutputs`, new passthrough fields, and postValidate callback are correctly typed.
- **No circular dependencies:** Import chain: `capability-config.ts → review-task.ts → goal-state.ts → frontmatter-schemas.ts`. The schemas module is a leaf (imports only from typebox). Verify with successful compilation.
- **Existing test suite passes:** `npx vitest run` passes all 360+ existing tests with no regressions.

## Test Order

1. Type compilation (`npx tsc --noEmit`) — ensures overloads and passthrough types are correct
2. Unit tests: GoalState.getReviewOutputs overload (isolated filesystem operations via `fs.mkdtempSync()`)
3. Unit tests: resolveCapabilityConfig passthrough (module-level, no filesystem)
4. Unit tests: review-task postValidate functional tests (use temp dirs)
5. Full test suite (`npx vitest run`) — regression check
