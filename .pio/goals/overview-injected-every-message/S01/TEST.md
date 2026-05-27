# Test Coverage: Switch before_agent_start to systemPrompt delivery

Tests verify that the `before_agent_start` handler returns a `systemPrompt` string instead of a custom conversation `message`, preserving pi's base prompt as a prefix.

## Unit Tests

Given the `before_agent_start` handler is invoked with a populated `prompts` array, when the handler runs, then it returns an object with a `systemPrompt` property (not a `message` property).

Given `_event.systemPrompt` is `"base prompt"` and prompts contain capability instructions, when the handler returns, then the `systemPrompt` value starts with `"base prompt"`.

Given `prompts.length` is 0 (no project context, no skills, no capability prompt), when the handler runs, then it returns `undefined` (early return, no override).

Given the `prompts` array contains project overview, skill loading, and capability prompt sections, when the handler joins them, then the injection order is preserved: PROJECT OVERVIEW appears before SKILL LOADING INSTRUCTIONS, which appears before YOUR INSTRUCTIONS.

Given model resolution resolves a different model than the current one, when the handler runs, then `pi.setModel` is called and the same `result` object (with `systemPrompt`) is returned.

Given the current model already matches the resolved model, when the handler runs, then `pi.setModel` is not called and `result` is returned early.

## Programmatic Verification

Given `npx tsc --noEmit` is executed, when the command completes, then it reports no type errors.

Given `grep -n 'message:'` is run on the handler code, when searching for result construction, then no `message:` field appears in the result object.

Given `grep -n '_event.systemPrompt'` is run on the handler code, when searching for the concatenation, then `_event.systemPrompt` is prepended to the joined prompts.
