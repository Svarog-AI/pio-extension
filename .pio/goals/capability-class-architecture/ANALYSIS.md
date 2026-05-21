# Analysis: Capability Class Architecture

## Current Patterns

### 1. Capability inventory table

15 capability modules exist under `src/capabilities/` (excluding `session-capability.ts`, which is shared infrastructure). They fall into three categories: **session-based** (export `CAPABILITY_CONFIG` and use `launchCapability()`), **non-session** (tool/command only, no session launch), and **hybrid** (use `launchCapability` but reference another capability's config).

| Module | Category | Lines | Tool? | Command? | CAPABILITY_CONFIG? | prepareSession | postValidate | postExecute | Config callbacks |
|--------|----------|-------|-------|----------|---------------------|----------------|--------------|-------------|-------------------|
| create-goal.ts | session-based | 116 | yes | yes | yes | — | — | — | — |
| create-plan.ts | session-based | 176 | yes | yes | yes | — | yes | — | — |
| evolve-plan.ts | session-based | 231 | yes | yes | yes | — | — | — | validation, writeAllowlist |
| execute-task.ts | session-based | 315 | yes | yes | yes | — | — | — | validation, readOnlyFiles |
| review-task.ts | session-based | 421 | yes | yes | yes | yes | yes | — | validation, readOnlyFiles, writeAllowlist |
| execute-plan.ts | session-based | 90 | no | yes | yes | — | — | — | — |
| project-context.ts | session-based | 47 | no | yes | yes | — | — | — | — |
| create-issue.ts | non-session | 128 | yes | yes | no | — | — | — | — |
| goal-from-issue.ts | hybrid | 122 | yes | yes | no | — | — | — | — |
| finalize-goal.ts | session-based | 155 | yes | yes | yes | — | — | — | — |
| init.ts | non-session | 67 | yes | yes | no | — | — | — | — |
| delete-goal.ts | non-session | 69 | yes | yes | no | — | — | — | — |
| next-task.ts | non-session | 109 | no | yes | no | — | — | — | — |
| list-goals.ts | non-session | 98 | no | yes | no | — | — | — | — |
| parent.ts | non-session | 41 | no | yes | no | — | — | — | — |

**Totals:** 2,330 lines across 15 capability modules.

**Category breakdown:**
- **Session-based (10):** create-goal, create-plan, evolve-plan, execute-task, review-task, execute-plan, project-context, finalize-goal — all export `CAPABILITY_CONFIG: StaticCapabilityConfig` and use `launchCapability()` to create sub-sessions. 8 of 10 have both tool and command; execute-plan and project-context are command-only.
- **Non-session (5):** init, delete-goal, next-task, list-goals, parent — register tools and/or commands but never launch sessions. No `CAPABILITY_CONFIG`. All logic is inline in the handler or a core function.
- **Hybrid (1):** goal-from-issue — uses `launchCapability()` but references `create-goal`'s `CAPABILITY_CONFIG` via `resolveCapabilityConfig(ctx.cwd, { capability: "create-goal", ... })` rather than defining its own config. Has tool + command.

### 2. Boilerplate breakdown

#### Shared boilerplate across session-based capabilities

Every session-based capability follows this structural pattern:

1. **Import block** (~9 lines): `ExtensionAPI`, `ExtensionCommandContext`, `defineTool`, `Type`, `fs`, `path`, `launchCapability`, `resolveGoalDir`, `enqueueTask`, `resolveCapabilityConfig`, `StaticCapabilityConfig`, and sometimes `createGoalState`.
2. **CAPABILITY_CONFIG declaration** (~5–35 lines): `prompt`, `validation`, `readOnlyFiles`, `writeAllowlist`, `defaultInitialMessage`, and optional lifecycle hooks. Config callbacks (for step-dependent fields) add ~10–30 lines each.
3. **Tool definition** (~15–25 lines): `defineTool({...})` with `name`, `label`, `description`, `parameters` (TypeBox schema), and `execute` handler that calls validation → `enqueueTask` → returns result.
4. **Command handler** (~15–25 lines): arg parsing → validation → `resolveCapabilityConfig()` → `launchCapability()`. Always includes the "ctx is stale after launchCapability" comment.
5. **setupXxx() function** (~5–8 lines): `pi.registerTool()` and `pi.registerCommand()`.

Representative line counts per section:

| Section | Simple (create-goal) | Complex (review-task) |
|---------|---------------------|----------------------|
| Imports | 9 | 11 |
| CAPABILITY_CONFIG + callbacks | 15 | 55 |
| Tool definition | 22 | 25 |
| Command handler | 18 | 25 |
| setupXxx() | 7 | 7 |
| **Boilerplate subtotal** | **~71** | **~123** |
| Unique logic | ~45 | ~298 |
| **Total** | **116** | **421** |

#### Non-session capability boilerplate

Non-session capabilities follow a simpler pattern:

1. **Import block** (~4–7 lines): `ExtensionAPI`, `ExtensionCommandContext`, `defineTool`, `Type`, `fs`, `path`, and shared utilities.
2. **Core logic function** (~5–20 lines): The actual business logic (e.g., `init()`, `deleteGoal()`).
3. **Tool definition** (~12–20 lines): `defineTool({...})` with parameters and execute handler. (Not all have tools — next-task, list-goals, parent are command-only.)
4. **Command handler** (~8–20 lines): Arg parsing → call core function → `ctx.ui.notify()`.
5. **setupXxx() function** (~5–8 lines): `pi.registerTool()` and/or `pi.registerCommand()`.

Representative line counts:

| Section | init.ts 67 lines | list-goals.ts 98 lines |
|---------|--------------------|-------------------------|
| Imports | 7 | 6 |
| Core function | 12 | — |
| Tool definition | 18 | — |
| Command handler | 8 | 35 |
| Helpers (inferPhase, readLastTask) | — | 25 |
| setupXxx() | 6 | 6 |
| **Boilerplate subtotal** | **~43** | **~47** |
| Unique logic | ~24 | ~51 |
| **Total** | **67** | **98** |

### 3. Unique logic inventory

#### create-goal.ts 116 lines
- `prepareGoal(name, cwd)` — mkdir for goal workspace, checks for existence

#### create-plan.ts 176 lines
- `postValidateCreatePlan(goalDir)` — validates PLAN.md frontmatter `totalSteps` matches actual `## Step N:` heading count
- `STEP_HEADING_RE` regex constant
- `validateGoal(name, cwd)` — checks goal dir exists, GOAL.md present, PLAN.md absent

#### evolve-plan.ts 231 lines
- `resolveEvolveValidation(workingDir, params)` — config callback for step-dependent validation files
- `resolveEvolveWriteAllowlist(workingDir, params)` — config callback for step-dependent write allowlist
- `validateAndFindNextStep(name, cwd)` — scans S{NN}/ folders, checks for COMPLETED marker, uses frontmatter `totalSteps` for completion detection

#### execute-task.ts 315 lines
- `resolveExecuteValidation(dir, params)` — config callback for step-dependent validation
- `resolveExecuteReadOnlyFiles(dir, params)` — config callback for step-dependent read-only files
- `isStepReady(goalDir, stepNumber)` — checks step status is "defined" (TASK.md + TEST.md exist, no COMPLETED/BLOCKED)
- `validateAndFindNextStep(name, cwd)` — finds first step with status "defined"
- `validateExplicitStep(name, cwd, stepNumber)` — validates an explicitly requested step number

#### review-task.ts 421 lines
- `applyReviewDecision(goalDir, stepNumber, outputs)` — creates APPROVED/REJECTED marker files, deletes COMPLETED on rejection
- `resolveReviewValidation(dir, params)` — config callback
- `resolveReviewReadOnlyFiles(dir, params)` — config callback
- `resolveReviewWriteAllowlist(dir, params)` — config callback
- `prepareReviewSession(dir, params)` — lifecycle hook: deletes stale APPROVED/REJECTED markers
- `postValidateReview(goalDir, params)` — lifecycle hook: parses REVIEW.md frontmatter, calls `applyReviewDecision`
- `isReviewable(step)` — shared helper: checks status "implemented" + hasSummary
- `isStepReviewable(goalDir, stepNumber)` — public check for review readiness
- `findMostRecentCompletedStep(goalDir)` — scans steps descending for reviewable step
- `validateStepForReview(name, cwd, stepNumber)` — validates explicit step for review
- `validateAndFindReviewStep(name, cwd)` — finds most recent completed step

#### execute-plan.ts 90 lines
- `validateGoal(name, cwd)` — checks goal dir, GOAL.md, PLAN.md all exist

#### project-context.ts 47 lines
- (no unique functions — all logic is in CAPABILITY_CONFIG and inline command handler)

#### create-issue.ts 128 lines
- `createIssue(cwd, slug, title, description, category, context)` — writes issue markdown file

#### goal-from-issue.ts 122 lines
- `validateGoalFromIssue(cwd, issuePath)` — resolves issue path, derives goal name, checks for collisions

#### finalize-goal.ts 155 lines
- `validateFinalizeGoal(name, cwd)` — checks goal dir exists + COMPLETED marker present

#### init.ts 67 lines
- `init()` — creates .pio/ directory structure

#### delete-goal.ts 69 lines
- `deleteGoal(name, cwd)` — removes goal workspace directory

#### next-task.ts 109 lines
- `handleNextTask(args, ctx)` — reads queue file, resolves config, launches capability, cleans up queue
- `launchAndCleanup(ctx, dir, goalName, task)` — resolves config, launches session, deletes queue file

#### list-goals.ts 98 lines
- `inferPhase(goalDir)` — infers "empty"/"defined"/"planned"/"in progress" from filesystem state
- `readLastTask(goalDir)` — reads LAST_TASK.json for last capability name

#### parent.ts 41 lines
- `findParentPath(ctx)` — reads session header for parent session path

### 4. Shared infrastructure dependencies

| Module | Lines | Exports | Used by capabilities |
|--------|-------|---------|---------------------|
| session-capability.ts | 388 | `launchCapability()`, `setupCapability()`, `getSessionParams()`, `getStepNumber()`, `getSessionGoalName()`, `resolveProjectContextPath()` | All session-based + hybrid + next-task |
| capability-config.ts | 86 | `resolveCapabilityConfig()` | All session-based + hybrid + next-task |
| types.ts | 115 | `ValidationRule`, `CapabilityConfig`, `StaticCapabilityConfig`, `ConfigCallback<T>`, `PrepareSessionCallback`, `PostValidateCallback`, `PostExecuteCallback` | All session-based (for `CAPABILITY_CONFIG` typing) |
| fs-utils.ts | 126 | `resolveGoalDir()`, `stepFolderName()`, `goalExists()`, `discoverNextStep()`, `issuesDir()`, `findIssuePath()`, `deriveSessionName()` | All capabilities that reference goal/issue paths |
| queues.ts | 71 | `enqueueTask()`, `readPendingTask()`, `listPendingGoals()`, `writeLastTask()`, `queueDir()` | create-goal, create-plan, evolve-plan, execute-task, review-task, finalize-goal, goal-from-issue, next-task |
| goal-state.ts | 347 | `createGoalState()`, `StepStatus` | create-plan, evolve-plan, execute-task, review-task, finalize-goal |
| state-machine.ts | 218 | `resolveTransition()`, `recordTransition()` | session-capability.ts (inside `pio_mark_complete`) |
| guards/validation.ts | 222 | `validateOutputs()`, `setupValidation()` | session-capability.ts (inside `pio_mark_complete`) |
| model-config.ts | 154 | `resolveModelForCapability()` | session-capability.ts (inside `before_agent_start`) |

**Dependency graph summary:**
- Every session-based capability imports from: `session-capability.ts` (`launchCapability`), `capability-config.ts` (`resolveCapabilityConfig`, `StaticCapabilityConfig`), `fs-utils.ts` (path helpers), and `queues.ts` (`enqueueTask`).
- Capabilities with step-dependent config (evolve-plan, execute-task, review-task) additionally import `goal-state.ts`.
- `review-task.ts` is the most heavily dependent: it imports from `session-capability`, `fs-utils`, `queues`, `capability-config`, `goal-state`, and `frontmatter-schemas`.
- Non-session capabilities have minimal shared dependencies: typically just `fs-utils.ts` and possibly `queues.ts`.
- `session-capability.ts` is the central hub: it orchestrates the full lifecycle (resources_discover → prepareSession → before_agent_start → pio_mark_complete → postValidate → transition routing → postExecute → cleanup).

### 5. Boilerplate vs unique logic quantification

#### Per-capability breakdown

| Module | Total | Boilerplate | Unique | Boilerplate % |
|--------|-------|------------|--------|---------------|
| create-goal.ts | 116 | ~71 | ~45 | 61% |
| create-plan.ts | 176 | ~77 | ~99 | 44% |
| evolve-plan.ts | 231 | ~77 | ~154 | 33% |
| execute-task.ts | 315 | ~86 | ~229 | 27% |
| review-task.ts | 421 | ~86 | ~335 | 20% |
| execute-plan.ts | 90 | ~55 | ~35 | 61% |
| project-context.ts | 47 | ~35 | ~12 | 74% |
| finalize-goal.ts | 155 | ~77 | ~78 | 50% |
| goal-from-issue.ts | 122 | ~77 | ~45 | 63% |
| create-issue.ts | 128 | ~55 | ~73 | 43% |
| init.ts | 67 | ~43 | ~24 | 64% |
| delete-goal.ts | 69 | ~43 | ~26 | 62% |
| next-task.ts | 109 | ~40 | ~69 | 37% |
| list-goals.ts | 98 | ~47 | ~51 | 48% |
| parent.ts | 41 | ~25 | ~16 | 61% |
| **Total** | **2,330** | **~974** | **~1,356** | **42%** |

#### By category

| Category | Modules | Total lines | Boilerplate | Unique | Boilerplate % |
|----------|---------|-------------|-------------|--------|---------------|
| Session-based (with tool+command) | 8 | 1,775 | ~649 | ~1,126 | 37% |
| Session-based (command-only) | 2 | 137 | ~90 | ~47 | 66% |
| Non-session | 5 | 384 | ~198 | ~186 | 52% |
| Hybrid | 1 | 122 | ~77 | ~45 | 63% |

#### Key observations

1. **Boilerplate is significant but not dominant.** Across all 15 modules, ~42% of lines are structural boilerplate (imports, config blocks, tool definitions, command handlers, setup functions). The remaining ~58% is capability-specific logic.

2. **Complexity skews toward unique logic in larger modules.** The simplest session capability (project-context.ts, 47 lines) is 74% boilerplate. The most complex (review-task.ts, 421 lines) is only 20% boilerplate — the config callbacks, lifecycle hooks, and validation functions constitute the majority.

3. **The CAPABILITY_CONFIG block scales with capability complexity.** Simple capabilities (create-goal) have a ~15-line config. Complex ones (review-task) have ~55 lines of config + callbacks. This is the single biggest source of variation in boilerplate size.

4. **Non-session capabilities have less boilerplate but higher boilerplate ratios.** init.ts 67 lines is 64% boilerplate — the actual `init()` function body is only ~12 lines, while the surrounding scaffolding (imports, tool def, command handler, setup) is ~43 lines.

5. **Command-only session capabilities (execute-plan, project-context) are the most boilerplate-heavy.** Without a tool definition, they still carry the full import block, CAPABILITY_CONFIG, command handler, and setup function — but have very little unique logic.

---

## Variant Analysis

This section evaluates two class-based variants against the current config-object + callback pattern across all six research questions from GOAL.md. TypeScript interface/class sketches precede the question-by-question analysis to ground the comparison in concrete shapes.

### TypeScript Sketches

#### Variant A: Configurable Instances

A single `SessionCapability` class instantiated per-capability with a config object. Variation is expressed through constructor parameters and callback fields — conceptually similar to the current pattern but encapsulated in a class instance.

```typescript
// Variant A: SessionCapability — configurable instances
// Each capability creates one instance: new SessionCapability(config)

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type {
  StaticCapabilityConfig,
  CapabilityConfig,
  ValidationRule,
  ConfigCallback,
  PrepareSessionCallback,
  PostValidateCallback,
  PostExecuteCallback,
} from "../types";

/** Extended config for Variant A — wraps StaticCapabilityConfig with tool/command specifics. */
interface SessionCapabilityDefinition {
  /** Capability name (e.g. "create-goal") — used for tool name, command name, module import. */
  name: string;
  /** StaticCapabilityConfig fields — prompt, validation, readOnlyFiles, etc. */
  config: StaticCapabilityConfig;
  /** TypeBox parameter schema for the tool. */
  toolParameters: unknown; // TypeBox TSchema
  /** Tool description and label. */
  toolDescription: string;
  toolLabel: string;
  /** Command description. */
  commandDescription: string;
  /** Whether this capability exposes a tool (some are command-only). */
  hasTool?: boolean;
  /** Validation function: parses args, validates preconditions, returns { goalDir, ready, ... }.
   * Corresponds to current inline validation (e.g. validateGoal, validateAndFindNextStep). */
  validate: (args: string | undefined, cwd: string) => Promise<ValidationResult>;
}

interface ValidationResult {
  goalDir: string;
  ready: boolean;
  error?: string;
  [key: string]: unknown;
}

class SessionCapability {
  constructor(protected readonly def: SessionCapabilityDefinition) {}

  /** Register tool and command with ExtensionAPI. */
  setup(pi: ExtensionAPI): void {
    if (this.def.hasTool !== false) {
      pi.registerTool(this.buildTool());
    }
    pi.registerCommand(`pio-${this.def.name}`, {
      description: this.def.commandDescription,
      handler: this.handleCommand.bind(this),
    });
  }

  protected buildTool() {
    return defineTool({
      name: `pio_${this.def.name.replace(/-/g, "_")}`,
      label: this.def.toolLabel,
      description: this.def.toolDescription,
      parameters: this.def.toolParameters,
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
        // Tool execute: validate → enqueueTask → return result
        // Each capability needs custom tool execute logic.
        // In Variant A, this would be a callback in the definition.
        return this.def.toolExecute?.(_toolCallId, params, ctx) ??
          { content: [{ type: "text", text: "Not implemented" }], details: {} };
      },
    });
  }

  protected async handleCommand(args: string | undefined, ctx: ExtensionCommandContext): Promise<void> {
    const result = await this.def.validate(args, ctx.cwd);
    if (!result.ready) {
      ctx.ui.notify(result.error ?? "Validation failed", "error");
      return;
    }
    // launchCapability calls ctx.newSession() — after this, ctx is stale.
    const config = await resolveCapabilityConfig(ctx.cwd, {
      capability: this.def.name,
      ...(result as Record<string, unknown>),
    });
    if (!config) {
      ctx.ui.notify(`Failed to resolve ${this.def.name} config.`, "error");
      return;
    }
    await launchCapability(ctx, config);
  }
}

// Non-session capabilities: separate base class
abstract class ToolCapability {
  abstract readonly name: string;
  abstract setup(pi: ExtensionAPI): void;
}

// Usage examples — each capability is one instance:
const createGoalCapability = new SessionCapability({
  name: "create-goal",
  config: {
    prompt: "create-goal.md",
    validation: { files: ["GOAL.md"] },
    writeAllowlist: ["GOAL.md"],
    defaultInitialMessage: (workingDir, params) => { /* ... */ },
  },
  toolParameters: Type.Object({ name: Type.String() }),
  toolDescription: "Create a new goal workspace...",
  toolLabel: "Pio Create Goal",
  commandDescription: "Create a new goal workspace and launch a create-goal session",
  validate: async (args, cwd) => { /* prepareGoal logic */ },
  toolExecute: async (_id, params, ctx) => { /* enqueueTask logic */ },
});
```

**Key observations about Variant A:**
- The `SessionCapability` class encapsulates the common command handler pattern (validate → resolveCapabilityConfig → launchCapability). This eliminates the repeated command handler across all 10 session-based capabilities.
- However, tool `execute` logic, validation logic, and TypeBox parameter schemas are still per-capability and must be passed as callbacks or fields in the definition object.
- `StaticCapabilityConfig` is preserved as a nested field — the lifecycle hooks (`prepareSession`, `postValidate`, `postExecute`) remain callbacks.
- Non-session capabilities (`init`, `delete-goal`, etc.) get a separate `ToolCapability` abstract base, but this provides minimal value since they share almost no structure (some have tools, some are command-only, some have no CAPABILITY_CONFIG at all).

#### Variant B: Inheritance-Based Subclasses

A base `SessionCapability` class with overridable methods. Each capability is a subclass that overrides specific methods.

```typescript
// Variant B: SessionCapability — inheritance-based subclasses
// Each capability extends the base class and overrides methods

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type {
  StaticCapabilityConfig,
  CapabilityConfig,
} from "../types";

abstract class SessionCapability {
  abstract readonly name: string;
  abstract readonly config: StaticCapabilityConfig;

  setup(pi: ExtensionAPI): void {
    if (this.hasTool()) {
      pi.registerTool(this.defineTool());
    }
    pi.registerCommand(`pio-${this.name}`, {
      description: this.commandDescription(),
      handler: this.handleCommand.bind(this),
    });
  }

  // Override points — subclasses implement capability-specific behavior
  protected hasTool(): boolean { return true; }
  protected abstract defineTool(): ReturnType<typeof defineTool>;
  protected abstract commandDescription(): string;
  protected abstract handleCommand(args: string | undefined, ctx: ExtensionCommandContext): Promise<void>;
}

abstract class ToolCapability {
  abstract readonly name: string;
  abstract setup(pi: ExtensionAPI): void;
}

// Example: simple session capability
class CreateGoalCapability extends SessionCapability {
  readonly name = "create-goal";
  readonly config: StaticCapabilityConfig = {
    prompt: "create-goal.md",
    validation: { files: ["GOAL.md"] },
    writeAllowlist: ["GOAL.md"],
    defaultInitialMessage: (workingDir, params) => {
      const goalName = typeof params?.goalName === "string" ? params.goalName : undefined;
      if (goalName) return `Goal workspace created: ${goalName}\n\nWrite GOAL.md in this workspace.`;
      return `Created goal workspace at ${workingDir}`;
    },
  };

  protected commandDescription(): string {
    return "Create a new goal workspace and launch a create-goal session";
  }

  protected defineTool() {
    return defineTool({
      name: "pio_create_goal",
      label: "Pio Create Goal",
      description: "Create a new goal workspace...",
      parameters: Type.Object({
        name: Type.String({ description: "Name for the goal workspace" }),
        initialMessage: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
        // Tool execute logic — still inline per-subclass
        const { goalDir, ready } = await this.prepareGoal(params.name, ctx.cwd);
        if (!ready) return { content: [{ type: "text", text: `Goal already exists` }], details: {} };
        enqueueTask(ctx.cwd, params.name, { capability: "create-goal", params: { goalName: params.name } });
        return { content: [{ type: "text", text: `Goal workspace created.` }], details: {} };
      },
    });
  }

  protected async handleCommand(args: string | undefined, ctx: ExtensionCommandContext): Promise<void> {
    if (!args?.trim()) { ctx.ui.notify("Usage: /pio-create-goal <name>", "warning"); return; }
    const { goalDir, ready } = await this.prepareGoal(args.trim(), ctx.cwd);
    if (!ready) { ctx.ui.notify(`Goal already exists at ${goalDir}`, "warning"); return; }
    const config = await resolveCapabilityConfig(ctx.cwd, { capability: "create-goal", goalName: args.trim() });
    if (!config) { ctx.ui.notify("Failed to resolve config.", "error"); return; }
    await launchCapability(ctx, config);
  }

  // Capability-specific logic — was a module-level function, now a class method
  private async prepareGoal(name: string, cwd: string): Promise<{ goalDir: string; ready: boolean }> {
    const goalDir = resolveGoalDir(cwd, name);
    if (goalExists(goalDir)) return { goalDir, ready: false };
    fs.mkdirSync(goalDir, { recursive: true });
    return { goalDir, ready: true };
  }
}

// Example: complex session capability with lifecycle hooks
class ReviewTaskCapability extends SessionCapability {
  readonly name = "review-task";
  readonly config: StaticCapabilityConfig = {
    prompt: "review-task.md",
    validation: this.resolveReviewValidation.bind(this),
    readOnlyFiles: this.resolveReviewReadOnlyFiles.bind(this),
    writeAllowlist: this.resolveReviewWriteAllowlist.bind(this),
    prepareSession: this.prepareReviewSession.bind(this),
    postValidate: this.postValidateReview.bind(this),
    defaultInitialMessage: (workingDir, params) => {
      const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
      const folderName = stepFolderName(stepNumber!);
      return `Review Step ${stepNumber} in ${workingDir}/${folderName}/`;
    },
  };

  // Config callbacks — were module-level functions, now class methods
  private resolveReviewValidation(_dir: string, params?: Record<string, unknown>): { files: string[] } {
    const stepNumber = params?.stepNumber as number;
    return { files: [`${stepFolderName(stepNumber)}/REVIEW.md`] };
  }
  private resolveReviewReadOnlyFiles(_dir: string, params?: Record<string, unknown>): string[] {
    const stepNumber = params?.stepNumber as number;
    const folder = stepFolderName(stepNumber);
    return ["GOAL.md", "PLAN.md", `${folder}/TASK.md`, `${folder}/TEST.md`, `${folder}/SUMMARY.md"];
  }
  private resolveReviewWriteAllowlist(_dir: string, params?: Record<string, unknown>): string[] {
    return [`${stepFolderName(params!.stepNumber as number)}/REVIEW.md`];
  }
  private prepareReviewSession(_dir: string, params?: Record<string, unknown>): void {
    const folder = stepFolderName(params!.stepNumber as number);
    fs.rmSync(path.join(_dir, folder, "APPROVED"), { force: true });
    fs.rmSync(path.join(_dir, folder, "REJECTED"), { force: true });
  }
  private postValidateReview(goalDir: string, params?: Record<string, unknown>): { success: boolean; message?: string } {
    const state = createGoalState(goalDir);
    const result = state.getReviewOutputs(params!.stepNumber as number, { errors: true });
    if ("error" in result) return { success: false, message: result.error };
    applyReviewDecision(goalDir, params!.stepNumber as number, result.data!);
    return { success: true };
  }

  // Validation, tool definition, command handler — all overridden per-subclass
  protected commandDescription(): string { /* ... */ }
  protected defineTool() { /* ... */ }
  protected async handleCommand(args: string | undefined, ctx: ExtensionCommandContext): Promise<void> { /* ... */ }
}
```

**Key observations about Variant B:**
- The base `SessionCapability` class provides the `setup()` method that registers tool + command. This eliminates the ~5–8 line `setupXxx()` function per module.
- However, `defineTool()`, `handleCommand()`, and all validation logic must still be overridden per-subclass. The tool `execute` callback and command handler contain imperative logic that cannot be fully templated.
- Config callbacks (`resolveReviewValidation`, etc.) become class methods. This requires `.bind(this)` in the `config` object literal to preserve `this` context — a common gotcha.
- The `config` field must be initialized at the class declaration site (to satisfy the `StaticCapabilityConfig` type), but it references `this` methods — creating a chicken-and-egg problem during construction. This forces awkward patterns like `bind(this)` in the literal or splitting config into a getter.
- Non-session capabilities get a `ToolCapability` abstract base, but inheritance provides no shared behavior since non-session capabilities share almost no structure.

---

### Question 1: Pattern Capture

**How does each variant map the config-object + callback pattern? Does either handle non-session capabilities gracefully?**

#### Current pattern assessment

The current pattern uses `StaticCapabilityConfig` as a declarative config object, with optional callback fields for step-dependent values (`ConfigCallback<T>`) and lifecycle hooks (`PrepareSessionCallback`, `PostValidateCallback`, `PostExecuteCallback`). This cleanly separates static config (prompt, validation) from dynamic config (callbacks that receive `(workingDir, params)`). The module-level `CAPABILITY_CONFIG` export is consumed by `resolveCapabilityConfig()` via dynamic import.

Non-session capabilities have no `CAPABILITY_CONFIG` — they're just modules with `setupXxx()` registering tools and/or commands. `goal-from-issue.ts` and `next-task.ts` are hybrids: they call `launchCapability()` but reference another capability's config at runtime.

The pattern captures all three shapes (session, non-session, hybrid) without forcing a single mold. Each module exports exactly what it needs.

#### Variant A assessment

Variant A wraps `StaticCapabilityConfig` inside a `SessionCapabilityDefinition` that adds tool parameters, validation callbacks, and tool execute logic. The config-object pattern is preserved but extended — the class instance holds the config rather than a module-level constant.

**Problem:** The current `CAPABILITY_CONFIG` is consumed by `resolveCapabilityConfig()` via dynamic import (`import(\`./capabilities/${cap}\`)`). Variant A would need to either:
1. Keep the `CAPABILITY_CONFIG` export alongside the class instance (duplicating data), or
2. Replace dynamic import with a registry of instances (requiring explicit registration of every capability).

