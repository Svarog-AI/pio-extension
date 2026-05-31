/**
 * Type definitions for the capability package format.
 *
 * Replaces the old single-file `.ts` + freeform `.md` prompt model with
 * directory-based packages containing structured component files:
 *
 *   src/capabilities/<name>/
 *     ├── config.ts        — CapabilityPackageConfig (declarative config)
 *     ├── role.md          — CapabilityRole (structured role description)
 *     ├── workflow.ts      — WorkflowStep[] (structured workflow steps)
 *     ├── guidelines.md    — CapabilityGuidelines (constraints/rules)
 *     ├── schemas.ts       — TypeBox schemas (input/output contracts)
 *     └── validators.ts    — Custom validation logic
 *
 * This module is a leaf: it imports only from `src/types.ts` and external
 * packages. It must NOT import from `fs-utils`, `capability-session`, or
 * other capability modules to avoid circular dependencies.
 */

import type { TSchema } from "typebox";
import type {
  CapabilitySkills,
  ConfigCallback,
  PostExecuteCallback,
  PostValidateCallback,
  PrepareSessionCallback,
  ValidationRule,
} from "./types";

// Re-export for downstream consumers (prompt-compiler, capability-session, etc.)
export type { CapabilitySkills } from "./types";

// ---------------------------------------------------------------------------
// Directory layout constants
// ---------------------------------------------------------------------------
//
// File names expected inside each capability package directory.
// Discovery (Step 2) checks for CAPABILITY_CONFIG_FILE as the package marker.
// The prompt compiler (Step 3) locates component files by these names.

/** Marker file that identifies a directory as a capability package. */
export const CAPABILITY_CONFIG_FILE = "config.ts";

/** Structured role description file (optional). */
export const CAPABILITY_ROLE_FILE = "role.md";

/** Structured workflow steps file (required for prompt compilation). */
export const CAPABILITY_WORKFLOW_FILE = "workflow.ts";

/** Constraints and behavior rules file (optional). */
export const CAPABILITY_GUIDELINES_FILE = "guidelines.md";

/** TypeBox schemas for input/output contracts (optional). */
export const CAPABILITY_SCHEMAS_FILE = "schemas.ts";

/** Custom lifecycle callbacks (optional). */
export const CAPABILITY_CALLBACKS_FILE = "callbacks.ts";

// ---------------------------------------------------------------------------
// Output schema types
// ---------------------------------------------------------------------------

/**
 * Declares an output document and the TypeBox schema its YAML frontmatter
 * must conform to.
 *
 * Used in `CapabilityPackageConfig.frontmatterSchemas` so the exit-gate can
 * automatically validate structured markdown outputs (PLAN.md, TASK.md,
 * REVIEW.md) without per-capability postValidate hooks.
 *
 * Schema validation covers type constraints (required fields, integer types,
 * enum values) but NOT cross-field validations that require reading document
 * body content (e.g., totalSteps matching heading count). Those remain in
 * per-capability postValidate hooks.
 */
export interface FrontmatterSchemaDeclaration {
  /** Output file path relative to workingDir (e.g. "PLAN.md", "TASK.md") */
  outputFile: string;
  /** TypeBox schema the YAML frontmatter must conform to */
  schema: TSchema;
}

// ---------------------------------------------------------------------------
// Component type interfaces
// ---------------------------------------------------------------------------

/**
 * Structured role description that replaces freeform role text in prompts.
 *
 * Loaded from `role.md` in the capability package directory (or defined
 * inline as a TypeScript object). Renders to the "Role" section of the
 * compiled system prompt.
 */
export interface CapabilityRole {
  /** Short title displayed as the role identity, e.g. "Goal Definition Assistant" */
  title: string;
  /** One-paragraph description of what this capability does and its responsibilities. */
  description: string;
}

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

/**
 * Constraints and behavior rules separated from workflow steps.
 *
 * Loaded from `guidelines.md` in the capability package directory.
 * Renders to the "Guidelines" section of the compiled system prompt.
 */
export interface CapabilityGuidelines {
  /** Guidelines text in markdown format. This replaces the "## Guidelines" section currently embedded in .md prompts. */
  content: string;
}

// ---------------------------------------------------------------------------
// Package descriptor types
// ---------------------------------------------------------------------------

/**
 * Declarative config exported by each capability's `config.ts`.
 *
 * Replaces `StaticCapabilityConfig` from single-file capabilities.
 * Fields mirror the old shape (same hook signatures, same validation
 * shape) so migration is straightforward. The `prompt` field is removed
 * since the prompt is now compiled from component files
 * (role.md + workflow.ts + guidelines.md).
 */
export interface CapabilityPackageConfig {
  /** Logical capability name (e.g. "create-goal") */
  capability: string;
  /** Validation rules declared by this capability. Same shape as existing ValidationRule or callback. */
  validation?: ValidationRule | ConfigCallback<ValidationRule>;
  /** Files that must not be modified during this session (relative to workingDir) */
  readOnlyFiles?: string[] | ConfigCallback<string[]>;
  /** Allowlist of files that may be written. Takes precedence over readOnlyFiles when present. */
  writeAllowlist?: string[] | ConfigCallback<string[]>;
  /** Derive initialMessage from workingDir and params */
  defaultInitialMessage: (workingDir: string, params?: Record<string, unknown>) => string;
  /** Lifecycle hooks — same as existing StaticCapabilityConfig */
  prepareSession?: PrepareSessionCallback;
  postValidate?: PostValidateCallback;
  postExecute?: PostExecuteCallback;
  /** Capability-level skill declarations. Workflow step skills are merged into these at prompt compilation time. */
  skills?: CapabilitySkills;
  /** Declarative output document frontmatter schemas. Each entry declares an output file path and a TypeBox schema. Validated by the exit-gate via validateFrontmatter(). */
  frontmatterSchemas?: FrontmatterSchemaDeclaration[];
}

/**
 * What the discovery mechanism returns for each discovered capability.
 *
 * Produced by scanning `src/capabilities/` for directories containing
 * `config.ts` (the package marker). Contains the resolved config and
 * enough metadata for registration.
 */
export interface CapabilityPackageDescriptor {
  /** Logical capability name (derived from directory name) */
  name: string;
  /** Absolute path to the capability package directory */
  dirPath: string;
  /** Resolved config from config.ts */
  config: CapabilityPackageConfig;
}

/**
 * All resolved component files for a capability (used by the prompt compiler).
 *
 * The prompt compiler reads these from the package directory and assembles
 * the final system prompt. Optional components (role, guidelines) may be
 * undefined if the capability doesn't provide them.
 */
export interface CapabilityPackageComponents {
  /** Raw markdown content from role.md, or undefined if not present */
  role?: string;
  /** Ordered workflow steps from workflow.ts */
  steps: WorkflowStep[];
  /** Guidelines content from guidelines.md, or undefined if not present */
  guidelines?: CapabilityGuidelines;
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
