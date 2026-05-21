# Task: Update pio skill documentation

Update `src/skills/pio/SKILL.md` to document the `revise-plan` capability across all relevant sections.

## Context

The pio skill (`src/skills/pio/SKILL.md`) is the canonical workflow reference loaded into every sub-session's `<available_skills>` block. The `revise-plan` capability has been fully implemented across Steps 1–8 (capability code, state machine transitions, prompts, shared planning skill, wiring). The skill documentation must now be updated to reflect the revised lifecycle, command reference, and conventions so that all future sub-sessions have accurate context.

## What to Build

Update `src/skills/pio/SKILL.md` in three sections:

### 1. Workflow lifecycle section

Add `revise-plan` to the numbered lifecycle steps and update the cycle description. Current text:

```
3. **evolve-plan** — Finds next incomplete step...
4. **execute-task** — Reads specs from S{NN}/, implements step...
5. **review-task** — Reviews completed step...

Steps 3–5 form a cycle: `evolve-plan` → `execute-task` → `review-task` → repeat until all plan steps are done.
```

The updated text should show that evolve-plan can divert to revise-plan when the `REVISE_PLAN_NEEDED` marker is present, and describe the revise-plan → evolve-plan return path. The cycle description should account for this branching behavior.

### 2. Command reference table

Add a new row for `revise-plan` between the existing `review-task` and `execute-plan` rows. The entry should follow the existing table format:

| Command | Tool | Description | Parameters | Output |
|---------|------|-------------|------------|--------|
| `/pio-revise-plan <name>` | `pio_revise_plan` | Archive current PLAN.md, delete incomplete steps, launch fresh planning session | `name` | `.pio/goals/<name>/PLAN.md` (rewritten) |

### 3. Common conventions section

Add two new convention entries:
- **Plan revision:** `REVISE_PLAN_NEEDED` marker inside an `S{NN}/` folder signals that the plan requires restructuring. evolve-plan auto-detects this marker and routes to revise-plan via the state machine.
- **Plan archive:** Archived plans live in `PLAN_ARCHIVE/` inside the goal workspace, with timestamped filenames (e.g., `PLAN-{YYYYMMDDTHHMMSSZ}.md`). The revise-plan agent reads these for context when writing a fresh plan.

## Approach and Decisions

- **Non-destructive edits only:** Do not remove or significantly reword existing content. Insert new information at the correct positions in each section.
- **Plan deviation — skill path is `pio-planning`:** When referencing the shared planning skill (if at all), use `src/skills/pio-planning/SKILL.md`, not `src/skills/planning/SKILL.md`. This step primarily documents the workflow, not the planning methodology itself.
- **Keep descriptions concise:** The skill is read by every sub-session agent. Each new entry should be brief — match the style and density of existing entries.

## Dependencies

- Step 3 (revise-plan capability) must be completed — to know the correct tool/command names, parameters, and behavior.
- Step 8 (evolve-plan marker integration) must be completed — to know the marker file name (`REVISE_PLAN_NEEDED`) and its trigger mechanism.
- No dependency on specific implementation details from Steps 1–7.

## Files Affected

- `src/skills/pio/SKILL.md` — modified: add revise-plan to workflow lifecycle, command reference table, and common conventions

## Acceptance Criteria

- [ ] Workflow lifecycle section includes `revise-plan` in the correct position, showing `evolve-plan → revise-plan → evolve-plan` flow
- [ ] Command reference table has a row for `/pio-revise-plan` with tool `pio_revise_plan`
- [ ] Common conventions mention `REVISE_PLAN_NEEDED` marker file and `PLAN_ARCHIVE/` directory
- [ ] No other workflow steps are accidentally modified or removed
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Editing a markdown file:** Since this is a `.md` file, TypeScript compilation (`npx tsc --noEmit`) will pass regardless of content correctness. The executor must verify content quality through programmatic checks (grep) rather than relying solely on type checking.
- **Preserving existing content:** Ensure edits insert at correct positions without disrupting table formatting, indentation, or YAML frontmatter.
- **Accuracy of documentation:** Cross-reference actual implementation from Steps 3–8 to ensure documented behavior matches code reality (tool name, command syntax, marker filename).
