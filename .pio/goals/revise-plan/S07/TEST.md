# Tests: Wire revise-plan and register planning skill in index.ts

## Unit Tests

**File:** `src/index.test.ts` (modify existing test suite)  
**Test runner:** Vitest  
**Existing pattern:** Tests use `makeMockPi()` to capture event registrations, then invoke the extension factory. Check `registeredHandlers`, `mockPi.registerTool`, and `mockPi.registerCommand` for assertions.

### Test cases to add

1. **`describe("skill registration")` — new test: "includes pio-planning in skillPaths"**
   - Arrange: import `./index`, create mock Pi, invoke extension factory
   - Act: call the `resources_discover` handler, get `result.skillPaths`
   - Assert: find a path containing `"pio-planning"` — must be defined
   - Purpose: verifies the planning skill is registered for discovery

2. **`describe("capability registration")` — new describe block**  
   New test: **"setupRevisePlan registers pio_revise_plan tool"**
   - Arrange: import `./index`, create mock Pi, invoke extension factory
   - Act: check `mockPi.registerTool.mock.calls` (array of calls)
   - Assert: at least one call has `"pio_revise_plan"` as the first argument (tool name)
   - Purpose: verifies the revise-plan tool is registered

3. **`describe("capability registration")` — new test: "setupRevisePlan registers /pio-revise-plan command"**
   - Arrange/Act: same mock setup, invoke factory
   - Assert: `mockPi.registerCommand.mock.calls` contains a call where the first argument starts with `/pio-revise-plan`
   - Purpose: verifies the revise-plan command is registered

### Existing tests to update

4. **Update "skillPaths contain absolute paths under the skills directory"** — Add `"pio-planning"` to the `expect(skillNames).toContain(...)` assertions alongside the existing three skill names. Or better: verify `skillPaths` length increased from 3 to 4 (if no other skills added elsewhere).

## Programmatic Verification

1. **Import exists:** `grep -c 'setupRevisePlan' src/index.ts` → expected result: at least 2 matches (import line + call site)
2. **Correct module path:** `grep 'from ".\/capabilities\/revise-plan"' src/index.ts` → expected result: 1 match (the import statement)
3. **Skill path registered:** `grep 'pio-planning' src/index.ts` → expected result: at least 1 match (in skillPaths array)
4. **No stale "planning" reference:** `grep '"planning"' src/index.ts` → expected result: 0 matches (must use `pio-planning`, not `planning`)
5. **TypeScript compiles:** `npx tsc --noEmit` → expected result: exit code 0, no errors

## Test Order

1. Programmatic verification (grep checks) — fastest, confirms file edits are present
2. Unit tests (`npm test -- src/index.test.ts`) — validates runtime behavior via mocks
3. TypeScript compilation — catches any import resolution or type issues
