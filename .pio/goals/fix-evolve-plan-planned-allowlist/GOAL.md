# Fix evolve-plan PLANNED marker: rename to COMPLETED and add to write allowlist

The `evolve-plan` capability instructs the Specification Writer agent to write an empty file called `PLANNED` when all plan steps are already specified (i.e., the assigned step number doesn't exist in `PLAN.md`). However, the write allowlist blocks this file from being created because it only permits writes inside step folders (`S{NN}/TASK.md`, `S{NN}/TEST.md`). This goal renames the marker to `COMPLETED` for naming consistency with other capabilities and updates the allowlist and validation rules so the marker can actually be written.

## Current State

**Prompt instructs a write that is blocked.** `src/prompts/evolve-plan.md` (~line 46) tells the agent:

> "If you **cannot find** your assigned step in PLAN.md, it means all steps have already been specified. In that case: Write an empty file called `PLANNED` in the goal workspace root."

The naming is inconsistent: `execute-task` uses `COMPLETED`/`BLOCKED` markers inside step folders (`src/capabilities/execute-task.ts`, lines 55–56), and the SKILL.md workflow lifecycle references these same names. The `PLANNED` marker has no precedent elsewhere.

**Write allowlist doesn't permit the file.** `src/capabilities/evolve-plan.ts` defines `resolveEvolveWriteAllowlist` (line ~34):

```typescript
return [`${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`];
```

This is always step-number-dependent. When all steps are done, the agent writes `COMPLETED` at the goal workspace root — which is not inside any `S{NN}/` folder. The file protection handler in `src/capabilities/validation.ts` (`tool_call` event) enforces this allowlist and blocks writes to paths not explicitly listed.

**Validation expects step-folder files.** `resolveEvolveValidation` (line ~27) always returns `{ files: [`${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`] }`. When all steps are complete, the expected output should be `COMPLETED` instead of step-folder files. Currently the agent would fail validation because `S{NN}/TASK.md` and `S{NN}/TEST.md` don't exist for a nonexistent step.

**Files involved:**

- `src/prompts/evolve-plan.md` — instructs writing `PLANNED` (line ~46)
- `src/capabilities/evolve-plan.ts` — `resolveEvolveWriteAllowlist` and `resolveEvolveValidation` only cover step-folder files
- `src/capabilities/validation.ts` — file protection handler that enforces allowlists
- `src/skills/pio/SKILL.md` — workflow lifecycle docs (references `COMPLETED`/`BLOCKED`, should be consistent)

## To-Be State

**Rename PLANNED → COMPLETED in the prompt.** `src/prompts/evolve-plan.md` instructs writing an empty file called `COMPLETED` instead of `PLANNED`. This aligns with the naming convention used by `execute-task` and documented in `src/skills/pio/SKILL.md`.

**Add COMPLETED to the write allowlist unconditionally.** `resolveEvolveWriteAllowlist` in `src/capabilities/evolve-plan.ts` always includes `"COMPLETED"` in the returned array, regardless of step number:

```typescript
return ["COMPLETED", `${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`];
```

This is safe — the agent only writes the file when prompted to (i.e., when the assigned step doesn't exist in PLAN.md). Having it always-allowed is harmless.

**Make validation conditional on whether a step actually needs spec writing.** `resolveEvolveValidation` should return different expected files depending on the situation:
- When a valid step exists in PLAN.md → expect `S{NN}/TASK.md` and `S{NN}/TEST.md` (current behavior)
- When all steps are already specified (step doesn't exist in PLAN.md) → expect `COMPLETED` only

This may require reading PLAN.md during config resolution to determine which set of expected files to declare, or handling it differently in the validation logic.

**Update SKILL.md references.** `src/skills/pio/SKILL.md` workflow lifecycle description should remain consistent — no PLANNED references should exist. Verify all marker naming is `COMPLETED`/`BLOCKED`.

**Consider: Should evolve-plan detect an existing COMPLETED marker?** If a plan is already fully specified (COMPLETED exists at goal root), running `/pio-evolve-plan` again should ideally detect this and skip re-launching the sub-session, instead notifying the user that all steps are already defined. This is a nice-to-have improvement that could be part of this goal or deferred to a separate issue.
