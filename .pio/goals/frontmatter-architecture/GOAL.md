# Frontmatter Architecture

Move frontmatter parsing and types out of the cross-cutting `validation.ts` guard module into capability-owned modules. Add frontmatter awareness to `GoalState` so consumers can read structured data (e.g., review decisions, issue counts) without manually parsing files. Eliminate the `_private(state)` / `public(goalDir)` function pattern across capability modules in favor of a single public API that accepts `goalDir`.

## Current State

### Frontmatter parsing lives in the wrong place

The functions `parseReviewFrontmatter`, `validateReviewFrontmatter`, `toReviewFrontmatter`, `applyReviewDecision`, and `validateReviewState` all live in `src/guards/validation.ts` (~500 lines). These handle review-specific YAML frontmatter extracted from `REVIEW.md` files. The types `RawReviewFrontmatter` and `ReviewFrontmatter` are also defined there.

This creates several problems:

- **Wrong ownership**: The review-task capability (`src/capabilities/review-task.ts`) defines what frontmatter it needs (decision, issue counts) via the prompt at `src/prompts/review-task.md` (Step 7), but the parsing logic lives in a guard module.
- **Tight coupling**: `validation.ts` imports `js-yaml`, knows about review-specific file paths (`REVIEW.md` inside `S{NN}/` folders), and understands review types. This is cross-cutting concern pollution.
- **Not extensible**: If `execute-task` or `create-plan` want frontmatter in their output files (e.g., `SUMMARY.md` metadata), the pattern doesn't exist outside review. The guard module would need more capability-specific branches.
- **GoalState is blind**: `src/goal-state.ts` exposes lazy filesystem queries (`steps()`, `hasGoal()`, `hasPlan()`) but has no awareness of frontmatter content. Consumers must manually read and parse files to get structured data like review decisions.

### How validation.ts uses review frontmatter today

Inside the `pio_mark_complete` tool (`src/guards/validation.ts`, ~line 250), when `capability === "review-task"`, it:

1. Creates a `GoalState` from the working directory
2. Resolves the step number (from session params or `state.currentStepNumber()`)
3. Calls `parseReviewFrontmatter(reviewPath)` to extract YAML
4. Calls `validateReviewFrontmatter(frontmatter)` to validate decision and counts
5. Calls `toReviewFrontmatter(raw)` to coerce to strict types
6. Calls `applyReviewDecision(dir, stepNumber, frontmatter)` to create `APPROVED`/`REJECTED` markers
7. Calls `validateReviewState(dir, stepNumber, decision)` to verify consistency

This entire block is review-specific logic embedded in a generic validation module.

### Ugly `_private(state)` / `public(goalDir)` pattern

In `src/capabilities/review-task.ts`:
- `_isReviewable(step: StepStatus)` (private) + `isStepReviewable(goalDir, stepNumber)` (public wrapper)
- `_findMostRecentCompletedStep(state: GoalState)` (private) + `findMostRecentCompletedStep(goalDir)` (public wrapper)

In `src/capabilities/execute-task.ts`:
- `_isStepReady(state: GoalState, stepNumber)` (private) + `isStepReady(goalDir, stepNumber)` (public wrapper)

Each pattern creates `GoalState` in the public wrapper just to call the private function. This is unnecessary indirection — callers never benefit from the split since they always go through the public API.

### External dependencies

- `validation.ts` is imported only by `src/index.ts` (for `setupValidation`) and its own test file (`src/guards/validation.test.ts`).
- `review-task.ts` is imported only by `src/index.ts` (for `setupReviewTask`) and its own test file.
- `execute-task.ts` is imported only by `src/index.ts` (for `setupExecuteTask`) and its own test file.
- No other modules import the frontmatter-specific functions from `validation.ts`.

## To-Be State

### 1. Shared frontmatter parsing module

A new module `src/frontmatter.ts` handles the mechanical work shared across all capabilities:

- **Extract YAML block**: Read a file, find the `---` delimited YAML frontmatter at the top, parse it with `js-yaml`. Returns raw parsed object or `null` if the file doesn't exist, has no frontmatter delimiters, or YAML is malformed.
- **Schema-based coercion and validation**: Given a capability-defined schema describing expected fields (name, type, optional constraints like enum values or min/max), validate that all required fields are present with correct types. On success, return a typed output object. On failure, return an error description string.

The module is generic — it knows nothing about review decisions, issue counts, or any capability-specific semantics. It only understands: "read YAML from file, validate against schema, return typed result."

