# Fix Plan Step Heading Regex

Align the step heading regex in `postValidateCreatePlan` with the documented `### Step N:` format (3 hashes). The validation currently uses `## Step N:` (2 hashes), causing `pio_mark_complete` to always fail for correctly formatted PLAN.md files produced by planner sessions.

## Current State

The `postValidateCreatePlan` function in `src/capabilities/create-plan.ts` validates PLAN.md by counting step headings using the regex `/^## Step \d+:/gm` (line 18). This matches headings with **2 hashes** (`##`).

However, the canonical step heading format is documented as **3 hashes** (`###`) in `src/skills/pio-planning/SKILL.md` under "Step Heading Format": `### Step N: <Descriptive Title>`. All real PLAN.md files (e.g., `implement-subgoals/PLAN.md`, `frontmatter-architecture/PLAN.md`) follow the 3-hash format as documented.

Because of this mismatch, `pio_mark_complete` for the create-plan capability reports `"totalSteps is X but found 0 step heading(s)"` for every correctly written PLAN.md — effectively breaking validation for all planner sessions.

The unit tests in `src/capabilities/create-plan.test.ts` pass because the helper functions `makePlanContent()` (line ~53) and `makePlanContentWithSteps()` (line ~63) generate test PLAN.md content with `## Step N:` headings — matching the wrong regex instead of the documented format. The tests are validating against incorrect data.

## To-Be State

1. **`src/capabilities/create-plan.ts`** — Change `STEP_HEADING_RE` from `/^## Step \d+:/gm` to `/^### Step \d+:/gm`. Update the JSDoc comment referencing `"## Step 1:"` to reference `"### Step 1:"` instead.

2. **`src/capabilities/create-plan.test.ts`** — Update `makePlanContent()` and `makePlanContentWithSteps()` to generate `### Step N:` headings (3 hashes). Update all inline plan content strings in test cases that currently use `## Step N:` to use `### Step N:` instead.

After these changes, `postValidateCreatePlan` will correctly validate PLAN.md files that follow the documented format from `src/skills/pio-planning/SKILL.md`, and `pio_mark_complete` will succeed for properly written plans. All existing tests should still pass since they will be aligned with the corrected regex.
