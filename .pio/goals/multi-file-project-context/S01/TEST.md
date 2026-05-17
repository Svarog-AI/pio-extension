# Tests: Update session loader to read `.pio/PROJECT/OVERVIEW.md`

## Unit Tests

**File:** `src/capabilities/session-capability.test.ts`  
**Test runner:** Vitest (`npm test`)

Add a new `describe("project context file path")` block following the existing "model resolution" pattern: use `vi.resetModules()`, mock `../model-config`, create a temp directory with `.pio/PROJECT/OVERVIEW.md`, and manually trigger event handlers.

### Test cases

1. **`describe('project context file path')`:**
   - **Setup:** Create temp dir, write `.pio/PROJECT/OVERVIEW.md` with known content (e.g., `"OVERVIEW CONTENT"`). Call `vi.resetModules()`. Mock `../model-config` to return `undefined` (no model resolution interference). Import fresh `session-capability`, call `setupCapability(mockPi)`.
   - **Spy on `process.cwd`:** Use `vi.spyOn(process, 'cwd').mockReturnValue(tempDir)` so the path resolves to the temp dir.
   - **Trigger `resources_discover`** with a config `{ capability: "test-cap", prompt: "_skill-loading.md" }` (a minimal valid config — `_skill-loading.md` is loaded by `resources_discover`, but we don't need it to find a real prompt since we only care about project context).
   - **Trigger `before_agent_start`.**
   - **Assert:** The returned result's message content contains `"OVERVIEW CONTENT"` (proving the file at `.pio/PROJECT/OVERVIEW.md` was read and injected).
   - **Cleanup:** Restore `process.cwd` spy, remove temp dir.

2. **`it('ignores .pio/PROJECT.md (old path) when .pio/PROJECT/OVERVIEW.md exists')`:**
   - **Setup:** Same as above, but create BOTH `.pio/PROJECT.md` (content: `"OLD CONTENT"`) AND `.pio/PROJECT/OVERVIEW.md` (content: `"NEW CONTENT"`).
   - **Trigger handlers.**  
   - **Assert:** The injected content contains `"NEW CONTENT"` but does NOT contain `"OLD CONTENT"`. This proves the old path is no longer read.

3. **`it('handles missing .pio/PROJECT/OVERVIEW.md gracefully')`:**
   - **Setup:** Temp dir with NO `.pio/` directory at all.
   - **Trigger handlers.**  
   - **Assert:** The handler does not throw. The returned result should NOT contain `--- PROJECT OVERVIEW ---` (no project context injected when file doesn't exist).

## Programmatic Verification

- **What:** TypeScript type check passes after the change.
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no errors

- **What:** The path string in `session-capability.ts` references `.pio/PROJECT/OVERVIEW.md`.
  - **How:** `grep '"OVERVIEW.md"' src/capabilities/session-capability.ts` (or `grep 'PROJECT.*OVERVIEW'`)
  - **Expected result:** One match containing the new path

- **What:** No stale references to `.pio/PROJECT.md` remain in `session-capability.ts`.
  - **How:** `grep '"PROJECT\.md"' src/capabilities/session-capability.ts`
  - **Expected result:** Zero matches (the old path string is gone)

- **What:** The cache variable name `projectContext` is preserved.
  - **How:** `grep 'let projectContext' src/capabilities/session-capability.ts`
  - **Expected result:** One match confirming the variable name is unchanged

## Test Order

1. Unit tests (`npm test`) — verify correct file path and graceful fallback behavior
2. Programmatic verification (`npm run check`, grep) — confirm no type errors and old path is removed
