# Decisions (carried forward from Step 1)

## Plan Deviations
- None — Step 1 implementation followed PLAN.md exactly.

## Architecture Decisions
- **System prompt delivery via `systemPrompt`:** `before_agent_start` now returns `{ systemPrompt: _event.systemPrompt + "\n\n" + prompts.join("\n\n") }`. The `message` field is removed entirely — no dual-delivery. This affects all test assertions that referenced `result.message`.
- **Base prompt preservation via explicit prepend:** Pi's framework uses last-writer-wins for `systemPrompt` (confirmed in `runner.js:728-729`). We must explicitly include `_event.systemPrompt` as a prefix — the framework does not auto-chain.

## Test Implications
- The 5 failing tests all assert against `result.message?.customType === "pio-capability-instructions"` or read content from `result.message?.content?.[0]?.text`. These must be updated to read from `result.systemPrompt` instead, which is a plain string (not a structured message object).
- A new test must verify `_event.systemPrompt` is preserved as a prefix in the returned `systemPrompt`.
