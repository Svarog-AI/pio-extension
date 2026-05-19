# Tests: Move `pio_mark_complete` from `validation.ts` to `session-capability.ts`

## Unit Tests

### File: `src/capabilities/session-capability.test.ts` (new describe block)
**Test runner:** Vitest

#### "markCompleteTool execution flow — full lifecycle"

Test the complete mark-complete tool flow by triggering the registered tool with mocked session config. Verify each phase executes in order.

**Test cases:**

- `describe('pio_mark_complete')`:
  - **"registers as pio_mark_complete via setupCapability"** — After calling `setupCapability(mockPi)`, verify `mockPi.registerTool` was called with a tool named `"pio_mark_complete"`. Extract the registered tool and verify its name, label, and parameters (`Type.Object({})`).

  - **"file validation failure returns error without terminating"** — Configure config with `validation: { files: ["missing.md"] }` in a temp dir where the file doesn't exist. Execute mark-complete. Assert: returns content with "Validation failed" text, `terminate` is `undefined` or `false`. No transition enqueued (verify no queue file created).

  - **"file validation success continues to postValidate"** — Configure config with `validation: { files: ["present.md"] }` and create the file. Set up a mock `postValidate` that returns `{ success: false, message: "test error" }`. Execute mark-complete. Assert: returns content containing "test error", `terminate` is falsy. Verify postValidate was called with (workingDir, sessionParams).

  - **"postValidate failure prevents transitions"** — Same as above but additionally verify no task was enqueued and no transition recorded (check temp dir for absence of queue files and transitions.json).

  - **"postValidate success triggers transition routing"** — Configure config with `capability: "execute-task"`, valid files, and `postValidate` returning `{ success: true }`. Execute mark-complete. Assert: `enqueueTask` was called, `recordTransition` was called, next task is `"review-task"` capability. Verify queue file exists at `.pio/session-queue/task-{goalName}.json`.

  - **"postExecute runs after transition routing"** — Set up both `postValidate` (success) and `postExecute` callbacks. Use execution order tracking (e.g., an array that gets pushed to by each callback). Execute mark-complete. Assert: postValidate was called before postExecute (check array indices). Session terminated (`terminate: true`).

  - **"postExecute errors don't block termination"** — Configure `postExecute` to throw an error. Set up `postValidate` returning success. Execute mark-complete. Assert: `terminate: true` (session terminates despite postExecute error), console.warn was called with the error message.

  - **"cleanup deletes files in fileCleanup"** — Create a temp file, set `fileCleanup: [tempFilePath]`. Execute mark-complete with valid config and successful postValidate. Assert: the file was deleted (`fs.existsSync` returns false).

  - **"no config entry passes with terminate true"** — Simulate no `pio-config` custom entry in session entries. Execute mark-complete. Assert: returns content indicating no validation configured, `terminate: true`.

  - **"missing workingDir passes with terminate true"** — Config exists but `workingDir` is undefined. Execute mark-complete. Assert: returns pass message with `terminate: true`.

### File: `src/capabilities/session-capability.test.ts` (new describe block)
**Test runner:** Vitest

#### "markCompleteTool — review-task specific behavior"

Verify the integration with the review-task's `postValidate` hook (which uses GoalState + schema validation).

- `describe('pio_mark_complete for review-task')`:
  - **"valid APPROVED frontmatter creates APPROVED marker and enqueues evolve-plan"** — Create a temp goal workspace with valid REVIEW.md (APPROVED decision, valid issue counts). Configure mark-complete for `capability: "review-task"`. Execute. Assert: S{NN}/APPROVED file exists, queue file has `capability: "evolve-plan"` with incremented stepNumber.

  - **"valid REJECTED frontmatter creates REJECTED marker and enqueues execute-task"** — Create REVIEW.md with REJECTED decision. Execute mark-complete. Assert: S{NN}/REJECTED file exists, S{NN}/COMPLETED is deleted, queue file has `capability: "execute-task"` with same stepNumber.

  - **"invalid frontmatter returns error, no markers created"** — Create REVIEW.md with invalid frontmatter (e.g., missing decision field). Execute mark-complete. Assert: returns error message, no APPROVED/REJECTED markers created, session not terminated.

## Integration Tests

### File: `src/guards/validation.test.ts` (verify existing tests still pass)
**Test runner:** Vitest

Verify that removing the mark-complete tool from validation.ts doesn't break remaining functionality:

- **"setupValidation no longer calls registerTool"** — After calling `setupValidation(mockPi)`, verify that `mockPi.registerTool` was NOT called. Only event handlers (`resources_discover`, `turn_start`, `tool_call`) should be registered via `mockPi.on()`.

## Programmatic Verification

- **TypeScript compilation:** Run `npx tsc --noEmit`. Expected: zero errors.
- **No tool registration in validation.ts:** Run `grep -c 'registerTool' src/guards/validation.ts`. Expected: `0` (no matches).
- **Tool registration in session-capability.ts:** Run `grep -c 'registerTool.*markCompleteTool\|pio_mark_complete' src/capabilities/session-capability.ts`. Expected: at least 1 match.
- **validateOutputs still exported from validation.ts:** Run `grep -c 'export function validateOutputs' src/guards/validation.ts`. Expected: `1` (function is still available for import).
- **extractGoalName still exported from validation.ts:** Run `grep -c 'export function extractGoalName' src/guards/validation.ts`. Expected: `1`.
- **No markCompleteTool in validation.ts:** Run `grep -c 'markCompleteTool\|defineTool.*pio_mark_complete' src/guards/validation.ts`. Expected: `0`.
- **Full test suite:** Run `npx vitest run`. Expected: all existing tests pass with no regressions. New tests also pass.

## Test Order

1. Unit tests — mark-complete registration and execution flow (session-capability.test.ts)
2. Unit tests — review-task specific behavior (session-capability.test.ts)
3. Integration test — validate validation.ts no longer registers tools (validation.test.ts)
4. Programmatic verification — type check, grep checks, full test suite
