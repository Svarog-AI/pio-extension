# Tests: evolve-plan prompt — TASK.md frontmatter skills instructions

This verifies that `evolve-plan.md` instructs the spec writer to include skills in TASK.md YAML frontmatter, distinguishing mandatory vs recommended skills, preserving the body `## Skills` section, and providing a YAML example.

No unit tests apply — this is a prompt-only change (markdown template). Per TDD methodology, content-based tests for prompts are excluded as they break on any rewording without indicating behavioral regressions.

## Programmatic Verification

Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
Given the existing test suite when `npm test` is run then all tests pass with no regressions.
Given `evolve-plan.md` when searched for "skills.mandatory" then at least one match exists.
Given `evolve-plan.md` when searched for "skills.recommended" then at least one match exists.
Given `evolve-plan.md` when searched for frontmatter YAML example with "---" delimiters then a YAML snippet with skills block exists.
Given `evolve-plan.md` when searched for instruction to preserve the body "## Skills" section then the prompt explicitly states both sections coexist.
Given `evolve-plan.md` when searched for instruction to omit recommended when empty then the prompt states to omit `skills.recommended` entirely (not write empty array).
