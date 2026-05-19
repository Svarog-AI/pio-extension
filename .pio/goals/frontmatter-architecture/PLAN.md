# Plan: Frontmatter Architecture

Move frontmatter parsing from the cross-cutting `validation.ts` guard into a shared generic module, add frontmatter awareness to `GoalState`, standardize all four capability lifecycle hooks (PreValidate, Prepare, PostValidate, PostExecute), and eliminate the `_private(state)` / `public(goalDir)` function pattern.

## Prerequisites

- None. All required dependencies (`js-yaml`) are already in `package.json`.

## Steps

### Step 1: Create shared frontmatter parsing module (`src/frontmatter.ts`)

**Description:** Create a new generic module that handles YAML extraction from files and schema-based validation/coercion. The module knows nothing about review decisions, issue counts, or any capability-specific semantics — it only understands "read YAML from file, validate against schema, return typed result."

Two public functions:
- `extractFrontmatter(filePath: string): Record<string, unknown> | null` — reads a file, finds the `---` delimited YAML block at top, parses with `js-yaml`. Returns `null` if file missing, no delimiters, or malformed YAML.
- `validateAndCoerce(raw: Record<string, unknown>, schema: OutputSchema): { data: T; error?: never } | { data?: never; error: string }` — validates required fields, checks types (string/integer/enum), applies constraints (min values). Returns typed output or error description.

Schema shape (defined as a type in this module):
```typescript
interface OutputField {
  name: string;
  type: "string" | "integer" | "enum";
  values?: string[];  // for enum type
  min?: number;        // for integer type
}

interface OutputSchema {
  fields: OutputField[];
}
```

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `extractFrontmatter` returns parsed object for valid `---...---` YAML, `null` for missing file / no delimiters / malformed YAML
- [ ] `validateAndCoerce` returns typed data on valid input, error string on missing fields, wrong types, out-of-range values, or invalid enum values
- [ ] Existing test suite passes with no regressions (`npx vitest run`)

**Files affected:**
- `src/frontmatter.ts` — new file: YAML extraction + schema-based validation/coercion

---

### Step 2: Add types, output schema, and marker creation to `review-task.ts`

**Description:** Move review-specific frontmatter logic from `validation.ts` into `review-task.ts`. This involves:

1. Define `ReviewOutputs` type and `REVIEW_OUTPUT_SCHEMA` constant (using the schema shape from Step 1):
   ```typescript
   interface ReviewOutputs {
     decision: "APPROVED" | "REJECTED";
     criticalIssues: number;
     highIssues: number;
     mediumIssues: number;
     lowIssues: number;
   }
   ```
