# Tests: Dimension 2 — Queue keying strategy

This is a research-and-documentation step. No source code changes are made. Verification confirms the analysis in `FEASIBILITY.md` is complete and covers all acceptance criteria.

## Programmatic Verification

### FEASIBILITY.md structure checks

- **What:** FEASIBILITY.md exists at the correct path
- **How:** `test -f .pio/goals/subgoals/FEASIBILITY.md`
- **Expected result:** Exit code 0 (file exists)

- **What:** Contains "Dimension 2: Queue keying strategy" heading
- **How:** `grep -q "Dimension 2" .pio/goals/subgoals/FEASIBILITY.md`
- **Expected result:** Match found (exit code 0)

### Content coverage checks

- **What:** Section evaluates multiple keying strategies
- **How:** `grep -ciE "strateg|approach|option" .pio/goals/subgoals/FEASIBILITY.md | grep -q '[2-9]'` — counts distinct strategy mentions in the Dimension 2 section area
- **Expected result:** At least 2 strategy evaluations present

- **What:** Section contains a recommendation with justification
- **How:** `grep -qiE "recommend|chosen|selected" .pio/goals/subgoals/FEASIBILITY.md`
- **Expected result:** Match found — a specific approach is recommended

- **What:** References `src/queues.ts` and key functions
- **How:** `grep -q "queues" .pio/goals/subgoals/FEASIBILITY.md && grep -qiE "enqueueTask|readPendingTask|listPendingGoals" .pio/goals/subgoals/FEASIBILITY.md`
- **Expected result:** Both references found

- **What:** Identifies required changes to `src/queues.ts` functions
- **How:** `grep -qiE "breaking change\|new logic\|new field" .pio/goals/subgoals/FEASIBILITY.md` (within Dimension 2 section)
- **Expected result:** Change categorizations present

- **What:** Addresses backward compatibility with flat goals
- **How:** `grep -qiE "backward.?compat|flat.*(goal|name)|existing.*work" .pio/goals/subgoals/FEASIBILITY.md`
- **Expected result:** Backward compatibility is discussed

- **What:** Discusses collision risk (same-named sibling subgoals)
- **How:** `grep -qiE "collid|sibling|unique.*key|ambig" .pio/goals/subgoals/FEASIBILITY.md`
- **Expected result:** Collision analysis present

- **What:** Addresses downstream integration (`GoalState`, capability config, session naming)
- **How:** `grep -qiE "goal-state|capability-config|deriveSessionName|pendingTask" .pio/goals/subgoals/FEASIBILITY.md`
- **Expected result:** At least one downstream integration point referenced

### TypeScript compilation check

- **What:** No TypeScript errors introduced (this step produces no code changes, but verify the workspace is still clean)
- **How:** `npm run check`
- **Expected result:** Exit code 0, no type errors

## Test Order

1. FEASIBILITY.md existence check
2. Structure checks (heading presence)
3. Content coverage checks (strategies, recommendation, function references, change categorizations, backward compatibility, collision analysis, downstream integration)
4. TypeScript compilation check (`npm run check`)
