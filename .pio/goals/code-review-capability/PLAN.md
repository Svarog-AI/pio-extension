# Plan: Code Review Capability

Add a `review-code` capability between `execute-task` and `evolve-plan` that reviews implementations, writes `REVIEW.md`, and uses file-based conditional transitions (`APPROVED` marker) to decide whether to proceed or re-execute.

## Prerequisites

- None. All required files already exist in the project.

## Steps

### Step 1: Add conditional transition support and sessionParams to utils.ts + types.ts

**Description:** Extend `CAPABILITY_TRANSITIONS` to support callback-based transitions, and propagate original session params through auto-enqueue so downstream capabilities receive full context (goalName, stepNumber, etc.).

Two changes in this step:

**A. Conditional transitions:** Change the value type of `CAPABILITY_TRANSITIONS` from `string` to `string | CapabilityTransitionResolver`, where the resolver is a function taking context and returning the next capability name. Existing string entries work unchanged.

```ts
interface TransitionContext {
  capability: string;           // current capability name (e.g. "review-code")
  workingDir: string;            // goal workspace directory
  params?: Record<string, unknown>;  // session params from completing session (goalName, stepNumber, …)
}

type CapabilityTransitionResolver = (ctx: TransitionContext) => string | undefined;
```

Add an exported function `resolveNextCapability(capability: string, ctx: TransitionContext): string | undefined` that reads from `CAPABILITY_TRANSITIONS`, invokes callbacks when present, and returns the next capability name. All existing string entries resolve identically through this function (backwards compatible).

The `"review-code"` transition entry is a callback that checks for `S{NN}/APPROVED` in workingDir. Step number comes from `ctx.params.stepNumber`. On approval returns `"evolve-plan"`. Otherwise returns `"execute-task"`.

**B. Session params propagation:** Add an optional `sessionParams?: Record<string, unknown>` field to `CapabilityConfig` in `types.ts`. In `resolveCapabilityConfig` (utils.ts), store a copy of the original `params` as `sessionParams` on the returned config:

```ts
// at end of resolveCapabilityConfig return block:
return { capability: cap, ..., sessionParams: params };
```

This allows downstream code (validation.ts) to access the full set of params that created the session. The existing `CAPABILITY_CONFIG` export pattern is unaffected — `resolveCapabilityConfig` reads params from its call site and stores them.

**Acceptance criteria:**
- [ ] `CAPABILITY_TRANSITIONS` values accept both `string` and callable resolver functions
- [ ] New exported function `resolveNextCapability(capability, ctx)` resolves transitions (invokes callbacks when present)
- [ ] Existing string-only entries in the map resolve identically through the new function
- [ ] `CapabilityConfig` interface in `types.ts` has optional `sessionParams?: Record<string, unknown>` field
- [ ] `resolveCapabilityConfig` stores original params as `sessionParams` on returned config
- [ ] `"review-code"` transition entry exists as a callback checking for APPROVED file
- [ ] `npm run check` passes

**Files affected:**
- `src/utils.ts` — add types, resolver function, store sessionParams in resolveCapabilityConfig, add review-code transition entry with callback
- `src/types.ts` — add optional `sessionParams` field to `CapabilityConfig`

### Step 2: Update validation.ts to use conditional transitions and propagate params

**Description:** In `src/capabilities/validation.ts`, update the auto-enqueue logic in the `pio_mark_complete` tool:

1. Replace the direct map lookup `CAPABILITY_TRANSITIONS[capability]` with a call to `resolveNextCapability(capability, { capability, workingDir: dir, params })` where `params` comes from `config.sessionParams`. This enables callback-based transitions.

2. Pass original session params through to the enqueued task so downstream capabilities receive full context. The existing code passes `params: { goalName }` — change it to include the completing session's params as well:

```ts
// Before (current):
enqueueTask(cwd, { capability: nextCapability, params: { goalName } });

// After (changed):
enqueueTask(cwd, { capability: nextCapability, params: { goalName, ...(config.sessionParams || {}) } });
```

This preserves stepNumber and any other fields from the completing session. Existing capabilities are unaffected — string-only transition entries resolve identically through `resolveNextCapability`.

**Acceptance criteria:**
- [ ] Auto-enqueue calls `resolveNextCapability` instead of a direct map lookup
- [ ] Enqueued task params include both explicit `goalName` and any original `sessionParams` (preserving stepNumber, etc.)
- [ ] Existing capabilities transition unchanged — string entries resolve identically
- [ ] `npm run check` passes