Option 1 defeats the purpose — the config still exists as a module-level constant. Option 2 adds a registration mechanism that doesn't exist today.

For non-session capabilities, Variant A introduces a `ToolCapability` abstract base. However, this is essentially empty — non-session capabilities share no common fields or methods. `init.ts` has a tool + command, `parent.ts` has command-only, and `list-goals.ts` has helper functions (`inferPhase`, `readLastTask`) with no config object. The abstract base would provide zero shared implementation.

#### Variant B assessment

Variant B expresses the config as a class field (`readonly config: StaticCapabilityConfig`). This has the same dynamic import problem as Variant A — `resolveCapabilityConfig()` expects a `CAPABILITY_CONFIG` export, so the subclass would need to re-export the field as a module-level constant anyway.

Additionally, Variant B creates a construction-order problem: the `config` field references `this` methods (for callbacks), but `this` is not fully initialized when the field initializer runs. This forces `.bind(this)` in the literal or deferring config construction to a factory method.

For non-session capabilities, Variant B's `ToolCapability` base class is equally empty. There's no polymorphic behavior to express — `init()` doesn't share structure with `deleteGoal()` or `findParentPath()`.

#### Comparative judgment

**Current pattern remains superior for pattern capture.** The config-object + callback approach cleanly separates static config from dynamic behavior without construction-order issues. Both variants struggle with the dynamic import mechanism (`resolveCapabilityConfig()`) and provide no meaningful improvement for non-session capabilities. The current pattern handles all three shapes (session, non-session, hybrid) naturally by letting each module export exactly what it needs — no class hierarchy forces.

