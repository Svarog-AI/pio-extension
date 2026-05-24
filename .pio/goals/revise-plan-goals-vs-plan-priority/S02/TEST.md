# Tests: Priority hierarchy documentation in pio-planning/SKILL.md

This verifies that the new "Priority Hierarchy for Plan Revision" section was added to the shared planning skill with the correct content and structure. This is a markdown-only change — verification is programmatic (file content checks, type checking, existing test suite).

## Programmatic Verification

Given the SKILL.md file when the Priority Hierarchy section heading is searched then it exists as a top-level `##` heading.
Given the SKILL.md file when the priority hierarchy order is checked then it states "revision notes > archived PLAN.md > GOAL.md".
Given the SKILL.md file when the scope vs. implementation distinction is checked then it documents GOAL.md defines *what* and archived PLAN.md defines *how*.
Given the SKILL.md file when the three modification conditions are checked then all three are enumerated: revision notes require it, gaps discovered during specification, re-numbering after completed steps.
Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the existing test suite when npx vitest run is executed then all tests pass with no regressions.
