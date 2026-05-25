# Tests: Prompt file content verification

This step modifies only `.md` documentation files — no TypeScript code or behavioral logic is changed. Per the `test-driven-development` skill, documentation-only changes require **no unit tests**. Content-based tests for `.md` files (asserting specific words/phrases with `toContain`/`toMatch`) are an explicit anti-pattern: they break on harmless rewording without indicating behavioral regression.

## Unit Tests

(None — documentation-only changes. No unit tests apply.)

## Programmatic Verification

Given the TypeScript project when `npm run check` is run then it exits with code 0.
Given the test suite when `npm test` is run then all tests pass with no regressions.
Given `src/prompts/create-plan.md` when scanned for "use the grill-me skill" then the phrase is absent.
Given `src/prompts/create-plan.md` Skill References when inspected then it references both `pio-planning` and `grill-me`.
Given `src/prompts/revise-plan.md` when step headings are counted (outside code blocks) then there are 8 sequential steps.
Given `src/prompts/revise-plan.md` Step 5 when inspected then it is titled "Validate revision direction with the user" and declares WHAT outcomes without prescribing tool usage.
Given `src/prompts/revise-plan.md` Skill References when inspected then it references both `pio-planning` and `grill-me`, with step number references matching new numbering.
Given `src/prompts/create-goal.md` when inspected then it contains a Skill References section referencing both `pio-planning` and `grill-me`.
Given all three prompt files when scanned for "use the grill-me skill" phrasing then none contain it.