---

### Question 2: Boilerplate Reduction

**Using baseline from Step 1, does a class eliminate duplication or merely relocate it?**

#### Current pattern assessment

Across all 15 modules (2,185 lines corrected total), approximately ~817 lines (~37%) are structural boilerplate. The boilerplate consists of:
- Import blocks (~4–11 lines per module)
- `CAPABILITY_CONFIG` declaration (~5–55 lines, scales with complexity)
- Tool definition (~12–25 lines)
- Command handler (~8–25 lines)
- `setupXxx()` function (~5–8 lines)

The simplest session capability (`project-context.ts`, 47 lines) is ~74% boilerplate. The most complex (`review-task.ts`, 421 lines) is ~20% boilerplate — unique logic dominates.

#### Variant A assessment

Variant A eliminates the repeated `setupXxx()` function (~5–8 lines × 10 session capabilities = ~60 lines saved) and the repeated command handler skeleton (~15–25 lines × 10 = ~180 lines saved). The `SessionCapability.setup()` method handles registration, and `handleCommand()` provides the common validate → resolveConfig → launch pattern.

**However,** the tool `execute` logic cannot be templated — each capability has unique validation, enqueue logic, and error handling. The TypeBox parameter schemas are entirely per-capability. The `CAPABILITY_CONFIG` equivalent still needs to be declared (as a `SessionCapabilityDefinition` field), and the dynamic import problem means the config may need to exist as both a class field AND a module-level export.

