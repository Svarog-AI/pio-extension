# Code Review: Create dead-turn detection and recovery module (Step 1)

## Decision
APPROVED

## Summary
The implementation is clean, well-structured, and faithfully follows the task specification. `turn-guard.ts` correctly detects thinking-only turns by checking that all content blocks are `type: "thinking"` with no tool results, then injects a recovery prompt via `pi.sendUserMessage()`. The module follows existing pio conventions (module-level state, `resources_discover` config detection, `setup*` pattern), is self-contained with no circular dependencies, and is backed by 13 passing unit tests covering all edge cases. The decision to use local interfaces instead of importing unexported framework types is a sound stability choice.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- [MEDIUM] `getAssistantContent` uses `event.message as { role?: string; content?: readonly ContentBlock[] }` — the cast relies on runtime shape assumptions about the private `AgentMessage` union. If the framework changes the structure of assistant messages, this could silently break. Documented rationale mitigates risk, but worth monitoring during framework upgrades. — `src/capabilities/turn-guard.ts` (line 78)

## Low Issues
- [LOW] `RECOVERY_PROMPT` is a module-level constant. If future requirements call for configurable or localized recovery messages, this would need refactoring. Acceptable for current scope (no config surface per GOAL.md). — `src/capabilities/turn-guard.ts` (line 87)

## Test Coverage Analysis
All acceptance criteria are covered:

| Acceptance Criterion | Test Coverage |
|---|---|
| `npm run check` passes | ✅ Verified (exit code 0, zero errors) |
| `setupTurnGuard` exported with `ExtensionAPI` param | ✅ Verified via grep + type check |
| `resources_discover` sets active-session flag | ✅ 2 tests: flag=true when pio-config found, flag=false when absent |
| `turn_end` detects thinking-only turns | ✅ 6 tests for `isThinkingOnlyTurn`: all-thinking, multiple-thinking, thinking+text, thinking+toolCall, empty content, text-only |
| `pi.sendUserMessage()` called with recovery prompt | ✅ 1 test: recovery sent on thinking-only turn; 1 test: NOT sent when text present |
| No imports from other pio capability files | ✅ Verified via grep (zero matches) |

Additional integration-level tests verify: handler registration, non-pio session guard, non-assistant message guard. Total: 13/13 tests passing.

## Gaps Identified
- **GOAL ↔ PLAN ↔ TASK ↔ Implementation**: Fully aligned. The step delivers exactly what the plan specifies — a self-contained turn-guard module with detection + recovery logic.
- **TASK ↔ TESTS**: All acceptance criteria from TASK.md have corresponding unit tests or programmatic checks in TEST.md. No gaps.
- **Implementation scope**: Only `src/capabilities/turn-guard.ts` was created (new file). No existing files were modified, keeping Step 1 cleanly isolated from Step 2 (wiring into `index.ts`).

## Recommendations
N/A — implementation is approved as-is. The medium issue (type cast in `getAssistantContent`) is documented and low-risk given the current framework version. Monitor during future pi framework upgrades.
