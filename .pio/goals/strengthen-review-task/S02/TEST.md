# Tests: Strengthen review prompt with new severity classification rules

This step modifies a single markdown prompt file (`src/prompts/review-task.md`). No TypeScript code is created or changed. Verification relies entirely on programmatic text searches and type-checking health checks.

## Programmatic Verification

### Prompt file exists

- **What:** The renamed prompt file from Step 1 exists
- **How:** `test -f src/prompts/review-task.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### Old filename removed

- **What:** The old `review-code.md` no longer exists (Step 1 cleanup)
- **How:** `test ! -f src/prompts/review-code.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### Medium issues require ask_user

- **What:** Prompt states medium issues require mandatory user confirmation via `ask_user`
- **How:** `grep -n "ask_user" src/prompts/review-task.md | grep -i "medium"` (or read file and verify "ask_user" appears in the context of medium-severity issue handling)
- **Expected result:** At least one match line containing both "ask_user" and a reference to medium issues

### Test quality classified as CRITICAL

- **What:** Prompt classifies test-related deviations as CRITICAL severity
- **How:** `grep -n -i "test" src/prompts/review-task.md | grep -i "critical"` (or verify the CRITICAL section mentions test deviations, meaningless tests, absent tests)
- **Expected result:** At least one match referencing both test quality and CRITICAL level

### Code smells classified as HIGH

- **What:** Prompt classifies code smells / unnecessary complexity as HIGH severity
- **How:** `grep -n -iE "(over-engineer|unnecessary abstraction|dead code|complexity)" src/prompts/review-task.md | grep -i "high"` (or verify HIGH section mentions these patterns)
- **Expected result:** At least one match linking code smells/complexity to HIGH level

### Security risks classified as HIGH

- **What:** Prompt classifies security risks as HIGH severity
- **How:** `grep -n -iE "(security|injection|credential|traversal)" src/prompts/review-task.md | grep -i "high"` (or verify HIGH section mentions security examples)
- **Expected result:** At least one match linking security risks to HIGH level

### Accidental changes classified as HIGH

- **What:** Prompt classifies accidental/unauthorized file modifications as HIGH severity
- **How:** `grep -n -iE "(unrelated|scope|accidental|unauthorized)" src/prompts/review-task.md | grep -i "high"` (or verify HIGH section mentions scope/file comparison)
- **Expected result:** At least one match linking accidental changes to HIGH level

### Design flaws classified as MEDIUM

- **What:** Prompt classifies design flaws and code duplication as MEDIUM severity
- **How:** `grep -n -iE "(design flaw|duplication|DRY)" src/prompts/review-task.md | grep -i "medium"` (or verify MEDIUM section mentions these patterns)
- **Expected result:** At least one match linking design flaws/duplication to MEDIUM level

### Old lenient policy removed

- **What:** The old "at your discretion" policy for medium issues is no longer present
- **How:** `grep -n "at your discretion" src/prompts/review-task.md` (should return no results, or if present, only in a LOW context — not as the medium-issue rule)
- **Expected result:** No matches (or verify that medium issues are NOT described as "at your discretion")

### Severity classification table exists

- **What:** A severity classification reference (table or structured list) is present in the prompt
- **How:** `grep -cE "(CRITICAL|HIGH|MEDIUM|LOW)" src/prompts/review-task.md` — should show significantly more references than before (original had 4; new version should have many more due to the classification table + detailed descriptions)
- **Expected result:** Count is significantly higher than the original (which had exactly 4 severity level mentions in the categorization section)

### TypeScript health check

- **What:** Overall project type-checking still passes (no unintended side effects)
- **How:** `npx tsc --noEmit`
- **Expected result:** Exit code 0, no errors reported

## Manual Verification

### Prompt structure preserved

- **What:** The prompt retains its 8-step process structure, YAML frontmatter format instructions, REVIEW.md template, and guidelines section
- **How:** Open `src/prompts/review-task.md` and verify:
  - Steps 1–4 (reading context files) are unchanged
  - Step 5 (categorize issues) is rewritten with new severity rules
  - Step 6 (approval decision) is updated with mandatory ask_user for medium issues
  - Steps 7–8 (writing REVIEW.md, signaling completion) are unchanged
  - YAML frontmatter format section is intact
  - REVIEW.md template is intact
  - Guidelines section at the bottom is intact

### Prompt readability

- **What:** The rewritten prompt reads naturally and provides unambiguous guidance
- **How:** Read the full file — verify severity rules are clear, examples are concrete, and the classification table (if present) maps patterns to levels correctly
- **Expected result:** A review agent reading this prompt would have no ambiguity about which severity to assign for common issue patterns

## Test Order

1. File existence checks (prompt exists, old file gone)
2. Content searches (ask_user, CRITICAL/HIGH/MEDIUM classifications)
3. Old policy removal check
4. TypeScript health check (`npx tsc --noEmit`)
5. Manual structure review
6. Manual readability assessment
