# Auto-inject frontmatter output templates into capability prompts

## Problem

When a capability declares that its output file requires specific frontmatter (e.g., TASK.md requiring `skills`, PLAN.md requiring `totalSteps` + `steps[]`, REVIEW.md requiring `decision`), the expected format is currently defined in each capability's prompt template. This creates duplication and drift risk — if the schema changes, every relevant prompt must be updated manually.

## Proposed solution

When a session capability declares an output file with a known frontmatter schema, automatically inject a required output format block into the session prompt. The format block is generated from the schema definition — single source of truth in code, injected at runtime.

### Design sketch

- **Output template declaration:** `StaticCapabilityConfig` gains an optional `outputTemplates` field declaring which files require frontmatter and what schema they follow:
  ```typescript
  outputTemplates?: { file: string; schemaName: string }[];
  // e.g., [{ file: "S01/TASK.md", schemaName: "task-frontmatter" }]
  ```
- **Schema registry:** A small map of schema name → markdown template (generated from the TypeBox schema or a paired markdown description). Lives in `frontmatter-schemas.ts` alongside the schemas themselves.
- **Injection point:** During `before_agent_start`, after building skill-loading instructions, iterate `outputTemplates`, render each template as a markdown block, and inject before `--- YOUR INSTRUCTIONS ---`:
  ```markdown
  --- REQUIRED OUTPUT FORMAT ---

  ## TASK.md Frontmatter

  Your output file `S{NN}/TASK.md` must include the following YAML frontmatter:
  ... (rendered schema) ...
  ```
- **Per-session customization:** The template can use placeholders resolved from session params (e.g., step number → folder name).

### Benefits

1. Schema in code drives prompt content — no manual prompt updates when schemas evolve
2. Consistent format guidance across all sessions that produce the same output type
3. `postValidate` already validates the schema at completion; the prompt now tells the agent what's expected upfront

## Scope

This is a general infrastructure improvement. It applies to:
- **TASK.md** — frontmatter skills (Step 6 of skill-prioritization goal)
- **PLAN.md** — totalSteps + steps[] (already has validation, but format lives in prompt)
- **REVIEW.md** — decision + issue counts (format specified inline in review-task.md)

All three currently hardcode format expectations in their respective prompts. A single output template system would eliminate this duplication.

## Category

improvement

## Context

Related to skill-prioritization goal Step 6 (TASK_FRONTMATTER_SCHEMA). Currently evolve-plan.md hardcodes the expected TASK.md format in its prompt template. If other capabilities also produce structured outputs with frontmatter, the pattern repeats. Files involved: src/prompts/evolve-plan.md, src/prompts/create-plan.md, src/prompts/review-code.md, src/frontmatter-schemas.ts