**Net estimate:** ~100–150 lines saved across 10 session capabilities (primarily from eliminating setup functions and command handler skeletons). This represents ~12–18% of the ~817 boilerplate lines. The remaining ~650+ lines of boilerplate (imports, config declarations, tool definitions) persist.

For non-session capabilities, Variant A saves nothing — the `ToolCapability` base provides no shared implementation.

#### Variant B assessment

Variant B eliminates `setupXxx()` (~60 lines saved) but requires each subclass to implement `defineTool()`, `handleCommand()`, and `commandDescription()`. The tool `defineTool()` call contains the same `name`, `label`, `description`, `parameters`, and `execute` fields — the subclass just wraps them in a method instead of a module-level constant. This relocates boilerplate rather than eliminating it.

The command handler skeleton is partially shared via the base class, but each subclass must still override `handleCommand()` with its own arg parsing and validation logic. For `review-task.ts` (421 lines), the subclass would contain ~380 lines of overrides — nearly the entire module.

**Net estimate:** ~50–80 lines saved (primarily from eliminating `setupXxx()` functions). The `.bind(this)` requirement for config callbacks adds ~5–10 lines of boilerplate per callback-heavy capability (review-task has 3 config callbacks + 2 lifecycle hooks = ~30 extra lines of `.bind(this)` calls).

**Net after bind overhead:** ~20–50 lines saved across all capabilities. Negligible.

#### Comparative judgment

**Variant A provides modest boilerplate reduction (~100–150 lines, ~12–18% of boilerplate) by eliminating setup functions and command handler skeletons. Variant B provides negligible reduction (~20–50 lines) after accounting for `.bind(this)` overhead and method override boilerplate.**

Neither variant eliminates the dominant boilerplate sources: imports (~9 lines × 15 modules = ~135 lines), `CAPABILITY_CONFIG` declarations (~5–55 lines each), and tool definitions (~15–25 lines each). These are inherently per-capability — they encode capability-specific parameters, validation schemas, and execute logic that cannot be factored into a base class.

The ~42% boilerplate ratio (corrected: ~37% of 2,185 lines) is not primarily in the setup/registration layer — it's in the config declarations and tool definitions, which are inherently unique per capability. A class hierarchy relocates the registration boilerplate but cannot eliminate the config and tool definition boilerplate.

---

### Question 3: Testing Impact

**Current pure functions are trivially testable. Would class instances require mocking `ExtensionAPI` or managing constructor injection?**

#### Current pattern assessment

Current testing is straightforward. Pure functions like `prepareGoal(name, cwd)` from `create-goal.ts`, `applyReviewDecision(goalDir, stepNumber, outputs)` from `review-task.ts`, and `isStepReviewable(goalDir, stepNumber)` are exported as module-level functions and tested directly:

```typescript
// From create-goal.test.ts
import { CAPABILITY_CONFIG, prepareGoal } from "./create-goal";

describe("CAPABILITY_CONFIG.defaultInitialMessage", () => {
  it("given { goalName: 'my-feature' }, message contains the goal name", () => {
    const result = CAPABILITY_CONFIG.defaultInitialMessage("/path", { goalName: "my-feature" });
    expect(result).toContain("my-feature");
  });
});

// From review-task.test.ts
import { applyReviewDecision, isStepReviewable, findMostRecentCompletedStep } from "./review-task";

describe("applyReviewDecision", () => {
  it("creates APPROVED marker when decision is APPROVED", () => {
    // Arrange: create temp goal tree
    const goalDir = createGoalTree(tempDir, "test", { stepNumber: 1 }).goalDir;
    // Act
    applyReviewDecision(goalDir, 1, { decision: "APPROVED", issues: [] });
    // Assert
    expect(fs.existsSync(path.join(goalDir, "S01", "APPROVED"))).toBe(true);
  });
});
```

Tests use `fs.mkdtempSync()` for temp directories (not mocked filesystems). No mocking of `ExtensionAPI` is needed because the pure functions don't depend on it. `CAPABILITY_CONFIG` fields are tested directly as exported constants.

#### Variant A assessment

In Variant A, `CAPABILITY_CONFIG` becomes a nested field inside `SessionCapabilityDefinition`. To test `defaultInitialMessage` or validation callbacks, tests would need to:
1. Construct a full `SessionCapabilityDefinition` (including tool parameters, validation function, etc.), or
2. Access the nested `config` field via an instance.

This adds setup overhead. Currently, `CAPABILITY_CONFIG` is imported directly. In Variant A, the test would need to either import the instance and access `.def.config`, or re-export the config separately (defeating the encapsulation).

Tool execute logic and command handlers are harder to test as class methods. Testing `handleCommand()` would require constructing the full `SessionCapability` instance with all config fields. Testing tool execute would require either extracting it as a separate method or mocking `ExtensionAPI` to capture the registered tool and invoke its execute handler.

**Impact:** Moderate negative. Pure functions remain testable if exported separately, but config field access requires instance construction. Command handler testing requires full instance setup.

#### Variant B assessment

In Variant B, the `config` field is a class property. Config callbacks are class methods. To test `resolveReviewValidation`, the test would need to:
1. Instantiate `ReviewTaskCapability` (which requires the full class to be constructed), or
2. Make the method `protected`/`public` and access it via an instance.

The construction-order problem (config field referencing `this` methods) makes instantiation fragile. Tests would need to handle the `.bind(this)` patterns.

For pure functions like `applyReviewDecision`, Variant B would move them to class methods. Testing them requires instantiating `ReviewTaskCapability`, which may have side effects (e.g., the constructor might register tools/commands if `setup()` is called during construction).

