# Decisions (carried from Step 1)

## Skill Loading Architecture

- The mandatory `pio` skill is always loaded via `_skill-loading.md`; the `## Skills` section in `TASK.md` lists only *additional* recommendations. This distinction affects how execute-task should interpret the section — listed skills are supplementary to the baseline `pio` skill.
- The `## Skills` template entry includes a "no additional skills" fallback phrase: "No additional skills recommended beyond the mandatory pio skill." Downstream prompts or tooling that parse TASK.md should handle this case gracefully.

## Prompt Structure

- The skill identification instruction block is named "Step 4.5" (inserted between Steps 4 and 5) to avoid renumbering existing steps that downstream agents may reference by number. Any future prompt modifications should preserve this numbering convention.
