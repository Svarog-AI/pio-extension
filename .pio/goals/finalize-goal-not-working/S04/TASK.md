# Task: Update tests to verify transition params and initial message

Verify the three bug fixes from Steps 1–3 are comprehensively tested, add any remaining integration coverage, and confirm the full test suite passes clean.

## Context

Steps 1–3 each introduced behavioral changes AND their own tests following the TDD workflow:
- Step 1 added goal name to `defaultInitialMessage` in `finalize-goal.ts`
- Step 2 expanded `transitionEvolvePlan()` params to include `goalDir` and `workingDir`
- Step 3 added explicit `params.workingDir` precedence check in `resolveCapabilityConfig()`

Step 4 ensures test coverage is complete across all three files, adds any missing edge cases or integration scenarios, and proves the full suite passes. During research, one gap was identified: the manual invocation path (`finalizeGoalTool.execute`) passes `{ goalDir }` but not `goalName`, meaning `defaultInitialMessage` falls back to "goal workspace" for manual invocations instead of including the human-readable goal name.

**Reference:** See `DECISIONS.md` for accumulated architectural decisions from Steps 1–3 that affect test expectations.

## What to Build

Update existing test suites to provide complete verification of all three bug fixes. No new behavioral code is required — this step focuses exclusively on test coverage.

### Test Updates: state-machine.test.ts

The `resolveTransition — evolve-plan completion detection` describe block should have tests verifying the expanded params shape. Verify these exist (added in Step 2):
- Completion transition returns `{ goalName, goalDir, workingDir }` with correct computed values
- `goalDir` is computed via `resolveGoalDir(process.cwd(), goalName)`
- `workingDir` equals `process.cwd()` (project root)
- Non-completion paths are unaffected — still return `{ goalName, stepNumber }`

If any of these are missing, add them. If they already exist and pass, no changes needed.

### Test Updates: finalize-goal.test.ts

The `CAPABILITY_CONFIG.defaultInitialMessage` describe block should have tests verifying goal name inclusion. Verify these exist (added in Step 1):
- Message contains the goal name when `params.goalName` is provided
- Goal name is formatted naturally (quoted) in the message
- Graceful fallback when `goalName` is absent — no empty artifacts like `'' at`

Additionally, verify a test exists confirming that the tool enqueue params include both `goalDir` and the goal name context. If the current tool execute test only checks for `goalDir` (and explicitly asserts `goalName` is NOT present), document this behavior in tests. The manual invocation path currently passes `{ goalDir }` without `goalName` — this is existing behavior; a test should assert this shape to prevent regression.

### Test Updates: capability-config.test.ts

The `resolveCapabilityConfig — explicit workingDir override` describe block should have tests verifying the three-way precedence. Verify these exist (added in Step 3):
- Explicit `workingDir` overrides `goalName`-based derivation
- `goalName`-based derivation still works when `workingDir` is absent
- Fallback to `cwd` when neither is present
- Empty string `workingDir` does not override

Additionally, add a test verifying the end-to-end interaction: when `resolveCapabilityConfig` receives params matching what `transitionEvolvePlan()` produces (i.e., `{ goalName, goalDir, workingDir: <project root> }`), the resolved `workingDir` is the project root — not the goal workspace directory. This connects Step 2's output to Step 3's precedence check.

### Code Components

No new code components. All behavior changes were implemented in Steps 1–3. This step adds or updates test assertions only.

### Approach and Decisions

- **Test file placement:** Follow the colocated convention — `src/state-machine.test.ts`, `src/capabilities/finalize-goal.test.ts`, `src/capability-config.test.ts`. See `.pio/PROJECT/DEVELOPMENT.md` for the project's test directory convention.
- **Use `vi.spyOn(process, "cwd")`** when mocking cwd in state machine tests, matching the pattern established in Step 2 and documented in `S02/SUMMARY.md`.
- **Prefer real implementations over mocks** per TDD skill guidelines — use actual `resolveCapabilityConfig()` and `CAPABILITY_CONFIG.defaultInitialMessage()` in integration-style assertions rather than mocking internals.
- **Verify, don't duplicate:** If Steps 1–3 already added comprehensive tests, do not add redundant assertions. Focus on any gaps: end-to-end integration between state machine output and config resolution.

## Dependencies

- **Step 1:** Must be completed — goal name in `defaultInitialMessage`
- **Step 2:** Must be completed — expanded transition params from `transitionEvolvePlan()`
- **Step 3:** Must be completed — explicit `workingDir` precedence in `resolveCapabilityConfig()`

All three prior steps produce the behavioral changes that Step 4's tests verify.

## Files Affected

- `src/state-machine.test.ts` — update or add completion detection tests to assert expanded params (`goalName`, `goalDir`, `workingDir`)
- `src/capabilities/finalize-goal.test.ts` — ensure goal name in initial message is tested; verify tool enqueue param shape
- `src/capability-config.test.ts` — ensure explicit `workingDir` override is tested; add integration test connecting state machine output to config resolution

## Acceptance Criteria

- [ ] `state-machine.test.ts` — completion detection test asserts `result.params.goalDir`, `result.params.goalName`, and `result.params.workingDir` with correct values
- [ ] `finalize-goal.test.ts` — new or updated test confirms initial message contains the goal name string
- [ ] `capability-config.test.ts` — new test confirms explicit `workingDir` in params takes precedence over `goalName` derivation
- [ ] Full test suite passes: `npm run test` exits with code 0
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- **Tests already exist:** Steps 1–3 included their own test updates. Most Step 4 acceptance criteria may already be satisfied. The task should verify rather than blindly add — if a test already exists and is comprehensive, mark it verified and move on.
- **Manual vs auto invocation gap:** `finalizeGoalTool.execute` enqueues with `{ goalDir }` only (no `goalName`). This means manual invocations get "goal workspace" in the initial message instead of the quoted goal name. This is a known limitation of the current implementation; test it but do not fix it in this step unless explicitly required by acceptance criteria.
- **process.cwd() mocking:** State machine tests mock `process.cwd()` using `vi.spyOn(process, "cwd")`. Ensure mocks are restored in `afterEach` or use `.mockRestore()` to avoid test interference.
- **Test count consistency:** After all updates, the total test count should not decrease from previous steps. If any existing test was broken by Steps 1–3, it would have been caught earlier.
