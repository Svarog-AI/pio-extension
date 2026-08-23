/**
 * Runtime workflow execution types.
 *
 * Extracted from `capability-package.ts` so that runtime execution semantics
 * live in the `src/runtime/` package alongside the loop engine.
 * Imports `PioSessionState` from `./session-state` (type-only cycle) for
 * the `TerminationCondition` callback signature.
 */

import type { CapabilitySkills } from "../types";
import type { PioSessionState } from "./session-state";

// ---------------------------------------------------------------------------
// Code-step context
// ---------------------------------------------------------------------------

/**
 * Context passed to a `kind: "code"` phase's `run()` callback.
 *
 * A minimal additive seam exposing exactly one field — `state`. The wrapper
 * exists purely so future additions become field additions to this interface
 * rather than signature breaks to authored `run()` callbacks. There are no
 * dedicated context methods and no control-flow API: code-phase authors reach
 * everything through `ctx.state` (variables via `state.store`, contract I/O
 * via `state.capState`, identifiers via `state.sessionId`/`state.projectRoot`),
 * and routing is handled by variables plus declared branch phases.
 */
export interface CodeStepContext {
  /** Read-only view of full loop-engine state — store, capState, sessionId, projectRoot, etc. are all reached through here */
  readonly state: PioSessionState;
}

// ---------------------------------------------------------------------------
// Workflow phase types
// ---------------------------------------------------------------------------

/**
 * Per-phase skill declarations.
 *
 * Mirrors `CapabilitySkills` but scoped to a single workflow phase.
 * Mandatory skills are force-injected at prompt compilation time;
 * recommended skills are listed as instructions for on-demand loading.
 */
export interface WorkflowPhaseSkillDeclarations {
  /** Skills forcefully injected for this phase — full SKILL.md content delivered at startup */
  mandatory?: string[];
  /** Skills listed as instructions, loaded on demand by condition */
  recommended?: { name: string; condition: string }[];
}

/**
 * A condition definition for callback-based loop termination.
 *
 * All conditions in the `terminateWhen` array must return `true` for the
 * loop to terminate and advance to the next phase. Conditions use AND logic —
 * all must pass to advance.
 *
 * The callback receives the full PioSessionState directly — it reads
 * whatever fields it needs (`state.filesWritten`, `state.currentIteration`)
 * and ignores the rest. No projection function needed.
 *
 * Note: This creates a type-only cycle between workflow-types.ts and
 * session-state.ts. Both use `import type`, so there is no runtime
 * circular dependency — ESM resolves this correctly.
 */
export interface TerminationCondition {
  /** Condition type — currently only "callback" is supported; expression-based conditions are deferred */
  type: "callback";
  /** Callback that receives the full PioSessionState and returns true to signal this condition is met. All conditions must return true to advance (AND logic) */
  callback(state: PioSessionState): boolean;
}

/**
 * A condition definition for callback-based loop continuation.
 *
 * When any condition in the `loopWhile` array returns `true`,
 * the loop continues and the engine replays the current phase.
 * Conditions use OR logic — the first passing condition forces a loop replay.
 *
 * Complements `TerminationCondition` (AND: all pass → advance).
 * `loopWhile(a)` is equivalent to `terminateWhen(¬a)`.
 *
 * The callback receives the full PioSessionState directly — it reads
 * whatever fields it needs and ignores the rest.
 */
export interface LoopWhileCondition {
  /** Condition type — currently only "callback" is supported */
  type: "callback";
  /** Callback that receives the full PioSessionState and returns true to keep looping. Uses OR logic — any passing condition forces a loop replay */
  callback(state: PioSessionState): boolean;
}

// ---------------------------------------------------------------------------
// Session variable types
// ---------------------------------------------------------------------------

/**
 * How a phase variable's value is produced.
 *
 * - `'static'` — value is hardcoded in the phase config (no LLM involvement)
 * - `'llm'` — value is set by the agent via `setVar()` during a variable-defining phase
 * - `'computed'` — value is calculated by a callback function at `agent_end`
 */
export type PhaseVariableKind = "static" | "llm" | "computed";

/**
 * Declaration of a single session variable scoped to a workflow phase.
 *
 * Each entry specifies the variable's name, authoritative type, and how its
 * value is produced (`kind`). The loop engine uses this to pre-declare
 * variables, enforce types on `setVar()`, and manage the variable lifecycle.
 */
