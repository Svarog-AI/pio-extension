# Evolve-Plan Skill Recommendations

When `evolve-plan` generates `TASK.md` for a step, it should identify which pi skills are relevant to the task and include an explicit `## Skills` section in TASK.md. This gives the `execute-task` agent a concrete recommendation instead of relying solely on heuristic scanning of `<available_skills>`.

## Current State

Skill loading is currently prompt-driven and implicit. The mechanism works as follows:

- **`src/prompts/_skill-loading.md`** is injected into every pio sub-session via the context injection pipeline (`session-capability.ts`). It instructs agents to: (1) always load the `pio` skill, and (2) scan `<available_skills>` from the system prompt to find matching skills by description.
- **`src/prompts/execute-task.md`** explicitly mentions the `test-driven-development` skill in its text ("When writing tests and implementing features, follow the guidance from the `test-driven-development` skill") and references the `pio-git` skill during the commit step ("Commit changes using the `pio-git` skill"). However, these are hardcoded references — they don't scale to arbitrary skills or per-step variation.
- **`src/prompts/evolve-plan.md`** instructs the Specification Writer to research files affected by the step and write TASK.md with sections: Context, What to Build, Code Components, Approach and Decisions, Dependencies, Files Affected, Acceptance Criteria, and Risks and Edge Cases. There is no `## Skills` section in the TASK.md template.
- **Available skills (bundled):** The project ships 6 skills under `src/skills/`: `pio`, `pio-git`, `pio-planning`, `pio-project-knowledge`, `test-driven-development`, `write-a-skill`. External skills like `source-research`, `web-browser`, and `pi-intercom` may also appear in `<available_skills>` depending on the user's pi installation.
- The specification writer (`evolve-plan`) has deep context during spec writing — it reads GOAL.md, PLAN.md, previous step outputs, and researches affected files. This gives it better insight into which skills apply than the execute-task agent, which must guess from TASK.md alone plus `<available_skills>` scanning.

## To-Be State

`evolve-plan` will produce a `## Skills` section in every `TASK.md`, explicitly recommending relevant skills with justifications:

- **New TASK.md section:** A `## Skills` section appears between "Approach and Decisions" and "Dependencies". It lists each recommended skill by name with a one-sentence justification explaining why it applies to this specific step.
- **Scope of recommendations:** The specification writer considers ALL available skills — both bundled (`src/skills/`) and external (e.g., `source-research`, `web-browser` from `<available_skills>`). The goal is comprehensive coverage: if a skill could help the executor, it should be recommended.
- **Updated evolve-plan prompt:** `src/prompts/evolve-plan.md` will instruct the specification writer to analyze the step's requirements (files affected, code components, approach) and identify relevant skills from `<available_skills>`. The prompt template for TASK.md will include the new `## Skills` section.
- **execute-task integration:** `src/prompts/execute-task.md` already tells agents to load matching skills — the `_skill-loading.md` instructions remain. The explicit `## Skills` section in TASK.md provides a strong signal that complements (not replaces) the general skill-loading protocol. The execute-task agent should prioritize skills listed in TASK.md's `## Skills` section.
- **No changes to task validation:** The `evolve-plan` capability config (`src/capabilities/evolve-plan.ts`) already validates that `TASK.md` exists — no write allowlist or validation rule changes are needed since the Skills section is content inside an existing file, not a new output artifact.

### Files affected

- **`src/prompts/evolve-plan.md`** — modified: add instructions to identify and recommend relevant skills; update TASK.md template to include `## Skills` section
- **`src/prompts/execute-task.md`** — modified: instruct the execute-task agent to check TASK.md's `## Skills` section as a primary signal when deciding which skills to load

### What does NOT change

- `_skill-loading.md` injection mechanism (prompt-level skill loading stays in place as a general fallback)
- `<available_skills>` scanning (still required for skills not explicitly listed in TASK.md)
- File validation rules or write allowlists in `evolve-plan.ts`
- The `pio_mark_complete` exit-gate or any queue mechanics
