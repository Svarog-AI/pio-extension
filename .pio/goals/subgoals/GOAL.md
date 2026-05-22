# Subgoals Feasibility Study

Conduct a feasibility study for supporting **subgoals** — plan steps that spawn nested goal workspaces passing through the full pio lifecycle (planning → specification → implementation → review) recursively. The study must determine whether this is architecturally viable with existing state management, transitions, and session queuing, identify required changes to core modules, and recommend a concrete approach.

User preference: **nested goals** (subgoals live inside step directories, allowing recursive nesting). Open to hybrid approaches with nested directory structures.

## Current State

### Goal workspace structure
Goal workspaces are flat under `.pio/goals/<name>/`. `resolveGoalDir(cwd, name)` at `src/fs-utils.ts` always resolves to `<cwd>/.pio/goals/<name>/` — there is no nesting support. Inside a goal: `GOAL.md`, `PLAN.md` (with YAML frontmatter `totalSteps`), step folders `S01/`, `S02/, ...` each containing `TASK.md`, `TEST.md`, `SUMMARY.md`, and status markers (`COMPLETED`, `APPROVED`, `REJECTED`, `BLOCKED`).

### GoalState path resolution
`createGoalState(goalDir)` in `src/goal-state.ts` derives `cwd` by splitting the goal dir path on `/goals/`. For a nested subgoal path like `<cwd>/.pio/goals/parent/S03/subgoals/nested/`, this derivation would find `<cwd>/.pio/goals/parent/` and return an incorrect cwd. The `steps()` method scans the goal dir for `S{NN}/` folders using the regex `/^S(\d+)$/`. Both assume a single-level goal workspace directly under `.pio/goals/`.

### Task queue
`src/queues.ts` provides per-goal single-slot FIFO at `.pio/session-queue/task-{goalName}.json`. The key is the goal name — one pending task per goal. Enqueuing overwrites any existing task for that goal. `listPendingGoals()` scans for `task-*.json` files and extracts goal names by stripping the `task-` prefix. No concept of hierarchical or composite keys.

### State machine
`src/state-machine.ts` is a pure transition resolver: current capability → next capability, based on `GoalState`. Current transitions are linear within a single goal: `create-goal` → `create-plan` → `evolve-plan` → `execute-task` → `review-task` → (back to `evolve-plan` or `execute-task`). `finalize-goal` is terminal. The state machine knows nothing about parent-child relationships — it operates on one goal workspace at a time via `goalName` + optional `stepNumber`.

### Session launcher
`launchCapability()` in `src/capabilities/session-capability.ts` creates sub-sessions via `ctx.newSession({ parentSession })` with the parent session file ref. Pi tracks parent-child relationships natively. `/pio-parent` (in `src/capabilities/parent.ts`) switches back to the parent session. No limit on nesting depth is documented in the pi API.

### File protection
`src/guards/validation.ts` enforces write restrictions via the `tool_call` event handler: default-deny for writes to `.pio/`, with exceptions for the session's own `workingDir` and explicit `writeAllowlist`. Current behavior: a session can write anywhere inside its `workingDir` (the goal workspace). No scoping for sub-workspaces within a goal.

### Capability config resolution
`src/capability-config.ts` resolves `CAPABILITY_CONFIG` per capability via dynamic import. Derives `workingDir` from `goalName` using `resolveGoalDir(cwd, goalName)`. If `goalName` is something like `parent__subgoal`, it would resolve to `.pio/goals/parent__subgoal/` (flat) — not a nested path.

### List goals
`src/capabilities/list-goals.ts` scans `.pio/goals/*/` as flat directories, filtering entries where the name matches `/^S\d{2}$/` to find step folders. A nested subgoal under `S03/subgoals/name/` would be invisible to this scanner — it only sees top-level directories under `.pio/goals/`.

## To-Be State

The feasibility study (produced as output of this goal) should analyze and document each dimension below, identifying required changes, conflicts, and the recommended approach. The study output should enable a go/no-go decision and feed directly into a `PLAN.md` if approved.

### Dimension 1: Nesting structure on disk
Evaluate how subgoal workspaces live relative to parent goal/step folders. User preference is **nested-in-step-dirs** (e.g., `.pio/goals/parent/S03/subgoals/nested-feature/`). Study must cover: recursive nesting depth, the `subgoals/` directory convention vs alternatives, and implications for `GoalState` path resolution in `src/goal-state.ts` and `resolveGoalDir` in `src/fs-utils.ts`.