2. Move `applyReviewDecision(workingDir, stepNumber, frontmatter)` from `validation.ts` — creates APPROVED/REJECTED markers and deletes COMPLETED on REJECT.
3. Eliminate the `_private(state)` / `public(goalDir)` split: `isStepReviewable` and `findMostRecentCompletedStep` accept `goalDir` directly and create state internally. Internal helpers like `isReviewable(step: StepStatus)` remain as unexported module-level utilities (no underscore prefix needed since they're not exported).

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `REVIEW_OUTPUT_SCHEMA` is exported from `review-task.ts` and uses the schema shape from `src/frontmatter.ts`
- [ ] `ReviewOutputs` type is exported from `review-task.ts`
- [ ] `applyReviewDecision` is exported and produces same file side effects as current implementation in `validation.ts`
- [ ] `isStepReviewable(goalDir, stepNumber)` accepts `goalDir` (no private `_isReviewable` wrapper)
- [ ] `findMostRecentCompletedStep(goalDir)` accepts `goalDir` (no private `_findMostRecentCompletedStep` wrapper)
- [ ] Existing tests in `src/capabilities/review-task.test.ts` pass with no regressions

**Files affected:**
- `src/capabilities/review-task.ts` — add types, schema, marker creation; eliminate _private/public split
- `src/guards/validation.ts` — remove `applyReviewDecision`, `validateReviewState` (no longer needed as a separate check — marker creation is self-consistent)

---

### Step 3: Add `getReviewOutputs(stepNumber)` to `GoalState`

**Description:** Add a typed method to `GoalState` for reading review frontmatter. The method resolves the `REVIEW.md` path for a given step, calls `extractFrontmatter` from the shared module with `REVIEW_OUTPUT_SCHEMA` from `review-task.ts`, and returns typed `ReviewOutputs` or `null`.

Implementation follows the existing lazy-evaluation pattern: no internal caching, reads fresh from disk on every call.

```typescript
getReviewOutputs: (stepNumber: number) => ReviewOutputs | null;
```

This requires importing from `review-task.ts` (for schema + types) and `frontmatter.ts` (for parser). Since `GoalState` currently has no capability-specific imports, verify there's no circular dependency introduced. If one exists, consider extracting the schema constant into a dedicated file (e.g., `src/frontmatter-schemas.ts`).

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors (no circular dependency)
- [ ] `getReviewOutputs(stepNumber)` returns typed `ReviewOutputs` for valid REVIEW.md with frontmatter
- [ ] Returns `null` when REVIEW.md missing, has no frontmatter, or has invalid frontmatter
- [ ] Step number is correctly zero-padded in path resolution (e.g., step 5 → `S05/REVIEW.md`)
- [ ] Existing tests in `src/goal-state.test.ts` pass with no regressions

**Files affected:**
- `src/goal-state.ts` — add `getReviewOutputs` method to `GoalState` interface and factory

---

### Step 4: Standardize all lifecycle hooks in types (`types.ts`)

**Description:** Extend the type definitions to document and support all four capability lifecycle phases. This makes the lifecycle explicit rather than implicit.

The four phases:
- **PreValidate** — inline validation at tool/command invocation, before queuing a session. Documented as a convention in `types.ts` comments. Each capability validates its own inputs (e.g., `validateStepForReview`). No hook type needed — remains inline per GOAL.md.
- **Prepare** (`prepareSession`) — runs on session startup (`resources_discover`). Already exists in types. No change needed to the type, but ensure it's clearly documented alongside the other phases.
- **PostValidate** (new) — runs after file-existence validation passes but before transition routing. Can fail to keep agent in session. Signature:
  ```typescript
  postValidate?: (goalDir: string, params?: Record<string, unknown>) => { success: boolean; message?: string };
  ```
- **PostExecute** (new) — runs after transition routing + task enqueuing completes. Applies irreversible side effects or capability-specific cleanup. Signature:
  ```typescript
  postExecute?: (goalDir: string, params?: Record<string, unknown>) => void | Promise<void>;
  ```

Add `postValidate` and `postExecute` to both `StaticCapabilityConfig` and `CapabilityConfig`. Add a block comment documenting the full lifecycle order and when each hook runs.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Both `StaticCapabilityConfig` and `CapabilityConfig` include `postValidate` and `postExecute` as optional fields
- [ ] Block comment documents all four lifecycle phases with their trigger points
- [ ] Existing test suite passes with no regressions (`npx vitest run`)

**Files affected:**
- `src/types.ts` — add `postValidate` and `postExecute` callback types; document full lifecycle

---

### Step 5: Wire `postValidate` and `postExecute` through `capability-config.ts`

**Description:** Update `resolveCapabilityConfig` in `capability-config.ts` to pass through both `postValidate` and `postExecute` callbacks from `CAPABILITY_CONFIG` into the resolved `CapabilityConfig`. This follows the existing pattern for `prepareSession` — callbacks are passed through directly since they're already functions.

The review-task `CAPABILITY_CONFIG.postValidate` implementation uses the shared frontmatter module + schema:
1. Resolve step number from params
2. Call `extractFrontmatter` on `S{NN}/REVIEW.md`
3. Call `validateAndCoerce` with `REVIEW_OUTPUT_SCHEMA`
4. On failure, return `{ success: false, message: "..." }`
5. On success, call `applyReviewDecision` (marker creation) and return `{ success: true }`

Marker creation happens in `postValidate` (before transition routing) so that `resolveTransition` can still read markers from disk via `GoalState.step.status()` — preserving existing transition behavior without changes to `state-machine.ts`.

The review-task does not define `postExecute` at this time. The hook is available for future use or for capabilities that need post-exit behavior beyond marker creation and generic cleanup.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `resolveCapabilityConfig` includes both `postValidate` and `postExecute` in the returned `CapabilityConfig` when defined on `CAPABILITY_CONFIG`
- [ ] `review-task.ts` exports `CAPABILITY_CONFIG.postValidate` that validates review frontmatter using shared parser + schema
- [ ] `postValidate` returns `{ success: false, message }` for missing/invalid frontmatter
- [ ] `postValidate` returns `{ success: true }` and creates markers (APPROVED/REJECTED) for valid frontmatter
- [ ] Existing test suite passes with no regressions

**Files affected:**
- `src/capability-config.ts` — pass through both `postValidate` and `postExecute` in resolved config
- `src/capabilities/review-task.ts` — add `postValidate` to `CAPABILITY_CONFIG` (uses shared parser + schema + applyReviewDecision)

---

### Step 6: Move `pio_mark_complete` from `validation.ts` to `session-capability.ts`

**Description:** Move the `pio_mark_complete` tool registration and execution logic from `validation.ts` into `session-capability.ts`. The tool now orchestrates the full exit lifecycle across all four phases:

1. Agent calls `pio_mark_complete`
2. **File-existence validation** (generic, reads `validation` from config)
3. **PostValidate** — call `postValidate` if defined on resolved capability config. On failure (`success: false`), return error to agent and stay in session. On success, continue.
4. **Transition routing + task enqueuing** — resolve transition via `state-machine.ts`, enqueue task via `queues.ts`
5. **Record transition audit** — `recordTransition(dir, capability, nextTask)`
6. **PostExecute** — call `postExecute` if defined on resolved capability config
7. **Cleanup** — delete files declared in `config.fileCleanup`
8. Return success, terminate session

The `validateOutputs` function (pure file-existence check) remains available for the tool to call — either keep it in `validation.ts` as a utility or move it to `fs-utils.ts`. Moving it avoids leaving an orphaned function in a file that's about to be slimmed down.

Remove from `validation.ts`: the `markCompleteTool` definition, the `setupValidation` tool registration (`pi.registerTool(markCompleteTool)`), and the review-specific automation block inside the tool execute handler. Keep `setupValidation` but simplify it to only register the `tool_call` guard and `resources_discover` handler for file protection config.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `pio_mark_complete` tool is registered by `session-capability.ts` (not `validation.ts`)
- [ ] Tool execution flow: validateOutputs → postValidate → resolveTransition → enqueueTask → recordTransition → postExecute → cleanup → terminate
- [ ] For review-task capability, valid frontmatter creates markers and enqueues correct next task
- [ ] For non-review capabilities, tool passes file validation and resolves transition without postValidate/postExecute
- [ ] `validation.ts` no longer registers any tools (only event handlers for file protection)
- [ ] Existing test suite passes with no regressions

**Files affected:**
- `src/capabilities/session-capability.ts` — gain `pio_mark_complete` tool registration + full exit orchestration (postValidate, transitions, postExecute)
- `src/guards/validation.ts` — remove `pio_mark_complete` tool, remove review automation block, keep file protection handlers
- `src/fs-utils.ts` — optionally receive `validateOutputs` if moved from validation.ts

---

### Step 7: Eliminate `_private(state)` / `public(goalDir)` split in `execute-task.ts`

**Description:** Simplify `execute-task.ts` by removing the `_isStepReady(state, stepNumber)` private helper and having `isStepReady(goalDir, stepNumber)` create state internally. The internal logic is straightforward enough to inline — no separate module-level helper is needed for a single-use function.

Before:
```typescript
function _isStepReady(state: GoalState, stepNumber: number): boolean { /* ... */ }
export function isStepReady(goalDir, stepNumber) { return _isStepReady(createGoalState(goalDir), stepNumber); }
```

After:
```typescript
export function isStepReady(goalDir: string, stepNumber: number): boolean {
  const state = createGoalState(goalDir);
  const step = state.steps().find(s => s.stepNumber === stepNumber);
  if (!step) return false;
  return step.status() === "defined";
}
```

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `isStepReady(goalDir, stepNumber)` produces same results as before (behavioral equivalence)
- [ ] No `_isStepReady` function exists in the file
- [ ] Existing tests in `src/capabilities/execute-task.test.ts` pass with no regressions

**Files affected:**
- `src/capabilities/execute-task.ts` — inline state creation into `isStepReady`, remove `_isStepReady`

---

### Step 8: Slim down `validation.ts` — retain only file protection

**Description:** Remove all frontmatter-related code and the mark-complete tool from `validation.ts`. The file should contain only:

1. File protection event handlers (`tool_call` guard with read-only / write-allowlist enforcement)
2. Session config loading on `resources_discover` (capturing `workingDir`, `readOnlyFiles`, `writeAllowlist`)
3. Turn counter reset on `turn_start`
4. The `validateOutputs` pure utility function (if not moved to `fs-utils.ts` in Step 6)
5. Re-export of `ValidationRule` type

Remove:
- All frontmatter functions: `parseReviewFrontmatter`, `validateReviewFrontmatter`, `toReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`
- Frontmatter types: `RawReviewFrontmatter`, `ReviewFrontmatter`
- `markCompleteTool` definition (moved in Step 6)
- `setupValidation` tool registration (`pi.registerTool`) — the function itself stays but only registers event handlers
- Review-specific imports (`js-yaml`)
- `extractGoalName` (if no longer needed after mark_complete moves; check if anything else uses it)

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `validation.ts` exports only: `setupValidation` (file protection), `validateOutputs`, `ValidationRule` type
- [ ] No frontmatter functions (`parseReviewFrontmatter`, etc.) exist in the file
- [ ] No `js-yaml` import in `validation.ts`
- [ ] No `defineTool` / tool registration in `validation.ts`
- [ ] File protection (readOnly/writeAllowlist) continues to work — verified by existing file protection tests

**Files affected:**
- `src/guards/validation.ts` — remove frontmatter functions, types, mark-complete tool; keep file protection + validateOutputs

---

### Step 9: Update `src/index.ts`, migrate tests, verify build

**Description:** Final integration step covering wiring updates and test migration.

1. **Update `src/index.ts`:** Ensure imports are correct after the refactoring. `setupValidation` is still imported from `validation.ts`. `session-capability.ts` now also registers `pio_mark_complete`. No changes needed if function signatures are preserved, but verify no dangling imports or missing exports.

2. **Migrate tests:**
   - Move frontmatter parsing/validation tests from `src/guards/validation.test.ts` into a new `src/frontmatter.test.ts` (testing the generic module with capability-agnostic test data)
   - Move `applyReviewDecision` and review schema tests from `validation.test.ts` to `src/capabilities/review-task.test.ts`
   - Add tests for `GoalState.getReviewOutputs()` in `src/goal-state.test.ts`
   - Add post-validate hook tests to `src/capabilities/review-task.test.ts` (valid APPROVED, valid REJECTED, missing frontmatter, invalid decision, negative counts)
   - Keep file protection (readOnly/writeAllowlist) tests in `src/guards/validation.test.ts`
   - Remove orphaned imports from `validation.test.ts`

3. **Verify:** Run full test suite and type check to confirm no regressions.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `npx vitest run` passes all tests with no regressions
- [ ] `src/frontmatter.test.ts` exists and covers `extractFrontmatter` and `validateAndCoerce`
- [ ] `src/guards/validation.test.ts` contains only file protection + validateOutputs + extractGoalName tests (if retained)
- [ ] `src/capabilities/review-task.test.ts` contains post-validate, applyReviewDecision, and schema tests
- [ ] `src/goal-state.test.ts` contains `getReviewOutputs` tests

**Files affected:**
- `src/index.ts` — verify imports are correct after refactoring
- `src/frontmatter.test.ts` — new file: tests for shared frontmatter module
- `src/guards/validation.test.ts` — remove frontmatter/mark-complete tests, keep file protection tests
- `src/capabilities/review-task.test.ts` — add post-validate and schema tests
- `src/goal-state.test.ts` — add `getReviewOutputs` tests
- `src/capabilities/session-capability.test.ts` — verify existing tests still pass

---

## Notes

- **Circular dependency risk:** `GoalState` importing from `review-task.ts` (for schema/types) could create a cycle if review-task indirectly depends on goal-state. Trace the import chain: `goal-state.ts → review-task.ts → capability-config.ts → types.ts`. Review-task does NOT import from goal-state, state-machine, or queues at module load time (dynamic imports only), so no cycle should exist. Verify with `npx tsc --noEmit` in Step 3.
- **`validateReviewState` removal:** The current `validateReviewState` function checks marker consistency after creation. Since `applyReviewDecision` is self-consistent (it always creates the correct marker), this check adds no value in the new architecture and can be removed.
- **`extractGoalName` from validation.ts:** Currently used in `validation.ts` mark_complete handler and exported. After moving mark_complete, check if it's still needed. It may be replaced by `path.basename(goalDir)` since goal directories always follow `<cwd>/.pio/goals/<name>` pattern.
- **Behavioral equivalence:** Steps 2 and 7 (function pattern refactor) must not change behavior — the public API remains the same (`isStepReviewable`, `findMostRecentCompletedStep`, `isStepReady` all accept `goalDir, stepNumber`). The only change is removing internal indirection.
- **Lifecycle order summary:** PreValidate (inline, unchanged) → prepareSession (existing, `resources_discover`) → agent session → PostValidate (`pio_mark_complete`, frontmatter + markers) → transition routing → task enqueuing → PostExecute (capability-specific side effects, currently unassigned for review-task) → cleanup → terminate.
- **Transition routing unchanged:** By keeping marker creation in `postValidate` (before transition resolution), the existing `resolveTransition` logic continues to work via `GoalState.step.status()` reading markers from disk. No changes to `state-machine.ts` needed for this goal.
- **PostExecute is wired but not assigned for review-task:** GOAL.md describes a separation between validation (can fail) and side effects (irreversible). Marker creation currently lives in `postValidate` because transitions need to read markers from disk. A future goal could move marker creation to `postExecute` if transition routing is updated to consume parsed frontmatter data instead of file-based status.
