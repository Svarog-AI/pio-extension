# Plan: Fix evolve-plan PLANNED marker and write allowlist

Rename `PLANNED` → `COMPLETED` in the evolve-plan prompt, fix the write allowlist and validation rules to support writing the marker at the goal workspace root, and add detection for already-complete plans.

## Prerequisites

None.

## Steps

### Step 1: Fix evolve-plan COMPLETED marker — detection, validation, allowlist, and prompt

**Description:** Single-step fix covering all changes needed for the evolve-plan "all steps complete" scenario. Three areas:

**A. Detect "all steps complete" in `validateAndFindNextStep` (`evolve-plan.ts`):**
- Check for an existing `COMPLETED` marker at the goal workspace root. If present, return `{ ready: false, error }` — do not relaunch (all steps already specified).
- After calling `discoverNextStep(goalDir)`, read PLAN.md locally and scan for headings matching `/### Step (\d+):/g`. Compare the discovered step number against the set of defined steps. If the discovered step does not exist in the plan (e.g., discover returns 4 but plan defines steps [1,2,3]), all steps are complete — set `allStepsComplete: true`.
- When `allStepsComplete`, still return `{ ready: true }` so a sub-session launches to write the COMPLETED marker. The PLAN.md parsing is local to evolve-plan.ts (inline regex scan, no shared utility needed).

**B. Thread `allStepsComplete` through params and make config callbacks conditional (`evolve-plan.ts`):**
- Pass `{ allStepsComplete }` in params for both tool and command handlers.
- In the command handler: when `allStepsComplete` is true, supply a custom `initialMessage` instructing the agent to write `COMPLETED` at the goal root (bypassing `defaultInitialMessage`, which expects `stepNumber`). Skip creating the S{NN}/ directory since no step folder is needed.
- `resolveEvolveWriteAllowlist`: When `allStepsComplete` → `["COMPLETED"]`. Otherwise always include `"COMPLETED"` alongside the step-folder paths: `["COMPLETED", `${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`]` (allowing it unconditionally is harmless).
- `resolveEvolveValidation`: When `allStepsComplete` → `{ files: ["COMPLETED"] }`. Otherwise keep current behavior.
- `defaultInitialMessage`: Handle `allStepsComplete === true` by returning a message about writing COMPLETED, so no crash when `stepNumber` is absent.

**C. Rename PLANNED → COMPLETED in the prompt (`src/prompts/evolve-plan.md`):**
- Change `PLANNED` to `COMPLETED` in the "all steps complete" instruction (around line 46).

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] Running `/pio-evolve-plan <goal>` when `COMPLETED` already exists shows an error notification and does not launch a sub-session
- [ ] When all steps are specified, validation expects only `"COMPLETED"` and the write allowlist permits writing it at the goal workspace root
- [ ] `src/prompts/evolve-plan.md` instructs writing `COMPLETED` (no references to `PLANNED` remain)
- [ ] Normal evolve-plan flow (valid step exists) is unaffected — still creates S{NN}/, expects TASK.md + TEST.md

**Files affected:**
- `src/capabilities/evolve-plan.ts` — `validateAndFindNextStep`, tool/command handlers, all three config callbacks
- `src/prompts/evolve-plan.md` — rename `PLANNED` → `COMPLETED`

## Notes

- **SKILL.md verification:** `src/skills/pio/SKILL.md` was checked — it contains no references to `PLANNED`. All marker naming already uses `COMPLETED`/`BLOCKED`. No changes needed.
- **Backwards compatibility:** A `PLANNED` file written by an older version of evolve-plan will be a stale artifact. No migration or cleanup is needed — the new flow writes `COMPLETED`, and old `PLANNED` files are harmless (they're just empty markers).
- **Conditional callbacks:** The validation/allowlist logic follows the existing pattern established by `resolveCapabilityConfig()` in `utils.ts`. The callback functions receive `params` which now includes `allStepsComplete`. This is consistent with how `stepNumber` flows through today.
