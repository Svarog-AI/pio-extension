# Tests: Fix state machine transition params for finalize-goal

## Unit Tests

### File: `src/state-machine.test.ts` (existing — modify completion detection tests)

**Test runner:** Vitest (global `describe/it/expect`)

**Modify existing test:** `"routes to finalize-goal when goal is completed"`
- Currently asserts `{ capability: "finalize-goal", params: { goalName: "feat" } }`
- Update to assert expanded params: `{ capability: "finale-goal", params: { goalName, goalDir, workingDir } }`
- Spy on `process.cwd()` with `vi.spyOn(process, "cwd").mockReturnValue("/fake/cwd")` before the assertion
- Assert `result.params.goalDir` equals `"/fake/cwd/.pio/goals/feat"` (computed via `path.join`)
- Assert `result.params.workingDir` equals `"/fake/cwd"`

**Modify existing test:** `"propagates goalName in finalize-goal params"`
- Update to additionally assert `goalDir` and `workingDir` are present
- Spy on `process.cwd()` similarly; verify `goalDir` contains the goal name from params

**Add new test:** `"includes goalDir computed from resolveGoalDir"`
- Mock `goalCompleted: () => true`, spy `process.cwd()` returning a known path like `/test/project`
- Call `resolveTransition("evolve-plan", state, { goalName: "my-goal" })`
- Assert `result.params.goalDir === "/test/project/.pio/goals/my-goal"`

**Add new test:** `"includes workingDir set to process.cwd()"`
- Mock `goalCompleted: () => true`, spy `process.cwd()` returning `/my/root`
- Call `resolveTransition("evolve-plan", state, { goalName: "feat" })`
- Assert `result.params.workingDir === "/my/root"`

**Verify unchanged paths:** Ensure existing non-completion tests (evolve-plan → execute-task) still pass without modification. These don't exercise the completion guard and should remain unaffected.

## Programmatic Verification

- **What:** TypeScript compilation succeeds with no type errors after importing `resolveGoalDir` in `state-machine.ts`
- **How:** `npm run check` (runs `tsc --noEmit`)
- **Expected result:** Exit code 0, no output about type errors

- **What:** Import of `resolveGoalDir` is present in `state-machine.ts`
- **How:** `grep 'resolveGoalDir' src/state-machine.ts`
- **Expected result:** At least 2 matches (import line + usage in `transitionEvolvePlan`)

- **What:** `process.cwd()` is used in `transitionEvolvePlan` for the completion path
- **How:** `grep -A5 'goalCompleted' src/state-machine.ts | grep 'cwd'`
- **Expected result:** Matches `process.cwd()` usage near the `goalCompleted` guard

## Test Order

1. Unit tests — run modified and new tests in `state-machine.test.ts` via `npm test -- src/state-machine.test.ts`
2. Programmatic verification — run `npm run check` for type safety
3. Full suite — run `npm test` to confirm no regressions across all 483+ tests