export interface PhaseVariable {
  /** Unique identifier within the phase's `variables` array (e.g. `"iteration_count"`) */
  name: string;
  /** Authoritative declared type as a string (e.g. `"number"`, `"string"`, `"boolean"`). Used by the loop engine to pre-declare variables so `setVar()` validates against it. */
  type: string;
  /** Controls how the value is produced — static (hardcoded), llm (agent sets via setVar), or computed (callback at agent_end) */
  kind: PhaseVariableKind;
  /** Optional hardcoded value — used when `kind` is `'static'`. Set before `buildPhaseInstructions()`. */
  value?: unknown;
  /** Optional natural language description — used when `kind` is `'llm'`. Describes what the agent should determine and set via `setVar()`. The loop engine uses this text to construct the agent-facing variable listing. */
  description?: string;
  /** Optional callback — used when `kind` is `'computed'`. Receives current state and returns a value. Executed at `agent_end` in declaration order. */
  compute?: (state: PioSessionState) => unknown;
}

/**
 * Structured workflow phase that replaces freeform numbered steps in markdown prompts.
 *
 * Each phase defines an id (for loop engine correlation), a display title,
 * and natural language instructions. Skills can be declared per-phase and
 * are merged into the session's global skills at prompt compilation time.
 *
 * Optional loop fields (`minIterations`, `maxIterations`, `terminateWhen`,
 * `loopMessage`) enable the loop engine to control phase execution.
 * When omitted, the phase executes once and advances — preserving backward
 * compatibility with existing capability workflows.
 */
export interface WorkflowPhase {
  /** Phase identifier (e.g. "phase-1", "understand-goal") — used for loop engine correlation */
  id: string;
  /** Display title shown to the agent, e.g. "Understand the goal" */
  title: string;
  /** Natural language instructions for this phase. This replaces the freeform numbered-step body in current .md prompts. May contain markdown formatting. Omitted for variable-defining phases — the engine generates instructions from the `variables` array. */
  instructions?: string;
  /** Per-phase skill declarations — merged into session skills at prompt compilation time */
  skills?: WorkflowPhaseSkillDeclarations;

  // -----------------------------------------------------------------------
  // Loop engine fields (all optional — single-iteration phases omit these)
  // -----------------------------------------------------------------------

  /** Minimum iterations before termination conditions are evaluated. Default behavior (when omitted): phase executes once and advances. */
  minIterations?: number;

  /** Hard limit on iterations regardless of termination conditions. Uses resolveMaxIterations() from model-config for resolution. With `kind: "loop"` it counts full body passes, not single-phase iterations. */
  maxIterations?: number;

  /** Array of callback-based conditions — all passing conditions terminate the loop (AND logic) */
  terminateWhen?: TerminationCondition[];

  /** Array of callback-based conditions — any passing condition keeps the phase looping (OR logic). Complements `terminateWhen` (AND: all pass → advance) */
  loopWhile?: LoopWhileCondition[];

  /** Message sent as a follow-up when looping (replaying the current phase). Informs the LLM what to focus on for the retry. */
  loopMessage?: string;

  /** Contract output names this phase is allowed to write (resolved during resources_discover). When absent or empty, all contract output writes are blocked (restricted-by-default). Non-contract project file writes are governed by `allowProjectWrites` */
  write?: string[];

  /** Controls whether this phase may write non-contract project files. Default: false (blocked). Contract outputs in `write[]` always pass regardless of this flag. */
  allowProjectWrites?: boolean;

  /** Phase execution kind — `'standard'` for normal phases, `'variable-definition'` for phases that declare and collect session variables, `'branch:if'` for conditional if/else branching, `'branch:switch'` for multi-way switch branching, `'code'` for programmatic phases whose `run()` callback executes instead of an LLM turn, `'loop'` for repeating multi-phase blocks (do-while). Defaults to `'standard'`. */
  kind?:
    | "standard"
    | "variable-definition"
    | "branch:if"
    | "branch:switch"
    | "code"
    | "loop";

  /** Programmatic phase callback — required when `kind` is `'code'`; must be absent for all other kinds (the pairing is enforced at runtime by `PhaseManager` construction, not by the type system). May be synchronous or asynchronous. */
  run?: (ctx: CodeStepContext) => void | Promise<void>;

  /** Variables declared by this phase — meaningful only when `kind` is `'variable-definition'`. Each entry specifies name, type, and how the value is produced (`static`/`llm`/`computed`). */
  variables?: PhaseVariable[];

  // -----------------------------------------------------------------------
  // Branch fields (all optional — meaningful only when kind starts with "branch:")
  // -----------------------------------------------------------------------

  /** Callback for `branch:if` — receives session state, truthy result selects the `then` arm, falsy selects `else`. Returns `boolean | unknown` because the phase manager treats any truthy/falsy value. */
  condition?: (state: PioSessionState) => boolean | unknown;

  /** Phases executed when `condition` is truthy. Used only with `kind: "branch:if"`. */
  then?: WorkflowPhase[];

  /** Phases executed when `condition` is falsy. Default behavior if absent: skip (jump to post-branch phase). Used only with `kind: "branch:if"`. */
  else?: WorkflowPhase[];

