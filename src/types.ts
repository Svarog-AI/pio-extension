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
import type { CapState } from "./capability-state";

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
  /** Short unique identifier for named accessor lookup (e.g. "task", "review", "plan"). Required — used by input()/output() accessors. */
  name: string;
  /** Relative file path with `{key}` / `{key:format}` placeholder support */
  file: string;
  /** Optional TypeBox schema for YAML frontmatter validation — plain existence check when absent */
  schema?: TSchema;
  /** Optional predicate to determine if this file is required. Receives session params. If absent, file is always required. */
  requiredWhen?: (
    params?: Record<string, unknown>,
    capState?: CapState,
  ) => boolean;
  /** When true, resolves from pioRootDir (`.pio/`) bypassing workspace prefix. Used for files like `.pio/PROJECT/*.md` that live outside goal workspaces. */
  projectRelative?: boolean;
}

/**
 * A group where exactly one file must be present (e.g., APPROVED xor REJECTED).
 */
export interface OneOfGroup {
  files: MarkdownFileSpec[];
}

/** An output entry: either a single file spec or a one-of group. */
export type OutputEntry = MarkdownFileSpec | OneOfGroup;

/** Type guard: distinguish MarkdownFileSpec from OneOfGroup within OutputEntry[]. */
export function isMarkdownFileSpec(
  entry: OutputEntry,
): entry is MarkdownFileSpec {
  return "file" in entry && !("files" in entry);
}

/**
 * Declares a marker file the framework automatically creates based on frontmatter.
 *
 * The framework reads the specified output file, extracts the frontmatter field,
 * and creates an empty marker file with the matched filename. This replaces
 * custom `postExecute` callbacks that manually create marker files.
 *
 * Example: `{ outputFile: "summary", field: "status", values: { completed: "COMPLETED", blocked: "BLOCKED" } }`
 */
export interface MarkerDeclaration {
  /** Name matching a MarkdownFileSpec.name in contract outputs */
  outputFile: string;
  /** Frontmatter key to read (e.g. "status", "decision") */
  field: string;
  /** Maps frontmatter value → marker filename (e.g. { completed: "COMPLETED" }) */
  values: Record<string, string>;
}

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
  /** Declarative marker file rules — framework auto-creates/cleans up marker files based on frontmatter values */
  markers?: MarkerDeclaration[];
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
  /** Resolved workspace directory — includes workspacePrefix from normalization. */
  workspaceDir?: string;
  /** Files that must not be modified during this session (relative to workspaceDir) */
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
  /** Unified capability contract: consolidated inputs, outputs, excluded files, and frontmatter schemas. */
  contract: CapabilityContract;
  /** When true, permits writing to project files outside `.pio/`. */
  allowProjectWrites: boolean;
}

/** Callback signature for step-dependent config fields.
 * @param workspaceDir - Resolved workspace directory (already includes workspacePrefix from normalization). */
export type ConfigCallback<T> = (
  workspaceDir: string,
  params?: Record<string, unknown>,
) => T;

/** Lifecycle hook that runs before the agent starts (e.g., stale-state cleanup).
 * @param workspaceDir - Resolved workspace directory (already includes workspacePrefix from normalization). */
export type PrepareSessionCallback = (
  workspaceDir: string,
  params?: Record<string, unknown>,
) => void | Promise<void>;

/** Lifecycle hook that runs after file-existence validation passes but before transition routing. Can fail to keep the agent in the session to fix issues. */
export type PostValidateCallback = (
  workspaceDir: string,
  params?: Record<string, unknown>,
) => { success: boolean; message?: string };

/** Lifecycle hook that runs after transition routing + task enqueuing completes. Applies irreversible side effects or capability-specific cleanup. */
export type PostExecuteCallback = (
  workspaceDir: string,
  params?: Record<string, unknown>,
) => void | Promise<void>;

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
