# Summary: Prompts and skills documentation

## Status
COMPLETED

## Files Created
- `.pio/goals/implement-subgoals/S08/TEST.md` — test specification with programmatic verification checks

## Files Modified
- `src/prompts/create-plan.md` — Step 4 now frames steps as deliverables ("Conceptually, each step is a deliverable") and includes subgoal classification guidance referencing the `pio-planning` skill (no explicit section names). Prompt does not know internal skill organization.
- `src/prompts/finalize-goal.md` — added subgoal-aware summary reading instructions in Step 2 (check for `subgoals/` directories, read subgoal GOAL.md, DECISIONS.md, and per-sub-step SUMMARY.md)
- `src/skills/pio-planning/SKILL.md` — added "Subgoal Decomposition" section with I/O contract test (examples), encapsulation rule (examples), and frontmatter-based declaration (with YAML example). Step Design Rules now frames steps as deliverables. No step count guard — subgoal classification relies on I/O contract test and encapsulation rule only.
- `src/skills/pio/SKILL.md` — updated workflow lifecycle to describe subgoal spawning from evolve-plan, completion propagation through finalize-goal, and `S{NN}/subgoals/<name>/` directory structure; updated command reference table for evolve-plan

## Files Deleted
- (none)

## Decisions Made
- All changes are additive — existing content preserved entirely in all four files
- Prompt-skill separation maintained: `create-plan.md` says WHAT to do (evaluate and mark), `pio-planning/SKILL.md` says HOW (detailed I/O contract test, encapsulation rule)
- Frontmatter-only subgoal declaration documented consistently (no in-body annotations)
- No changes to `create-goal.md` or `evolve-plan.md` per plan decision (initial message carries parent context; evolve-plan is identical for regular and subgoal steps)
- Steps framed as deliverables conceptually: "Conceptually, each step is a deliverable" in create-plan.md; "Each step is a deliverable" in pio-planning SKILL.md
- No explicit skill section references in prompts: `create-plan.md` says "Follow the subgoal classification guidance in the `pio-planning` skill" rather than naming specific sections
- No step count guard: subgoal classification relies solely on I/O contract test and encapsulation rule; removed the fixed threshold of 8

## Test Coverage
- All 15 programmatic verification checks pass (content presence verified via grep)
- All existing content sections preserved (verified via section heading counts)
- No `.ts` files modified (documentation-only change)
- `npx tsc --noEmit` reports no errors
