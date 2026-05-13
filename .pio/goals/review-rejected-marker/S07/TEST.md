# Tests: Implement automatic marker creation at `pio_mark_complete`

No dedicated test runner was originally configured, but the project now uses **Vitest** (`package.json` script `"test": "vitest run"`, config at `vitest.config.ts`). Existing tests live under `__tests__/` as `*.test.ts` files. This step extends `__tests__/validation.test.ts`.

## Unit Tests

### Frontmatter parsing — `parseReviewFrontmatter`

**File:** `__tests__/validation.test.ts` (append new `describe` block)  
**Test runner:** Vitest  
**Import:** `import { parseReviewFrontmatter } from "../src/capabilities/validation"`

#### `describe("parseReviewFrontmatter")`

- **Valid APPROVED frontmatter returns correct object**
  - Arrange: Write a temp file with `---\ndecision: APPROVED\ncriticalIssues: 0\nhighIssues: 1\nmediumIssues: 2\nlowIssues: 3\n---\n# Code Review`
  - Act: Call `parseReviewFrontmatter(filePath)`
  - Assert: Returns `{ decision: "APPROVED", criticalIssues: 0, highIssues: 1, mediumIssues: 2, lowIssues: 3 }`

- **Valid REJECTED frontmatter returns correct object**
  - Arrange: Write a temp file with `---\ndecision: REJECTED\ncriticalIssues: 2\nhighIssues: 0\nmediumIssues: 1\nlowIssues: 0\n---\n# Code Review`
  - Act: Call `parseReviewFrontmatter(filePath)`
  - Assert: Returns object with `decision: "REJECTED"` and correct counts

- **Returns null when file does not start with `---`**
  - Arrange: Write a temp file starting with `# Code Review...` (no frontmatter)
  - Act: Call `parseReviewFrontmatter(filePath)`
  - Assert: Returns `null`

- **Returns null when closing `---` delimiter is missing**
  - Arrange: Write a file starting with `---\ndecision: APPROVED` but no closing `---`
  - Act: Call `parseReviewFrontmatter(filePath)`
  - Assert: Returns `null`

- **Returns null when YAML between delimiters is malformed**
  - Arrange: Write `---\ndecision: APPROVED\nbroken: [unclosed\n---\n# body`
  - Act: Call `parseReviewFrontmatter(filePath)`
  - Assert: Returns `null` (js-yaml error caught gracefully)

- **Returns null when file does not exist**
  - Arrange: Pass a non-existent path
  - Act: Call `parseReviewFrontmatter(nonExistentPath)`
  - Assert: Returns `null`

- **Extra fields in frontmatter are tolerated**
  - Arrange: Write frontmatter with required fields plus extra key `reviewer: bot`
  - Act: Call `parseReviewFrontmatter(filePath)`
  - Assert: Returns object with all five required fields correctly parsed

- **Whitespace around delimiters is handled gracefully**
  - Arrange: Write `\n---\ndecision: APPROVED\n...\n---\n# body` (leading newline before first `---`)
  - Act: Call `parseReviewFrontmatter(filePath)`
  - Assert: Returns `null` (frontmatter must be at the very start of the file)

### Decision validation — `validateReviewFrontmatter`

**File:** `__tests__/validation.test.ts`  
**Import:** `import { validateReviewFrontmatter } from "../src/capabilities/validation"`

#### `describe("validateReviewFrontmatter")`

- **Valid APPROVED with all zero counts → null (no error)**
  - Arrange: `{ decision: "APPROVED", criticalIssues: 0, highIssues: 0, mediumIssues: 0, lowIssues: 0 }`
  - Act: Call `validateReviewFrontmatter(frontmatter)`
  - Assert: Returns `null`

- **Valid REJECTED with non-zero counts → null (no error)**
  - Arrange: `{ decision: "REJECTED", criticalIssues: 2, highIssues: 1, mediumIssues: 0, lowIssues: 3 }`
  - Act: Call `validateReviewFrontmatter(frontmatter)`
  - Assert: Returns `null`

