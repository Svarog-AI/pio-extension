# Summary: Update create-plan prompt to reference shared skill

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/create-plan.md` — Rewrote from 214 lines to 86 lines. Extracted methodology content into `pio-planning` skill references. Retained capability-specific instructions (role definition, process steps with user interaction flow, guidelines). Added "Skill References" section at the end.

## Changes Detail

### Removed (methodology now in `pio-planning` skill)
- Full PLAN.md format template (YAML frontmatter example, section descriptions, step template)
- Detailed step quality criteria inline definitions
- Detailed acceptance criteria rules and examples
- Detailed research process sub-steps
- Scope discipline inline rules
- User interaction protocol details
- "Example Interaction Flow" section (entire section removed)

### Retained (capability-specific to create-plan)
- Role definition ("You are a Planning Agent")
- Setup instructions
- Step 1: Read GOAL.md (capability-specific context)
- Step 2: Deep research (trimmed, references skill for methodology)
- Step 3: Validate assumptions and gather preferences (kept detailed — interactive planning is create-plan's key differentiator from revise-plan)
- Step 4: Design the steps (trimmed, references skill for quality criteria)
- Step 5: Write PLAN.md (trimmed, references skill for structure)
- Step 6: Signal completion (unchanged)
- Guidelines: "Do not modify GOAL.md", scope discipline, no source code, don't over-interview, etc.
- Skill References section listing what to consult from `pio-planning`

### Added
- References to `pio-planning` skill throughout process steps (5 total references)
- "Skill References" section at the end documenting all skill lookups

## Decisions Made
- Used `src/skills/pio-planning/SKILL.md` as the correct skill path (matching Step 1's actual output, not the original plan's `src/skills/planning/SKILL.md`)
- Kept Step 3 (Validate assumptions) relatively detailed since interactive planning is the key differentiator between create-plan and revise-plan
- Removed the "Example Interaction Flow" section entirely — the skill's User Interaction Protocol provides sufficient guidance
- Target line count achieved: 86 lines (within 60-100 target range)

## Test Coverage
All 13 programmatic verification checks from TEST.md pass:
1. File exists ✓
2. Line count 86 (within 60-100 range) ✓
3. `pio-planning` referenced 5 times (≥2) ✓
4. Correct skill path `src/skills/pio-planning/SKILL.md` present ✓
5. Old skill path `src/skills/planning/SKILL.md` absent ✓
6. "Planning Agent" role definition retained ✓
7. "Do not modify GOAL.md" constraint retained ✓
8. Read GOAL.md references present ✓
9. Write PLAN.md references present ✓
10. "Skill References" section exists ✓
11. `pio_mark_complete` referenced ✓
12. Old YAML frontmatter template removed ✓
13. "Example Interaction Flow" section removed ✓
14. `npx tsc --noEmit` passes ✓

Manual verification:
- Every removed methodology rule has a corresponding entry in `src/skills/pio-planning/SKILL.md` ✓
- Prompt reads as a coherent, actionable standalone document ✓
- All capability-specific interaction patterns preserved ✓
