---
totalSteps: 2
steps:
  - name: add-skills-section-to-evolve-plan
    complexity: task
  - name: prioritize-task-skills-in-execute-task
    complexity: task
---

# Plan: Evolve-Plan Skill Recommendations

Add a `## Skills` section to every `TASK.md` produced by the specification writer, and instruct the execute-task agent to use it as a primary skill-loading signal. Reference GOAL.md for full context.

## Prerequisites

None.

## Steps

### Step 1: Add skill identification instructions and `## Skills` section to evolve-plan prompt

**Description**

Update `src/prompts/evolve-plan.md` so the specification writer produces a `## Skills` section in every `TASK.md`. This requires two changes inside the prompt file:

1. **New instruction block before "Step 5: Write TASK.md":** Add guidance telling the specification writer to analyze the step's requirements (files affected, code components, approach) against `<available_skills>` from the system prompt and identify which skills are relevant. The writer should consider both bundled skills (`src/skills/`) and external skills (e.g., `source-research`, `web-browser`). For each recommended skill, write a one-sentence justification explaining why it applies to this specific step.

2. **New `## Skills` section in the TASK.md template:** Insert a `## Skills` heading between "Approach and Decisions" and "Dependencies" in the template block under "Step 5: Write TASK.md". The template should show the expected format: list each skill by name with a brief justification. If no skills are relevant beyond the mandatory `pio` skill, instruct the writer to note that explicitly (e.g., "No additional skills recommended beyond the mandatory pio skill").

**Acceptance Criteria**

- `src/prompts/evolve-plan.md` contains instructions directing the specification writer to analyze step requirements against available skills and produce skill recommendations
- The TASK.md template in `src/prompts/evolve-plan.md` includes a `## Skills` section positioned between "Approach and Decisions" and "Dependencies"
- The `## Skills` template entry shows the expected format: skill name with one-sentence justification per entry
- The prompt instructs the writer to consider ALL available skills — both bundled and external
- Existing TASK.md sections and ordering are preserved (only insertion, no restructuring)

**Files Affected**

- `src/prompts/evolve-plan.md` — modified: add skill identification instructions; insert `## Skills` section into TASK.md template

### Step 2: Update execute-task prompt to prioritize TASK.md skill recommendations

**Description**

Update `src/prompts/execute-task.md` so the execute-task agent checks `TASK.md`'s `## Skills` section as a primary signal when deciding which skills to load. The existing hardcoded references to `test-driven-development` and `pio-git` should remain — they act as baseline defaults. The new instruction tells the agent that skills explicitly listed in `TASK.md`'s `## Skills` section are the specification writer's targeted recommendations for this step and should be loaded first, before falling back to heuristic scanning of `<available_skills>`.

Add a short paragraph after the existing skill-loading references (the `test-driven-development` mention near the top) that instructs the agent to: read the `## Skills` section from `TASK.md`, prioritize loading those skills, and treat them as strong recommendations from the specification writer who had deeper context about the step.

**Acceptance Criteria**

- `src/prompts/execute-task.md` contains instructions directing the executor to check `TASK.md`'s `## Skills` section and prioritize loading listed skills
- Existing references to `test-driven-development` skill are preserved (not removed or modified)
- Existing references to `pio-git` skill during commit step are preserved
- The new instruction clarifies that TASK.md recommendations complement — not replace — the general skill-loading protocol from `_skill-loading.md`

**Files Affected**

- `src/prompts/execute-task.md` — modified: add instruction to check and prioritize TASK.md `## Skills` section when loading skills

## Notes

- Both steps modify only markdown prompt files — no TypeScript, tests, or build artifacts are affected.
- Step 1 must complete before Step 2 so the execute-task agent knows what to expect in TASK.md (though there's no strict code dependency, the logical flow matches produce-then-consume).
- `_skill-loading.md` is intentionally unchanged per GOAL.md — it remains the general fallback mechanism.
- No changes to `evolve-plan.ts` validation rules or write allowlists are needed since the `## Skills` section is content inside an existing file (`TASK.md`), not a new output artifact.
