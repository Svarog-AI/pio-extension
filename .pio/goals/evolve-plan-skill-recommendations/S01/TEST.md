# Tests: Skill identification instructions and `## Skills` section in evolve-plan prompt

This verifies that `src/prompts/evolve-plan.md` contains the new skill identification instructions and the `## Skills` section in the TASK.md template. As this is a prompt-only change with no behavioral code, no unit tests apply — per the `test-driven-development` skill, content-based tests for prompt files break on any rewording without indicating behavioral regression. Verification relies on programmatic checks.

## Programmatic Verification

Given `src/prompts/evolve-plan.md` when grep for skill identification instructions before "Step 5" is run then instructions directing the specification writer to analyze step requirements against available skills are found.
Given `src/prompts/evolve-plan.md` when grep for the `## Skills` section in the TASK.md template is run then a Skills heading exists between "Approach and Decisions" and "Dependencies".
Given `src/prompts/evolve-plan.md` when grep for skill format guidance is run then the template shows skill name with one-sentence justification per entry.
Given `src/prompts/evolve-plan.md` when grep for bundled and external skill consideration is run then instructions mention both bundled (`src/skills/`) and external skills from `<available_skills>`.
Given `src/prompts/evolve-plan.md` when existing TASK.md sections are checked then all original sections (Context, What to Build, Code Components, Approach and Decisions, Dependencies, Files Affected, Acceptance Criteria, Risks and Edge Cases) are preserved with original ordering.
Given `src/prompts/evolve-plan.md` when grep for mandatory pio skill clarification is run then instructions clarify that `## Skills` lists additional recommendations beyond the mandatory `pio` skill.
Given the TypeScript project when `npm run check` is run then it exits with code 0 (no type errors introduced).
Given the test suite when `npm test` is run then all existing tests still pass (no regressions).
Given no TypeScript files when checking for modified `.ts` files then no TypeScript files were created or modified.
