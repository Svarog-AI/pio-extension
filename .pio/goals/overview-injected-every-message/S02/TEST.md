# Test Coverage

Tests verify that the `before_agent_start` handler returns `systemPrompt` (a plain string) instead of the old `message` object with `customType: "pio-capability-instructions"`.

## Test Cases

- Given the handler runs with a capability that has a prompt file, when before_agent_start fires, then `result.systemPrompt` is a non-empty string containing `--- YOUR INSTRUCTIONS ---`.
- Given the handler runs with mandatory skills in the registry, when before_agent_start fires, then `result.systemPrompt` contains `--- SKILL LOADING INSTRUCTIONS ---` and the skill XML tag.
- Given the handler runs with project context, skills, and capability prompt all available, when before_agent_start fires, then `result.systemPrompt` contains all three sections in order: PROJECT OVERVIEW before SKILL LOADING INSTRUCTIONS before YOUR INSTRUCTIONS.
- Given the skill registry is populated via `systemPromptOptions.skills`, when before_agent_start fires, then `result.systemPrompt` contains the cached skill XML tag.
- Given before_agent_start runs with mandatory skills from `buildSkillLoadingSection`, when the handler returns, then `result.systemPrompt` contains the dynamically generated skill content.
- Given `_event.systemPrompt` has a non-empty base prompt value, when before_agent_start fires, then `result.systemPrompt` starts with the base prompt string and appended pio instructions follow after the `\n\n` separator.

## Programmatic Verification

- `npx tsc --noEmit` passes with no errors.
- `npx vitest run src/capabilities/session-capability.test.ts` passes all 37 tests.
- `grep -c 'result.message?.customType' src/capabilities/session-capability.test.ts` returns 0 (no old assertions remain).
