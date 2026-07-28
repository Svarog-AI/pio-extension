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
 * `loopMessage`, `returnTo`) enable the loop engine to control phase execution.
 * When omitted, the phase executes once and advances — preserving backward
 * compatibility with existing capability workflows.
 */
export interface WorkflowPhase {
  /** Phase identifier (e.g. "phase-1", "understand-goal") — used for loop engine correlation */
  id: string;
  /** Display title shown to the agent, e.g. "Understand the goal" */
  title: string;
  /** Natural language instructions for this phase. This replaces the freeform numbered-step body in current .md prompts. May contain markdown formatting. */
  instructions: string;
  /** Per-phase skill declarations — merged into session skills at prompt compilation time */
  skills?: WorkflowPhaseSkillDeclarations;

  // -----------------------------------------------------------------------
  // Loop engine fields (all optional — single-iteration phases omit these)
  // -----------------------------------------------------------------------

  /** Minimum iterations before termination conditions are evaluated. Default behavior (when omitted): phase executes once and advances. */
  minIterations?: number;

  /** Hard limit on iterations regardless of termination conditions. Uses resolveMaxIterations() from model-config for resolution. */
  maxIterations?: number;

  /** Array of callback-based conditions — all passing conditions terminate the loop (AND logic) */
  terminateWhen?: TerminationCondition[];

  /** Array of callback-based conditions — any passing condition keeps the phase looping (OR logic). Complements `terminateWhen` (AND: all pass → advance) */
  loopWhile?: LoopWhileCondition[];

  /** Message sent as a follow-up when looping (replaying the current phase). Informs the LLM what to focus on for the retry. */
  loopMessage?: string;

  /** Phase number to return to after ad-hoc mode resumption. No longer used by /continue (which stays on current phase). Kept for backward compatibility and a future goto command. */
  returnTo?: number;

  /** Contract output names this phase is allowed to write (resolved during resources_discover). When absent or empty, all contract output writes are blocked (restricted-by-default). Non-contract files always pass through. */
  write?: string[];

  /** Phase execution kind — `'standard'` for normal phases, `'variable-definition'` for phases that declare and collect session variables. Defaults to `'standard'`. */
  kind?: "standard" | "variable-definition";

  /** Variables declared by this phase — meaningful only when `kind` is `'variable-definition'`. Each entry specifies name, type, and how the value is produced (`static`/`llm`/`computed`). */
  variables?: PhaseVariable[];
}

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