**Files affected:**
- `src/capabilities/validation.ts` — replace direct lookup with resolver call, propagate sessionParams into enqueued task params

### Step 3: Create review-code capability module

**Description:** Create `src/capabilities/review-code.ts` following the existing capability pattern (modeled after `execute-task.ts`). Exports `CAPABILITY_CONFIG`, a tool (`pio_review_code`), a command (`/pio-review-code`), and `setupReviewCode(pi)`.

Key design decisions:
- **Validation:** The step must have a `COMPLETED` marker (was executed) and `SUMMARY.md` must exist. Unlike execute-task which requires NO COMPLETED, review-code requires COMPLETED to be present.
- **Step number resolution:** Tool accepts optional `stepNumber`. If omitted, finds the most recently completed step by scanning S01/, S02/, ... in descending order for a folder containing `COMPLETED` (not yet reviewed). This is a fallback — when enqueued via execute-task's auto-enqueue (Steps 1+2), stepNumber will be present in params.
- **Enqueue behavior:** On successful validation, enqueues `{ capability: "review-code", params: { goalName, stepNumber } }` via `enqueueTask`.
- **Command handler:** Validates preconditions, resolves config via `resolveCapabilityConfig`, sets validation to require `S{NN}/REVIEW.md`, and launches capability. Sets `readOnlyFiles` for input files (GOAL.md, PLAN.md, TASK.md, TEST.md, SUMMARY.md) and `writeAllowlist` for output targets (`S{NN}/REVIEW.md`, `S{NN}/APPROVED`).

**Acceptance criteria:**
- [ ] File exports `CAPABILITY_CONFIG` with prompt `"review-code.md"` and `defaultInitialMessage` referencing goal workspace and step number
- [ ] File exports `setupReviewCode(pi)` that registers `pio_review_code` tool and `/pio-review-code` command
- [ ] Tool validates: goal exists, step N has COMPLETED marker, SUMMARY.md exists
- [ ] Command handler sets validation to require `S{NN}/REVIEW.md`
- [ ] writeAllowlist includes REVIEW.md and APPROVED paths within the step folder
- [ ] When stepNumber is omitted from tool params, finds most recently completed step
- [ ] `npm run check` passes

**Files affected:**
- `src/capabilities/review-code.ts` — new file: capability module (tool + command + setup)

### Step 4: Create review-code system prompt

**Description:** Create `src/prompts/review-code.md` defining the Code Review Agent's behavior. The agent:

1. Reads `GOAL.md`, `PLAN.md`, `S{NN}/TASK.md`, `S{NN}/TEST.md`, and `S{NN}/SUMMARY.md`.
2. Uses `SUMMARY.md`'s "Files Created" and "Files Modified" sections to locate and read the actual implementation files.
3. Analyzes: test coverage vs acceptance criteria, implementation correctness, simplicity, anti-patterns, gaps between PLAN↔TASK↔implementation.
4. Categorizes issues by criticality: low, medium, high, critical.
5. High/critical issues must never be ignored silently. Low/medium issues use reviewer discretion — `ask_user` when in doubt.
6. Writes `S{NN}/REVIEW.md` with structured sections (Decision, Summary, Critical/High/Medium/Low Issues, Test Coverage Analysis, Gaps Identified, Recommendations).

**Conditional decision mechanism (file-based):**
- **If APPROVED:** Write an empty file at `S{NN}/APPROVED`. Leave COMPLETED intact. Then call `pio_mark_complete`. The transition callback detects APPROVED and routes to `evolve-plan`.
- **If REJECTED:** Do NOT write APPROVED. Delete the `S{NN}/COMPLETED` marker so that `isStepReady` in execute-task will consider this step ready for re-execution. Then call `pio_mark_complete`. The transition callback sees no APPROVED file and routes to `execute-task`.

The routing is handled entirely by infrastructure (the conditional transition callback). The agent's responsibility is simply: write REVIEW.md, create/delete marker files as appropriate, then call mark_complete.

**Acceptance criteria:**
- [ ] Prompt instructs reading all context files (GOAL.md, PLAN.md, TASK.md, TEST.md, SUMMARY.md)
- [ ] Prompt instructs using SUMMARY.md to find and read implementation files
- [ ] Prompt defines criticality levels: low, medium, high, critical with handling rules
- [ ] Prompt instructs `ask_user` when in doubt on approve/reject decisions
- [ ] APPROVED path: write `S{NN}/APPROVED` marker + call `pio_mark_complete`
- [ ] REJECTED path: delete `S{NN}/COMPLETED` + call `pio_mark_complete` (no APPROVED file written)
- [ ] REVIEW.md structure matches the specification from GOAL.md