Each capability defines an **output schema** describing its expected frontmatter fields. For example, review-task exports:

```typescript
const REVIEW_OUTPUT_SCHEMA = {
  fields: [
    { name: "decision", type: "enum", values: ["APPROVED", "REJECTED"] },
    { name: "criticalIssues", type: "integer", min: 0 },
    { name: "highIssues", type: "integer", min: 0 },
    { name: "mediumIssues", type: "integer", min: 0 },
    { name: "lowIssues", type: "integer", min: 0 },
  ],
};
```

The parsing module reads the file, extracts YAML, validates against the schema, and returns a typed result. No capability-specific parsing code is needed — just the schema definition.

### 2. Capability-owned schemas and types

Each capability defines the frontmatter contract — types and schema — as exported constants. These are data definitions, not behavior.

**In `src/capabilities/review-task.ts`:**

- `ReviewOutputs` type: `{ decision: "APPROVED" | "REJECTED"; criticalIssues: number; highIssues: number; mediumIssues: number; lowIssues: number }`
- `REVIEW_OUTPUT_SCHEMA`: schema object defining expected frontmatter fields (field names, types, constraints)

That's it. The capability defines the shape of its outputs. No parsing logic lives here.

### 3. GoalState gains per-capability frontmatter methods

`src/goal-state.ts` gains typed methods for reading capability outputs. The approach is per-capability — not a generic "parse any YAML" interface:

- `getReviewOutputs(stepNumber: number)` — resolves the REVIEW.md path, calls the shared parser with `REVIEW_OUTPUT_SCHEMA`. Returns typed `ReviewOutputs` or `null`.

No delegation through capability modules. GoalState reads files and calls the shared parser directly. If `execute-task` later needs SUMMARY.md metadata, it exports a schema and GoalState gets a matching method. This keeps type safety high while making new additions minimal — one schema export in the capability + one method on GoalState per capability. Parsing is lazy (on first access), matching `GoalState`'s existing lazy-evaluation model.

### 4. Capability lifecycle hooks — standardized across all capabilities

Each capability lifecycle has distinct phases that should be expressed as explicit hooks rather than inline code scattered across modules:

| Phase | When it runs | Current state | Target state |
|-------|-------------|---------------|--------------|
| **PreValidate** | Tool/command invocation, before queuing a session | Inline validation in each capability's tool and command handler. e.g., `validateStepForReview` in review-task.ts checks GOAL.md, PLAN.md, step folder existence, COMPLETED marker, SUMMARY.md | Remains inline for now. Each capability validates its own inputs before launching. |
| **Prepare** | Session startup (`resources_discover`), before agent runs | Already exists: `prepareSession` hook in `StaticCapabilityConfig`. review-task uses it to delete stale APPROVED/REJECTED markers. Other capabilities omit it. | No change needed — this pattern already works. |
| **Agent session** | Normal operation | Prompt-driven agent work | No change. |
| **PostValidate** | `pio_mark_complete`, after file-existence validation passes | Hardcoded inline in `validation.ts` for review-task only (frontmatter parsing, marker creation). Other capabilities have no post-validation logic. | Optional field on `StaticCapabilityConfig`: `postValidate(goalDir, params) → { success: boolean; message?: string }`. Resolved through `capability-config.ts`, called by `session-capability.ts`. On failure, agent stays in session to fix. |
| **PostExecute** | After PostValidate passes, before transition routing | Currently mixed into PostValidate for review (deleting COMPLETED on REJECT happens inside `applyReviewDecision`). This is a side effect of the decision — not validation. No dedicated capability hook yet. | If a capability needs post-exit behavior beyond marker creation and generic cleanup, it exports `postExecute(goalDir, params)`. Resolved the same way as `prepareSession`, called by `session-capability.ts`. |

The key addition is making these phases explicit rather than implicit:

```typescript
function postValidate(goalDir: string, params?: Record<string, unknown>): { success: boolean; message?: string }
```

For review-task:
- **postValidate**: parse REVIEW.md frontmatter via shared parser + schema, validate decision value and issue counts. Returns success or error message.
- **postExecute** (currently mixed into `applyReviewDecision`): apply side effects of the validated decision — create APPROVED/REJECTED markers, delete COMPLETED on REJECT.

The split matters: postValidate can fail and keep the agent in the session to fix things. PostExecute runs once after successful validation and applies irreversible changes.

### 5. session-capability.ts orchestrates all lifecycle hooks + pio_mark_complete

