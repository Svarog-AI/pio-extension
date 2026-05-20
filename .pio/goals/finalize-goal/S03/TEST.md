# Tests: Create finalize-goal prompt

## Unit Tests

**File:** `src/index.test.ts` (append new test cases to existing file, following Step 2's pattern)

**Test runner:** Vitest

Add a new `describe("finalize-goal.md prompt")` block with the following test cases:

- **`file exists and is non-empty`** — verify `src/prompts/finalize-goal.md` exists and content length > 0
- **`contains pio-project-knowledge skill loading instruction`** — assert prompt content matches `/pio-project-knowledge/i` (agent is instructed to load the skill)
- **`references DECISIONS.md`** — assert prompt content mentions `DECISIONS.md` (the agent reads decisions from this file)
- **`contains update rules reference`** — assert prompt mentions evaluating decisions against update rules or references update rules by name
- **`contains skip/filter instruction`** — assert prompt instructs the agent to skip decisions that don't map to any update rule (look for "skip" or filtering language)
- **`references PLAN.md`** — assert prompt content mentions `PLAN.md` (agent reads plan for overall scope)
- **`references SUMMARY.md`** — assert prompt content mentions `SUMMARY.md` (agent reads per-step summaries for ground truth)
- **`instructs multi-source synthesis`** — assert prompt instructs combining insights from multiple sources (DECISIONS.md, PLAN.md, SUMMARY.md) rather than relying on DECISIONS.md alone
- **`contains summary output instruction`** — assert prompt instructs the agent to produce a summary of changes (look for "summary" and "files modified" or similar)

## Programmatic Verification

- **What:** TypeScript compilation succeeds with no errors
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no output

- **What:** All existing tests pass (no regressions)
  - **How:** `npm test`
  - **Expected result:** All tests pass, exit code 0

- **What:** Prompt file exists at correct path
  - **How:** `test -f src/prompts/finalize-goal.md && wc -l src/prompts/finalize-goal.md`
  - **Expected result:** File exists, line count > 10 (non-trivial content)

## Manual Verification

- **What:** Prompt follows structural conventions of existing prompts (agent identity, Setup, Process steps, Guidelines)
  - **How:** Open `src/prompts/finalize-goal.md` and verify it has: agent role description, completion statement with scope boundary, Setup section, numbered process steps, Guidelines section

- **What:** Prompt does not re-encode update rules inline (single source of truth = pio-project-knowledge skill)
  - **How:** Search for PROJECT file names in the prompt — they should appear only as references to the skill, not as detailed update rule tables. The prompt should instruct the agent to load the skill rather than listing per-file update rules directly.

## Test Order

1. Programmatic: TypeScript compilation (`npx tsc --noEmit`)
2. Unit tests: new tests in `src/index.test.ts`
3. All existing tests (`npm test`) — verify no regressions
4. Manual verification of prompt structure and content
