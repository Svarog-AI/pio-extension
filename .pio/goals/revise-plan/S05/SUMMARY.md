# Summary: Create revise-plan prompt

## Status
COMPLETED

## Files Created
- `src/prompts/revise-plan.md` — revise-plan system prompt defining the Plan Revision Agent's role, workflow, and output requirements

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- Prompt follows the structural conventions of existing prompts (create-plan.md, evolve-plan.md): role definition → Setup → Process steps → Guidelines → Signal completion
- 7 process steps: Read GOAL.md → Read archived plans → Identify completed steps → Research context → Design new steps → Write PLAN.md → Signal completion
- Completed steps are marked with `[COMPLETED]` and `**Status:** COMPLETED` lines in the PLAN.md template
- References the planning skill by name (`pio-planning`) throughout the prompt, with path `src/skills/pio-planning/SKILL.md` in the Skill References section
- Includes a "Skill References" section at the end explicitly listing what to consult from the `pio-planning` skill

## Test Coverage
- File existence: `test -f src/prompts/revise-plan.md` — PASS
- References `pio-planning`: `grep -c 'pio-planning'` → 1 (≥ 1) — PASS
- No old path (`src/skills/planning/SKILL.md`): `grep -c` → 0 — PASS
- `PLAN_ARCHIVE` references: `grep -c` → 2 (≥ 1) — PASS
- Completed/APPROVED/immutable references: `grep -ciE` → 24 (≥ 2) — PASS
- Anchor/historical references: `grep -ci` → 6 (≥ 1) — PASS
- New/future step references: `grep -ci` → 13 (≥ 1) — PASS
- `pio_mark_complete` reference: `grep -c` → 1 (≥ 1) — PASS
- `npx tsc --noEmit`: Exit code 0, no errors — PASS
- Structural review: Has role definition, Setup, numbered Process steps, Guidelines, signal completion — PASS
- Content specificity: Revise-specific (archived plans, completed folders, fresh PLAN.md, new steps for completed code changes) — PASS
