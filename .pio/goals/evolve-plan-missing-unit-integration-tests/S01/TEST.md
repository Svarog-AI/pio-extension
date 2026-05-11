# Tests: Revise evolve-plan.md to add Unit Tests and Integration Tests to TEST.md template

## Programmatic Verification

1. **TypeScript compilation passes**
   - **What:** No TypeScript errors after modifying the prompt file (markdown-only change should not affect types)
   - **How:** `npm run check`
   - **Expected result:** Exit code 0, no error output

2. **Preamble contains test infrastructure check instruction**
   - **What:** The preamble instructs the Specification Writer to check for test runner/test conventions before writing TEST.md
   - **How:** `grep -i 'test runner\|test infrastructure\|test convention\|jest\|vitest' src/prompts/evolve-plan.md` (should match near the top of the file, in the preamble area)
   - **Expected result:** At least one match in the preamble region (before "## Process")

3. **Preamble contains test file prescription instruction**
   - **What:** The preamble instructs prescribing actual `.test.ts`/`.spec.ts` files when possible
   - **How:** `grep -i '\.test\.ts\|\.spec\.ts' src/prompts/evolve-plan.md` (should appear in preamble, not just inside the Step 6 template)
   - **Expected result:** Match found in preamble area

4. **Preamble contains fallback instruction**
   - **What:** The preamble instructs falling back to programmatic verification when no test runner exists
   - **How:** `grep -i 'fall.*back\|no test\|without test' src/prompts/evolve-plan.md` (should appear in preamble)
   - **Expected result:** At least one match in the preamble region

5. **Preamble contains omit-empty-sections instruction**
   - **What:** The preamble instructs omitting empty sections rather than leaving blank headings
   - **How:** `grep -i 'omit.*empty\|skip.*section\|blank.*head\|empty.*section' src/prompts/evolve-plan.md` (should appear in preamble)
   - **Expected result:** At least one match in the preamble region

6. **Step 6 template contains Unit Tests section**
   - **What:** The TEST.md template inside Step 6's code block includes a "Unit Tests" heading
   - **How:** `awk '/### Step 6/,/### Step 7/' src/prompts/evolve-plan.md | grep -i 'unit test'`
   - **Expected result:** Match found — "Unit Tests" heading present in the template

7. **Step 6 template contains Integration Tests section**
   - **What:** The TEST.md template inside Step 6's code block includes an "Integration Tests" heading
   - **How:** `awk '/### Step 6/,/### Step 7/' src/prompts/evolve-plan.md | grep -i 'integration test'`
   - **Expected result:** Match found — "Integration Tests" heading present in the template

8. **Step 6 template retains Programmatic Verification section**
   - **What:** The existing "Programmatic Verification" section is still present
   - **How:** `awk '/### Step 6/,/### Step 7/' src/prompts/evolve-plan.md | grep 'Programmatic Verification'`
   - **Expected result:** Match found

9. **Step 6 template retains Manual Verification section**
   - **What:** The existing "Manual Verification (if any)" section is still present
   - **How:** `awk '/### Step 6/,/### Step 7/' src/prompts/evolve-plan.md | grep 'Manual Verification'`
   - **Expected result:** Match found

10. **Sections appear in correct order: Unit Tests → Integration Tests → Programmatic Verification → Manual Verification**
    - **What:** The four verification sections appear in the specified sequence within Step 6's template
    - **How:** `awk '/### Step 6/,/### Step 7/' src/prompts/evolve-plan.md | grep -n 'Unit Tests\|Integration Tests\|Programmatic Verification\|Manual Verification'` — verify line numbers are monotonically increasing in the correct order
    - **Expected result:** Line numbers show: Unit Tests < Integration Tests < Programmatic Verification < Manual Verification

11. **Test Order section exists and specifies correct ordering**
    - **What:** A "Test Order" section appears after all four verification categories, specifying unit → integration → programmatic → manual
    - **How:** `awk '/### Step 6/,/### Step 7/' src/prompts/evolve-plan.md | grep -n 'Test Order'` — verify it appears after Manual Verification; then check its content mentions the ordering
    - **Expected result:** "Test Order" heading found after all four sections; content references unit, integration, programmatic, manual ordering

12. **Only evolve-plan.md was modified**
    - **What:** No other files in the repository were changed
    - **How:** `git diff --name-only` (or `git status --porcelain`)
    - **Expected result:** Only `src/prompts/evolve-plan.md` appears in the list of changed files

## Manual Verification (if any)

1. **Preamble readability and flow**
   - **What:** The new preamble paragraph reads naturally and doesn't conflict with existing instructions
   - **How:** Read the file from the top through "## Process" — verify the new text flows logically and reinforces rather than contradicts existing guidance

2. **Step 6 template completeness**
   - **What:** The revised TEST.md template is complete and self-contained as a usable specification for future evolve-plan sessions
   - **How:** Read Step 6's code block from top to bottom — verify all section descriptions have meaningful content (not just placeholder headings)

## Test Order

1. Run `npm run check` first (test #1) — ensures no structural TypeScript issues
2. Run content verification checks (tests #2–#11) — grep/awk commands to validate specific content is present and in correct order
3. Verify file isolation (test #12) — confirm only the target file was modified
4. Perform manual review (manual tests) — read through for flow and completeness
