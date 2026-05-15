# Plan: Evolve-Plan Carryover Mechanism

Add a `DECISIONS.md` file to each step folder (`S{NN}/`) so that architectural decisions from earlier steps are carried forward to later specification and implementation sessions.

## Prerequisites

None.

## Steps

### Step 1: Update evolve-plan capability config for DECISIONS.md

**Description:** Modify the step-dependent config callbacks in `evolve-plan.ts` so that for Step 2+, `DECISIONS.md` is included in both the validation file list and the write allowlist. Step 1 remains unchanged — it produces only `TASK.md` and `TEST.md`. This follows the existing pattern used by `resolveEvolveValidation` and `resolveEvolveWriteAllowlist`, which already branch on `stepNumber`.

Add a `DECISIONS_FILE` constant alongside `PLAN_FILE`, `TASK_FILE`, and `TEST_FILE`. In `resolveEvolveValidation`, append `${folder}/${DECISIONS_FILE}` to the validation files array when `stepNumber > 1`. In `resolveEvolveWriteAllowlist`, append `${folder}/${DECISIONS_FILE}` to the allowlist when `stepNumber > 1`.

**Acceptance criteria:**
- [ ] `resolveEvolveValidation` returns `[S01/TASK.md, S01/TEST.md]` for stepNumber=1 (no DECISIONS.md)
- [ ] `resolveEvolveValidation` returns `[S02/TASK.md, S02/TEST.md, S02/DECISIONS.md]` for stepNumber=2
- [ ] `resolveEvolveWriteAllowlist` includes `S02/DECISIONS.md` for stepNumber=2
- [ ] `resolveEvolveWriteAllowlist` does not include `S01/DECISIONS.md` for stepNumber=1
- [ ] Existing tests in `evolve-plan.test.ts` still pass (no regressions)
- [ ] `npm run check` reports no TypeScript errors

**Files affected:**
- `src/capabilities/evolve-plan.ts` — add `DECISIONS_FILE` constant; update `resolveEvolveValidation` and `resolveEvolveWriteAllowlist` callbacks to conditionally include `DECISIONS.md` for step > 1

### Step 2: Update evolve-plan prompt with DECISIONS.md instructions

**Description:** Modify the Specification Writer prompt (`evolve-plan.md`) so that for Step 2+, it reads the previous step's `SUMMARY.md` "Decisions Made" section and any existing `DECISIONS.md`, merges them into a new `S{NN}/DECISIONS.md`, and incorporates relevant prior decisions into `TASK.md`.

Changes to the prompt:
1. **Step 3 (Read previous step context):** Add instructions to also read `S{NN-1}/DECISIONS.md` if it exists (handle gracefully when missing — Step 2 has no previous DECISIONS.md). Extract "Decisions Made" from `SUMMARY.md`.
2. **New sub-step after Step 3:** Write `S{NN}/DECISIONS.md` for step > 1. Merge accumulated decisions with new ones from the previous SUMMARY.md. Filter out stale or implementation-only details. Rephrase decisions to fit current context — don't just append verbatim. Skip entirely for Step 1.
3. **Step 5 (Write TASK.md):** Update the "Approach and Decisions" section instructions to reference relevant prior decisions from `DECISIONS.md` that directly affect the current step's implementation.
4. **Step 7 (Signal completion):** Mention `DECISIONS.md` as an expected output file for Step 2+ (for agent awareness, validation is handled by config in Step 1).

**Acceptance criteria:**
- [ ] The prompt instructs the Specification Writer to read `S{NN-1}/DECISIONS.md` (if it exists) alongside `SUMMARY.md`
- [ ] The prompt handles the missing DECISIONS.md gracefully for the Step 1 → Step 2 transition
- [ ] The prompt instructs the writer to produce `S{NN}/DECISIONS.md` for steps > 1 (not for step 1)
- [ ] The prompt instructs the writer to filter stale decisions and rephrase for context (not just append)
- [ ] The prompt instructs the writer to incorporate relevant prior decisions into TASK.md's "Approach and Decisions" section
- [ ] All existing prompt instructions (TASK.md structure, TEST.md generation, etc.) are preserved unchanged

**Files affected:**
- `src/prompts/evolve-plan.md` — add DECISIONS.md reading, merging, and writing instructions; update TASK.md template to reference prior decisions

### Step 3: Update execute-task prompt to mention DECISIONS.md

**Description:** Add a note to the Execute Task Agent prompt (`execute-task.md`) so it knows that `DECISIONS.md` may exist in the step folder (Step 2+) as optional enrichment context. The primary carry-forward mechanism remains TASK.md content, but execute-task can reference DECISIONS.md for additional background on decisions from earlier steps.

Add to Step 2 (Read TASK.md and TEST.md): a note that `S{NN}/DECISIONS.md` may also exist (Step 2+) containing accumulated architectural decisions from prior steps. Treat it as optional enrichment — read it if present but never treat it as a prerequisite.

**Acceptance criteria:**
- [ ] The prompt mentions `DECISIONS.md` exists for Step 2+ as optional enrichment context
- [ ] The prompt clarifies that TASK.md remains the primary source of truth (DECISIONS.md is supplementary)
- [ ] All existing prompt instructions are preserved unchanged

**Files affected:**
- `src/prompts/execute-task.md` — add DECISIONS.md mention to Step 2 (Read TASK.md and TEST.md)

## Notes

- The `validateAndFindNextStep` function in evolve-plan.ts checks for a root-level `COMPLETED` marker to determine if all steps are specified. This logic should remain unchanged — the COMPLETED marker is still created by evolve-plan when it runs out of steps in PLAN.md (see Step 2 of evolve-plan.md prompt).
- The step-dependent callback pattern (`ConfigCallback`) in `capability-config.ts` already supports this: callbacks receive `(workingDir, params)` where `params` includes `stepNumber`. Steps 1 and 2 follow the exact same pattern as the existing `resolveEvolveValidation` and `resolveEvolveWriteAllowlist`.
- The Specification Writer (agent reading evolve-plan.md) is responsible for producing DECISIONS.md content. No new TypeScript logic is needed beyond config changes — the merge/filter/rephrase logic lives entirely in the prompt instructions, executed by the LLM agent at runtime.
- Backwards compatibility: existing goal workspaces without DECISIONS.md will continue to work. The mechanism is purely additive — evolve-plan handles missing DECISIONS.md gracefully (Step 2 has no previous one).
