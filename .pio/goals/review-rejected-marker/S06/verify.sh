#!/usr/bin/env bash
# Verification script for Step 6: YAML frontmatter in review prompt
set -euo pipefail

PROMPT="src/prompts/review-code.md"
PASS=0
FAIL=0

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ] || { [ "$expected" = ">0" ] && [ "$actual" -gt 0 ]; }; then
    echo "PASS: $desc (got $actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Verifying Step 6: YAML frontmatter in review prompt ==="

# 1. YAML code block present
check "YAML code block present" ">0" "$(grep -c '```yaml' "$PROMPT")"

# 2. All five required fields
check "decision field mentioned" ">0" "$(grep -c 'decision:' "$PROMPT")"
check "criticalIssues field mentioned" ">0" "$(grep -c 'criticalIssues:' "$PROMPT")"
check "highIssues field mentioned" ">0" "$(grep -c 'highIssues:' "$PROMPT")"
check "mediumIssues field mentioned" ">0" "$(grep -c 'mediumIssues:' "$PROMPT")"
check "lowIssues field mentioned" ">0" "$(grep -c 'lowIssues:' "$PROMPT")"

# 3. Frontmatter placement (top of file, before headings)
check "Frontmatter placement guidance" ">0" "$(grep -ciE 'top|before.*heading|first' "$PROMPT")"

# 4. Manual marker instructions removed
check "No 'Write an empty file.*APPROVED'" "0" "$(grep -c 'Write an empty file.*APPROVED' "$PROMPT" || true)"
check "No 'Delete.*COMPLETED'" "0" "$(grep -c 'Delete.*COMPLETED' "$PROMPT" || true)"
check "No 'rm .*COMPLETED'" "0" "$(grep -c 'rm .*COMPLETED' "$PROMPT" || true)"

# 5. Automation language present
check "Automation language present" ">0" "$(grep -ciE 'automatic|automatically|infrastructure.*handle' "$PROMPT")"

# 6. pio_mark_complete mentioned
check "pio_mark_complete mentioned" ">0" "$(grep -c 'pio_mark_complete' "$PROMPT")"

# 7. Agent told not to create/delete marker files manually
check "Agent told not to manage markers manually" ">0" "$(grep -ciE 'should.*not|do not|no longer|must not' "$PROMPT")"

# 8. Human-readable ## Decision section preserved
check "## Decision heading present" ">0" "$(grep -c '## Decision' "$PROMPT")"

# 9. Steps 1-6 unchanged
check "Step 1: Read GOAL.md" "1" "$(grep -c '### Step 1: Read GOAL.md' "$PROMPT")"
check "Step 2: Read TASK.md" "1" "$(grep -c '### Step 2: Read TASK.md' "$PROMPT")"
check "Step 3: Read implementation" "1" "$(grep -c '### Step 3: Read implementation' "$PROMPT")"
check "Step 4: Analyze the implementation" "1" "$(grep -c '### Step 4: Analyze the implementation' "$PROMPT")"
check "Step 5: Categorize issues" "1" "$(grep -c '### Step 5: Categorize issues' "$PROMPT")"
check "Step 6: Make the approval decision" "1" "$(grep -c '### Step 6: Make the approval decision' "$PROMPT")"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
