# Agent does not load available skills before executing tasks

## Problem

When given a task, the agent did not load relevant skills from `<available_skills>` even though they were listed in the system prompt. The agent proceeded to execute commands using raw bash and file reads instead of following skill-defined protocols.

## Observed behavior

- Available skills were listed in the system prompt (`ask-user`, `source-research`, `web-browser`, `pi-intercom`)
- Agent proceeded directly to bash commands and file reads without checking if any skill applied
- When asked about it, the agent claimed a "pio skill" was not available (true - no pio-specific skill exists), but failed to recognize that existing skills like `ask-user` could have been relevant for decision-making

## Expected behavior

The agent should:
1. Scan `<available_skills>` at task start to determine if any skill applies to the current context
2. Load relevant SKILL.md files before proceeding with implementation
3. Follow skill protocols (e.g., `ask-user` for ambiguous decisions, `source-research` for code investigation)

## Impact

- Missed opportunities for structured decision-making
- Potential violations of established workflows that skills enforce
- Inconsistent agent behavior across sessions

## Category
bug


## Category

bug

## Context

The <available_skills> block in the system prompt lists skills with descriptions and locations. The agent should read SKILL.md files when task context matches skill descriptions before proceeding with implementation.
