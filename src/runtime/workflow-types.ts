/**
 * Runtime workflow execution types.
 *
 * Extracted from `capability-package.ts` so that runtime execution semantics
 * live in the `src/runtime/` package alongside the loop engine. This module
 * is a leaf: it imports only from `src/types.ts` and external packages.
 */

import type { CapabilitySkills } from "../types";

// ---------------------------------------------------------------------------
// Workflow step types
// ---------------------------------------------------------------------------

/**
 * Per-step skill declarations.
 *
 * Mirrors `CapabilitySkills` but scoped to a single workflow step.
 * Mandatory skills are force-injected at prompt compilation time;
 * recommended skills are listed as instructions for on-demand loading.
 */
export interface WorkflowStepSkillDeclarations {
  /** Skills forcefully injected for this step — full SKILL.md content delivered at startup */
  mandatory?: string[];
  /** Skills listed as instructions, loaded on demand by condition */
  recommended?: { name: string; condition: string }[];
}

/**
 * Structured workflow step that replaces freeform numbered steps in markdown prompts.
 *
 * Each step defines an id (for step nudging correlation), a display title,
 * and natural language instructions. Skills can be declared per-step and
 * are merged into the session's global skills at prompt compilation time.
 */
export interface WorkflowStep {
  /** Step identifier (e.g. "step-1", "understand-goal") — used for step nudging correlation */
  id: string;
  /** Display title shown to the agent, e.g. "Understand the goal" */
  title: string;
  /** Natural language instructions for this step. This replaces the freeform numbered-step body in current .md prompts. May contain markdown formatting. */
  instructions: string;
  /** Per-step skill declarations — merged into session skills at prompt compilation time */
  skills?: WorkflowStepSkillDeclarations;
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
  /** Workflow steps section (rendered from WorkflowStep[]) */
  workflow?: string;
  /** Guidelines section (from CapabilityGuidelines) */
  guidelines?: string;
  /** Merged workflow step skills — carries merged mandatory/recommended skills downstream for skill loading */
  mergedSkills?: CapabilitySkills;
  /** Raw workflow steps — carried for step nudging (totalWorkflowSteps, workflowSteps). Not rendered in the prompt. */
  _steps?: WorkflowStep[];
}
