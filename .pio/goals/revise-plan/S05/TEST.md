# Tests: Create revise-plan prompt

## Programmatic Verification

- **What:** `src/prompts/revise-plan.md` file exists
  - **How:** `test -f src/prompts/revise-plan.md`
  - **Expected result:** Exit code 0 (file exists)

- **What:** Prompt references the correct shared planning skill path
  - **How:** `grep -c 'pio-planning' src/prompts/revise-plan.md`
  - **Expected result:** Output ≥ 1 (at least one reference to `pio-planning`)

- **What:** Prompt does NOT reference the incorrect path (`src/skills/planning/SKILL.md`)
  - **How:** `grep -c 'src/skills/planning/SKILL.md' src/prompts/revise-plan.md`
  - **Expected result:** Output 0 (no references to old path)

- **What:** Prompt contains revise-specific instructions (not just a copy of create-plan.md)
  - **How:** `grep -c 'PLAN_ARCHIVE' src/prompts/revise-plan.md`
  - **Expected result:** Output ≥ 1 (references to the archive directory)

- **What:** Prompt instructs agent to identify completed steps
  - **How:** `grep -ciE '(completed|APPROVED|immutable)' src/prompts/revise-plan.md`
  - **Expected result:** Output ≥ 2 (multiple references to completed/immutable concepts)

- **What:** Prompt instructs agent to write fresh PLAN.md with completed steps as anchors
  - **How:** `grep -ci 'anchor\|historical' src/prompts/revise-plan.md`
  - **Expected result:** Output ≥ 1 (references to preserving completed steps as anchors)

- **What:** Prompt instructs agent to add new steps rather than modify completed entries when changes are needed
  - **How:** `grep -ci 'new.*step\|future.*step' src/prompts/revise-plan.md`
  - **Expected result:** Output ≥ 1 (references to creating new/future steps)

- **What:** Prompt instructs agent to call `pio_mark_complete` upon completion
  - **How:** `grep -c 'pio_mark_complete' src/prompts/revise-plan.md`
  - **Expected result:** Output ≥ 1

- **What:** `npx tsc --noEmit` reports no errors
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no type errors

## Manual Verification

- **What:** Prompt follows structural conventions of existing prompts (role definition, process steps, guidelines)
  - **How:** Open `src/prompts/revise-plan.md` and compare structure against `src/prompts/create-plan.md` — verify it has: role definition ("You are a Plan Revision Agent"), Setup section, numbered Process steps, Guidelines, and signal completion instruction

- **What:** Prompt is revise-specific, not a copy-paste of create-plan.md
  - **How:** Read the full file and confirm it addresses: reading archived plans, identifying completed step folders, writing fresh PLAN.md with anchors, handling changes to completed code via new steps. It should NOT contain create-plan-specific content like user interviewing for architecture decisions or presenting findings to users

## Test Order

1. Programmatic verification (file existence, content checks, type checking)
2. Manual verification (structural review, content specificity)
