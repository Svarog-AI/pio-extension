---
totalSteps: 2
steps:
  - name: switch-before-agent-start-to-systemprompt
    complexity: task
  - name: update-tests-for-systemprompt
    complexity: task
---

# Plan: Fix Overview Injected Every Message

Stop re-injecting the project overview, skill loading instructions, and capability prompt as a custom conversation message on every turn. Deliver them once via `systemPrompt` instead — persistent across turns without accumulating in history.

## Prerequisites

None.

## Steps

### Step 1: Switch before_agent_start to systemPrompt delivery

**Description**

Change the `before_agent_start` handler in `session-capability.ts` to return `{ systemPrompt: <combined string> }` instead of `{ message: { customType: "pio-capability-instructions", ... } }`.

The combined string concatenates `_event.systemPrompt` (pi's base prompt) with the three injection blocks, preserving order: project overview → skill loading instructions → capability prompt. This is necessary because the framework uses last-writer-wins for `systemPrompt` (confirmed in `runner.js:728-729`), so we must explicitly preserve the base prompt.

Specific changes:
- Remove the custom message object construction (`{ message: { customType, content, display, details } }`)
- Replace with `{ systemPrompt: _event.systemPrompt + "\n\n" + prompts.join("\n\n") }`
- Keep the early return `if (prompts.length === 0) return` — if nothing to inject, no system prompt override needed
- Leave the model-switching logic (`resolveModelForCapability`, `pi.setModel`) unchanged; it's independent and already references the result variable correctly

**Acceptance Criteria**

- `npx tsc --noEmit` reports no errors
- The handler returns `{ systemPrompt: ... }` containing `_event.systemPrompt` as a prefix
- The handler does not return a `message` field in the result
- The injection order is preserved: project overview → skill loading instructions → capability instructions

**Files Affected**

- `src/capabilities/session-capability.ts` — change return type from `message` to `systemPrompt`, remove custom message construction

### Step 2: Update tests for systemPrompt delivery

**Description**

Update the test assertions in `session-capability.test.ts` to match the new return shape. Several tests currently assert against `result.message?.customType === "pio-capability-instructions"` and check message content text. These need to verify `result.systemPrompt` instead.

Tests affected (in the existing file):
- `"prompt injection still works alongside model resolution"` — asserts `result.message?.customType`
- `"given before_agent_start with mandatory skills..."` — asserts `result.message?.customType` and checks text content from `result.message?.content?.[0]?.text`
- `"given before_agent_start when the handler runs then delivery order is PROJECT OVERVIEW..."` — checks text ordering via `result.message?.content?.[0]?.text`
- `"given the skill registry is populated via systemPromptOptions.skills..."` — checks `result.message?.content?.[0]?.text`
- `"resources_discover — skill loading uses buildSkillLoadingSection"` — checks `result.message?.content?.[0]?.text`

Additionally, add a test verifying that `_event.systemPrompt` is preserved as a prefix in the returned `systemPrompt`, to guard against accidentally overwriting pi's base prompt.

**Acceptance Criteria**

- `npx tsc --noEmit` reports no errors
- `npx vitest run src/capabilities/session-capability.test.ts` passes with no regressions
- All previously passing tests still pass with updated assertions
- A new test verifies `_event.systemPrompt` is preserved as a prefix

**Files Affected**

- `src/capabilities/session-capability.test.ts` — update assertions from `result.message` to `result.systemPrompt`, add base-prompt-preservation test

## Notes

- **Framework chaining is last-writer-wins:** `runner.js:728-729` shows `currentSystemPrompt = result.systemPrompt`. We must explicitly prepend `_event.systemPrompt` — the framework does not auto-chain or append.
- **No other extensions return `systemPrompt`:** Only pio-extension registers a `before_agent_start` handler that returns prompt content. If another extension is added later that also returns `systemPrompt`, order of registration matters (last writer wins).
- **Model-switching logic is unaffected:** The model resolution code (`resolveModelForCapability`, `pi.setModel`) runs after prompt injection and references the same `result` variable — no change needed.
- **The `message` field and `systemPrompt` field are independent in `BeforeAgentStartEventResult`:** Both are optional. Returning only `systemPrompt` (without `message`) is fully supported by the framework.
