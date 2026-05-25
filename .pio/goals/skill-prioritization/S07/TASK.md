# Task: Update evolve-plan to write skills in TASK.md frontmatter

Update the evolve-plan prompt template so the spec writer includes per-step skill recommendations in TASK.md YAML frontmatter alongside the existing body `## Skills` section.

## Context

Steps 1–5 centralized capability-level skill loading via `CapabilityConfig.skills`. Step 6 added `TASK_FRONTMATTER_SCHEMA` to validate a `skills` field in TASK.md YAML frontmatter. However, the spec writer (evolve-plan sessions) doesn't yet know to write skills in the frontmatter — it currently writes skills only in the body `## Skills` section as human-readable text. This step updates the evolve-plan prompt so the machine-readable signal exists in frontmatter for Step 8 (execute-task/review-task prepareSession hooks) to consume at runtime, while preserving the body `## Skills` section for human reasoning.

## What to Build

Modify `src/prompts/evolve-plan.md` — a markdown prompt template injected into evolve-plan sub-sessions. Add instructions near the TASK.md template section telling the spec writer to include skills in YAML frontmatter. This is a **prompt-only change** — no TypeScript or JavaScript code is modified.

### Prompt Changes

The evolve-plan.md prompt currently contains a TASK.md template that the spec writer follows. The template includes sections like `## Context`, `## What to Build`, `## Skills` (body), `## Dependencies`, `## Files Affected`, `## Acceptance Criteria`. The change targets two areas:

**1. Frontmatter instructions:** Near or within the TASK.md template, add a paragraph instructing the spec writer to include a YAML frontmatter block at the top of TASK.md with an optional `skills` field. The instructions must:

- Explain the purpose: machine-readable skill declarations consumed at runtime by execute-task and review-task
- Describe the two sub-fields:
  - `skills.mandatory` — array of skill names critical for step completion (force-injected, guaranteed loaded). Examples: `pio-git` for a migration step, `test-driven-development` for any TDD step
  - `skills.recommended` — array of `{name, condition}` pairs for situational skills loaded on demand. Examples: `source-research` with condition "when researching external libraries"
- Clarify the distinction between mandatory and recommended: mandatory = critical for completion, recommended = helpful references under specific conditions
- Instruct to omit the entire `skills.recommended` key (not write an empty array) when there are no recommended skills — matching the capability config convention from Steps 1–5
- Note that both `skills.mandatory` and `skills.recommended` are optional — a step with no special skill needs omits the `skills` block entirely

**2. Short frontmatter example:** Include a concrete YAML snippet showing what the frontmatter looks like:

```yaml
---
skills:
  mandatory:
    - pio-git
    - test-driven-development
  recommended:
    - name: source-research
      condition: when researching external library internals
---
```

**3. Preserve the body `## Skills` section:** Explicitly state that the body `## Skills` section remains unchanged — it provides human-readable reasoning and context for the executor. The frontmatter is the machine-readable signal; the body section explains the "why." Both coexist, serving different purposes.

### Approach and Decisions

- **No code changes.** This step modifies only `src/prompts/evolve-plan.md` — a markdown file read at runtime by the capability system. No TypeScript compilation or test execution is affected directly.
- **Reference DECISIONS.md decisions:**
  - The frontmatter schema shape was defined in Step 6 (`TASK_FRONTMATTER_SCHEMA`). Instruct spec writers to follow this exact structure: `skills.mandatory` (string[]) and `skills.recommended` ({name, condition}[]).
  - Per capability config convention (DECISIONS.md), omit `recommended` entirely when empty — don't write an empty array.
  - Inline skill mentions in prompt files are legitimate procedural instructions (preserved in Step 5). This distinction is relevant: the body `## Skills` section remains a legitimate part of TASK.md; we're adding frontmatter, not replacing the body.
- **Placement in evolve-plan.md:** Look for where the TASK.md template is described. The new frontmatter instructions should appear near the top of the template description (before the body sections) since YAML frontmatter appears at the very top of the file. Add a clear note that the spec writer should include the frontmatter block as the first thing in the TASK.md file, before the `# Task:` heading.

## Skills

No additional skills recommended beyond the mandatory pio skill.

## Dependencies

- **Step 6 (Add TASK.md frontmatter schema with skills):** The `TASK_FRONTMATTER_SCHEMA` must exist so spec writers know the exact structure to follow. This step provides the schema definition; this step instructs the spec writer to produce data matching it.

## Files Affected

- `src/prompts/evolve-plan.md` — modified: add frontmatter skills instructions to the TASK.md template section, including a short YAML example and clarification about mandatory vs recommended skills

## Acceptance Criteria

- [ ] `evolve-plan.md` instructs the spec writer to include skills in TASK.md YAML frontmatter
- [ ] Instructions distinguish between `skills.mandatory` (force-injected, critical for completion) and `skills.recommended` (instruction-based, situational references with load conditions)
- [ ] The existing body `## Skills` section is preserved — both sections coexist (explicitly stated in instructions)
- [ ] A short example of the frontmatter YAML format is included in the instructions
- [ ] Instructions state to omit `skills.recommended` entirely (not write empty array) when no recommended skills apply
- [ ] No code files are modified — only the markdown prompt template changes

## Risks and Edge Cases

- **Prompt injection timing:** evolve-plan.md is read during session startup. The change takes effect on the next evolve-plan sub-session — no existing TASK.md files are retroactively affected. This is correct behavior; Step 8 (prepareSession) handles backward compatibility by falling back to base skills when frontmatter is absent.
- **Spec writer compliance:** The spec writer is an LLM following instructions. There's no guarantee it will always include frontmatter skills. Step 8 must handle missing/malformed frontmatter gracefully — this is covered in Step 8's acceptance criteria but worth noting here as context for prompt design. Clear, specific instructions with an example reduce the risk of non-compliance.
- **Frontmatter placement:** YAML frontmatter must appear at the very top of TASK.md (before any content). Ensure instructions are clear about this — place `---` delimiters before the `# Task:` heading.
- **Duplication with body section:** If a spec writer lists different skills in frontmatter vs. body, Step 8 will use frontmatter (machine-readable) and ignore the body. Make this priority clear in the instructions: frontmatter is authoritative for runtime behavior; body is informational only.
