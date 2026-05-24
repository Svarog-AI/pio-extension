# Task: Update execute-task prompt to prioritize TASK.md skill recommendations

Add instructions to `src/prompts/execute-task.md` so the execute-task agent checks `TASK.md`'s `## Skills` section as a primary signal when deciding which skills to load.

## Context

Step 1 (completed) updated `evolve-plan.md` so every `TASK.md` now includes a `## Skills` section with targeted skill recommendations. Currently, the execute-task agent relies on `_skill-loading.md` for general skill-loading instructions and has hardcoded references to `test-driven-development` and `pio-git`. There is no instruction telling the agent to read `TASK.md`'s `## Skills` section — a gap this step closes. The specification writer (`evolve-plan`) has deeper context about each step than the executor, so its skill recommendations should be treated as a strong signal.

## What to Build

Modify `src/prompts/execute-task.md` to instruct the execute-task agent to:

1. Read the `## Skills` section from `TASK.md` as part of the setup/context phase
2. Prioritize loading skills explicitly listed in that section before falling back to heuristic scanning of `<available_skills>`
3. Treat TASK.md recommendations as targeted guidance from the specification writer who had deeper context about the step

The existing hardcoded references to `test-driven-development` and `pio-git` must remain unchanged — they serve as baseline defaults. The new instruction clarifies that TASK.md recommendations complement, not replace, the general skill-loading protocol from `_skill-loading.md`.

### Code Components

No TypeScript or logic changes. This is a prompt-only modification (markdown file). The change consists of adding a short paragraph to `src/prompts/execute-task.md`.

### Approach and Decisions

- Insert the new paragraph after the existing `test-driven-development` reference near the top of the prompt (the paragraph beginning "When writing tests and implementing features, follow the guidance from the `test-driven-development` skill."). This location is optimal because it appears in the introductory section where skill-loading context is already established, before the step-by-step process begins.
- The new text should instruct the agent to: check TASK.md's `## Skills` section when present, load those skills as a priority, and understand they are recommendations from the specification writer. It should also clarify this complements — not replaces — the general `_skill-loading.md` protocol.
- Do NOT modify the existing `test-driven-development` or `pio-git` references anywhere in the file. Add new text only.
- See `DECISIONS.md` for Step 1 decisions regarding the "no additional skills" fallback phrase and skill loading architecture.

## Skills

No additional skills recommended beyond the mandatory pio skill.

## Dependencies

Step 1 (add-skills-section-to-evolve-plan) must be completed first so that TASK.md files will actually contain a `## Skills` section for the execute-task agent to read. This ensures logical consistency: produce before consume.

## Files Affected

- `src/prompts/execute-task.md` — modified: add a short paragraph instructing the executor to check and prioritize TASK.md `## Skills` section when loading skills

## Acceptance Criteria

- `src/prompts/execute-task.md` contains instructions directing the executor to check `TASK.md`'s `## Skills` section and prioritize loading listed skills
- Existing references to `test-driven-development` skill are preserved (not removed or modified)
- Existing references to `pio-git` skill during commit step are preserved
- The new instruction clarifies that TASK.md recommendations complement — not replace — the general skill-loading protocol from `_skill-loading.md`

## Risks and Edge Cases

- **Placement matters:** Inserting the new paragraph in the wrong location could disrupt the flow of existing instructions. Place it after the `test-driven-development` reference near the top, before the "## Setup" section.
- **"No additional skills" case:** TASK.md may contain "No additional skills recommended beyond the mandatory pio skill." The new instruction should not cause the agent to error on this — it's a valid state meaning no extra skills are needed.
- **Prompt-only change:** No TypeScript files are modified. Verification is content-based (checking text exists in markdown) and programmatic (`npm run check` for type safety, `npm test` for regression). Per the `test-driven-development` skill, content-based tests for prompt files are not recommended — they break on rewording without indicating behavioral regression.
