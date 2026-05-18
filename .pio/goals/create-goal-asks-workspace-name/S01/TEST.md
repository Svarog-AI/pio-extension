# Tests: Update defaultInitialMessage to include goal name as a given fact

## Unit Tests

- **File:** `src/capabilities/create-goal.test.ts` (new file, colocated with source)
- **Test runner:** Vitest 4.x (Node.js environment, globals enabled)

### Test cases

#### `describe("CAPABILITY_CONFIG.defaultInitialMessage")`

1. **Given `{ goalName: "my-feature" }`, message contains the goal name**
   - Call `CAPABILITY_CONFIG.defaultInitialMessage("/some/path", { goalName: "my-feature" })`
   - Assert result includes `"my-feature"`
   
2. **Given `{ goalName: "refactor-auth" }`, message contains the goal name**
   - Call `CAPABILITY_CONFIG.defaultInitialMessage("/another/path", { goalName: "refactor-auth" })`
   - Assert result includes `"refactor-auth"`

3. **Given no params, message does not crash (fallback to directory path)**
   - Call `CAPABILITY_CONFIG.defaultInitialMessage("/some/.pio/goals/test")`
   - Assert result is a non-empty string (doesn't throw)
   - Assert result includes the directory path (fallback behavior preserved)

4. **Given params without goalName, message does not crash (fallback)**
   - Call `CAPABILITY_CONFIG.defaultInitialMessage("/some/path", { otherKey: "value" })`
   - Assert result is a non-empty string
   - Assert result includes the directory path

5. **Message frames goal name as a known fact**
   - Call with `{ goalName: "test-goal" }`
   - Assert result does NOT contain question marks or phrasing like "confirm", "ask", "what should we call"

#### `describe("prepareGoal")`

6. **Returns ready: false when directory exists**
   - Create a temp dir with `.pio/goals/existing-goal/`
   - Call `prepareGoal` (accessed via dynamic import since it's not exported)
   - Assert `{ goalDir, ready: false }`

7. **Creates directory and returns ready: true when it doesn't exist**
   - Use a temp dir without the goal subdirectory
   - Call `prepareGoal`
   - Assert `{ goalDir, ready: true }` and that the directory was created

## Programmatic Verification

- **What:** TypeScript compiles without errors after the change
- **How:** `npm run check` (runs `tsc --noEmit`)
- **Expected result:** Exit code 0, no type errors

- **What:** Full test suite passes including new tests
- **How:** `npm test` (runs `vitest run`)
- **Expected result:** All tests pass, exit code 0. New tests in `create-goal.test.ts` are included via the `src/**/*.test.ts` pattern in `vitest.config.ts`.

## Test Order

1. Unit tests (`npm test`) — verify `defaultInitialMessage` returns correct strings
2. Programmatic verification (`npm run check`) — TypeScript type checking