  /** For `branch:switch`. Either a callback that receives state and returns a discriminant value, or a `"$varName"` string that resolves to a variable via `state.store?.get(varName)`. The `$varName` string form is evaluated at runtime by PhaseManager, not here. */
  on?: ((state: PioSessionState) => unknown) | string;

  /** Keyed arm map for `branch:switch`. Keys are matched against the result of evaluating `on`. */
  cases?: Record<string, WorkflowPhase[]>;

  /** Fallback arm when no `cases` key matches (or when `on` throws). Default if absent: skip. */
  defaultBranch?: WorkflowPhase[];

  // -----------------------------------------------------------------------
  // Loop block fields (all optional — meaningful only when kind is "loop")
  // -----------------------------------------------------------------------

  /** The phases executed as a repeating unit (do-while body). Used only with `kind: "loop"`. */
  body?: WorkflowPhase[];

  /** Repeat condition for `kind: "loop"` — same callback shape as `condition`; evaluated at the end of each full body pass (do-while, never pre-checked). Truthy result repeats the body. */
  repeatWhile?: (state: PioSessionState) => boolean | unknown;

  /** Set true on engine-injected routing nodes (the synthesized branch-end and loop-end phases from Steps 2/3). Consumed by `executePhase` (log suppression, Step 4), `/goto` filtering (Step 5), and tests. */
  synthetic?: boolean;
}

// ---------------------------------------------------------------------------
// Branch routing types (post-flattening routing data from PhaseManager)
// ---------------------------------------------------------------------------

/**
 * Routing data for a `branch:if` phase after PhaseManager flattening.
 *
 * Holds both arm destinations — named "Routing" (not "Target") because
 * each type contains multiple destinations.
 */
export interface IfBranchRouting {
  /** ID of the first phase in the `then` arm, or post-branch ID if then was empty */
  thenFirst: string;
  /** ID of the first phase in the `else` arm, or post-branch ID if else was empty, or undefined for trailing branches with no else and no successor */
  elseFirst?: string;
}

/**
 * Routing data for a `branch:switch` phase after PhaseManager flattening.
 *
 * All `caseFirst` values are concrete strings — set to post-branch ID
 * during flattening if an arm was empty.
 */
export interface SwitchBranchRouting {
  /** Map from case key to first phase ID in that arm. All values are concrete strings — set to post-branch ID during flattening if an arm was empty */
  caseFirst: Record<string, string>;
  /** ID of the first phase in the default branch, or undefined if no default and no cases match */
  defaultFirst?: string;
}

/**
 * Routing data for a `kind: "loop"` phase after PhaseManager flattening.
 *
 * Structurally discriminated — no `type` field (consistent with
 * `IfBranchRouting`/`SwitchBranchRouting`; runtime keys on `"loopTarget" in routing`).
 */
export interface LoopBackRouting {
  /** ID of the loop body's first phase — repeat target */
  loopTarget: string;
  /** ID of the phase after the loop, or undefined when the loop is the workflow's last element */
  exitTarget?: string;
  /** Repeat condition evaluated at the end of each full body pass; omitted → always repeat (bounded by maxPasses) */
  repeatWhile?: (state: PioSessionState) => boolean | unknown;
  /** Pass cap for this loop block (resolved per evaluation via resolveMaxIterations in Step 3) */
  maxPasses?: number;
  /** Loop block id the pass counter is keyed by (unique workflow-wide) */
  loopId: string;
}

/** Union of all branch routing types — used by PhaseManager._conditionalRouting and resolveNext() */
export type BranchRouting =
  | IfBranchRouting
  | SwitchBranchRouting
  | LoopBackRouting;

// ---------------------------------------------------------------------------
// Prompt compiler output type
// ---------------------------------------------------------------------------

/**
 * Intermediate representation of compiled prompt sections.
 *
 * Enables backward compatibility: the prompt compiler produces this
 * structure for both old-style (single `.md` file) and new-style
 * (component files) capabilities, then assembles the final prompt
 * from these normalized sections.
 */
export interface CompiledPromptSections {
  /** Project context section (from .pio/PROJECT/OVERVIEW.md) */
  projectContext?: string;
  /** Skill loading instructions section (generated from merged mandatory/recommended skills) */
  skillLoading?: string;
  /** Role section (from CapabilityRole) */
  role?: string;
  /** Workflow phases section (rendered from WorkflowPhase[]) */
  workflow?: string;
  /** Guidelines section (from CapabilityGuidelines) */
  guidelines?: string;
  /** Merged workflow phase skills — carries merged mandatory/recommended skills downstream for skill loading */
  mergedSkills?: CapabilitySkills;
  /** Raw workflow phases — accessed via getCompiledWorkflowPhases(). Not rendered in the prompt. */
  _steps?: WorkflowPhase[];
}
