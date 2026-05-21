# Tests: Update create-plan prompt to reference shared skill

This step modifies a markdown prompt file (`src/prompts/create-plan.md`). Verification relies on programmatic content checks and manual review. No new TypeScript code is created, so no unit tests are needed.

## Programmatic Verification

- **What:** File exists and was modified
  - **How:** `test -f src/prompts/create-plan.md`
  - **Expected result:** Exit code 0 (file exists)

- **What:** Prompt is significantly shorter than before (~214 lines)
  - **How:** `wc -l < src/prompts/create-plan.md`
  - **Expected result:** Output is between 60 and 100 (inclusive)

- **What:** Prompt references the shared planning skill by name
  - **How:** `grep -c 'pio-planning' src/prompts/create-plan.md`
  - **Expected result:** Output ≥ 2 (skill name referenced in process steps AND skill references section)

- **What:** Prompt uses correct skill path (`pio-planning`, not `planning`)
  - **How:** `grep -c 'src/skills/pio-planning/SKILL.md' src/prompts/create-plan.md`
  - **Expected result:** Output ≥ 1

- **What:** No references to old skill path remain
  - **How:** `grep -c 'src/skills/planning/SKILL.md' src/prompts/create-plan.md`
  - **Expected result:** Output = 0

- **What:** Role definition is retained
  - **How:** `grep -ci 'Planning Agent' src/prompts/create-plan.md`
  - **Expected result:** Output ≥ 1

- **What:** "Do not modify GOAL.md" constraint is retained
  - **How:** `grep -ci 'do not modify GOAL.md' src/prompts/create-plan.md`
  - **Expected result:** Output ≥ 1

- **What:** Process steps still reference reading GOAL.md
  - **How:** `grep -ci 'Read GOAL.md\|read.*goal.md' src/prompts/create-plan.md`
  - **Expected result:** Output ≥ 1

- **What:** Process steps still reference writing PLAN.md
  - **How:** `grep -ci 'Write PLAN.md\|write.*plan.md' src/prompts/create-plan.md`
  - **Expected result:** Output ≥ 1

- **What:** "Skill References" section exists at the end
  - **How:** `grep -c '## Skill References' src/prompts/create-plan.md`
  - **Expected result:** Output = 1

- **What:** pio_mark_complete is referenced (signal completion)
  - **How:** `grep -c 'pio_mark_complete' src/prompts/create-plan.md`
  - **Expected result:** Output ≥ 1

- **What:** Old inline methodology content removed (PLAN.md YAML frontmatter template)
  - **How:** `grep -c '```yaml' src/prompts/create-plan.md` or check for absence of the full frontmatter example block with `totalSteps: <number of steps>`
  - **Expected result:** The detailed YAML frontmatter template from the original should be gone or significantly reduced. Check that `totalSteps: \` style inline examples are absent.

- **What:** Old "Example Interaction Flow" section removed
  - **How:** `grep -c '## Example Interaction Flow' src/prompts/create-plan.md`
  - **Expected result:** Output = 0

- **What:** TypeScript compilation still passes (no source code changed, but verify clean state)
  - **How:** `npx tsc --noEmit` from project root
  - **Expected result:** Exit code 0, no errors

## Manual Verification

- **What:** No methodology rules are lost — cross-reference removed content with the skill
  - **How:** Compare the original create-plan.md content against `src/skills/pio-planning/SKILL.md`. For every guideline, rule, or instruction removed from create-plan.md, verify a corresponding entry exists in the skill. Categories to check:
    - Acceptance criteria guidelines (programmatic verification, no test steps) → skill "Acceptance Criteria Guidelines"
    - Step design quality criteria (concrete, ordered, sized, independent) → skill "Step Design Rules"
    - Research process instructions → skill "Research Process"
    - Scope discipline rules → skill "Scope Discipline"
    - User interaction protocol → skill "User Interaction Protocol"
  - **Expected result:** Every removed rule has a clear home in the skill. No orphaned guidance.

- **What:** Prompt is coherent and actionable as a standalone document
  - **How:** Read the revised prompt from start to finish. Verify it flows logically: role → Setup → Process steps (with skill references where appropriate) → Guidelines → Skill References section. An agent reading only this prompt + the referenced skill should have all information needed to create a PLAN.md.
  - **Expected result:** Prompt reads as a complete, coherent instruction set without gaps.

- **What:** Capability-specific content is preserved
  - **How:** Verify these create-plan-specific elements remain (they differ from revise-plan):
    - Interactive planning flow (Step 3: validate assumptions with user)
    - Presenting research findings to user
    - Asking about architecture decisions, scope alignment, execution preferences
    - Summarizing plan structure before writing
    - "If GOAL.md is too vague" guidance
  - **Expected result:** All capability-specific interaction patterns are retained or adequately referenced.

## Test Order

Execute in this priority:
1. Programmatic verification (all `grep`/`wc`/`tsc` checks)
2. Manual cross-reference check (verify no methodology loss)
3. Manual coherence review
