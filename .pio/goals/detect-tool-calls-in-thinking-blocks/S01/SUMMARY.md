# Summary: Create dead-turn detection and recovery module

## Status
COMPLETED

## Files Created
- `src/capabilities/turn-guard.ts` — Dead-turn detection and recovery handler module. Exports `setupTurnGuard(pi: ExtensionAPI)` which registers `resources_discover` (detects pio sub-sessions) and `turn_end` (detects thinking-only turns and sends recovery prompts). Also exports `isThinkingOnlyTurn(content, toolResults)` as a pure helper for unit testing, and `__testSetActiveSession()` for test access to internal state.

## Files Modified
- (none — `__tests__/turn-guard.test.ts` existed from the prior review iteration)

## Files Deleted
- (none)

## Decisions Made
- **Minimal local interface (`ContentBlock`) instead of importing framework types:** The pi framework uses `AgentMessage`, `ThinkingContent`, and `ToolResultMessage` internally but does not re-export them from the main package. These types live in private sub-packages (`@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`) that are not guaranteed to be stable public APIs. A local `interface ContentBlock { type: string }` provides compile-time safety against typos in block-type discriminators while remaining stable across framework versions. Documented inline with a comment explaining the rationale.
- **Helper function (`getAssistantContent`) for message narrowing:** Bridges the gap between the typed `TurnEndEvent` (which is exported) and the unexported `AgentMessage` union. Extracts content blocks safely, returning `undefined` for non-assistant messages. Avoids raw `as` casts in the event handler.
- **Test-only accessor renamed to `__testSetActiveSession`:** Clearly marked with `__test` prefix and `@internal` JSDoc tag. Prevents accidental use in production code (e.g., Step 2's wiring in `index.ts`).

## Test Coverage
- **13 unit tests** in `__tests__/turn-guard.test.ts` (all passing):
  - 6 tests for `isThinkingOnlyTurn`: all-thinking, multiple-thinking, thinking+text, thinking+toolCall, empty content, text-only
  - 7 tests for `setupTurnGuard`: resources_discover registration, flag set true/false, turn_end registration, non-pio guard, non-assistant guard, recovery on thinking-only, no-recovery when text present
- **TypeScript type check:** `npm run check` passes with zero errors
- **Programmatic verification:** All grep-based checks confirm correct exports, handler registration, and import hygiene

## Review Feedback (addressed)
The first submission was rejected due to two HIGH issues:
1. **Type safety (`unknown[]` → `ContentBlock[]`):** Replaced all `unknown[]` parameters with the typed `ContentBlock` interface. The `turn_end` handler now uses `getAssistantContent()` which returns properly typed content blocks, eliminating manual casts like `(block as { type?: string }).type`.
2. **Test helper naming (`setTestActiveSession` → `__testSetActiveSession`):** Renamed with `__test` prefix and added `@internal` JSDoc to clearly mark it as test-only infrastructure that should not be imported in production code.
