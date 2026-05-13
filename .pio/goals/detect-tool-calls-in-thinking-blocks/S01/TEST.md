# Tests: Create dead-turn detection and recovery module

## Unit Tests

**File:** `__tests__/turn-guard.test.ts`  
**Test runner:** Vitest (`npm run test`)  
**Prerequisite for testability:** The dead-turn detection logic should be extracted into a pure, exported helper function (e.g., `isThinkingOnlyTurn(content, toolResults)`) that the `turn_end` handler calls. This enables unit testing without mocking the full ExtensionAPI.

### `describe('isThinkingOnlyTurn')` — pure detection logic

**"all thinking blocks + empty toolResults → true"**  
- Arrange: content = [{ type: "thinking", thinking: "..."}], toolResults = []  
- Act: call `isThinkingOnlyTurn(content, toolResults)`  
- Assert: returns `true`

**"multiple thinking blocks + no toolResults → true"**  
- Arrange: content = [{ type: "thinking", thinking: "a" }, { type: "thinking", thinking: "b" }], toolResults = undefined  
- Act: call `isThinkingOnlyTurn(content, toolResults)`  
- Assert: returns `true`

**"thinking + text block → false (has user-facing output)"**  
- Arrange: content = [{ type: "thinking", thinking: "..." }, { type: "text", text: "hello" }], toolResults = []  
- Act: call `isThinkingOnlyTurn(content, toolResults)`  
- Assert: returns `false`

**"thinking + toolCall block → false (has tool calls in content)"**  
- Arrange: content = [{ type: "thinking", thinking: "..." }, { type: "toolCall", id: "x", name: "read", arguments: {} }], toolResults = []  
- Act: call `isThinkingOnlyTurn(content, toolResults)`  
- Assert: returns `false`

**"empty content → false (not thinking-only)"**  
- Arrange: content = [], toolResults = []  
- Act: call `isThinkingOnlyTurn(content, toolResults)`  
- Assert: returns `false`

**"text only + no toolResults → false"**  
- Arrange: content = [{ type: "text", text: "response" }], toolResults = []  
- Act: call `isThinkingOnlyTurn(content, toolResults)`  
- Assert: returns `false`

### `describe('setupTurnGuard')` — handler registration

These tests verify that `setupTurnGuard(pi)` registers the expected event handlers. Use a mock `ExtensionAPI` where `pi.on(event, handler)` captures callbacks in a map for later invocation.

**"registers resources_discover handler"**  
- Arrange: Create mock ExtensionAPI with empty handler registry. Mock `sessionManager.getEntries()` to return [{ type: "custom", customType: "pio-config", data: {} }].  
- Act: Call `setupTurnGuard(mockPi)`.  
- Assert: A handler was registered for `"resources_discover"`. After invoking it, the internal session flag is `true`.

**"resources_discover sets flag false when no pio-config"**  
- Arrange: Mock `sessionManager.getEntries()` to return [] (no custom entries).  
- Act: Call `setupTurnGuard(mockPi)`, invoke the `resources_discover` handler.  
- Assert: The internal session flag is `false`.

**"registers turn_end handler"**  
- Arrange: Create mock ExtensionAPI. Track calls to `pi.sendUserMessage()`.  
- Act: Call `setupTurnGuard(mockPi)`.  
- Assert: A handler was registered for `"turn_end"`.

**"turn_end does nothing when not in pio session"**  
- Arrange: Mock API, set session flag to false (non-pio session). Create a mock `TurnEndEvent` with thinking-only content.  
- Act: Invoke the `turn_end` handler with the event.  
- Assert: `pi.sendUserMessage()` was NOT called.

**"turn_end does nothing for non-assistant messages"**  
- Arrange: Set session flag to true. Create a mock `AgentMessage` with `role: "user"` and thinking content.  
- Act: Invoke the `turn_end` handler.  
- Assert: `pi.sendUserMessage()` was NOT called.

**"turn_end sends recovery message on thinking-only turn"**  
- Arrange: Set session flag to true. Create mock `TurnEndEvent` with `message.role === "assistant"`, content = [{ type: "thinking", thinking: "..." }], toolResults = [].  
- Act: Invoke the `turn_end` handler.  
- Assert: `pi.sendUserMessage()` was called exactly once with a non-empty string containing recovery guidance.

**"turn_end does NOT send recovery message when text is present"**  
- Arrange: Set session flag to true. Create mock event with content = [{ type: "thinking", thinking: "..." }, { type: "text", text: "hello" }], toolResults = [].  
- Act: Invoke the `turn_end` handler.  
- Assert: `pi.sendUserMessage()` was NOT called.

## Programmatic Verification

**TypeScript type check passes**  
- What: No compile-time type errors after creating the new module  
- How: `npm run check` (runs `nsc --noEmit`)  
- Expected result: Exit code 0, no output about `turn-guard.ts`

**Module exports setupTurnGuard**  
- What: The function is a named export from the correct path  
- How: `grep -n "export.*function setupTurnGuard" src/capabilities/turn-guard.ts`  
- Expected result: Exactly one match with `ExtensionAPI` parameter

**No imports from other pio capability files**  
- What: Module is self-contained to prevent circular dependencies  
- How: `grep "from.*\.\." src/capabilities/turn-guard.ts | grep -v "@earendil-works"`  
- Expected result: No output (all imports are from the pi framework package, not from sibling capability files)

**turn_end handler is registered**  
- What: The setup function calls `pi.on("turn_end", ...)`  
- How: `grep -c 'turn_end' src/capabilities/turn-guard.ts`  
- Expected result: At least 1 occurrence

**resources_discover handler is registered**  
- What: The setup function calls `pi.on("resources_discover", ...)`  
- How: `grep -c 'resources_discover' src/capabilities/turn-guard.ts`  
- Expected result: At least 1 occurrence

**sendUserMessage is called with a recovery prompt**  
- What: The turn_end handler invokes `pi.sendUserMessage()` when dead-turn condition is met  
- How: `grep -c 'sendUserMessage' src/capabilities/turn-guard.ts`  
- Expected result: At least 1 occurrence

## Test Order

1. Unit tests (`__tests__/turn-guard.test.ts`) — pure logic first
2. Programmatic verification — type check, file structure, import hygiene
