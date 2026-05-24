# Task: Add skill identification instructions and `## Skills` section to evolve-plan prompt

Update the specification writer prompt so every generated `TASK.md` includes a `## Skills` section recommending relevant pi skills with justifications.

## Context

Skill loading is currently implicit — agents scan `<available_skills>` heuristically, or rely on hardcoded references in individual prompts (e.g., `execute-task.md` hardcodes `test-driven-development` and `pio-git`). The specification writer (`evolve-plan`) has deep context during spec writing — it reads GOAL.md, PLAN.md, previous step outputs, and researches affected files. This gives it better insight into which skills apply than the executor, which must guess from TASK.md alone. Adding explicit skill recommendations to TASK.md leverages this superior context.

## What to Build

Two changes inside `src/prompts/evolve-plan.md`:

1. **New instruction block before "Step 5: Write TASK.md":** Add guidance telling the specification writer to analyze the step's requirements against `<available_skills>` from the system prompt and identify which skills are relevant. The writer should consider both bundled skills (listed in `src/skills/`) and external skills that may appear in `<available_skills>` (e.g., `source-research`, `web-browser`, `pi-intercom`). For each recommended skill, write a one-sentence justification explaining why it applies to this specific step.

2. **New `## Skills` section in the TASK.md template:** Insert a `## Skills` heading between "Approach and Decisions" and "Dependencies" in the template block under "Step 5: Write TASK.md". The template should show the expected format: list each skill by name with a brief justification. If no skills are relevant beyond the mandatory `pio` skill, instruct the writer to note that explicitly.

### Code Components

No TypeScript components — this is a prompt-only change. The two modifications are:

- **Skill identification instructions:** A new paragraph or sub-section inserted before "Step 5: Write TASK.md" in evolve-plan.md. It should instruct the writer to (a) review `<available_skills>` from the system prompt, (b) analyze step requirements (files affected, code components, approach), and (c) produce a one-sentence justification per recommended skill.
- **`## Skills` template entry:** A new section in the TASK.md template markdown block showing the format: skill name with justification per line. Include guidance about noting when no additional skills are needed beyond the mandatory `pio` skill.

### Approach and Decisions

- The instruction block should be placed as a sub-step or paragraph immediately before "Step 5: Write TASK.md" so it's read as part of the spec-writing process, not as an afterthought.
- The `## Skills` template entry should follow the same formatting style as other template sections — angle-bracketed placeholder text describing what goes there.
- Position the `## Skills` section between "Approach and Decisions" and "Dependencies" in the template to match the natural flow: first you decide approach, then identify skills that support that approach, then list dependencies.
- Reference `<available_skills>` explicitly in the instructions — this is the mechanism by which skills are communicated to sub-sessions (injected via `session-capability.ts`).
- The 6 bundled skills at time of writing are: `pio`, `pio-git`, `pio-planning`, `pio-project-knowledge`, `test-driven-development`, `write-a-skill`. Don't hardcode this list in the prompt — just instruct the writer to scan `<available_skills>` and consider `src/skills/` as a reference for bundled skills.

## Dependencies

None. This is Step 1 with no prerequisites.

## Files Affected

- `src/prompts/evolve-plan.md` — modified: add skill identification instructions before "Step 5"; insert `## Skills` section into TASK.md template

## Acceptance Criteria

- `src/prompts/evolve-plan.md` contains instructions directing the specification writer to analyze step requirements against available skills and produce skill recommendations
- The TASK.md template in `src/prompts/evolve-plan.md` includes a `## Skills` section positioned between "Approach and Decisions" and "Dependencies"
- The `## Skills` template entry shows the expected format: skill name with one-sentence justification per entry
- The prompt instructs the writer to consider ALL available skills — both bundled (`src/skills/`) and external (from `<available_skills>`)
- Existing TASK.md sections and ordering are preserved (only insertion, no restructuring of other sections)
- No TypeScript files were modified or created

## Risks and Edge Cases

- Ensure the `## Skills` section is inserted at the correct position in the template block — verify by checking that "Approach and Decisions" appears before it and "Dependencies" appears after.
- The instruction block should not conflict with or duplicate existing instructions in evolve-plan.md (e.g., existing research steps). Phrase as an additional consideration during spec writing, not a replacement for any existing step.
- Don't accidentally modify the TASK.md template structure beyond the single insertion — the rest of the template sections must remain verbatim to avoid confusing downstream specification writers.
- The mandatory `pio` skill is already always loaded via `_skill-loading.md`. The instructions should clarify that `## Skills` lists _additional_ recommendations, not the mandatory baseline.
