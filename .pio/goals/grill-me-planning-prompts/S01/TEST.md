# Tests: Rewrite grill-me skill as a reusable technique guide

This verifies that `src/skills/grill-me/SKILL.md` has been completely rewritten as a proper technique guide covering four usage contexts, with broadened frontmatter description and proper skill structure.

Per the TDD skill, content-based tests for `.md` files are excluded — these tests break on any rewording without indicating a behavioral regression. Verification relies on programmatic checks and manual acceptance criteria.

## Programmatic Verification

Given the TypeScript project when `npm run check` (tsc --noEmit) is run then it exits with code 0.
Given the existing test suite when `npm test` is run then all tests pass with no regressions.
Given the rewritten SKILL.md file when line count is checked then it exceeds 50 lines (structurally substantial, not an incremental augmentation).
Given the SKILL.md frontmatter when the description field is read then it is under 1024 characters.
Given the SKILL.md frontmatter when the description field is read then it mentions all four contexts (goal definition, plan creation, plan revision, stress-testing).
Given the SKILL.md body when searched for capability-specific filenames then no references to `create-goal.md`, `create-plan.md`, `revise-plan.md`, or `execute-task.md` are found.
Given the SKILL.md body when searched for context sections then all four usage contexts have dedicated sections (goal definition, plan creation, plan revision, reactive stress-testing).
Given the SKILL.md body when searched for skill relationships then it references both `pio-planning` and `ask-user` by skill name.
Given the SKILL.md body when searched for the pio-planning relationship section then it states the timing vs. technique distinction (pio-planning = when to engage, grill-me = how to probe).
