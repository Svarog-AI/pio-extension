# Tests: Require YAML frontmatter in the review prompt

This step modifies a single markdown prompt file (`src/prompts/review-code.md`). Verification relies on programmatic content checks and TypeScript compilation. No new test runner code is needed — the changes are to documentation/instructions consumed by agents, not executable source code.

## Programmatic Verification

### YAML frontmatter format present in Step 7

- **What:** The updated Step 7 contains a YAML frontmatter block specification
- **How:** `grep -c '```yaml' src/prompts/review-code.md`
- **Expected result:** Output is `1` (exactly one yaml code block)

### All five required fields specified

- **What:** Frontmatter format includes all five required fields
- **How:** Each checked individually:
  - `grep -c 'decision:' src/prompts/review-code.md`
  - `grep -c 'criticalIssues:' src/prompts/review-code.md`
  - `grep -c 'highIssues:' src/prompts/review-code.md`
  - `grep -c 'mediumIssues:' src/prompts/review-code.md`
  - `grep -c 'lowIssues:' src/prompts/review-code.md`
- **Expected result:** Each returns `1` or greater (field is mentioned)

### Frontmatter placement specified (top of file, before headings)

- **What:** Instructions state frontmatter appears at the very top of REVIEW.md, before markdown headings
- **How:** `grep -ci 'top\|before.*heading\|first' src/prompts/review-code.md`
- **Expected result:** Output is `1` or greater (placement guidance present)

### Manual marker instructions removed from Step 8

- **What:** Step 8 no longer instructs the agent to manually write APPROVED files or delete COMPLETED
- **How:** Check that specific old phrases are absent:
  - `grep -c 'Write an empty file.*APPROVED' src/prompts/review-code.md`
  - `grep -c 'Delete.*COMPLETED' src/prompts/review-code.md`
  - `grep -c 'rm .*COMPLETED' src/prompts/review-code.md`
- **Expected result:** All return `0` (old manual marker instructions removed)

### Automation language present in Step 8

- **What:** Step 8 states that markers are created automatically by infrastructure/automation
- **How:** `grep -ci 'automatic\|automatically\|infrastructure.*handle' src/prompts/review-code.md`
- **Expected result:** Output is `1` or greater (automation language present)

### Agent instructed to call pio_mark_complete

- **What:** Step 8 instructs the agent to call `pio_mark_complete`
- **How:** `grep -c 'pio_mark_complete' src/prompts/review-code.md`
- **Expected result:** Output is `1` or greater (call to pio_mark_complete present)

### Agent told not to create/delete marker files manually

- **What:** Step 8 explicitly states the agent should not write or delete marker files
- **How:** `grep -ci "should.*not\|do not\|no longer\|must not" src/prompts/review-code.md` (within context of markers)
- **Expected result:** Output is `1` or greater, and manual inspection confirms it relates to marker files

### Human-readable ## Decision section preserved

- **What:** The markdown body template still includes a `## Decision` section
- **How:** `grep -c '## Decision' src/prompts/review-code.md`
- **Expected result:** Output is `1` or greater (## Decision heading present in the template)

### Steps 1–6 unchanged (no unintended modifications)

- **What:** The review process steps before Step 7 are unchanged
- **How:** Verify Step headings still exist:
  - `grep -c '### Step 1: Read GOAL.md' src/prompts/review-code.md`
  - `grep -c '### Step 2: Read TASK.md' src/prompts/review-code.md`
  - `grep -c '### Step 3: Read implementation' src/prompts/review-code.md`
  - `grep -c '### Step 4: Analyze the implementation' src/prompts/review-code.md`
  - `grep -c '### Step 5: Categorize issues' src/prompts/review-code.md`
  - `grep -c '### Step 6: Make the approval decision' src/prompts/review-code.md`
- **Expected result:** Each returns `1` (original steps preserved)

### TypeScript compilation passes

- **What:** No type errors introduced by the change
- **How:** `npm run check`
- **Expected result:** Exits with code 0, no errors

## Test Order

1. Programmatic content checks (all `grep` commands above) — verify prompt modifications are correct
2. TypeScript compilation (`npm run check`) — verify no unintended side effects
