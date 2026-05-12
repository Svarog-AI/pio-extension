# Summary: Fix evolve-plan COMPLETED marker — detection, validation, allowlist, and prompt

## Status
COMPLETED

## Files Created
- `__tests__/evolve-plan.test.ts` — Unit tests for validateOutputs COMPLETED short-circuit, resolveEvolveWriteAllowlist always including COMPLETED, and validateAndFindNextStep pre-launch guard

## Files Modified
- `src/capabilities/validation.ts` — Added COMPLETED short-circuit at the start of `validateOutputs`: if `COMPLETED` exists at `baseDir`, validation passes immediately regardless of other expected files
- `src/capabilities/evolve-plan.ts` — Three changes: (1) exported `validateAndFindNextStep` for testing, (2) added pre-launch guard checking for COMPLETED at goal root and returning `{ ready: false, error }` when found, (3) updated `resolveEvolveWriteAllowlist` to always include `"COMPLETED"` alongside step-folder paths, (4) updated `resolveEvolveValidation` to return `{ files: ["COMPLETED"] }` when no stepNumber is provided, (5) updated `defaultInitialMessage` to handle the all-steps-complete case gracefully
- `src/prompts/evolve-plan.md` — Renamed `PLANNED` → `COMPLETED` in the "all steps complete" instruction

## Files Deleted
- (none)

## Decisions Made
- **No host-side PLAN.md parsing:** Per TASK.md, the agent inside the sub-session handles detection via prompt instructions. The host only checks filesystem state (COMPLETED exists → don't relaunch).
- **Validation short-circuit in `validateOutputs`:** Minimal change — added a single fs.existsSync check at the start of the function. This is safe because only evolve-plan writes COMPLETED at the goal workspace root; other capabilities write COMPLETED inside S{NN}/ subfolders, which wouldn't match.
- **Always-allowed COMPLETED in write list:** Simple and harmless — avoids conditional logic in the allowlist callback. The agent only writes it when prompted to.
- **Conditional validation/allowlist on stepNumber presence:** When stepNumber is null, the callbacks return COMPLETED-only config instead of throwing. This handles the all-steps-complete scenario without threading a separate flag through params.

## Test Coverage
- 7 new tests in `__tests__/evolve-plan.test.ts`:
  - 4 tests for `validateOutputs` COMPLETED short-circuit (passes with COMPLETED, passes when COMPLETED is only expected file, fails normally without COMPLETED, doesn't match subfolder COMPLETED)
  - 1 test for `resolveEvolveWriteAllowlist` always including COMPLETED alongside step-folder paths
  - 2 tests for `validateAndFindNextStep` pre-launch guard (returns ready:false when COMPLETED exists, returns ready:true when it doesn't)
- All 129 existing tests continue to pass (no regressions across 7 test files)
