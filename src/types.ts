/**
 * Shared type definitions for pio extension.
 *
 * These types are extracted here to break circular dependencies between:
 *   utils.ts  ←→  validation.ts  ←→  capability-session.ts
 *
 * All three modules previously imported types from each other, creating
 * a cycle that can cause issues with jiti module loading in sub-sessions.
 */

import type { TSchema } from "typebox";

// ---------------------------------------------------------------------------
// Frontmatter schema types
// ---------------------------------------------------------------------------

/**
 * Declares an output document and the TypeBox schema its YAML frontmatter
 * must conform to. Defined here (types.ts) to avoid circular imports:
 * capability-package.ts imports from types.ts, so types.ts cannot import back.
 */
export interface FrontmatterSchemaDeclaration {
  /** Output file path relative to workingDir (e.g. "PLAN.md", "TASK.md") */
  outputFile: string;
  /** TypeBox schema the YAML frontmatter must conform to */
  schema: TSchema;
}

// ---------------------------------------------------------------------------
// Validation types
// ---------------------------------------------------------------------------

export interface ValidationRule {
  /** Files that must exist after the capability completes. Paths are resolved relative to workingDir. */
  files?: string[];
}

// ---------------------------------------------------------------------------
// Input validation types
// ---------------------------------------------------------------------------

/**
 * Declarative input contract: which files must exist (or must not exist)
 * before a capability session can start.
 *
 * File paths can contain `{key}` placeholder tokens (e.g., `S{stepNumber}/TASK.md`)
 * that are resolved at runtime via `resolvePaths()` using session params.
 */
export interface InputValidationSpec {
  /** Files that must exist before the session starts (relative to goalDir). Paths can contain `{key}` placeholder tokens (e.g., `S{stepNumber}/TASK.md`). */
  requiredFiles: string[];
  /** Files that must NOT exist before the session starts. Same placeholder syntax as requiredFiles. */
  excludedFiles?: string[];
}

// ---------------------------------------------------------------------------
// Capability contract types (unified input/output declarations)
// ---------------------------------------------------------------------------

/**
 * Describes a single markdown file in a capability contract.
 *
 * File paths can contain `{key}` and `{key:format}` placeholder tokens
 * (e.g., `S{stepNumber:02d}/TASK.md`) resolved at runtime via `resolvePaths()`.
 * When a `schema` is provided, the file's YAML frontmatter is validated
 * against the TypeBox schema.
 */
export interface MarkdownFileSpec {
  /** Relative file path with `{key}` / `{key:format}` placeholder support */
  file: string;
  /** Optional TypeBox schema for YAML frontmatter validation — plain existence check when absent */
  schema?: TSchema;
  /** Optional predicate to determine if this file is required. Receives session params. If absent, file is always required. */
  requiredWhen?: (params?: Record<string, unknown>) => boolean;
}

/**
 * A group where exactly one file must be present (e.g., APPROVED xor REJECTED).
 */
export interface OneOfGroup {
  files: MarkdownFileSpec[];
}

/** An output entry: either a single file spec or a one-of group. */
export type OutputEntry = MarkdownFileSpec | OneOfGroup;

/**
 * Unified capability contract: declares inputs, outputs, excluded files,
 * and frontmatter schemas in a single object.
 *
 * Replaces the fragmented approach of separate `validation`, `frontmatterSchemas`,
 * and `inputValidation` fields with one consolidated declaration.
 */
export interface CapabilityContract {
  /** Files that must exist, with optional frontmatter schema validation */
  inputs: MarkdownFileSpec[];
  /** Files that must NOT exist */
  excludedFiles?: string[];
  /** Required output files or one-of groups */
  outputs: OutputEntry[];
}

// ---------------------------------------------------------------------------
// Capability config types
// ---------------------------------------------------------------------------

/** Declares which skills apply to a capability — mandatory skills are force-injected, recommended skills are listed as instructions. */
export interface CapabilitySkills {
  /** Skills forcefully injected into the prompt — full SKILL.md content is read at startup */
  mandatory?: string[];
  /** Skills listed as instructions for the LLM to load when conditions apply */
  recommended?: { name: string; condition: string }[];
}

