#!/usr/bin/env bash
# Verification script for Dimension 3: State machine extensions
# Runs all programmatic verification checks from TEST.md

set -euo pipefail

FEASIBILITY="/home/aleksj/git/pio-extension/.pio/goals/subgoals/FEASIBILITY.md"
PROJECT_ROOT="/home/aleksj/git/pio-extension"
PASS=0
FAIL=0

check() {
  local num="$1" desc="$2" cmd="$3"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  PASS  #$num: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  #$num: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Programmatic Verification ==="

# Test 1: FEASIBILITY.md exists
check 1 "FEASIBILITY.md exists" "test -f '$FEASIBILITY'"

# Test 2: Contains "Dimension 3" heading
check 2 "Contains Dimension 3 heading" "grep -q 'Dimension 3.*[Ss]tate [Mm]achine' '$FEASIBILITY'"

# Test 3: Subgoal spawning approaches evaluated (>=2)
SPAWN_COUNT=$(grep -ciE 'spawn(ing)?|piggyback|new transition' "$FEASIBILITY" || true)
check 3 "Subgoal spawning approaches evaluated (>=2 mentions: got $SPAWN_COUNT)" "[ $SPAWN_COUNT -ge 2 ]"

# Test 4: Lifecycle composition models evaluated (>=3)
LIFECYCLE_COUNT=$(grep -ciE 'pause|concurrent|delegat' "$FEASIBILITY" || true)
check 4 "Lifecycle composition models evaluated (>=3 mentions: got $LIFECYCLE_COUNT)" "[ $LIFECYCLE_COUNT -ge 3 ]"

# Test 5: Subgoal completion -> parent resumption mechanisms
check 5 "Completion->resumption mechanisms evaluated" "grep -qiE 'complet.*propagat|parent.*resum|finalize.*subgoal' '$FEASIBILITY'"

# Test 6: References state-machine.ts or key functions
check 6 "References state-machine.ts and key functions" \
  "grep -q 'state-machine' '$FEASIBILITY' && grep -qiE 'resolveTransition|transitionEvolvePlan|transitionFinalizeGoal' '$FEASIBILITY'"

# Test 7: Change categorizations present
check 7 "Change categorizations present" "grep -qiE 'breaking change|new logic|new field' '$FEASIBILITY'"

# Test 8: Cross-references to other dimensions
CROSS_REF_COUNT=$(grep -cE 'Dimension [1247]' "$FEASIBILITY" || true)
check 8 "Cross-references to other dimensions (>=2: got $CROSS_REF_COUNT)" "[ $CROSS_REF_COUNT -ge 2 ]"

# Test 9: finalize-goal terminal behavior addressed
check 9 "finalize-goal terminal behavior addressed" "grep -qiE 'terminal|finalize.*undefined|non-terminal' '$FEASIBILITY'"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
