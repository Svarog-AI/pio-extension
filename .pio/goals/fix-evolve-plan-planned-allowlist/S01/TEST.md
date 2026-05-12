# Tests: Fix evolve-plan COMPLETED marker — detection, validation, allowlist, and prompt

## Unit Tests

**File:** `__tests__/evolve-plan.test.ts` (new)
**Test runner:** Vitest (`npm test`)
**Pattern:** Follow existing test conventions from `__tests__/utils.test.ts` — use `fs.mkdtempSync(os.tmpdir())`, Arrange-Act-Assert, DAMP descriptions.

### validateOutputs COMPLETED short-circuit

Test the new validation behavior in `validation.ts`:

- **describe("validateOutputs with COMPLETED at baseDir"):**
  - "passes when COMPLETED exists, even if other expected files are missing" — Arrange: temp dir with COMPLETED file but no TASK.md/TEST.md. Validation expects `[TASK.md, TEST.md]`. Act: call `validateOutputs({ files: ["TASK.md", "TEST.md"] }, tempDir)`. Assert: `{ passed: true, missing: [] }`
  - "passes when COMPLETED is the only expected file and it exists" — Arrange: temp dir with COMPLETED. Validation expects `[COMPLETED]`. Act/Assert: passes.
  - "fails normally when COMPLETED does not exist and expected files are missing" — Arrange: temp dir with no COMPLETED, no TASK.md. Validation expects `[TASK.md]`. Act: call `validateOutputs({ files: ["TASK.md"] }, tempDir)`. Assert: `{ passed: false, missing: ["TASK.md"] }`
  - "does not match COMPLETED in a subfolder" — Arrange: temp dir with `S01/COMPLETED` but no `COMPLETED` at root. Validation expects `[S01/TASK.md]`. Act/Assert: fails normally (short-circuit only triggers for baseDir/COMPLETED, not subfolder).

### resolveEvolveWriteAllowlist always includes COMPLETED

Test the allowlist callback by importing from evolve-plan.ts or CAPABILITY_CONFIG:

- **describe("resolveEvolveWriteAllowlist"):**
  - "always includes COMPLETED alongside step-folder paths" — Arrange: call with `{ stepNumber: 2 }`. Assert: result contains `"COMPLETED"`, `"S02/TASK.md"`, `"S02/TEST.md"`

### validateAndFindNextStep COMPLETED pre-launch guard

Test that an existing COMPLETED file prevents relaunching:

- **describe("validateAndFindNextStep with COMPLETED marker"):**
  - "returns ready:false when COMPLETED exists at goal root" — Arrange: create goal dir with PLAN.md and a COMPLETED file. Act: call `validateAndFindNextStep` (may need to access via module internals or test through the exported setup). Assert: `{ ready: false, error }` where error mentions "COMPLETED" or "already specified".
  - "returns ready:true when COMPLETED does not exist and PLAN.md exists" — Arrange: goal dir with PLAN.md, no COMPLETED. Act/Assert: `{ ready: true, stepNumber: N }`

## Programmatic Verification

- **What:** TypeScript compiles without errors
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no error output

- **What:** Existing tests still pass (no regressions)
  - **How:** `npm test`
  - **Expected result:** All existing tests in `__tests__/utils.test.ts`, `__tests__/step-discovery.test.ts`, etc. pass

- **What:** No references to `PLANNED` remain in evolve-plan prompt
  - **How:** `grep -r "PLANNED" src/prompts/evolve-plan.md`
  - **Expected result:** No matches (exit code 1 from grep)

- **What:** COMPLETED is referenced in the evolve-plan prompt for the all-steps-complete instruction
  - **How:** `grep "COMPLETED" src/prompts/evolve-plan.md`
  - **Expected result:** At least one match containing instructions to write a file called `COMPLETED`

- **What:** evolve-plan.ts always includes COMPLETED in the write allowlist
  - **How:** `grep "COMPLETED" src/capabilities/evolve-plan.ts`
  - **Expected result:** `"COMPLETED"` appears in `resolveEvolveWriteAllowlist` as part of the returned array

- **What:** validateOutputs short-circuits on COMPLETED at baseDir
  - **How:** `grep -A2 "COMPLETED" src/capabilities/validation.ts`
  - **Expected result:** Check for fs.existsSync call referencing `"COMPLETED"` before the file-checking loop

## Manual Verification

- **What:** `/pio-evolve-plan <goal>` detects existing COMPLETED and shows error
  - **How:** Create a test goal with PLAN.md, S01/ with TASK.md+TEST.md, and a `COMPLETED` file at the goal root. Run `/pio-evolve-plan <goal>`. Observe: error notification appears ("all steps already specified"), no sub-session launches.

- **What:** `/pio-evolve-plan <goal>` allows agent to write COMPLETED when all steps done
  - **How:** Run `/pio-evolve-plan` on a goal where all plan steps have complete S{NN}/ specs (TASK.md+TEST.md present). The agent should launch, discover its assigned step doesn't exist in PLAN.md, write COMPLETED at the goal root, and `pio_mark_complete` should pass.

- **What:** Normal evolve-plan flow is unaffected
  - **How:** Run `/pio-evolve-plan` on a goal with incomplete steps. Observe: sub-session launches for the correct step number, agent creates TASK.md and TEST.md inside S{NN}/, validation passes normally.

## Test Order

1. Unit tests (new `__tests__/evolve-plan.test.ts`)
2. Existing test suite (`npm test` — verifies no regressions)
3. Programmatic verification (type check, grep checks)
4. Manual verification (command behavior in live session)
