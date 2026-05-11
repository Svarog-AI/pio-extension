# Plan: Fix step-dependent validation for capabilities launched via /pio-next-task

Allow `validation`, `readOnlyFiles`, and `writeAllowlist` in `CAPABILITY_CONFIG` to be callbacks (following the existing `defaultInitialMessage` pattern) so they resolve correctly regardless of launch path.

## Prerequisites

None.

## Steps

### Step 1: Add callback support to `StaticCapabilityConfig` + dispatch in `resolveCapabilityConfig()`

**Description:** In `src/types.ts`, update `StaticCapabilityConfig` to allow the three fields to each be either a static value or a callback. Mirror the existing `defaultInitialMessage` pattern — signature `(workingDir: string, params?: Record<string, unknown>) => T`:

```typescript
// Before:
validation?: ValidationRule;
readOnlyFiles?: string[];
writeAllowlist?: string[];

// After:
validation?: ValidationRule | ((workingDir: string, params?: Record<string, unknown>) => ValidationRule);
readOnlyFiles?: string[] | ((workingDir: string, params?: Record<string, unknown>) => string[]);
writeAllowlist?: string[] | ((workingDir: string, params?: Record<string, unknown>) => string[]);
```

In `src/utils.ts`, update `resolveCapabilityConfig()` to dispatch callbacks after computing `workingDir`. For each of the three fields: if the value from `CAPABILITY_CONFIG` is a function, invoke it with `(workingDir, params)` and use the result; otherwise use the static value as-is. This is identical to how `defaultInitialMessage` is already handled (line ~172).

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] Static capabilities still resolve identically — calling `resolveCapabilityConfig(cwd, { capability: "create-plan", goalName: "x" })` returns config with `validation.files` containing `["PLAN.md"]`, `readOnlyFiles` containing `["GOAL.md"]`, `writeAllowlist` containing `["PLAN.md"]`
- [ ] Calling `resolveCapabilityConfig(cwd, { capability: "evolve-plan", goalName: "x", stepNumber: 1 })` still returns a config object (step-dependent fields may be undefined since callbacks aren't added yet, but no crash or type error)

**Files affected:**
- `src/types.ts` — update `StaticCapabilityConfig`: change three fields to union (value | callback) types
- `src/utils.ts` — in `resolveCapabilityConfig()`, add callback dispatch for `validation`, `readOnlyFiles`, `writeAllowlist` after computing `workingDir`

### Step 2: Update step-dependent capabilities to use callbacks + remove inline overrides

**Description:** In each of the three capabilities, replace the placeholder comment with actual callback definitions in `CAPABILITY_CONFIG`. Then remove the now-redundant inline overrides from command handlers. Each callback follows the same pattern as `defaultInitialMessage`: extract `stepNumber` from `params`, compute folder name, return step-dependent paths relative to `workingDir`.

**evolve-plan.ts:**
- `validation: (dir, params) => ({ files: [folder/TASK_FILE, folder/TEST_FILE] })`
- `writeAllowlist: (dir, params) => [folder/TASK_FILE, folder/TEST_FILE]`
- Remove inline overrides from `handleEvolvePlan` (~lines 145-152): the manual `config.validation = ...` and `config.writeAllowlist = ...`

**execute-task.ts:**
- `validation: (dir, params) => ({ files: [folder/SUMMARY_FILE] })`
- `readOnlyFiles: (dir, params) => [folder/TASK_FILE, folder/TEST_FILE]`
- Remove inline overrides from `handleExecuteTask` (~lines 287-293): the manual `config.validation = ...` and `config.readOnlyFiles = ...`

**review-code.ts:**
- `validation: (dir, params) => ({ files: [folder/REVIEW_FILE] })`
- `readOnlyFiles: (dir, params) => [GOAL_FILE, PLAN_FILE, folder/TASK_FILE, folder/TEST_FILE, folder/SUMMARY_FILE]`
- `writeAllowlist: (dir, params) => [path.join(dir, folder, REVIEW_FILE), path.join(dir, folder, "APPROVED")]`
- Remove inline overrides from `handleReviewCode` (~lines 313-327): the manual `config.validation = ...`, `config.readOnlyFiles = ...`, and `config.writeAllowlist = ...`

Each capability already has a `stepFolderName()` helper to compute the zero-padded folder. The callbacks can reference it directly (same module scope).

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] Calling `resolveCapabilityConfig(cwd, { capability: "evolve-plan", goalName: "g", stepNumber: 1 })` returns config with `validation.files = ["S01/TASK.md", "S01/TEST.md"]` and correct `writeAllowlist` (previously both were `undefined`)
- [ ] Calling `resolveCapabilityConfig(cwd, { capability: "execute-task", goalName: "g", stepNumber: 2 })` returns config with `validation.files = ["S02/SUMMARY.md"]` and correct `readOnlyFiles` (previously both were `undefined`)
- [ ] Calling `resolveCapabilityConfig(cwd, { capability: "review-code", goalName: "g", stepNumber: 1 })` returns config with `validation.files = ["S01/REVIEW.md"]`, correct `readOnlyFiles`, and correct `writeAllowlist` (previously all were `undefined`)
- [ ] Direct commands produce identical config to before — same values reach `launchCapability()` (no regression). Verify by code inspection: the callback produces the same paths that the old inline override did.
- [ ] The three removed override blocks no longer appear in source files

**Files affected:**
- `src/capabilities/evolve-plan.ts` — add `validation` and `writeAllowlist` callbacks to `CAPABILITY_CONFIG`; remove inline overrides from `handleEvolvePlan`
- `src/capabilities/execute-task.ts` — add `validation` and `readOnlyFiles` callbacks to `CAPABILITY_CONFIG`; remove inline overrides from `handleExecuteTask`
- `src/capabilities/review-code.ts` — add `validation`, `readOnlyFiles`, and `writeAllowlist` callbacks to `CAPABILITY_CONFIG`; remove inline overrides from `handleReviewCode`

## Notes

- **Path format:** Keep paths relative to `workingDir`. Downstream consumers handle resolution: `validation.files` are joined with `workingDir` in `validateOutputs()`, and both `readOnlyFiles` / `writeAllowlist` are resolved via `path.resolve(workingDir, f)` in the `resources_discover` handler of `validation.ts`. The old `review-code.ts` used absolute paths for `writeAllowlist`, but relative works fine and is more consistent.
- **No behavioral change for direct commands:** The command path (handler → `resolveCapabilityConfig()` → `launchCapability()`) should produce identical config before and after. The fix targets the queue path where inline overrides were skipped.
- **`stepFolderName()` visibility:** In `evolve-plan.ts` and `review-code.ts` it's module-scoped (not exported), but callbacks live in the same scope — no visibility issues.