- **Decision is not APPROVED or REJECTED → returns error string**
  - Arrange: `{ decision: "PENDING", criticalIssues: 0, highIssues: 0, mediumIssues: 0, lowIssues: 0 }`
  - Act: Call `validateReviewFrontmatter(frontmatter)`
  - Assert: Returns a non-null string containing guidance about valid decision values

- **Missing required field → returns error string**
  - Arrange: `{ decision: "APPROVED", criticalIssues: 0, highIssues: 0 }` (missing `mediumIssues`, `lowIssues`)
  - Act: Call `validateReviewFrontmatter(frontmatter)`
  - Assert: Returns a non-null string mentioning the missing field name

- **Negative count → returns error string**
  - Arrange: `{ decision: "APPROVED", criticalIssues: -1, highIssues: 0, mediumIssues: 0, lowIssues: 0 }`
  - Act: Call `validateReviewFrontmatter(frontmatter)`
  - Assert: Returns a non-null string

- **Non-integer count → returns error string**
  - Arrange: `{ decision: "APPROVED", criticalIssues: 1.5, highIssues: 0, mediumIssues: 0, lowIssues: 0 }`
  - Act: Call `validateReviewFrontmatter(frontmatter)`
  - Assert: Returns a non-null string

### Marker creation — `applyReviewDecision`

**File:** `__tests__/validation.test.ts`  
**Import:** `import { applyReviewDecision } from "../src/capabilities/validation"`

#### `describe("applyReviewDecision")`

- **APPROVED creates empty APPROVED file, leaves COMPLETED intact**
  - Arrange: Create temp step dir `S01/` with `COMPLETED` (content "done"). No markers.
  - Act: Call `applyReviewDecision(stepDirParent, 1, parsedFrontmatter)` where `parsedFrontmatter.decision === "APPROVED"`
  - Assert: `S01/APPROVED` exists and is empty. `S01/COMPLETED` still exists with original content.

- **REJECTED creates empty REJECTED file, deletes COMPLETED**
  - Arrange: Create temp step dir `S01/` with `COMPLETED`. No markers.
  - Act: Call `applyReviewDecision(stepDirParent, 1, parsedFrontmatter)` where `parsedFrontmatter.decision === "REJECTED"`
  - Assert: `S01/REJECTED` exists and is empty. `S01/COMPLETED` does not exist.

- **REJECTED when COMPLETED is already absent → no crash**
  - Arrange: Create temp step dir `S01/` with no `COMPLETED`, no markers.
  - Act: Call `applyReviewDecision(...)` with REJECTED decision
  - Assert: `S01/REJECTED` exists. No exception thrown.

- **APPROVED does not create a REJECTED file**
  - Arrange: Create temp step dir `S01/` with `COMPLETED`. No markers.
  - Act: Call `applyReviewDecision(...)` with APPROVED decision
  - Assert: `S01/APPROVED` exists. `S01/REJECTED` does not exist.

- **Step number is correctly zero-padded in path**
  - Arrange: Create temp dir. Call with `stepNumber: 5`.
  - Act: Call `applyReviewDecision(dir, 5, ...)` with APPROVED decision
  - Assert: File created at `S05/APPROVED` (not `S5/`)

### State consistency — `validateReviewState`

**File:** `__tests__/validation.test.ts`  
**Import:** `import { validateReviewState } from "../src/capabilities/validation"`

#### `describe("validateReviewState")`

- **APPROVED exists, REJECTED absent → consistent for APPROVED**
  - Arrange: Create step dir with only `APPROVED`
  - Act: Call `validateReviewState(dir, 1, "APPROVED")`
  - Assert: Returns `true`

- **REJECTED exists, APPROVED absent → consistent for REJECTED**
  - Arrange: Create step dir with only `REJECTED`
  - Act: Call `validateReviewState(dir, 1, "REJECTED")`
  - Assert: Returns `true`

- **Both markers exist → inconsistent**
  - Arrange: Create step dir with both `APPROVED` and `REJECTED`
  - Act: Call `validateReviewState(dir, 1, "APPROVED")`
  - Assert: Returns `false`

- **Neither marker exists → inconsistent**
  - Arrange: Create empty step dir
  - Act: Call `validateReviewState(dir, 1, "APPROVED")`
  - Assert: Returns `false`