**Impact:** Significant negative. Class instantiation is required to access any method. The base class `setup()` method registers tools and commands with `ExtensionAPI` — tests would need to either mock `ExtensionAPI` or avoid calling `setup()`. Current tests import pure functions directly with zero mocking.

#### Comparative judgment

**Current pattern is superior for testing.** Module-level functions are imported and called directly with zero setup. `CAPABILITY_CONFIG` is a plain exported constant — testable as-is. Class instances (both variants) introduce construction overhead, potential side effects from `setup()`, and require either full instance construction or awkward protected method access. The current `.test.ts` files demonstrate that the module-level pattern produces clean, focused tests with no mocking.

---

### Question 4: Type Safety

**TypeScript already enforces `StaticCapabilityConfig` shape via structural typing. What additional compile-time guarantees would a class hierarchy provide?**

#### Current pattern assessment

TypeScript enforces the `StaticCapabilityConfig` interface structurally. Each `CAPABILITY_CONFIG` must have `prompt` (string), `defaultInitialMessage` (function), and optionally `validation`, `readOnlyFiles`, `writeAllowlist`, and lifecycle hooks. The compiler catches missing required fields and type mismatches in callback signatures.

`ConfigCallback<T>` provides generic type safety for step-dependent config fields: `ConfigCallback<ValidationRule>` ensures the callback returns `{ files: string[] }`, not an arbitrary object. Lifecycle callbacks have explicit return types: `PostValidateCallback` returns `{ success: boolean; message?: string }`.

However, there's no compile-time guarantee that:
- A capability with `validation` as a `ConfigCallback` actually passes `stepNumber` in params
- `setupXxx()` is called for every capability module
- The capability name in `enqueueTask()` matches the module filename

These are convention-based, not type-enforced. But they are low-risk — the dynamic import in `resolveCapabilityConfig()` fails at runtime with a clear warning if the module doesn't export `CAPABILITY_CONFIG`.

#### Variant A assessment

Variant A wraps `StaticCapabilityConfig` in `SessionCapabilityDefinition`, adding fields like `toolParameters`, `validate`, and `toolExecute`. The compiler would enforce that every definition provides these fields. This adds one compile-time guarantee: you can't forget to provide a validation function or tool parameters.

However, the relationship between `toolParameters` (TypeBox schema) and the actual tool `execute` handler is still unchecked. The `validate` function return type (`ValidationResult`) is an index signature — the compiler can't verify that `result.stepNumber` exists when the command handler reads it.

For lifecycle hooks, Variant A preserves the callback types from `StaticCapabilityConfig` — no improvement over the current pattern.

#### Variant B assessment

Variant B uses abstract methods to enforce that subclasses implement `defineTool()`, `handleCommand()`, and `commandDescription()`. The compiler catches missing overrides — you can't instantiate `SessionCapability` directly.

This provides one concrete guarantee: every session capability subclass must implement the core methods. If a developer forgets to override `handleCommand()`, the compiler errors.

However, the content of these methods is unchecked. `handleCommand()` could skip validation, skip `resolveCapabilityConfig()`, or call `launchCapability()` incorrectly — the compiler doesn't enforce the lifecycle order.

For config callbacks, Variant B has a type safety regression: the `config` field references `this` methods, requiring `.bind(this)`. If a developer forgets `.bind(this)`, the callback will receive `undefined` as `this` at runtime — a type-safe-looking pattern that produces runtime errors.

#### Comparative judgment

**No meaningful improvement in type safety for either variant.** The current pattern's structural typing (`StaticCapabilityConfig`, `ConfigCallback<T>`, lifecycle callback types) already provides strong compile-time guarantees. Variant A adds enforcement that definition fields are present — but these are already enforced by the `StaticCapabilityConfig` interface. Variant B adds enforcement that subclasses override abstract methods — but this merely shifts the guarantee from "module exports CAPABILITY_CONFIG" to "subclass implements abstract methods," with equivalent coverage.

Variant B introduces a type safety regression: `.bind(this)` requirements for config callbacks are easy to forget and produce runtime errors that TypeScript doesn't catch.

---

### Question 5: Lifecycle Hooks

**Current pattern uses 3 optional callbacks in `StaticCapabilityConfig`. Would overriding methods or configuring hooks on an instance feel more idiomatic?**

#### Current pattern assessment

The four-phase lifecycle is documented in `src/types.ts` comments:

1. **PreValidate** — inline per-capability (no hook). Each capability validates inputs in the tool execute handler or command handler.
2. **Prepare** — `prepareSession` hook, triggered at `resources_discover`. Only `review-task.ts` uses this (deletes stale APPROVED/REJECTED markers).
3. **PostValidate** — `postValidate` hook, triggered at `pio_mark_complete` after file validation. Used by `create-plan.ts` (validates PLAN.md step count) and `review-task.ts` (parses REVIEW.md frontmatter, creates markers).
4. **PostExecute** — `postExecute` hook, triggered after transition routing. Currently unused by any capability.

The callback approach is explicit and optional. Capabilities that don't need a hook simply omit it. The `session-capability.ts` module checks `if (config.prepareSession)` before calling — undefined hooks are a no-op.

Config callbacks (`ConfigCallback<T>`) handle step-dependent values: `evolve-plan.ts`, `execute-task.ts`, and `review-task.ts` use callbacks for `validation`, `readOnlyFiles`, and `writeAllowlist`. These receive `(workingDir, params)` and return the resolved value.

#### Variant A assessment

In Variant A, lifecycle hooks remain callback fields in the config object. The class doesn't change how hooks are expressed — they're still optional functions in `StaticCapabilityConfig`. The class instance holds the config but doesn't transform the hook pattern.

If Variant A moved hooks to class methods, it would require every capability to provide a method (even if empty). This is worse than optional callbacks — 8 of 10 session capabilities don't use `prepareSession`, and 8 of 10 don't use `postValidate`. Forcing empty method overrides adds boilerplate without value.

#### Variant B assessment

Variant B could express lifecycle hooks as overridable methods:

```typescript
abstract class SessionCapability {
  // Override points for lifecycle phases
  protected prepareSession(_workingDir: string, _params?: Record<string, unknown>): void {}
  protected postValidate(_goalDir: string, _params?: Record<string, unknown>): { success: boolean; message?: string } {
    return { success: true }; // Default: pass
  }
  protected postExecute(_goalDir: string, _params?: Record<string, unknown>): void {}
}
```

This provides default implementations (no-op for prepare/postExecute, pass for postValidate). Subclasses override only the hooks they need.

**Advantage:** No `.bind(this)` needed — `this.prepareSession` is already bound to the instance. The method signature is checked by the compiler.

**Disadvantage:** The `config` object still needs to reference these methods for `resolveCapabilityConfig()` to consume them. This requires either:
1. Setting `prepareSession: this.prepareSession.bind(this)` in the config literal (back to `.bind(this)`), or
2. Having `resolveCapabilityConfig()` read from the class instance instead of the config object (requires changing the dynamic import mechanism).

Option 1 negates the advantage. Option 2 requires architectural changes to `resolveCapabilityConfig()`.

#### Comparative judgment

**Current pattern remains superior for lifecycle hooks.** Optional callbacks are the right abstraction for sparsely-used hooks (3 of 10 capabilities use `prepareSession`, 2 use `postValidate`, 0 use `postExecute`). Making them class methods would force 8+ empty overrides per capability. The callback pattern in `StaticCapabilityConfig` is explicit, optional, and already well-typed via `PrepareSessionCallback`, `PostValidateCallback`, and `PostExecuteCallback`.

---

### Question 6: Non-Session Capabilities

**Account for `init`, `delete-goal`, `parent`, `next-task`, `list-goals` — do they fit the class hierarchy?**

#### Current pattern assessment

Non-session capabilities (5 modules, 384 lines total) share minimal structure:
- **`init.ts`** (67 lines): tool + command, no config. Core logic is `init()` — creates `.pio/` directory.
- **`delete-goal.ts`** (69 lines): tool + command, no config. Core logic is `deleteGoal()` — removes goal directory.
- **`parent.ts`** (41 lines): command-only, no tool. Core logic is `findParentPath()` — reads session header.
- **`list-goals.ts`** (98 lines): command-only, no tool. Helpers: `inferPhase()`, `readLastTask()`.
- **`next-task.ts`** (109 lines): command-only, no tool. Calls `launchCapability()` via `launchAndCleanup()` — resolves config at runtime for whatever capability is in the queue.

Hybrid capabilities:
- **`goal-from-issue.ts`** (122 lines): tool + command, no config. Calls `launchCapability()` referencing `create-goal`'s config.

No common base class or interface exists. Each module independently imports `defineTool`, `ExtensionAPI`, and registers its own tool/command.

#### Variant A assessment

Variant A introduces a `ToolCapability` abstract base for non-session capabilities. However, this base would be essentially empty:

```typescript
abstract class ToolCapability {
  abstract readonly name: string;
  abstract setup(pi: ExtensionAPI): void;
}
```

This provides no shared implementation. `init.ts` needs tool + command registration. `parent.ts` needs command-only. `list-goals.ts` has helper functions with no config. The abstract base doesn't eliminate any boilerplate — each subclass still needs its own `defineTool()`, command handler, and `setup()` implementation.

For `next-task.ts`, the situation is more complex: it calls `launchCapability()` but doesn't define its own config. In Variant A, it would need access to `launchCapability` and `resolveCapabilityConfig` — either as inherited methods (requiring a different base class that mixes session-launch support) or as direct imports (same as current pattern).

