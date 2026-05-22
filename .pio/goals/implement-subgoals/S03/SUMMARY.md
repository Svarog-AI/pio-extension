# Summary: Plan frontmatter with per-step metadata and enriched StepStatus

## Status
COMPLETED

## Files Created
- (none — all files already existed from previous attempt)

## Files Modified
- `src/frontmatter-schemas.ts` — Made `complexity` optional in `STEP_ENTRY_SCHEMA` using `Type.Optional()`, matching TASK.md specification (optional union defaulting to `"task"`)
- `src/goal-state.ts` — Updated `getMetadata()` to default `complexity` to `"task"` when omitted from frontmatter, using nullish coalescing (`entry.complexity ?? "task"`)
- `src/goal-state.test.ts` — Fixed misleading test name (LOW issue from review): test now actually omits `complexity` in the YAML to verify defaulting behavior instead of providing it explicitly
- `src/capabilities/create-plan.test.ts` — Changed "rejects when a step entry is missing complexity" to "passes when steps entries omit complexity (defaults to task)", since `complexity` is now optional per TASK.md

## Files Deleted
- (none)

## Decisions Made
- **`complexity` is optional in the schema:** Reverted the DECISIONS.md deviation that made `complexity` mandatory. TASK.md explicitly specifies `complexity` as optional with a `"task"` default. The schema now uses `Type.Optional(Type.Union([Type.Literal("task"), Type.Literal("subgoal")]))`.
- **Defaulting in `getMetadata()`:** The `validateAndCoerce` function in `frontmatter.ts` is generic and doesn't know about defaults. Defaulting is applied in `getMetadata()` via `entry.complexity ?? "task"`, consistent with the TASK.md guidance: "default to 'task' in both validation and runtime code."
- **`steps` array remains required:** Only `complexity` within each entry is optional. The `steps` array itself is still required (`Type.Array`, not `Type.Optional`).

## Test Coverage
- All 581 tests pass (zero regressions)
- `npx tsc --noEmit` reports no errors
- `StepMetadata` type exported from `src/frontmatter-schemas.ts` (verified by grep)
- `PLAN_FRONTMATTER_SCHEMA` includes required `steps` (verified by grep, not wrapped in `Type.Optional`)
- New/updated tests verify:
  - `getMetadata()` defaults `complexity` to `"task"` when omitted in frontmatter
  - `postValidateCreatePlan` passes when steps entries omit `complexity`
  - All existing `getMetadata()` tests (valid frontmatter, graceful degradation, edge cases) continue to pass
