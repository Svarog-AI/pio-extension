# Tests: Jira Config Setup section in SKILL.md

This verifies that the new "Jira Config Setup" section is correctly added to `src/skills/pio-jira/SKILL.md` with proper content, placement, and line budget compliance.

Since this is a documentation-only change (modifying a `.md` skill file), no unit tests apply. Per TDD guidelines, content-based tests for prompts and messages are an anti-pattern — they break on any rewording without indicating a behavioral regression. All verification is programmatic.

## Programmatic Verification

Given SKILL.md when grepped for `## Jira Config Setup` then the heading exists (exit code 0).
Given SKILL.md when line count is checked with `wc -l` then total lines are ≤ 100.
Given SKILL.md when grepped for `ask_user` in the Config Setup section then it instructs agents to use ask_user.
Given SKILL.md when grepped for `setup-config.sh` then the correct script path `scripts/setup-config.sh` is referenced.
Given SKILL.md when grepped for `SITE` and `PROJECT_KEY` in the Config Setup section then the three-field script signature is documented.
Given SKILL.md when grepped for auth status check reference in the Config Setup section then auth prerequisite is mentioned.
Given SKILL.md when the Config Setup section position is checked then it appears after "Auth Status Check" and before "Pull Jira → Local Issue".
Given SKILL.md when grepped for `REFERENCE.md` in the Config Setup section then a pointer to REFERENCE.md exists.
Given SKILL.md when existing sections are compared to the original then all pre-existing content is preserved verbatim.
Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