### Dimension 2: Queue keying strategy
Per-goal single-slot queue uses goal name as key. Subgoals need unique queue slots without colliding with parents or siblings. Evaluate: hierarchical keys (e.g., `task-parent__nested.json`), path-based keys, multi-slot queues. Determine if concurrent parent+subgoal execution is desirable or if serialization is acceptable.

### Dimension 3: State machine extensions
Current transitions in `src/state-machine.ts` are linear within a single goal. Study must cover: how a step spawns a subgoal (new transition? piggyback on existing?), how the subgoal lifecycle composes with the parent's, and what happens when a subgoal completes (transition back to parent's `review-task`, auto-mark parent step `COMPLETED`, or manual intervention?).

### Dimension 4: Subgoal trigger mechanism
How is a subgoal initiated? During `evolve-plan` (specification writer decides a step needs its own goal), during `execute-task` (implementer requests decomposition), or via PLAN.md metadata (pre-declared subgoal steps)? Study should evaluate each initiation point and what information flows into subgoal creation.

### Dimension 5: File protection scope
A subgoal session's `workingDir` would be nested inside the parent goal workspace. Current validation at `src/guards/validation.ts` allows writes within `workingDir`. Study must verify correctness for nested paths or determine if explicit scoping changes are needed (e.g., preventing subgoal sessions from writing to parent-level files outside their own sub-goal directory).

### Dimension 6: Session hierarchy and navigation
With subgoals, session tree deepens: root → parent goal → parent step → subgoal create-goal → ... Study must assess whether pi's `parentSession` tracking supports arbitrary depth (it appears to via `ctx.newSession({ parentSession })`), how `/pio-parent` navigates through multiple levels, and whether the user needs visibility into the nesting chain.

### Dimension 7: Completion propagation
When a subgoal completes (`finalize-goal` or `<subgoalDir>/COMPLETED`), how does this propagate to mark the parent step as complete? Options: automatic `COMPLETED` + `SUMMARY.md` writing in the parent's `S{NN}/`, returning control to the parent's `review-task`, or requiring user intervention. User indicated "the subgoal, like any goal, has a COMPLETED marker. This is what counts."

### Dimension 8: GoalState and path resolution changes
`createGoalState(goalDir)` derives cwd by splitting on `/goals/`. Nested paths break this. Study must document required changes to `src/goal-state.ts`, `src/fs-utils.ts` (`resolveGoalDir`), and any other code that assumes flat goal workspace paths.

### Dimension 9: Planning awareness — how create-plan and evolve-plan distinguish subgoals from regular steps
Currently, PLAN.md frontmatter (`src/frontmatter-schemas.ts`, `PLAN_FRONTMATTER_SCHEMA`) contains only `totalSteps`. There is no per-step metadata or step typing. The study must cover:
- **Step-level metadata in PLAN.md:** Can individual steps carry a `type` field (e.g., `regular` vs `subgoal`) via frontmatter, body annotations, or a separate steps array? If so, how does this integrate with the existing markdown step format?
- **create-plan prompt changes:** The Planning Agent (`src/prompts/create-plan.md`) currently produces numbered steps. Does it need instructions to flag certain steps as subgoals? What heuristic determines when a step warrants subgoal decomposition vs plain implementation?
- **evolve-plan behavior divergence:** When `evolve-plan` (`src/capabilities/evolve-plan.ts`) encounters a subgoal-type step, does it skip TASK.md/TEST.md generation and instead spawn the subgoal directly? Or does it produce wrapper specs that delegate to the subgoal?
- **Frontmatter schema evolution:** `PLAN_FRONTMATTER_SCHEMA` in `src/frontmatter-schemas.ts` will need new fields. The study should identify what per-step or per-plan metadata is required (e.g., `subgoalName`, `subgoalPath`) and validate backward compatibility.

### Expected output
The feasibility study should be a structured analysis document (e.g., `FEASIBILITY.md`) containing:
- Assessment of each dimension with required changes categorized as: new fields, new logic, or breaking changes
- Recommended nesting approach with justification
- List of files requiring modification and estimated change scope
- Identified risks or blockers
- Clear go/no-go recommendation
