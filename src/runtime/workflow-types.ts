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
  /** Skills forcefully injected for this step — full SKILL.md content delivered at startup */
  mandatory?: string[];
  /** Skills listed as instructions, loaded on demand by condition */
  recommended?: { name: string; condition: string }[];
}

/**
 * A condition definition for callback-based loop termination.
 *
 * When any condition in the `terminateWhen` array returns `true`,
 * the loop terminates and the engine advances to the next step.
 * Conditions use OR logic — the first passing condition wins.
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
  /** Callback that receives the full PioSessionState and returns true to terminate the loop */
  callback(state: PioSessionState): boolean;
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
  // Loop engine fields (all optional — single-iteration steps omit these)
  // -----------------------------------------------------------------------

  /** Minimum iterations before termination conditions are evaluated. Default behavior (when omitted): phase executes once and advances. */
  minIterations?: number;

  /** Hard limit on iterations regardless of termination conditions. Uses resolveMaxIterations() from model-config for resolution. */
  maxIterations?: number;

  /** Array of callback-based conditions — any passing condition terminates the loop (OR logic) */
  terminateWhen?: TerminationCondition[];

  /** Message sent as a follow-up when looping (replaying the current step). Informs the LLM what to focus on for the retry. */
  loopMessage?: string;

  /** Phase number to return to after ad-hoc mode resumption (/return command). Defaults to current phase when omitted. */
  returnTo?: number;

  /** Contract output names this step is allowed to write (resolved during resources_discover). When absent or empty, all contract output writes are blocked (restricted-by-default). Non-contract files always pass through. */
  write?: string[];
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
  /** Raw workflow phases — carried for loop engine injection (totalWorkflowSteps, workflowSteps). Not rendered in the prompt. */
  _steps?: WorkflowPhase[];
}
