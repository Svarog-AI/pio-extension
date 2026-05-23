# Detect Agent Refinement Loops via Turn Count Threshold

Add a simple turn-count guard that nudges an agent when a single agent run exceeds a configurable number of turns. No tool-call matching, no signature tracking — just "this session has been running for too many turns, take a step back." Extends the existing `session-guard.ts` which already counts turns and sends recovery prompts.

## Current State

No loop detection exists. Agents can enter refinement loops — repeatedly rewriting the same file (e.g., `PLAN.md`) with incremental prose improvements without ever calling `pio_mark_complete`. This was observed during an `evolve-plan` session: the agent rewrote `PLAN.md` ~5 times across many turns, never shipping.

**Existing infrastructure in `src/guards/session-guard.ts`:**
- Tracks `isActivePioSession` via `resources_discover` (detects pio sub-sessions).
- Listens to `turn_end` events (which include `turnIndex`) for thinking-only turn detection.
- Sends recovery prompts via `pi.sendUserMessage()` when a dead-turn is detected.
- Tracks `pio_mark_complete` calls via `tool_call` and warns at `agent_end` if never called.
- Resets state at `before_agent_start`.

**No turn-count tracking or threshold enforcement exists.** The guard sees every `turn_end` event but doesn't count them or fire warnings based on turn volume. No configuration schema for a turn limit.

**`src/model-config.ts`** reads `~/.pi/pio-config.yaml` via `js-yaml` — precedent for adding new top-level config keys.

## To-Be State

`src/guards/session-guard.ts` is extended with a one-time turn-count nudge:

**Detection logic (added to existing session-guard.ts):**
- On each `turn_end` event, increment a per-run turn counter.
- When the counter reaches a configurable threshold, send a one-time user message to the agent and stop counting (no repeats within the same run).
- Reset the counter at `before_agent_start` (next run starts fresh).

**Warning behavior:**
- Fires exactly once per agent run when the threshold is hit.
- Sends a nudge via `pi.sendUserMessage()` encouraging self-diagnosis: "Take a step back. You've been running for [N] turns. Recap what you're trying to accomplish, evaluate if you're stuck in a loop, and ship your work if it's ready."
- Does NOT block execution or interrupt the agent. Just sends a follow-up message.

**Configuration:**
- Threshold is configurable via `~/.pi/pio-config.yaml` with a default value (to be determined during planning — e.g., 10–15 turns).
- Reading config follows the existing pattern from `src/model-config.ts`.
- If config is missing or invalid, falls back to the hard-coded default.

**Respects pio session scope:** Active only when `isActivePioSession` is true (same guard as thinking-only detection and mark-complete tracking). Does not fire in non-pio sessions.

**Testing:**
- Tests in colocated `src/guards/session-guard.test.ts` cover the turn threshold logic: counter increments on `turn_end`, warning fires exactly once at threshold, resets at `before_agent_start`.
- Mock `ExtensionAPI`, verify `pi.sendUserMessage` is called once with the expected message content.

**Out of scope:** Per-capability thresholds (single global threshold for v1). Blocking or interrupting the agent. Tool-call matching (explicitly not done — turn count is the sole signal). Time-based detection.
