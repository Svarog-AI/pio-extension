/**
 * Shared type definitions for pio extension.
 *
 * These types are extracted here to break circular dependencies between:
 *   utils.ts  ←→  validation.ts  ←→  session-capability.ts
 *
 * All three modules previously imported types from each other, creating
 * a cycle that can cause issues with jiti module loading in sub-sessions.
 */

// ---------------------------------------------------------------------------
// Validation types
// ---------------------------------------------------------------------------

export interface ValidationRule {
  /** Files that must exist after the capability completes. Paths are resolved relative to workingDir. */
  files?: string[];
}

// ---------------------------------------------------------------------------
// Capability config types
// ---------------------------------------------------------------------------

/** Full configuration passed to a capability sub-session. */
export interface CapabilityConfig {
  /** Logical capability name (e.g. "create-goal") — determines prompt and transitions */
  capability: string;
  /** Prompt filename (e.g. "create-goal.md") — resolved from CAPABILITY_CONFIG.prompt */
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
}

/** Callback signature for step-dependent config fields. */
export type ConfigCallback<T> = (workingDir: string, params?: Record<string, unknown>) => T;

/** Static shape each capability exports as `CAPABILITY_CONFIG`. */
export interface StaticCapabilityConfig {
  prompt: string;                    // e.g. "create-goal.md"
  validation?: ValidationRule | ConfigCallback<ValidationRule>;
  readOnlyFiles?: string[] | ConfigCallback<string[]>;
  writeAllowlist?: string[] | ConfigCallback<string[]>;
  /** Derive initialMessage from workingDir (optional override via params.initialMessage) */
  defaultInitialMessage: (workingDir: string, params?: Record<string, unknown>) => string;
}
