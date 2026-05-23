# Session Run End Guard

Prevent pio sub-session agents from terminating naturally without having called `pio_mark_complete`. At `agent_end`, check whether any tool call during the run was `pio_mark_complete`. If not, emit a final warning message so the user sees that the session ended without proper completion.

## Current State

**Turn guard** (`src/guards/turn-guard.ts`) already detects dead turns at `turn_end` — but only for the narrower case of *thinking-only* turns (no tool calls, no visible text). It uses a single recovery prompt and does not track cumulative failures across turns. The guard sets `isActivePioSession` on `resources_discover` and sends `pi.sendUserMessage(RECOVERY_PROMPT)` when it detects thinking-only content.

**Exit-gate validation** (`src/guards/validation.ts`) already manages session-level counters: `warnedOnce` (reset each `turn_start`) and `warningsThisSession` (capped at `MAX_WARNINGS = 3`). The exit-gate currently blocks `session_before_switch` when expected output files are missing — but this is commented out. The file-protection logic (default-deny for `.pio/` writes, write-allowlist, read-only blocklist) remains active via the `tool_call` handler.

**Gap:** Neither guard prevents the agent from terminating without calling `pio_mark_complete`. If an agent finishes its work but forgets to mark completion, or if it gets confused and terminates early, the session ends silently — with no validation of expected outputs and no notification to the user.

**Events available:** `agent_end` (fires once when the agent loop exits; provides `messages: AgentMessage[]` for full conversation history), `tool_call` (intercept to detect `pio_mark_complete` calls), `resources_discover` (session initialization). The pi `ExtensionAPI` provides `pi.sendUserMessage()` for sending final warnings.

## To-Be State

A new guard mechanism integrated into `src/guards/turn-guard.ts` (alongside existing thinking-only detection) enforces that every agent run includes a `pio_mark_complete` call before terminating:

1. **Completion tracking:** A session-level boolean flag (`markCompleteCalled`) set to `true` when a `tool_call` event fires with `toolName === "pio_mark_complete"`. Reset to `false` on `resources_discover` (new session).

2. **Check at `agent_end`:** Subscribe to the `agent_end` event. When it fires, read the full conversation from `event.messages`. If `markCompleteCalled` is still `false`, send a final warning via `pi.sendUserMessage()` informing the user that the agent completed its run without calling `pio_mark_complete` — indicating the session ended without proper validation.

3. **No per-turn escalation:** The guard fires once at session end, not at every turn. This avoids noisy mid-run interruptions for legitimate multi-step work (reading files, running formatters, etc.).

4. **Session lifecycle integration:** Flag resets on `resources_discover`. No interference with existing file protection, write-allowlist, thinking-only dead-turn detection, or exit-gate validation — the new guard is additive and independent.

The user will now receive a clear notification if any agent run terminates without calling `pio_mark_complete`, instead of silently ending with no output.
