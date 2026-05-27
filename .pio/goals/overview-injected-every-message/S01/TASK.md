---
skills:
  mandatory:
    - tdd
---

# Task: Switch before_agent_start to systemPrompt delivery

Change the `before_agent_start` handler to return `{ systemPrompt: ... }` instead of `{ message: { customType: "pio-capability-instructions", ... } }` — eliminating per-turn accumulation of identical instructions in the conversation history.

## Context

Currently, on every `before_agent_start`, the handler returns a custom conversation message containing the project overview, skill loading instructions, and capability prompt. Pi's agent runner pushes this into the messages array for every user input and every tool result callback. This duplicates thousands of tokens across all turns with no added value after the first turn.

The fix: use `BeforeAgentStartEventResult.systemPrompt` instead. The framework replaces the system prompt for the turn — it persists across turns without accumulating in history. Since the framework uses last-writer-wins (`runner.js:728-729`: `currentSystemPrompt = result.systemPrompt`), we must explicitly prepend `_event.systemPrompt` to preserve pi's base prompt.

## What to Build

Modify the `before_agent_start` event handler in `src/capabilities/session-capability.ts` to return a `systemPrompt` string instead of a `message` object. The combined string concatenates `_event.systemPrompt` (pi's base prompt) with the three injection blocks, preserving order: project overview → skill loading instructions → capability prompt.

### Code Components

#### Change the return value in `before_agent_start`

**Current code (lines ~365-378):**
```ts
const result = {
  message: {
    customType: "pio-capability-instructions",
    content: [{ type: "text" as const, text: prompts.join("\n\n") }],
    display: false,
    details: {},
  },
};
```

**New code:**
```ts
const result = {
  systemPrompt: _event.systemPrompt + "\n\n" + prompts.join("\n\n"),
};
```

The `result` variable is a plain object with shape matching `BeforeAgentStartEventResult`. No TypeScript type annotation required — inference from the return value is sufficient.

#### Preserve `_event.systemPrompt` as a prefix

This is critical: the framework assigns `currentSystemPrompt = result.systemPrompt` (last-writer-wins). If we don't prepend `_event.systemPrompt`, pi's base system prompt is lost entirely. The concatenation must use `"\n\n"` as separator to maintain visual separation from our injected content.

#### Preserve injection order

The `prompts` array is already built in the correct order:
1. `--- PROJECT OVERVIEW ---\n\n${projectContext}` (if available)
2. Skill loading section from `buildSkillLoadingSection()` (if generated)
3. `--- YOUR INSTRUCTIONS ---\n\n${systemPrompt}` (capability prompt, if available)

This order must remain unchanged. The only change is how the combined string is delivered (systemPrompt vs message).

#### Keep model-switching logic intact

After constructing `result`, the model-switching block runs:
```ts
if (capabilityName && ctx.modelRegistry) {
  const resolved = resolveModelForCapability(capabilityName);
  // ...setModel logic...
}
return result;
```

This must remain unchanged. It references the same `result` variable — only the shape of that object changes.

#### Update the comment block

Update the comment preceding the `before_agent_start` handler registration to reflect the new approach:

**Old comment:**
```ts
// 2. Inject capability prompt as a custom conversation message for all turns.
//    This PRESERVES pi's default system prompt (identity, tools, guidelines,
//    skills, metadata) while layering our role-specific instructions on top
//    as a steering message in the conversation.
```

**New comment:** should reflect that we now use `systemPrompt` delivery instead of custom messages.

### Approach and Decisions

- Follow the pattern described in GOAL.md: append to `_event.systemPrompt`, don't replace it.
- The `message` field is removed entirely — no dual-delivery (both message + systemPrompt).
- The early return `if (prompts.length === 0) return;` remains unchanged — if nothing to inject, no override needed.
- No changes to `resources_discover`, skill injection, model resolution, or any other event handler.

## Skills

No additional skills recommended beyond the mandatory pio and tdd skills.

## Dependencies

None. This is Step 1 — no prior steps exist.

## Files Affected

- `src/capabilities/session-capability.ts` — change `before_agent_start` handler to return `systemPrompt` instead of `message`, update comment block

## Acceptance Criteria

- `npx tsc --noEmit` reports no errors
- The handler returns `{ systemPrompt: ... }` where the string contains `_event.systemPrompt` as a prefix (i.e., the returned `systemPrompt` starts with the value of `_event.systemPrompt`)
- The handler does not return a `message` field in the result object
- The injection order is preserved in the `systemPrompt` string: `--- PROJECT OVERVIEW ---` appears before `--- SKILL LOADING INSTRUCTIONS ---`, which appears before `--- YOUR INSTRUCTIONS ---`
- The model-switching logic (resolveModelForCapability, pi.setModel) still runs and references the same `result` variable
- The early return when `prompts.length === 0` is preserved — handler returns undefined when nothing to inject

## Risks and Edge Cases

- **`_event.systemPrompt` could be empty or undefined:** In tests, `_event.systemPrompt` is often `""` (empty string). The concatenation `_event.systemPrompt + "\n\n" + prompts.join("\n\n")` must handle this gracefully — the type definition declares it as `string` (not optional), so it should always be present. If empty, the result starts with `"\n\n"` followed by our content — acceptable behavior.
- **The `result` variable is used in the model-switching block:** After we change its shape from `{ message: ... }` to `{ systemPrompt: ... }`, all references to `result` in the model-switching code (`return result`) must still work since they return the object as-is. Verify no code accesses `result.message` after this point.
- **Existing tests assert against `result.message`:** Step 2 handles test updates — do NOT modify tests in this step. The tests will fail temporarily until Step 2 runs. This is expected and correct (TDD: implementation first, tests follow for behavior change).