/** Full configuration passed to a capability sub-session. */
export interface CapabilityConfig {
  /** Logical capability name (e.g. "create-goal") — determines prompt and transitions */
  capability: string;
  /** Prompt filename (e.g. "create-goal.md") */
  prompt?: string;
  /** Kickoff prompt sent as a user message to trigger the agent */
  initialMessage?: string;
  /** Base directory for resolving validation file paths (the goal workspace dir) */
  workingDir?: string;
  /** Validation rules declared by this capability */
  validation?: ValidationRule;
  /** Files that must not be modified during this session (relative to workingDir) */
  readOnlyFiles?: string[];
  /** Allowlist of files that may be written during this session. When present, takes precedence over readOnlyFiles. */
  writeAllowlist?: string[];
  /** Files to delete when validation passes (absolute paths). */
  fileCleanup?: string[];
  /** Original session params passed when this capability was launched. Used for downstream param propagation. */
  sessionParams?: Record<string, unknown>;
  /** Human-readable name applied to the sub-session via `setSessionName()`. Derived automatically from goal name + capability. */
  sessionName?: string;
  /** Lifecycle hook that runs before the agent starts (e.g., stale-state cleanup). */
  prepareSession?: PrepareSessionCallback;
  /** Lifecycle hook that runs after file-existence validation passes but before transition routing. */
  postValidate?: PostValidateCallback;
  /** Lifecycle hook that runs after transition routing + task enqueuing. */
  postExecute?: PostExecuteCallback;
  /** Capability-specific skill declarations — mandatory skills are force-injected, recommended skills are listed as instructions. */
  skills?: CapabilitySkills;
  /** Declarative output document frontmatter schemas. Validated by the exit-gate via validateFrontmatter(). */
  frontmatterSchemas?: FrontmatterSchemaDeclaration[];
  /** Declarative input contract: files that must/must-not exist before the session starts. */
  inputValidation?: InputValidationSpec;
  /** Unified capability contract: consolidated inputs, outputs, excluded files, and frontmatter schemas. Optional during migration — becomes mandatory in a later step. */
  contract?: CapabilityContract;
}

/** Callback signature for step-dependent config fields. */
export type ConfigCallback<T> = (workingDir: string, params?: Record<string, unknown>) => T;

/** Lifecycle hook that runs before the agent starts (e.g., stale-state cleanup). */
export type PrepareSessionCallback = (workingDir: string, params?: Record<string, unknown>) => void | Promise<void>;

/** Lifecycle hook that runs after file-existence validation passes but before transition routing. Can fail to keep the agent in the session to fix issues. */
export type PostValidateCallback = (goalDir: string, params?: Record<string, unknown>) => { success: boolean; message?: string };

/** Lifecycle hook that runs after transition routing + task enqueuing completes. Applies irreversible side effects or capability-specific cleanup. */
export type PostExecuteCallback = (goalDir: string, params?: Record<string, unknown>) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Capability lifecycle phases
// ---------------------------------------------------------------------------
//
// Capabilities go through four distinct phases from invocation to completion.
// Each phase has a specific trigger point and optional hook.
//
// 1. PreValidate (inline, no hook)
//    Triggered at: tool/command invocation, before queuing a sub-session.
//    Each capability validates its own inputs inline (e.g., checking that
//    GOAL.md exists, step folder is ready). No typed hook — remains per-
//    capability inline code.
//
// 2. Prepare (prepareSession hook)
//    Triggered at: session startup during the `resources_discover` event.
//    Runs before the agent starts. Used for stale-state cleanup, marker
//    deletion, or any preparation needed before the agent runs.
//    Hook type: PrepareSessionCallback (optional).
//
// 3. PostValidate (postValidate hook)
//    Triggered at: `pio_mark_complete` execution, after file-existence
//    validation passes but before transition routing.
//    Can fail to keep the agent in the session to fix issues.
//    Returns { success: boolean; message?: string }.
//    Hook type: PostValidateCallback (optional).
//
// 4. PostExecute (postExecute hook)
//    Triggered at: after transition routing + task enqueuing completes.
//    Applies irreversible side effects or capability-specific cleanup.
//    Runs once validation passes — errors here do not affect transitions.
//    Hook type: PostExecuteCallback (optional, may be async).
//
// Order: PreValidate → Prepare → agent session → PostValidate →
//        transition routing → task enqueuing → PostExecute → cleanup → terminate