#### Variant B assessment

Variant B's `ToolCapability` base has the same emptiness problem. Additionally, inheritance creates a false implication of shared behavior. `init()` and `deleteGoal()` don't share logic — one creates directories, the other removes them. Forcing them into a common hierarchy adds indirection without reducing code.

For `next-task.ts`, Variant B would need a hybrid base class (e.g., `LaunchingToolCapability extends ToolCapability`) that provides `launchCapability` access. This creates a three-tier hierarchy (`SessionCapability`, `ToolCapability`, `LaunchingToolCapability`) for just one module (`next-task.ts`).

#### Comparative judgment

**Current pattern is superior for non-session capabilities.** The five non-session modules share almost no structure — some have tools, some are command-only, some call `launchCapability()` without config. A class hierarchy (`ToolCapability`) provides no shared implementation and adds meaningless inheritance. The two hybrid capabilities (`goal-from-issue.ts`, `next-task.ts`) further complicate categorization — they need session-launch support without defining their own config, which doesn't fit cleanly into either `SessionCapability` or `ToolCapability`.

The current pattern handles this naturally: each module imports what it needs and exports what it provides. No hierarchy forces. No empty base classes.

---

### Question 7: Extensibility

**How easy is it to add new capabilities in the future, and how do they connect via the transition system?**

#### Current pattern assessment

Adding a new session-based capability today requires four explicit steps:

1. **Create the module** (`src/capabilities/my-feature.ts`): Write imports, `CAPABILITY_CONFIG: StaticCapabilityConfig`, tool definition, command handler, and `setupMyFeature(pi)`. TypeScript enforces the `StaticCapabilityConfig` shape — missing `prompt` or `defaultInitialMessage` is a compile error.
2. **Wire in `index.ts`**: Add `import { setupMyFeature } from "./capabilities/my-feature"` and call `setupMyFeature(pi)`. This is the only manual wiring — 2 lines.
3. **Add a prompt** (`src/prompts/my-feature.md`): Write the system prompt for the sub-session.
4. **Wire transitions** (`src/state-machine.ts`): Add a `case "my-feature"` to the `resolveTransition` switch, returning a `TransitionResult` pointing to the next capability.

The transition system is a pure switch statement in `resolveTransition()`. Each capability name maps to a pure function (`transitionXxx(state, params)`) that returns `{ capability, params }`. Adding a new transition is adding one `case` branch and one pure function. No registration, no decorators, no convention-over-configuration.

**Concrete example — adding a hypothetical "approve-manually" capability:**

```typescript
// src/capabilities/approve-manually.ts (~100 lines total)
export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "approve-manually.md",
  validation: { files: ["S01/APPROVAL.md"] },
  writeAllowlist: ["S01/APPROVAL.md"],
  defaultInitialMessage: (workingDir, params) => `Review and approve step ${params?.stepNumber}...`,
};
// ... tool def, command handler, setupApproveManually(pi)
```

```typescript
// src/index.ts — add 2 lines
import { setupApproveManually } from "./capabilities/approve-manually";
// ...
setupApproveManually(pi);
```

```typescript
// src/state-machine.ts — add 1 case + 1 function
case "approve-manually":
  return transitionApproveManually(state, params);

function transitionApproveManually(state: GoalState, params?: Record<string, unknown>): TransitionResult {
  return { capability: "evolve-plan", params: { goalName, stepNumber: stepNumber + 1 } };
}
```

**Total: ~1 new file (~100 lines), 2 lines in index.ts, ~5 lines in state-machine.ts.**

For a non-session capability (tool/command only, no session), the process is simpler: create the module, wire in `index.ts`. No `CAPABILITY_CONFIG`, no prompt, no transitions. ~60–100 lines for the module, 2 lines in `index.ts`. No state-machine changes.