**Files affected:**
- `src/prompts/review-code.md` — new file: system prompt for Code Review Agent

### Step 5: Create review-code skill description

**Description:** Create `src/skills/review-code/SKILL.md` following the pattern of existing skills (e.g., `src/skills/execute-task/SKILL.md`). Makes the capability discoverable in `<available_skills>`.

**Acceptance criteria:**
- [ ] File exists at `src/skills/review-code/SKILL.md`
- [ ] Contains YAML frontmatter with `name: review-code` and a `description` field
- [ ] Describes usage, output (REVIEW.md + APPROVED marker), and conditional workflow cycle

**Files affected:**
- `src/skills/review-code/SKILL.md` — new file: skill metadata for discovery

### Step 6: Wire review-code into extension entry point

**Description:** Update `src/index.ts` to import and register the new capability. Add the import for `setupReviewCode`, call `setupReviewCode(pi)` in the default export function, and add the skill path to the `skillPaths` array so it's discoverable.

**Acceptance criteria:**
- [ ] `import { setupReviewCode } from "./capabilities/review-code"` added
- [ ] `setupReviewCode(pi)` called inside the default export function
- [ ] `path.join(SKILLS_DIR, "review-code")` added to `skillPaths` array
- [ ] `npm run check` passes

**Files affected:**
- `src/index.ts` — add import, setup call, and skill path

### Step 7: Verify full integration

**Description:** Run the final type check to ensure all new and modified files compile correctly together. This validates the entire integration including conditional transitions, param propagation, and the new capability.

**Acceptance criteria:**
- [ ] `npm run check` passes with zero errors across the entire project
- [ ] All new files are syntactically valid TypeScript/markdown
- [ ] No circular import issues between utils.ts, validation.ts, and types.ts

**Files affected:**
- (verification only — no file changes)

## Notes

- **Param propagation flow:** `resolveCapabilityConfig(ctx.cwd, { goalName: "foo", stepNumber: 3 })` now stores `{ goalName: "foo", stepNumber: 3 }` as `sessionParams`. When mark_complete auto-enqueues, it spreads sessionParams into the enqueued task params. Downstream capabilities (review-code callback, execute-task, evolve-plan) receive full context without code changes.
- **GoalName duplication:** When validation.ts spreads sessionParams (which already contains goalName) alongside explicit `{ goalName }`, goalName appears twice — harmless since the last value wins in JS object spread. Acceptable for this project's patterns.
- **Conditional transition callback:** The review-code callback in `CAPABILITY_TRANSITIONS` reads `S{NN}/APPROVED` where NN comes from `ctx.params.stepNumber`. This is always available: (a) when enqueued by execute-task via Steps 1+2, stepNumber flows through sessionParams; (b) when launched manually with explicit stepNumber, it's in params directly.
- **Backwards compatibility:** All existing transition entries are plain strings. The resolver handles this with `typeof value === "string" ? value : value(ctx)`. Zero migration needed for any existing capability.
- **APPROVED marker lifecycle:** Created by review agent on approval, read by transition callback immediately after. After evolve-plan starts, the file can persist harmlessly — no subsequent capability reads it. On rejection, APPROVED is never written. If a step is rejected multiple times, each REVIEW.md overwrites the previous one.
- **COMPLETED marker lifecycle:** On rejection, review agent deletes `S{NN}/COMPLETED`. execute-task's `isStepReady` checks for absence of COMPLETED + BLOCKED, so re-execution proceeds normally. After successful re-execution, a new COMPLETED is written by execute-task per its existing contract.
- **REVIEW.md as feedback:** On rejection, REVIEW.md persists in the step folder. The next execute-task session will encounter it during its research phase (Step 3 — "Read files listed in TASK.md's Files affected"). No code changes to execute-task needed — the agent naturally discovers the review file alongside TASK.md/TEST.md.
- **File deletion and writeAllowlist:** On rejection, the agent deletes COMPLETED using bash (`rm S{NN}/COMPLETED`). The `tool_call` event handler in validation.ts blocks write tools targeting .pio/ files outside the allowlist, but doesn't block arbitrary file deletions via bash — consistent with existing patterns where execute-task also creates marker files during execution.
