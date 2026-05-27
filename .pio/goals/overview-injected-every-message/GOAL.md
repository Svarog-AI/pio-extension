# Fix Overview Injected Every Message

The `--- PROJECT OVERVIEW ---` section (along with skill loading instructions and capability prompts) is re-injected as a custom conversation message on **every** `before_agent_start` event. This means thousands of tokens are duplicated into the context window on every single turn, with no added value after the first turn since the agent already has this context in history.

## Current State

Injection happens in `src/capabilities/session-capability.ts` inside the `before_agent_start` event handler (line ~356). On every invocation:

1. **Project context** is read from `.pio/PROJECT/OVERVIEW.md` and prepended with `--- PROJECT OVERVIEW ---`. The file content is cached at module level (`projectContext`) to avoid re-reading from disk, but the cached string is still re-sent as a message each turn.
2. **Skill loading instructions** are built dynamically via `buildSkillLoadingSection()` — includes full content of mandatory skills (pio, ask-user) plus recommended skill listings. The pi framework passes the skill registry via `_event.systemPromptOptions.skills` on every event.
3. **Capability-specific prompt** is read from `src/prompts/<name>.md` and prepended with `--- YOUR INSTRUCTIONS ---`. Cached at module level as `systemPrompt`, but still re-sent each turn.

These three blocks are joined into a single custom message (`role: "custom"`, `customType: "pio-capability-instructions"`) returned as the `before_agent_start` result with `display: false`. Pi's agent runner pushes this into the messages array for **every user input**:

- Pi framework `dist/core/agent-session.js:_handleUserInput()` calls `emitBeforeAgentStart()` right before building the messages array
- The returned custom messages are pushed into the messages array, which gets sent to the LLM via `this.agent.prompt(messages)`
- This repeats for every user message — including tool result callbacks that trigger new agent turns

The `resources_discover` hook (same file) runs only once and correctly caches config. The problem is exclusively in the `before_agent_start` handler, which fires per-turn and always returns a custom message.

## To-Be State

Return the capability instructions via `systemPrompt` on `BeforeAgentStartEventResult` instead of returning a custom conversation message (`message`).

The `systemPrompt` return value replaces the system prompt for the turn — it persists across all turns without accumulating in the conversation history. This is the correct semantic fit: role instructions and project context are persistent agent guidance, not turn-specific conversation content. Using the system prompt channel also eliminates any concern about context compaction removing early messages, since the system prompt is re-applied every turn anyway.

Implementation approach:
- The `before_agent_start` handler in `src/capabilities/session-capability.ts` should return `{ systemPrompt: <combined string> }` instead of (or in addition to) `{ message: { customType: ..., content: [...] } }`
- The combined system prompt should append the project overview, skill loading instructions, and capability prompt to pi's base system prompt (`_event.systemPrompt`)
- Preserve the existing injection order: project overview → skill loading → capability instructions
- Remove the custom message return entirely — no more `message` in the result object. This eliminates per-turn accumulation entirely.
- The model-switching logic (also in `before_agent_start`) is independent and should remain unchanged

**Why systemPrompt over a one-time custom message:** The original code comment ("*This preserves pi's full default system prompt while delivering our capability instructions as conversation context*") reveals the original intent was to avoid replacing pi's system prompt. However, accumulating identical messages per-turn is worse than appending to the system prompt. The `BeforeAgentStartEventResult.systemPrompt` field explicitly supports this use case: "Replace the system prompt for this turn." Pi chains multiple extension returns when multiple extensions return `systemPrompt`, and resets to base when none do — so appending our content to `_event.systemPrompt` is the supported pattern.

Files affected:
- `src/capabilities/session-capability.ts` — change `before_agent_start` handler to return `systemPrompt` instead of `message`
- Potentially test file(s) if the current behavior is explicitly tested elsewhere

## Open Assumptions

- **System prompt chaining:** Assumes that returning `systemPrompt: _event.systemPrompt + "\n\n" + pioInstructions` correctly preserves pi's default system prompt while appending our instructions. The framework docs say "If multiple extensions return this, they are chained" — need to verify this means last-writer-wins with chain support, or if we need to explicitly preserve the base prompt.
- **System prompt length limits:** Some providers have practical limits on system prompt size. Appending thousands of tokens of project overview + skills + capability prompts could push the total beyond comfortable limits for some models. This is an existing concern (same content, different delivery channel) — not a regression from this change, but worth noting if token budgets are tight.
