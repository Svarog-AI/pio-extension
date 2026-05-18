# Tests: Invert approval framing in Step 6 to default-reject

## Programmatic Verification

This is a prompt-only change. No TypeScript code is modified, so no new test files are created or existing tests updated. All verification is through programmatic content checks and type checking.

### Default-reject framing present

- **What:** Step 6 begins with a REJECTED assumption rather than an APPROVED one
- **How:** `grep -n "start.*REJECT\|assume.*REJECT\|assuming.*REJECT" src/prompts/review-task.md` — should match within the Step 6 section (after line 147)
- **Expected result:** At least one match found after the `### Step 6` heading

### Explicit absence verification for each severity level

- **What:** Step 6 requires verifying absence of critical, high, and medium issues before approving
- **How:** 
  - `grep -n "No critical" src/prompts/review-task.md` — should find a line mentioning no critical issues
  - `grep -n "No high" src/prompts/review-task.md` — should find a line mentioning no high issues
  - `grep -n "No medium" src/prompts/review-task.md` — should find a line mentioning no medium issues
- **Expected result:** All three grep commands return at least one match within the Step 6 section

### Mandatory REJECT conditions preserved

- **What:** Critical/high = mandatory REJECT rule still exists and is unambiguous
- **How:** `grep -n "critical\|CRITICAL" src/prompts/review-task.md | grep -i "reject\|mandatory"` — should find references to mandatory rejection for critical/high issues
- **Expected result:** At least one match confirming the mandatory REJECT rule for critical or high issues

### `ask_user` requirement for medium-only preserved

- **What:** When medium issues are the highest severity, `ask_user` must be called
- **How:** `grep -n "ask_user" src/prompts/review-task.md | grep -A1 -B1 "medium\|MEDIUM"` — should find ask_user referenced in context of medium issues
- **Expected result:** `ask_user` is mentioned in proximity to medium severity handling within Step 6

### "Therefore: APPROVED" conclusion phrase present

- **What:** The absence verification checklist concludes with an explicit approval statement
- **How:** `grep -n "Therefore.*APPROV\|therefore.*APPROV" src/prompts/review-task.md` — should find a concluding approval phrase after the verification checklist
- **Expected result:** At least one match found within Step 6

### Type checking passes

- **What:** No type errors introduced by the prompt file change
- **How:** `npm run check` (runs `tsc --noEmit`)
- **Expected result:** Exit code 0, no type errors reported

### Existing content outside Step 6 preserved

- **What:** The severity classification table and Step 5 guardrails from Step 1 are unchanged
- **How:** 
  - `grep -c "Before classifying: match every issue" src/prompts/review-task.md` — should be exactly 1
  - `grep -c "Prohibited downgrading language" src/prompts/review-task.md` — should be exactly 1
  - `grep -c "Common mistakes to avoid" src/prompts/review-task.md` — should be exactly 1
  - `grep -c "Severity Classification Reference" src/prompts/review-task.md` — should be exactly 1
- **Expected result:** Each grep returns count of 1 (content preserved, not duplicated or removed)

## Test Order

Execute in this order:

1. Content preservation checks (ensure Step 1 additions still intact)
2. Default-reject framing present
3. Explicit absence verification for each severity level
4. Mandatory REJECT conditions preserved
5. `ask_user` requirement for medium-only preserved
6. "Therefore: APPROVED" conclusion phrase present
7. Type checking (`npm run check`)
