# Summary: Update pio skill documentation

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/skills/pio/SKILL.md` — Added revise-plan documentation across three sections:
  - **Workflow lifecycle:** Added "Plan revision" paragraph describing the `evolve-plan → revise-plan → evolve-plan` branching flow, including trigger conditions (`REVISE_PLAN_NEEDED` marker)
  - **Command reference table:** Added row for `/pio-revise-plan <name>` with tool `pio_revise_plan`, description, parameters, and output
  - **Common conventions:** Added two entries — `REVISE_PLAN_NEEDED` marker file mechanism and `PLAN_ARCHIVE/` directory with timestamped filenames

## Files Deleted
- (none)

## Decisions Made
- Placed "Plan revision" as a bold-paragraph after the cycle description (not as a numbered step) to preserve the original 1–5 step numbering while clearly showing revise-plan as a branching path
- Positioned the command table row between `review-task` and `execute-plan` to maintain logical grouping (review-related capabilities together)
- Kept convention entries concise, matching the existing bold-key-term style

## Test Coverage
- All programmatic checks pass (19/19):
  - `revise-plan` mentioned in file (grep)
  - `/pio-revise-plan` in command reference (grep)
  - `pio_revise_plan` tool name present (grep)
  - `REVISE_PLAN_NEEDED` marker documented (grep)
  - `PLAN_ARCHIVE` directory documented (grep)
  - All 12 original capability names preserved (grep)
  - YAML frontmatter preserved (head + grep)
- `npx tsc --noEmit` passes (exit code 0)
- `npm test` passes (538 tests, 22 files)