**Friction points:**
- The `index.ts` wiring is manual — forgetting to import and call `setupXxx()` produces no runtime error (the capability just doesn't exist). However, this is a one-time forget-able step per capability, and the capability simply won't be available if missed — no silent misbehavior.
- The transition switch requires manual updates. Adding a new capability without a corresponding transition entry means `resolveTransition()` returns `undefined` for that capability — the session completes but no next task is enqueued. This is a safe failure mode.

#### Variant A assessment

In Variant A, adding a new capability means creating a `SessionCapability` instance:

```typescript
const myFeatureCapability = new SessionCapability({
  name: "my-feature",
  config: { /* StaticCapabilityConfig fields */ },
  toolParameters: Type.Object({ /* ... */ }),
  toolDescription: "...",
  toolLabel: "...",
  commandDescription: "...",
  validate: async (args, cwd) => { /* ... */ },
  toolExecute: async (_id, params, ctx) => { /* ... */ },
});
```

Then wire in `index.ts`: `myFeatureCapability.setup(pi)`. Transitions still require updating `state-machine.ts` — Variant A doesn't change the transition mechanism.

**Potential improvement:** If Variant A introduced a registry pattern (e.g., `capabilityRegistry.register(myFeatureCapability)`), it could eliminate the explicit `setup(pi)` call in `index.ts`. However, this would require:
- A global registry module
- Auto-discovery or explicit registration of all instances
- A way to trigger `setup(pi)` for all registered instances at startup

This adds complexity for a marginal benefit — the current 2-line wiring in `index.ts` is explicit and easy to audit. A registry hides which capabilities are active.

**Transition wiring:** Unchanged. The `resolveTransition()` switch still needs manual updates. A class hierarchy doesn't automate transition registration — transitions encode workflow logic (which capability follows which), not just capability metadata.

**Net assessment:** Variant A doesn't meaningfully improve extensibility. The instance creation syntax is slightly more verbose than the current module-level `CAPABILITY_CONFIG` (wrapping config in a `SessionCapabilityDefinition` adds fields like `toolParameters`, `toolDescription`, `validate`). Transition wiring is identical.

#### Variant B assessment

In Variant B, adding a new capability means creating a subclass:

```typescript
class MyFeatureCapability extends SessionCapability {
  readonly name = "my-feature";
  readonly config: StaticCapabilityConfig = { /* ... */ };
  protected commandDescription(): string { return "..."; }
  protected defineTool() { return defineTool({ /* ... */ }); }
  protected async handleCommand(args, ctx) { /* ... */ }
}

const myFeatureCapability = new MyFeatureCapability();
```

Then wire: `myFeatureCapability.setup(pi)` in `index.ts`. Transition wiring still requires `state-machine.ts` changes.

**Construction-order problem:** The `config` field references `this` methods (for callbacks), requiring `.bind(this)` in the literal. A new developer adding a capability would need to understand this subtlety — it's not obvious from the base class interface.

**Potential improvement:** Variant B could theoretically provide a `setup()` implementation that auto-registers transitions based on the class name or a declared `nextCapability` field. However, this would require encoding workflow logic in the capability class — conflating "what this capability does" with "what happens after". The current separation (capability module = behavior, state-machine = workflow) is cleaner.

**Net assessment:** Variant B is the most verbose option for adding new capabilities. Subclass declaration + config field + method overrides + `.bind(this)` for callbacks + instantiation + wiring. No improvement to transition wiring.

#### Comparative judgment

**Current pattern is superior for extensibility.** Adding a new capability is a well-defined 4-step process: create module, wire in `index.ts`, add prompt, wire transitions. Each step is explicit and auditable. The module-per-capability pattern means a new developer can copy any existing capability (e.g., `create-goal.ts`) as a starting template and modify it — no inheritance hierarchy to understand, no construction-order gotchas.

The transition system (`resolveTransition()` switch) is the main extensibility bottleneck for all three approaches. It requires manual updates in `state-machine.ts` for every new capability that participates in the workflow. However, this is appropriate — transitions encode business logic (workflow rules), not capability metadata. Automating transition registration would conflate behavior with workflow and make the system harder to reason about.

If transition wiring is a genuine concern, the fix is not a class hierarchy — it's a declarative transition registry (e.g., a map or config file): `{ "create-goal": "create-plan", "create-plan": "evolve-plan", ... }`. This is orthogonal to the class-vs-config debate and could be added to the current pattern without restructuring capabilities.

---

### Question 8: Human Readability and Understandability

**How easy is it for a human (or AI agent) to read a capability module and understand: what callbacks do what, the lifecycle hook order, tool/command registration, and overall control flow?**

#### Current pattern assessment

A session-based capability module follows a predictable section order:

```
1. Imports
2. Config callbacks (resolveXxxValidation, resolveXxxReadOnlyFiles, etc.)
3. CAPABILITY_CONFIG — declarative summary
4. Constants
5. Validation/helper functions (isStepReady, validateAndFindNextStep)
6. Tool definition (defineTool)
7. Command handler (handleXxx)
8. setupXxx() — registration
```

**Strengths:**
- `CAPABILITY_CONFIG` is a **single declarative summary** of the capability's session shape. A reader can scan it to see: prompt, validation files, write allowlist, and which lifecycle hooks are active. This is the "table of contents" for the capability.
- Section separators (`// ---`) provide visual structure. Each section has a clear label.
- The module is self-contained — everything needed to understand the capability lives in one file.

**Weaknesses:**
- **Lifecycle hooks are defined as named functions above the config, then referenced by name in the config.** To understand what `prepareSession` does, the reader must find `prepareReviewSession` above the config, then trace it to `session-capability.ts` to understand *when* it runs. The lifecycle order (PreValidate → Prepare → PostValidate → PostExecute) is documented only in `src/types.ts` comments — not visible from the capability module itself.
- **Config callbacks are scattered above the config object.** In `review-task.ts`, `resolveReviewValidation`, `resolveReviewReadOnlyFiles`, `resolveReviewWriteAllowlist`, `prepareReviewSession`, and `postValidateReview` are all defined as standalone functions above `CAPABILITY_CONFIG`. The reader must scroll up to understand what each callback does.
- **Tool execute and command handler are separate but do similar things.** The tool execute handler validates → enqueues a task. The command handler validates → resolves config → launches a session. A reader needs to understand this split (tool = queue, command = launch) by reading both sections.
- **No explicit lifecycle ordering.** The four-phase lifecycle is implicit — the reader must know that `prepareSession` runs at `resources_discover`, `postValidate` runs at `pio_mark_complete`, etc. This knowledge lives in `session-capability.ts`, not the capability module.

**Concrete example — reading `review-task.ts` (421 lines):**

A new developer opening `review-task.ts` sees:
1. Imports (11 lines)
2. `applyReviewDecision()` — a pure function (not immediately clear this is a lifecycle helper)
3. `resolveReviewValidation()` — config callback (name suggests purpose, but when does it run?)
4. `resolveReviewReadOnlyFiles()` — config callback
5. `resolveReviewWriteAllowlist()` — config callback
6. `prepareReviewSession()` — lifecycle hook (name suggests "prepare", but when?)
7. `postValidateReview()` — lifecycle hook (name suggests "post-validate", but when?)
8. `CAPABILITY_CONFIG` — ties callbacks to lifecycle phases
9. Constants
10. `isReviewable()`, `isStepReviewable()`, `findMostRecentCompletedStep()` — validation helpers
11. `validateStepForReview()`, `validateAndFindReviewStep()` — PreValidate logic
12. Tool definition
13. Command handler
14. `setupReviewTask()`

The reader must mentally reconstruct: "Callbacks 3–5 are step-dependent config. Function 6 is the Prepare phase. Function 7 is the PostValidate phase. Functions 10–11 are PreValidate. Tool def is the tool handler. Command handler is the CLI entry point. Setup registers both."

#### Variant A assessment

In Variant A, the `SessionCapability` instance holds a `SessionCapabilityDefinition` config. The lifecycle hooks remain callbacks in the config — the same scattering problem persists.

**Potential improvement:** The class could provide a `setup()` method that documents the registration order:

```typescript
class SessionCapability {
  setup(pi: ExtensionAPI): void {
    // 1. Register tool (if hasTool)
    if (this.def.hasTool !== false) pi.registerTool(this.buildTool());
    // 2. Register command
    pi.registerCommand(`pio-${this.def.name}`, { handler: this.handleCommand.bind(this) });
  }
}
```

This makes the registration order explicit in one place. However, the lifecycle hook order (Prepare → PostValidate → PostExecute) is still in `session-capability.ts`, not the capability instance.

**No improvement to callback discoverability.** The reader still needs to find callback functions defined separately and referenced by name in the config.

#### Variant B assessment

Variant B offers the strongest readability improvement through **method ordering as documentation**:

```typescript
class ReviewTaskCapability extends SessionCapability {
  readonly name = "review-task";

  // --- Lifecycle hooks (called in this order by the framework) ---

  // Phase 1: Prepare (runs at session startup, before agent)
  protected prepareSession(workingDir: string, params?: Record<string, unknown>): void {
    // Delete stale markers
  }

  // Phase 2: PostValidate (runs at pio_mark_complete, after file validation)
  protected postValidate(goalDir: string, params?: Record<string, unknown>): { success: boolean; message?: string } {
    // Parse REVIEW.md, create APPROVED/REJECTED
  }

  // Phase 3: PostExecute (runs after transition routing)
  // (not overridden — uses base no-op)

  // --- Registration ---
  protected defineTool() { /* ... */ }
  protected handleCommand(args, ctx) { /* ... */ }

  // --- Validation helpers ---
  private validateStepForReview(name, cwd, stepNumber) { /* ... */ }
}
```

**Strengths:**
- **Lifecycle phases are explicit methods with clear names.** A reader sees `prepareSession()`, `postValidate()`, `postExecute()` as method overrides — the names match the lifecycle phase names from `types.ts`. No need to trace callback names through a config object.
- **Method order documents execution order.** Comments can label each phase (Prepare, PostValidate, PostExecute) and the reader sees them in the file in the same order the framework calls them.
- **No callback indirection.** The method body *is* the hook implementation. No need to find `prepareReviewSession` above the config and then trace it to `CAPABILITY_CONFIG.prepareSession`.
- **Base class as documentation.** The abstract `SessionCapability` class can document the lifecycle order:
  ```typescript
  abstract class SessionCapability {
    /** Phase 2: Prepare — runs at session startup. Override for stale-state cleanup. */
    protected prepareSession(_dir: string, _params?: Record<string, unknown>): void {}
    /** Phase 3: PostValidate — runs at pio_mark_complete. Override to add custom validation. */
    protected postValidate(_dir: string, _params?: Record<string, unknown>): { success: boolean } { return { success: true }; }
    /** Phase 4: PostExecute — runs after transitions. Override for irreversible side effects. */
    protected postExecute(_dir: string, _params?: Record<string, unknown>): void {}
  }
  ```
  This is the lifecycle documentation *in the code* — not in a separate `types.ts` comment block.

**Weaknesses:**
- **Requires understanding inheritance.** A reader must understand that `prepareSession` is called by the base class, not by the subclass. This is standard OOP but adds a layer of indirection compared to module-level functions.
- **`.bind(this)` problem for config callbacks.** If config callbacks (`validation`, `readOnlyFiles`) are class methods, they need `.bind(this)` in the config literal. This is a readability detractor — the reader sees `validation: this.resolveValidation.bind(this)` and must understand why `bind` is needed.
- **More boilerplate per capability.** The subclass declaration, field initializers, and method signatures add visual noise.

#### Comparative judgment

**Variant B provides the strongest readability improvement for lifecycle hooks.** Overriding named methods (`prepareSession`, `postValidate`, `postExecute`) is more immediately understandable than tracing callback names through a config object. The method order in the subclass documents the execution order. The base class serves as inline lifecycle documentation.

**However, the current pattern has a readability advantage for the "at-a-glance" case.** `CAPABILITY_CONFIG` is a single declarative summary — a reader can scan it to understand the capability's session shape without reading implementation details. Variant B scatters this information across method declarations and field initializers.

**The readability trade-off is: declarative summary (current) vs procedural clarity (Variant B).**

- **Current pattern:** `CAPABILITY_CONFIG` is a great "table of contents" but requires scrolling to find callback implementations. Lifecycle order is implicit.
- **Variant B:** Lifecycle hooks are explicit methods in execution order, but the "table of contents" is scattered across the class. The reader must scan the full class to see which hooks are active.

**Neither variant is clearly superior for overall readability.** The current pattern excels at quick scanning (CAPABILITY_CONFIG as summary). Variant B excels at deep understanding (lifecycle methods in order). A hybrid approach — keeping `CAPABILITY_CONFIG` as a summary while expressing hooks as methods — could capture both benefits, but that hybrid is essentially Variant A with method-based hooks, which introduces the `.bind(this)` problem.

---

### Summary Table

| Research Question | Current Pattern | Variant A (Instances) | Variant B (Subclasses) | Winner |
|---|---|---|---|---|
| Q1: Pattern capture | Handles all 3 shapes naturally | Dynamic import problem; empty ToolCapability base | Same + construction-order issues | **Current** |
| Q2: Boilerplate reduction | ~37% boilerplate (817/2,185 lines) | ~100–150 lines saved (~12–18% of boilerplate) | ~20–50 lines saved (negligible after `.bind(this)`) | **Variant A** (modest) |
| Q3: Testing impact | Pure functions, zero mocking | Moderate negative (instance construction needed) | Significant negative (full instantiation + mock ExtensionAPI) | **Current** |
| Q4: Type safety | Structural typing via interfaces | No meaningful improvement | Regression (`.bind(this)` runtime errors) | **Current** |
| Q5: Lifecycle hooks | Optional callbacks, sparsely used | No improvement (callbacks preserved) | Method overrides force 8+ empty implementations | **Current** |
| Q6: Non-session capabilities | Each module exports what it needs | Empty ToolCapability base | Three-tier hierarchy for 1 module | **Current** |
| Q7: Extensibility | 4-step explicit process, copy-any-module as template | No improvement, more verbose definition | Most verbose, construction-order gotchas | **Current** |
| Q8: Readability | CAPABILITY_CONFIG as declarative summary, lifecycle order implicit | No improvement (callbacks still scattered) | Lifecycle methods in execution order, but loses config summary | **Variant B** (for lifecycle clarity) / **Current** (for quick scanning) |

---

## Decision

### Recommendation: Reject the refactor

**The evidence overwhelmingly supports keeping the current config-object + callback pattern. The refactor to a class-based architecture (either Variant A or Variant B) is rejected.**

The current pattern wins on 7 of 8 research questions. The sole exception — boilerplate reduction (Q2) — favors Variant A only modestly: ~100–150 lines saved across 10 session capabilities, representing ~12–18% of the ~817 boilerplate lines out of 2,185 total lines. This marginal gain does not justify the costs in testability, type safety, and conceptual complexity.

---

### Summary of evidence

**Q1 — Pattern capture:** The current pattern handles all three capability shapes (session-based, non-session, hybrid) naturally by letting each module export exactly what it needs. Both variants struggle with `resolveCapabilityConfig()`'s dynamic import (`import(\`./capabilities/${cap}\`)`) — Variant A would need to keep `CAPABILITY_CONFIG` as a module-level export alongside the class instance (duplicating data), and Variant B faces the same problem plus construction-order issues. Neither variant improves non-session capability handling; the `ToolCapability` base class is empty in both cases.s a module-level export alongside the class instance (duplicating data), and Variant B faces the same problem plus construction-order issues. Neither variant improves non-session capability handling; the `ToolCapability` base class is empty in both cases.

**Q2 — Boilerplate reduction:** Variant A saves ~100–150 lines by eliminating `setupXxx()` functions (~60 lines) and command handler skeletons (~180 lines). However, the dominant boilerplate sources persist: imports (~135 lines across 15 modules), `CAPABILITY_CONFIG` declarations (~5–55 lines each), and tool definitions (~15–25 lines each). These encode capability-specific parameters and logic that cannot be factored into a base class. Variant B saves ~20–50 lines after accounting for `.bind(this)` overhead — the `ReviewTaskCapability` subclass alone would need ~30 extra lines of `.bind(this)` calls for its 3 config callbacks and 2 lifecycle hooks. The ~37% boilerplate ratio (817/2,185 lines) is inherent to the capability registration model, not a problem solvable by classes.

**Q3 — Testing impact:** Current pure functions (`prepareGoal`, `applyReviewDecision`, `isStepReviewable`, `findMostRecentCompletedStep`) are exported as module-level functions and tested directly with zero mocking. Tests use `fs.mkdtempSync()` for real temp directories. `CAPABILITY_CONFIG` is a plain exported constant — testable as-is. Both variants introduce construction overhead: Variant A requires full `SessionCapabilityDefinition` setup to access config fields; Variant B requires full class instantiation to access methods, with potential side effects from `setup()` registering tools/commands with `ExtensionAPI`. The current `.test.ts` files (`create-goal.test.ts`, `review-task.test.ts`, `evolve-plan.test.ts`, `execute-task.test.ts`) demonstrate that the module-level pattern produces clean, focused tests.

**Q4 — Type safety:** TypeScript already enforces `StaticCapabilityConfig` shape structurally. `ConfigCallback<T>` provides generic type safety for step-dependent fields. Lifecycle callbacks (`PrepareSessionCallback`, `PostValidateCallback`, `PostExecuteCallback`) have explicit return types. Variant A adds no meaningful improvement — the `SessionCapabilityDefinition` wrapper enforces field presence, but `StaticCapabilityConfig` already does this. Variant B introduces a type safety regression: `.bind(this)` requirements for config callbacks are easy to forget and produce `undefined` as `this` at runtime — a type-safe-looking pattern that TypeScript doesn't catch.

**Q5 — Lifecycle hooks:** Optional callbacks are the right abstraction for sparsely-used hooks: only `review-task.ts` uses `prepareSession`, `create-plan.ts` and `review-task.ts` use `postValidate`, and zero capabilities use `postExecute`. Making them class methods would force 8+ empty overrides per capability. The callback pattern in `StaticCapabilityConfig` is explicit, optional, and already well-typed. Variant B's method overrides (`prepareSession`, `postValidate`, `postExecute`) still require `.bind(this)` in the config literal for `resolveCapabilityConfig()` to consume them — negating the supposed advantage.

**Q6 — Non-session capabilities:** The five non-session modules (`init.ts`, `delete-goal.ts`, `parent.ts`, `list-goals.ts`, `next-task.ts`) share almost no structure: some have tools, some are command-only, some call `launchCapability()` without config. A `ToolCapability` base class provides zero shared implementation. The two hybrid capabilities (`goal-from-issue.ts`, `next-task.ts`) further complicate categorization — they need session-launch support without defining their own config, which doesn't fit cleanly into either `SessionCapability` or `ToolCapability`.

**Q7 — Extensibility:** Adding a new capability is a well-defined 4-step process: create module, wire in `index.ts` (2 lines), add prompt, wire transitions. A new developer can copy any existing capability (e.g., `create-goal.ts`) as a starting template. No inheritance hierarchy to understand, no construction-order gotchas. The transition system (`resolveTransition()` switch in `state-machine.ts`) is the main extensibility bottleneck for all three approaches — it requires manual updates regardless of capability architecture.

**Q8 — Readability:** `CAPABILITY_CONFIG` serves as a declarative "table of contents" — a reader can scan it to see prompt, validation files, write allowlist, and active lifecycle hooks. Variant B improves lifecycle hook discoverability (methods in execution order) but loses the config summary. The trade-off — declarative summary vs procedural clarity — favors the current pattern for the common case: understanding what a capability does at a glance.

---

### What the current pattern gets right

1. **`CAPABILITY_CONFIG` as a declarative summary.** Each session-based capability exports a single `StaticCapabilityConfig` object that captures the complete session shape: prompt, validation files, write allowlist, and lifecycle hooks. This is the "table of contents" for the capability — a reader can scan it to understand the session configuration without reading implementation details.

2. **Callbacks express variation points adequately.** Optional lifecycle hooks (`prepareSession`, `postValidate`, `postExecute`) are used by only 3 of 10 session capabilities. The callback pattern lets capabilities opt in without forcing empty implementations. Config callbacks (`ConfigCallback<T>`) handle step-dependent values cleanly — `evolve-plan.ts`, `execute-task.ts`, and `review-task.ts` use them for `validation`, `readOnlyFiles`, and `writeAllowlist`.

3. **Module-per-capability keeps concerns isolated.** Each capability is a self-contained module. No inheritance hierarchy means no accidental coupling between capabilities. Changes to `review-task.ts` don't ripple through a base class to affect `create-goal.ts`.

4. **Pure functions are simpler to test.** Functions like `applyReviewDecision`, `isStepReviewable`, and `prepareGoal` are exported as module-level functions. Tests import them directly — no instance construction, no mocking of `ExtensionAPI`, no constructor injection. The current test suite (`*.test.ts` files) demonstrates this: clean Arrange-Act-Assert tests with `fs.mkdtempSync()` for real temp directories.

5. **No polymorphic behavior is needed.** Each capability's tool execute logic, validation, and command handler are inherently unique. There is no shared behavior to factor into a base class. The common registration pattern (`setupXxx()`) is ~5–8 lines — too small to justify a class hierarchy.

6. **Natural handling of all three capability shapes.** Session-based, non-session, and hybrid capabilities each export exactly what they need. No class hierarchy forces a single mold onto fundamentally different module shapes.

---

### Identified risks of refactoring

1. **`.bind(this)` runtime errors.** Variant B's config callbacks as class methods require `.bind(this)` in the config literal to preserve `this` context. Forgetting `.bind(this)` produces `undefined` as `this` at runtime — a silent failure that TypeScript doesn't catch. `ReviewTaskCapability` alone would need ~6 `.bind(this)` calls (3 config callbacks + 2 lifecycle hooks + 1 `defaultInitialMessage`).

2. **Construction-order problems.** Variant B's `config` field references `this` methods, but `this` is not fully initialized when the field initializer runs. This forces awkward patterns: `.bind(this)` in the literal, splitting config into a getter, or deferring config construction to a factory method. All add complexity without proportional benefit.

3. **Increased test setup complexity.** Testing class methods requires instantiating the full class. If `setup()` is called during construction, tests need a mock `ExtensionAPI`. Current tests import pure functions directly with zero setup.

4. **Dynamic import compatibility.** `resolveCapabilityConfig()` in `capability-config.ts` uses `import(\`./capabilities/${cap}\`)` to dynamically load `CAPABILITY_CONFIG`. Both variants would need to either keep the module-level export (duplicating data) or replace dynamic imports with a registry (adding infrastructure).

5. **Meaningless inheritance for non-session capabilities.** A `ToolCapability` base class for `init`, `delete-goal`, `parent`, `list-goals`, and `next-task` provides no shared implementation. It adds a hierarchy layer without eliminating any code.

6. **Loss of `CAPABILITY_CONFIG` as a declarative summary.** Variant B scatters config across method declarations and field initializers. The "table of contents" advantage is lost — a reader must scan the full class to see which hooks are active.

---

### Future work

The analysis identified one orthogonal improvement that does not require a class hierarchy:

**Declarative transition registry.** The `resolveTransition()` switch in `state-machine.ts` is the main extensibility bottleneck. Adding a new capability requires a manual `case` branch. A declarative registry — e.g., a map or config object in `state-machine.ts` — would decouple transition registration from the switch statement:

```typescript
// Instead of a switch statement, use a registry:
const TRANSITIONS: Record<string, (state: GoalState, params?: Record<string, unknown>) => TransitionResult> = {
  "create-goal": transitionCreateGoal,
  "create-plan": transitionCreatePlan,
  "evolve-plan": transitionEvolvePlan,
  // ...
};
```

This is a small, self-contained improvement to `state-machine.ts` alone. It does not require restructuring capabilities, changing `CAPABILITY_CONFIG`, or introducing classes. It could be pursued as a separate goal if transition wiring becomes a genuine friction point.

Another potential improvement is **auto-discovery of capabilities** in `index.ts` — scanning `src/capabilities/` for `setupXxx` exports and registering them automatically. This would eliminate the manual 2-line wiring per capability. Again, this is orthogonal to the class-vs-config debate and could be added to the current pattern.
