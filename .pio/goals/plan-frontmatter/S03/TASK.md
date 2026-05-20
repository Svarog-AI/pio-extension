# Task: Update create-plan prompt to instruct frontmatter writing

Instruct the Planning Agent to include YAML frontmatter with `totalSteps` at the top of every PLAN.md it generates.

## Context

Currently, `src/prompts/create-plan.md` does not mention YAML frontmatter at all. The Planning Agent writes PLAN.md starting with a title (`# Plan: <Goal Name>`). With the plan-frontmatter goal, PLAN.md must start with a frontmatter block containing `totalSteps`. This requires updating the prompt so the Planning Agent knows to produce it.

Schema (`PLAN_FRONTMATTER_SCHEMA`) and infrastructure (`planMetadata()`, postValidate) are handled by other steps (1, 2, 4). This step is purely about updating agent instructions.

## What to Build

Modify `src/prompts/create-plan.md` to add instructions for writing YAML frontmatter. The changes fall into two areas:

### 1. Add a frontmatter instruction in the Plan.md output description

In or near the section that describes what PLAN.md should look like (currently Step 5: "Write PLAN.md"), add clear instructions that the Planning Agent must include a YAML frontmatter block at the very top of PLAN.md before any other content. The instructions should specify:

- Frontmatter delimiters: `---` on their own line, surrounding the YAML content
- The only required field: `totalSteps` as an integer
- The value must equal the count of steps being created in this plan
- Frontmatter appears **before** the document title (`# Plan: ...`)

### 2. Update the example PLAN.md structure

The prompt currently shows a template starting with `# Plan: <Goal Name>`. Prepend the frontmatter block to this template so it demonstrates the correct format:

```markdown
---
totalSteps: 5
---
# Plan: <Goal Name>
...
```

### Code Components

This is a prompt file change — no new TypeScript code. The modifications are confined to `src/prompts/create-plan.md` only.

### Approach and Decisions

- **Inject into existing structure:** Add frontmatter instructions within Step 5 ("Write PLAN.md") where the PLAN.md template is described. This is the natural location since it's where the agent learns the file format.
- **Update the markdown template verbatim:** The code block showing the PLAN.md structure (Step 5) should be updated to include the frontmatter block at the top, demonstrating the correct format with a placeholder value for `totalSteps`.
- **Keep other sections unchanged:** Do not modify Steps 1–4, Step 6, Guidelines, or the Example Interaction Flow section unless they directly reference PLAN.md structure in a way that becomes inconsistent.
- **Reference DECISIONS.md conventions:** Follow the prompt modification convention from `DECISIONS.md` — inject new instructions into existing sections without restructuring the prompt.

## Dependencies

- Step 1 (schema) and Step 2 (GoalState) must be completed so the frontmatter format is well-defined, but this step does not import any code from them. It only needs to know the frontmatter format: `totalSteps` as an integer in a YAML block delimited by `---`.

## Files Affected

- `src/prompts/create-plan.md` — modified: add frontmatter instructions and update example PLAN.md template

## Acceptance Criteria

- [ ] Prompt instructs Planning Agent to include `---\ntotalSteps: N\n---` at the top of PLAN.md
- [ ] Example PLAN.md structure in the prompt shows the frontmatter block before `# Plan: <Goal Name>`
- [ ] Instructions state that `totalSteps` must equal the actual number of steps
- [ ] No other behavior or sections of the prompt are changed (no modification to Steps 1–4, Step 6, Guidelines, or Example Interaction Flow)
- [ ] Existing test suite (`npm test`) passes with no regressions
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Prompt parsing:** Ensure the frontmatter delimiters (`---`) in the example don't conflict with any markdown rendering. Use proper code fences to prevent ambiguity.
- **Instruction clarity:** The agent could misinterpret `totalSteps` as optional if not clearly stated as required. Use unambiguous language ("must include", "mandatory").
- **Regression risk:** Modifying a prompt file could inadvertently change agent behavior in unexpected ways. Keep changes minimal and focused on the frontmatter addition only.
