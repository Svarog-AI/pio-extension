# Tests: Update create-goal prompt to remove "ask for workspace name" instructions

## Unit Tests

### Prompt content verification tests

**File:** `src/capabilities/create-goal.test.ts` (add new `describe` block)  
**Test runner:** Vitest  

Add a new test suite that reads `src/prompts/create-goal.md` as text and verifies it does not contain forbidden instructions:

**`describe('prompts/create-goal.md')`:**
- **"does not instruct to always confirm the goal name"** — Read the prompt file content; assert it does NOT match `/always.confirm/i` (case-insensitive). This directly tests the main acceptance criterion.
- **"does not instruct to ask about workspace name"** — Assert the prompt does NOT contain phrases like `"ask.*workspace.*name"`, `"confirm.*workspace"`, or `"confirm.*goal.*name"` (case-insensitive regex checks). These catch variations of the removed instruction.
- **"Setup section states goal name is provided"** — Find the Setup section text (between `## Setup` and the next `##`) and assert it contains language indicating the goal name comes from the session, e.g., matches `/goal\s*name.*provided/i` or `/provided.*session/i`.
- **"Setup section instructs not to ask for goal name"** — Assert the Setup section contains a negative instruction like "do not ask" about the goal/workspace name. Match something like `/do\s+not.*ask.*goal|do\s+not.*ask.*workspace/i`.
- **"Step 1 still asks about purpose, scope, requirements"** — Find Step 1 text (between `### Step 1` and the next `###`) and assert it still references understanding the goal's purpose or problem domain. Match `/problem|opportunity|purpose|requirement/i`.

Use `fs.readFileSync()` with the resolved absolute path (`path.join(__dirname, '..', 'prompts', 'create-goal.md')`) to read the file. The `__dirname` here refers to the capabilities directory since the test file is colocated at `src/capabilities/create-goal.test.ts`.

### Preserving existing tests

All existing test suites in `create-goal.test.ts` must continue to pass unchanged:
- 5 `CAPABILITY_CONFIG.defaultInitialMessage` tests (from Step 1)
- 2 `prepareGoal` tests
- 3 `goalExists` tests
- 2 `resolveGoalDir` tests

## Programmatic Verification

- **TypeScript type check**
  - **What:** No new TypeScript type errors introduced
  - **How:** `npm run check` (runs `tsc --noEmit`)
  - **Expected result:** Exits with code 0, no error output

- **Full test suite passes**
  - **What:** All existing tests + new prompt verification tests pass
  - **How:** `npm test` (runs `vitest run`)
  - **Expected result:** All tests pass, exit code 0

- **Prompt file does not contain "always confirm"**
  - **What:** Direct text check on the modified file
  - **How:** `grep -ic "always.confirm" src/prompts/create-goal.md`
  - **Expected result:** Exit code 1 (no match) or output `0`

- **Prompt file still contains Setup section**
  - **What:** Structural integrity — Setup heading still exists
  - **How:** `grep -c "^## Setup" src/prompts/create-goal.md`
  - **Expected result:** Output `1` (exactly one Setup heading)

- **Prompt file still contains Step 1 through Step 5**
  - **What:** Process steps are intact
  - **How:** `grep -c "^### Step [1-5]:" src/prompts/create-goal.md`
  - **Expected result:** Output `5` (all five step headings present)

- **Prompt file still contains GOAL.md template**
  - **What:** Step 4 template is unchanged
  - **How:** `grep -c "## Current State" src/prompts/create-goal.md && grep -c "## To-Be State" src/prompts/create-goal.md`
  - **Expected result:** Both outputs are `1`

## Test Order

1. Unit tests — prompt content verification (Vitest, colocated in `create-goal.test.ts`)
2. Full test suite — `npm test` (ensures nothing else broke)
3. Programmatic verification — type check, grep checks on prompt file
