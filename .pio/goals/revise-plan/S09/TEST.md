# Tests: Update pio skill documentation

This step modifies a markdown documentation file. Verification is programmatic (content checks via grep) and manual review rather than unit/integration tests.

## Programmatic Verification

### Verify revise-plan in workflow lifecycle

- **What:** Workflow lifecycle section mentions `revise-plan` capability
- **How:** `grep -c "revise-plan" src/skills/pio/SKILL.md`
- **Expected result:** Exit code 0, output ≥ 1 (at least one mention)

### Verify revise-plan in command reference table

- **What:** Command reference table contains a row for `/pio-revise-plan`
- **How:** `grep -c "/pio-revise-plan" src/skills/pio/SKILL.md`
- **Expected result:** Exit code 0, output ≥ 1

### Verify revise-plan tool name in command reference

- **What:** Command reference table mentions `pio_revise_plan` as the tool name
- **How:** `grep -c "pio_revise_plan" src/skills/pio/SKILL.md`
- **Expected result:** Exit code 0, output ≥ 1

### Verify REVISE_PLAN_NEEDED marker mentioned in conventions

- **What:** Common conventions section documents the `REVISE_PLAN_NEEDED` marker
- **How:** `grep -c "REVISE_PLAN_NEEDED" src/skills/pio/SKILL.md`
- **Expected result:** Exit code 0, output ≥ 1

### Verify PLAN_ARCHIVE directory mentioned in conventions

- **What:** Common conventions section documents the `PLAN_ARCHIVE/` directory
- **How:** `grep -c "PLAN_ARCHIVE" src/skills/pio/SKILL.md`
- **Expected result:** Exit code 0, output ≥ 1

### Verify no existing workflow steps removed

- **What:** All original capability names are still present (create-goal, create-plan, evolve-plan, execute-task, review-task, execute-plan, project-context, create-issue, goal-from-issue, list-goals, next-task, parent)
- **How:** For each name: `grep -c "<name>" src/skills/pio/SKILL.md`
- **Expected result:** Exit code 0 for all (all original references preserved)

### Verify TypeScript compilation

- **What:** No TypeScript errors introduced by the change (SKILL.md is markdown, but verify overall project health)
- **How:** `npx tsc --noEmit`
- **Expected result:** Exit code 0, no error output

### Verify YAML frontmatter preserved

- **What:** The file still starts with valid YAML frontmatter containing `name: pio` and `description:`
- **How:** `head -5 src/skills/pio/SKILL.md`
- **Expected result:** Output includes `---`, `name: pio`, and `description:` on separate lines

## Manual Verification

### Review workflow lifecycle section

- **What:** The lifecycle description correctly shows the revise-plan branching behavior (evolve-plan → revise-plan → evolve-plan) without disrupting the original 1–5 step numbering or the cycle description
- **How:** Read the "Workflow lifecycle" section visually. Verify:
  - Original steps 1–5 are still present and numbered
  - revise-plan is described as a branching path from evolve-plan (not a replacement of any existing step)
  - The cycle description accounts for the revision loop

### Review command reference table

- **What:** The new row follows the exact format of existing rows (pipe-delimited, correct column alignment) and provides accurate parameter/output information
- **How:** Read the command reference table. Verify:
  - `/pio-revise-plan` appears in the Command column
  - `pio_revise_plan` appears in the Tool column
  - Description accurately describes the capability
  - No formatting breaks (pipes align, no missing columns)

### Review common conventions section

- **What:** The new convention entries are clear, concise, and consistent with the style of existing entries (bold key term followed by colon and explanation)
- **How:** Read the "Common conventions" section. Verify:
  - REVISE_PLAN_NEEDED is explained in context of evolve-plan's trigger mechanism
  - PLAN_ARCHIVE/ is explained with mention of timestamped filenames
  - Existing conventions are unchanged

## Test Order

Execute in this priority: programmatic checks (grep + tsc) first, then manual review. All programmatic checks should pass before proceeding to manual verification.
