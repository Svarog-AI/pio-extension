# Tests: Update execute-task prompt to mention DECISIONS.md

## Programmatic Verification

No test runner is configured in this project; all verification uses programmatic checks and type checking.

### 1. DECISIONS.md is mentioned in the prompt

- **What:** The execute-task prompt contains a reference to `DECISIONS.md`
- **How:** `grep -c 'DECISIONS.md' src/prompts/execute-task.md`
- **Expected result:** Output ≥ 1 (at least one mention)

### 2. Step 2+ scope is clarified

- **What:** The prompt indicates DECISIONS.md exists for Step 2+ (not Step 1)
- **How:** `grep -c -i 'step 2\+' src/prompts/execute-task.md` or `grep -c 'Step 2' src/prompts/execute-task.md`
- **Expected result:** Output ≥ 1 (the mention should clarify availability scope)

### 3. TASK.md remains primary source of truth

- **What:** The prompt clarifies that TASK.md is the primary specification, DECISIONS.md is supplementary/enrichment
- **How:** `grep -c -iE 'primary|supplementar|enrichment|optional' src/prompts/execute-task.md`
- **Expected result:** Output ≥ 1 (at least one word establishing the hierarchy)

### 4. Existing step count preserved

- **What:** The execute-task prompt still has exactly 8 numbered steps (`### Step 1` through `### Step 8`)
- **How:** `grep -c '^### Step [0-9]' src/prompts/execute-task.md`
- **Expected result:** Exactly 8 (the modification is an inline addition to Step 2, not a new step)

### 5. Existing instructions preserved — Step 1 unchanged

- **What:** Step 1 (Read GOAL.md and PLAN.md for context) is still present with its original content
- **How:** `grep -c 'Read GOAL.md' src/prompts/execute-task.md` and `grep -c 'Read PLAN.md\|read.*PLAN.md' src/prompts/execute-task.md`
- **Expected result:** Both output ≥ 1

### 6. Existing instructions preserved — Step 8 (Write completion artifacts) unchanged

- **What:** The completion artifacts section (COMPLETED, SUMMARY.md, BLOCKED) is still present
- **How:** `grep -c 'Write.*SUMMARY.md' src/prompts/execute-task.md`
- **Expected result:** Output ≥ 1

### 7. Guidelines section preserved

- **What:** The Guidelines section at the end of the prompt is intact
- **How:** `grep -c '^## Guidelines' src/prompts/execute-task.md`
- **Expected result:** Exactly 1

### 8. TypeScript type check passes

- **What:** No TypeScript compilation errors after changes
- **How:** `npm run check`
- **Expected result:** Exit code 0, no error output

## Manual Verification

### 9. Readability of the DECISIONS.md mention

- **What:** The addition reads naturally within Step 2 and doesn't feel tacked on or confusing
- **How:** Read `src/prompts/execute-task.md` Step 2 section in full. Verify the DECISIONS.md note flows logically after the TASK.md and TEST.md descriptions.

### 10. No unintended changes via diff

- **What:** Only the intended DECISIONS.md mention was added; no other text changed
- **How:** `git diff src/prompts/execute-task.md` — verify only additions related to DECISIONS.md are present

## Test Order

Execute in this order: programmatic checks 1–8 first (automated), then manual checks 9–10. All must pass for the step to be considered complete.
