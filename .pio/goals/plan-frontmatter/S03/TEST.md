# Tests: Update create-plan prompt to instruct frontmatter writing

## Unit Tests

- **File:** `src/capabilities/create-plan.test.ts` (new file, colocated alongside `create-plan.ts` per project convention)
- **Test runner:** Vitest (Node.js environment, global `describe/it/expect`)

### Test cases

`describe("prompts/create-plan.md")`:

- `it("instructs to include YAML frontmatter at the top of PLAN.md")` — read prompt file, assert content contains instructions mentioning YAML frontmatter with `totalSteps` appearing before the document title. Verify a substring like `"totalSteps"` appears alongside frontmatter delimiters (`---`) in instructional text (not just in an example code block).

- `it("shows frontmatter block in example PLAN.md structure")` — read prompt file, assert the markdown template example contains a frontmatter block (`---\ntotalSteps:` pattern) that appears before `# Plan:` in the code fence.

- `it("states totalSteps must equal number of steps")` — read prompt file, assert instructions contain language specifying `totalSteps` must match/equal the count of steps being created (regex check for phrases like "must equal", "equal the count", or similar).

- `it("does not modify Step 1–4 headings")` — read prompt file, verify that Steps 1 through 4 retain their original titles (e.g., `### Step 1: Read GOAL.md`, `### Step 2: Deep research`, etc.). This prevents accidental restructuring.

- `it("does not modify the Guidelines section heading")` — read prompt file, assert `## Guidelines` section still exists unchanged.

Follow the pattern established in `create-goal.test.ts`:
- Read the prompt file with `fs.readFileSync()` relative to `__dirname`
- Use string matching (`expect(content).toMatch()`, `expect(content).not.toMatch()`) rather than complex parsing
- Helper functions to extract sections are optional but follow the existing precedent

## Programmatic Verification

- **What:** TypeScript type checking passes (no regressions from prompt change)
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no errors

- **What:** Full test suite passes with no regressions
  - **How:** `npm test`
  - **Expected result:** All existing tests pass, plus new prompt verification tests pass

- **What:** Prompt file contains frontmatter instructions
  - **How:** `grep -c "totalSteps" src/prompts/create-plan.md`
  - **Expected result:** Count ≥ 1 (at least one mention of totalSteps)

- **What:** Prompt file contains frontmatter delimiter example
  - **How:** `grep -c "^---$" src/prompts/create-plan.md`
  - **Expected result:** Count ≥ 2 (opening and closing delimiters in the example, plus any YAML list separators are harmless)

## Test Order

1. Unit tests (`npm test`) — verify prompt content
2. Programmatic verification (`npm run check`) — TypeScript compilation
3. Manual review of `src/prompts/create-plan.md` to confirm instructions are clear and examples are correct