`session-capability.ts` is the higher-level module — it owns the full capability session lifecycle from startup to exit, including tool registration:

| Phase | Triggered by event | Owned by |
|-------|-------------------|----------|
| **prepareSession** | `resources_discover` (startup) | `session-capability.ts` (already works today) |
| **postValidate** | `pio_mark_complete` execution | `session-capability.ts` |
| **transition routing + task enqueuing** | After postValidate passes | `session-capability.ts` (via `state-machine.ts`, `queues.ts`) |
| **postExecute** | After transition routing | `session-capability.ts` |
| **file protection** (readOnly/writeAllowlist) | `tool_call` event | Remains in `guards/` — cross-cutting guard, not capability-specific |

All lifecycle hooks are optional fields on `StaticCapabilityConfig`:

```typescript
interface StaticCapabilityConfig {
  // ... existing fields ...
  prepareSession?: (workingDir: string, params?) => void;
  postValidate?: (goalDir: string, params?) => { success: boolean; message?: string };
}
```

**The `pio_mark_complete` tool moves from `validation.ts` to `session-capability.ts`.** It registers the tool and handles the full flow:

1. Agent calls `pio_mark_complete`
2. File-existence validation (generic, reads `validation` from config)
3. Call `postValidate` if defined — fail = error to agent, success = continue
4. Resolve transition via `state-machine.ts`, enqueue task via `queues.ts`
5. Record transition audit
6. Call `postExecute` if defined
7. Return success, terminate session

This means `validation.ts` has no role beyond file protection (the `tool_call` guard). The mark-complete tool lives in the module that already owns the capability lifecycle.

Adding a new capability with post-validation logic requires only adding the callback to `CAPABILITY_CONFIG`. The resolution pipeline and callers stay the same.

### 6. Function pattern refactor — single public API

Eliminate the `_private(state)` / `public(goalDir)` split in both `review-task.ts` and `execute-task.ts`. Functions accept `goalDir` directly and create state internally:

- `isStepReviewable(goalDir, stepNumber)` — creates state, finds step, checks status
- `findMostRecentCompletedStep(goalDir)` — creates state, scans steps
- `isStepReady(goalDir, stepNumber)` — creates state, finds step, checks status

Internal helpers like `isReviewable(step: StepStatus)` can remain as private module-level utilities for deduplication (both validation and command paths need the same check), but there is no separate public/private function pair. The underscore prefix (`_`) pattern is removed — internal helpers are simply not exported.

### 7. Updated test coverage

- Frontmatter schema validation and coercion tests in a new `src/frontmatter.test.ts`
- Capability-specific output parsing tests (review schema, file resolution) move from `src/guards/validation.test.ts` to `src/capabilities/review-task.test.ts`
- New tests for `GoalState.getReviewOutputs()` verify lazy parsing, null on missing files, and malformed YAML handling
- Tests for the post-validation hook cover: valid APPROVED, valid REJECTED, missing frontmatter, invalid decision value, negative counts
- Function pattern refactor is validated by existing tests (no behavioral change — just removal of indirection)

### Files affected

| File | Change |
|------|--------|
| `src/guards/validation.ts` | Remove `pio_mark_complete` tool (moves to session-capability.ts). Remove frontmatter parsing. Retain only file protection (`tool_call` guard: readOnly/writeAllowlist). |
| `src/capabilities/session-capability.ts` | Gain `pio_mark_complete` tool registration + exit orchestration (postValidate → transition routing → task enqueuing → postExecute). |
| `src/frontmatter.ts` | New shared module: YAML extraction from files, schema-based validation/coercion. Generic — no capability-specific logic. |
| `src/capabilities/review-task.ts` | Add frontmatter types and output schema definition (`REVIEW_OUTPUT_SCHEMA`). Add marker creation (`applyReviewDecision`) and `postValidate`. Eliminate `_private`/`public` split. |
| `src/capabilities/execute-task.ts` | Eliminate `_private`/`public` split (`_isStepReady` → inline or private helper without public wrapper). |
| `src/goal-state.ts` | Add `getReviewOutputs(stepNumber)` method. Imports schema from review-task, calls shared parser directly (no delegation). |
| `src/guards/validation.test.ts` | Move frontmatter and mark-complete tests out. Keep file protection (readOnly/writeAllowlist) tests. |
| `src/capabilities/review-task.test.ts` | Add post-validation hook tests. |
| `src/capabilities/session-capability.test.ts` | Add mark-complete exit orchestration tests. |
