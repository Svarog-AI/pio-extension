---
totalSteps: 2
steps:
  - name: fix-regex-and-docs
    complexity: task
  - name: update-tests
    complexity: task
---

# Plan: Fix Plan Step Heading Regex

Align `STEP_HEADING_RE` and all test data to use the documented `### Step N:` (3-hash) format.

## Prerequisites

None.

## Steps

### Step 1: Fix regex and JSDoc in create-plan.ts

**Description**

Change `STEP_HEADING_RE` from `/^## Step \d+:/gm` to `/^### Step \d+:/gm` so it matches the documented step heading format (`### Step N:`). Update the JSDoc comment above the regex to reference `"### Step 1:"` instead of `"## Step 1:"`.

**Acceptance Criteria**

- `STEP_HEADING_RE` is `/^### Step \d+:/gm`
- JSDoc comment references `"### Step 1:"` and `"### Step 12: Add schema"`
- `npx tsc --noEmit` reports no errors

**Files Affected**

- `src/capabilities/create-plan.ts` — update regex on line 18 and JSDoc on lines 14–16

### Step 2: Update test data in create-plan.test.ts

**Description**

Update all test-generated PLAN.md content to use `### Step N:` (3 hashes) instead of `## Step N:` (2 hashes). This includes the two helper functions and all inline plan content strings across every test suite.

Specifically:
- `makePlanContent()` line ~47: template string generates headings — change `##` to `###`
- `makePlanContentWithSteps()` line ~63: same template fix
- Inline plan content in "no-frontmatter" test (line ~129)
- Inline plan content in "missing-steps" test (line ~309)
- Inline plan content in "omit-complexity" test (lines ~448–449)
- Inline plan content in "invalid-complexity" test (line ~473)
- Comment on line ~282 referencing the heading format

After these changes, all existing tests should still pass — they validate behavior (match/mismatch counts), not specific heading formats. The corrected helpers will now produce headings that match the corrected regex.

**Acceptance Criteria**

- All test-generated headings use `### Step N:` format
- All inline plan content strings use `### Step N:` format
- `npx vitest run src/capabilities/create-plan.test.ts` passes with no regressions

**Files Affected**

- `src/capabilities/create-plan.test.ts` — update heading format in helpers and inline test data

## Notes

- This is a pure consistency fix: the documented format (3 hashes) has always been correct; only the regex and tests were wrong.
- No behavioral logic changes — only string literals and regex patterns are modified.
- The "zero-headings" test (line ~282) asserts zero matches when no headings exist at all; it doesn't need heading content, but its comment should reference `###` for consistency.