- **Marker mismatch — APPROVED on disk but expected REJECTED → inconsistent**
  - Arrange: Create step dir with `APPROVED` only
  - Act: Call `validateReviewState(dir, 1, "REJECTED")`
  - Assert: Returns `false`

## Integration Tests

### Full review-code automation flow

**File:** `__tests__/validation.test.ts`  
**What:** Test the complete automation sequence (parse → validate → apply → verify) as it would execute inside `pio_mark_complete`.

#### `describe("review-code markComplete automation")`

- **APPROVED: valid REVIEW.md triggers APPROVED creation, COMPLETED preserved, state consistent**
  - Arrange: Create temp goal workspace with `S01/REVIEW.md` containing valid APPROVED frontmatter + markdown body. Create `S01/COMPLETED`.
  - Act: Execute the full automation sequence (call `parseReviewFrontmatter`, then `validateReviewFrontmatter`, then `applyReviewDecision`, then `validateReviewState`)
  - Assert: Parsing succeeds. Validation passes (`null`). `S01/APPROVED` exists. `S01/COMPLETED` still exists. `validateReviewState` returns `true`.

- **REJECTED: valid REVIEW.md triggers REJECTED creation, COMPLETED deleted, state consistent**
  - Arrange: Create temp goal workspace with `S01/REVIEW.md` containing valid REJECTED frontmatter + markdown body. Create `S01/COMPLETED`.
  - Act: Execute full automation sequence
  - Assert: Parsing succeeds. Validation passes. `S01/REJECTED` exists. `S01/COMPLETED` is deleted. `validateReviewState` returns `true`.

- **Missing frontmatter in REVIEW.md → automation fails early, no markers created**
  - Arrange: Create `S01/REVIEW.md` with just markdown (no YAML block). Create `S01/COMPLETED`.
  - Act: Execute full automation sequence
  - Assert: `parseReviewFrontmatter` returns `null`. No files are created or deleted on disk.

- **Invalid decision value in frontmatter → validation fails, no markers created**
  - Arrange: Create `S01/REVIEW.md` with `decision: PENDING` in frontmatter. Create `S01/COMPLETED`.
  - Act: Execute full automation sequence
  - Assert: Parsing succeeds but `validateReviewFrontmatter` returns a non-null error string. No files are created or deleted on disk.

- **Non-review-code path is unaffected (no extra processing)**
  - Arrange: The review-code automation block only runs when `capability === "review-code"`. Verify the new code checks this condition.
  - Act: Read `src/capabilities/validation.ts` and verify the automation block is gated on the capability name.
  - Assert: The source file contains a conditional that checks for `"review-code"` before invoking frontmatter parsing logic.

## Programmatic Verification

- **What:** `js-yaml` dependency is present in `package.json`
  - **How:** `grep '"js-yaml"' package.json`
  - **Expected result:** Match found (the key `"js-yaml"` appears under dependencies)

- **What:** `validation.ts` imports `js-yaml`
  - **How:** `grep 'js-yaml\|jsyaml' src/capabilities/validation.ts`
  - **Expected result:** Import statement present

- **What:** All four new functions are exported from `validation.ts`
  - **How:** `grep -c 'export function parseReviewFrontmatter\|export function validateReviewFrontmatter\|export function applyReviewDecision\|export function validateReviewState' src/capabilities/validation.ts`
  - **Expected result:** `4`

- **What:** The `pio_mark_complete` execute handler calls the new automation functions for review-code sessions
  - **How:** `grep 'parseReviewFrontmatter\|applyReviewDecision\|validateReviewState' src/capabilities/validation.ts` (should find both export declarations and call sites)
  - **Expected result:** More than 4 matches (exports + usage within execute handler)

- **What:** TypeScript compilation passes
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no errors

## Test Order

1. **Unit tests** — `parseReviewFrontmatter` (pure string/FS parsing)
2. **Unit tests** — `validateReviewFrontmatter` (pure validation logic)
3. **Unit tests** — `applyReviewDecision` (FS mutations with temp dirs)
4. **Unit tests** — `validateReviewState` (FS reads with temp dirs)
5. **Integration tests** — Full automation flow (sequences all four functions together)
6. **Programmatic verification** — `npm run check`, dependency and source checks
