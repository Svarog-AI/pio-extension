# Task: Move test generation from evolve-plan to execute-task

Evolve-plan produces only TASK.md (never TEST.md). Execute-task reads TASK.md and generates tests itself using TDD methodology. TASK.md becomes the universal input artifact for both regular execution and subgoal definition.

## Context

Currently, `evolve-plan` expects both `TASK.md` and `TEST.md` as outputs. A step is "defined" only when both files exist. The `execute-task` agent reads both files from disk to know what to build and how to test it.

This architecture requires conditional logic in evolve-plan if we want subgoal steps (which skip TEST.md entirely). By removing TEST.md from evolve-plan outputs, TASK.md becomes the universal input artifact — both execute-task and create-goal (subgoals) can read it without any special cases in evolve-plan code.

## What to Build

### Evolve-plan code changes (`src/capabilities/evolve-plan.ts`)

**`resolveEvolveValidation`:** Remove `TEST_FILE` from the expected files array. A step produces only `TASK.md` (and optionally `DECISIONS.md`, `REVISE_PLAN_NEEDED`).

Before: `[`${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`]`
After: `[`${folder}/${TASK_FILE}`]`

**`resolveEvolveWriteAllowlist`:** Remove `TEST_FILE` from the allowlist. The agent can write TASK.md, DECISIONS.md, REVISE_PLAN_NEEDED, and COMPLETED — but not TEST.md.

Before: includes `${folder}/${TEST_FILE}`
After: excludes it

**`CAPABILITY_CONFIG.defaultInitialMessage`:** Update to instruct producing TASK.md only — no mention of TEST.md. The message should say something like "Generate TASK.md inside the step directory" (not "TASK.md and TEST.md").

**`validateAndFindNextStep`:** This function currently uses `state.currentStepNumber()` which checks for APPROVED markers via folder scanning. It does NOT check for TASK.md/TEST.md existence directly. No code change needed here for this function itself — but the underlying status logic it depends on (via GoalState) will change.

### Execute-task code changes (`src/capabilities/execute-task.ts`)

**`isStepReady`:** Currently checks `step.status() === "defined"` which requires both TASK.md and TEST.md. After the GoalState change, "defined" will mean TASK.md exists alone. This function's behavior will update automatically — no code change needed if GoalState is updated correctly.

**`validateExplicitStep`:** Currently checks `!step.hasTask() || !step.hasTest()` to determine readiness. Remove the `hasTest()` check — the step is ready when only TASK.md exists. Update error message accordingly (currently says "missing TASK.md and TEST.md").

Before:
```
if (!step.hasTask() || !step.hasTest()) {
  const missing: string[] = [];
  if (!step.hasTask()) missing.push(TASK_FILE);
  if (!step.hasTest()) missing.push(TEST_FILE);
  // ...error with missing files
}
```

After: only check `!step.hasTask()`.

**`resolveExecuteReadOnlyFiles`:** Remove `TEST_FILE` from the read-only files list. The executor should not have TEST.md as a protected read-only input — it writes its own tests.

Before: `[`${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`]`
After: `[`${folder}/${TASK_FILE}`]`

**`CAPABILITY_CONFIG.defaultInitialMessage`:** Update to instruct reading TASK.md and deriving tests from acceptance criteria. Remove references to reading TEST.md. The message should say something like "Read TASK.md, write tests first based on the acceptance criteria using TDD methodology, then implement."

### GoalState status logic (`src/goal-state.ts`)

**`status()` in `createStepStatus`:** Currently returns `"defined"` when both TASK.md AND TEST.md exist. Change to return `"defined"` when only TASK.md exists (TEST.md check removed).

Before:
```typescript
if (
  fs.existsSync(path.join(stepDir, TASK_FILE)) &&
  fs.existsSync(path.join(stepDir, TEST_FILE))
) {
  return "defined";
}
```

After:
```typescript
if (fs.existsSync(path.join(stepDir, TASK_FILE))) {
  return "defined";
}
```

**Pending status:** A step with an empty folder (no TASK.md) returns `"pending"`. This is unchanged.

**`hasTest()` method:** Keep the `hasTest()` method on `StepStatus` interface and implementation — it may still be useful for other consumers (e.g., checking if tests were written during execution). Do not remove it; just stop using it as a readiness gate.

### Prompt changes

**`src/prompts/evolve-plan.md`:** 
- Remove the "Write TEST.md" step entirely from the Process section
- The agent writes TASK.md with acceptance criteria detailed enough for an executor to derive tests
- Add guidance: "TASK.md is the only output — ensure acceptance criteria are specific enough that an executor can write meaningful tests from them"
- Update any references to producing both TASK.md and TEST.md

**`src/prompts/execute-task.md`:**
- Remove all references to reading TEST.md as an input file (Step 2 currently says "Read TASK.md, TEST.md")
- Instruct the executor to derive test cases from TASK.md acceptance criteria using TDD methodology
- Reference the `test-driven-development` skill for test structure guidance (RED→GREEN→REFACTOR, Arrange-Act-Assert)
- Add instructions: write tests first based on TASK.md acceptance criteria, then implement

## Dependencies

- **Step 1 (Path resolution):** No direct dependency. Path resolution works identically regardless of TEST.md presence.
- **Step 2 (Queue keying):** No direct dependency. Queue keying is unaffected by the TASK.md-only change.
- **Step 3 (Plan frontmatter):** No direct dependency. Frontmatter schema unchanged.
- **Step 4 (State machine transitions):** No direct dependency. State machine routing uses `step.status()` which will update automatically with the GoalState change.

## Files Affected

- `src/capabilities/evolve-plan.ts` — remove TEST.md from validation files, write allowlist, and initial message
- `src/capabilities/evolve-plan.test.ts` — update tests to expect TASK.md-only (not TASK.md + TEST.md)
- `src/capabilities/execute-task.ts` — remove TEST.md requirement from isStepReady readiness check, validateExplicitStep, readOnlyFiles, and defaultInitialMessage
- `src/capabilities/execute-task.test.ts` — update tests for TASK.md-only readiness; "missing TEST.md" test should now expect true (step ready with only TASK.md)
- `src/goal-state.ts` — `status()` returns `"defined"` when TASK.md exists alone (remove TEST.md conjunction)
- `src/goal-state.test.ts` — update status tests: TASK.md-only folder should return "defined" instead of "pending"
- `src/prompts/evolve-plan.md` — remove TEST.md step; instruct writing testable acceptance criteria in TASK.md
- `src/prompts/execute-task.md` — remove TEST.md references; instruct deriving tests from TASK.md using TDD skill

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] Evolve-plan validation expects only TASK.md (not TEST.md) — verify via `resolveEvolveValidation` output
- [ ] Evolve-plan write allowlist does not include TEST.md
- [ ] Evolve-plan initial message instructs producing TASK.md only (no mention of TEST.md)
- [ ] Execute-task considers a step ready when TASK.md exists alone (`isStepReady` returns true for TASK.md-only folder)
- [ ] Execute-task `validateExplicitStep` passes with TASK.md alone (no TEST.md requirement)
- [ ] Execute-task read-only files list contains only TASK.md (not TEST.md)
- [ ] Execute-task initial message instructs deriving tests from TASK.md acceptance criteria using TDD skill
- [ ] `StepStatus.status()` returns `"defined"` when TASK.md exists (no TEST.md required)
- [ ] `StepStatus.status()` returns `"pending"` for empty folder (no TASK.md)
- [ ] Evolve-plan prompt no longer instructs writing TEST.md
- [ ] Execute-task prompt instructs deriving tests from TASK.md using TDD methodology

## Risks and Edge Cases

- **Test regression coverage is critical:** This changes the core artifact contract between workflow steps. Every test that checks for TEST.md existence, TASK.md+TEST.md combination, or "defined" status must be updated. Be thorough — search for all references to `TEST_FILE` or `"TEST.md"` across test files.
- **`hasTest()` method retention:** Keep the method on StepStatus interface but stop using it as a readiness gate. Removing it would be a breaking change for any external consumers.
- **Backward compatibility with existing goals:** Goals that already have both TASK.md and TEST.md should continue to work — `status()` returns "defined" when TASK.md exists (TEST.md presence is irrelevant). The executor will find an existing TEST.md but the new prompt won't reference it.
- **`validateExplicitStep` error message:** Update carefully — the old message listed missing files including TEST.md. New message should only mention TASK.md.
- **State machine integration:** `transitionEvolvePlan` and other state machine functions use `state.steps()[n].getMetadata()` for subgoal detection. The status change ("defined" with TASK.md only) means subgoal steps will be detected as "specified" sooner (as soon as TASK.md is written, not waiting for TEST.md). This is the desired behavior — it enables the subgoal workflow where evolve-plan produces TASK.md and the state machine routes to create-goal.
- **`isStepReady` uses `step.status() === "defined"`:** After the GoalState change, this will automatically return true for TASK.md-only folders. No code change needed in isStepReady itself, but verify with tests.
