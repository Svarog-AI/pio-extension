# Tests: Dimension 3 — State machine extensions

This is a research-and-documentation step. No source code is modified. Verification is programmatic (file existence, content checks) and TypeScript compilation only.

## Programmatic Verification

All test cases verify that `FEASIBILITY.md` was correctly updated with the Dimension 3 analysis section.

| # | What | How | Expected result |
|---|------|-----|-----------------|
| 1 | FEASIBILITY.md exists | `test -f /home/aleksj/git/pio-extension/.pio/goals/subgoals/FEASIBILITY.md` | Exit code 0 |
| 2 | Contains "Dimension 3" heading | `grep -q "Dimension 3.*[Ss]tate [Mm]achine" FEASIBILITY.md` | Match found (exit 0) |
| 3 | Subgoal spawning approaches evaluated (≥2) | `grep -ciE "spawn(ing)?\|piggyback\|new transition" FEASIBILITY.md` | Count ≥ 2 mentions of spawning/integration approaches |
| 4 | Lifecycle composition models evaluated (≥3) | `grep -ciE "pause\|concurrent\|delegat" FEASIBILITY.md` | Count ≥ 3 (one per model: pause, concurrent, delegate) |
| 5 | Subgoal completion → parent resumption mechanisms evaluated | `grep -ciE "complet.*propagat\|parent.*resum\|finalize.*subgoal" FEASIBILITY.md` | Match found — at least two options discussed |
| 6 | References `src/state-machine.ts` or key functions | `grep -q "state-machine" FEASIBILITY.md && grep -qiE "resolveTransition\|transitionEvolvePlan\|transitionFinalizeGoal" FEASIBILITY.md` | Both match (exit 0) |
| 7 | Change categorizations present | `grep -qiE "breaking change\|new logic\|new field" FEASIBILITY.md` | Match found within Dimension 3 section |
| 8 | Cross-references to other dimensions | `grep -cE "Dimension [1247]" FEASIBILITY.md` | Count ≥ 2 (at least 2 cross-references from {1, 2, 4, 7}) |
| 9 | `finalize-goal` terminal behavior addressed | `grep -qiE "terminal\|finalize.*undefined\|non-terminal" FEASIBILITY.md` | Match found — analysis covers the terminal-to-non-terminal question |
| 10 | TypeScript compilation passes | `npm run check` (in project root) | Exit code 0, no errors |

## Manual Verification

| # | What | How |
|---|------|-----|
| 1 | Section completeness | Read the Dimension 3 section in FEASIBILITY.md. Verify it covers: (a) spawning mechanisms with trade-offs, (b) lifecycle composition models, (c) completion → parent resumption, (d) specific `state-machine.ts` function changes |
| 2 | Analysis depth | Verify that each evaluated approach includes pros/cons or trade-off discussion — not just descriptions. The analysis should be actionable for a later PLAN.md. |
| 3 | Cross-referencing accuracy | Verify cross-references to Dimensions 1, 2, 4, and 7 are contextually accurate (e.g., Dimension 1's nesting path is correctly cited, Dimension 2's queue keying is referenced for transition enqueuing). |

## Test Order

Run in this order:
1. Programmatic Verification #1–9 (content checks — fast, no build)
2. Manual Verification #1–3 (readability and accuracy review)
3. Programmatic Verification #10 (`npm run check` — type compilation gate)
