import { join } from "node:path";
import { pioRootDir } from "./fs-utils";
import type { CapabilityConfig, CapabilityContract, ConfigCallback, PostExecuteCallback, PostValidateCallback, PrepareSessionCallback } from "./types";
import type { CapabilityPackageConfig, CapabilitySkills } from "./capability-package";

/**
 * Resolve a step-dependent config field: if it's a callback, invoke it;
 * otherwise pass through the static value.
 */
function resolveField<T>(
  value: T | ConfigCallback<T> | undefined,
  workspaceDir: string,
  params?: Record<string, unknown>,
): T | undefined {
  if (typeof value === "function") {
    return (value as ConfigCallback<T>)(workspaceDir, params);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Path placeholder resolution
// ---------------------------------------------------------------------------

/**
 * Parse a format specifier like "02d" into { pad: "0", width: 2, type: "d" }.
 * Returns null if the format is not recognized.
 */
function parseFormatSpecifier(spec: string): { pad: string; width: number; type: string } | null {
  const match = spec.match(/^(.)?(\d+)(.)$/);
  if (!match) return null;
  return {
    pad: match[1] || " ",
    width: parseInt(match[2], 10),
    type: match[3],
  };
}

/**
 * Replace `{key}` and `{key:format}` placeholder tokens in file paths with values from params.
 *
 * Uses regex /\{(\w+)(?::([^}]+))?\}/g to find placeholders. Supports format specifiers:
 *   - `{key:02d}` — zero-pad integer to 2 digits (e.g. 3 → "03")
 *   - `{key:04d}` — zero-pad integer to 4 digits (e.g. 7 → "0007")
 *   - `{key}`     — plain string substitution (no formatting)
 *
 * If a key is missing from params, the original `{key}` token is preserved as-is.
 *
 * Examples:
 *   resolvePaths(["S{stepNumber:02d}/TASK.md"], { stepNumber: 3 }) → ["S03/TASK.md"]
 *   resolvePaths(["{name}/file.md"], { name: "my-feature" })       → ["my-feature/file.md"]
 *
 * @param paths - Array of file paths (possibly containing `{key}` or `{key:format}` tokens)
 * @param params - Key-value map for placeholder substitution
 * @returns Paths with placeholders replaced
 */
export function resolvePaths(
  paths: string[],
  params: Record<string, unknown>,
): string[] {
  const results = paths.map((p) =>
    p.replace(/\{(\w+)(?::([^}]+))?\}/g, (_match, key, formatSpec) => {
      const value = params[key];
      if (value === undefined || value === null) return `{${key}${formatSpec ? ":" + formatSpec : ""}}`;

      if (formatSpec) {
        const parsed = parseFormatSpecifier(formatSpec);
        if (parsed && parsed.type === "d" && typeof value === "number") {
          return String(value).padStart(parsed.width, parsed.pad);
        }
      }

      return String(value);
    }),
  );

  // Fail fast: detect any remaining unresolved placeholders
  const unresolved = results.find((r) => r.match(/\{\w+(?::[^}]+)?\}/));
  if (unresolved !== undefined) {
    const match = unresolved.match(/\{(\w+)(?::[^}]+)?\}/);
    const placeholder = match?.[0] ?? "unknown";
    const keyName = match?.[1] ?? "unknown";
    throw new Error(
      `Unresolved placeholder ${placeholder} in path. Ensure session params include key '${keyName}'.`,
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Workspace prefix resolution layer
// ---------------------------------------------------------------------------

/**
 * Resolve a contract file path through the workspace prefix layer.
 *
 * Resolution order:
 * 1. Placeholder resolution via resolvePaths() (if params provided)
 * 2. Project-relative paths (`projectRelative: true`) join with global pioRootDir
 * 3. Prefixed paths join baseDir + workspacePrefix + contractPath
 * 4. Unprefixed paths join baseDir + contractPath
 *
 * @param contractPath - Path from capability contract (may contain {key} placeholders)
 * @param baseDir - Base directory for path resolution
 * @param workspacePrefix - Optional prefix string (e.g., "goals/my-feature")
 * @param params - Optional session params for placeholder resolution
 * @param projectRelative - When true, resolves from pioRootDir (`.pio/`) bypassing workspace prefix
 * @returns Fully resolved filesystem path
 */
export function resolveContractPath(
  contractPath: string,
  baseDir: string,
  workspacePrefix?: string,
  params?: Record<string, unknown>,
  projectRelative?: boolean,
): string {
  // 1. Placeholder resolution — always run through resolvePaths
  // Paths without placeholders pass through unchanged; paths with placeholders
  // throw if keys are missing (consistent with resolvePaths existing behavior).
  let resolved = resolvePaths([contractPath], params ?? {})[0];

  // 2. Project-relative path: resolve from global pioRootDir, ignoring baseDir and prefix
  if (projectRelative) {
    return join(pioRootDir, resolved);
  }

  // 3. Prefixed path: baseDir + workspacePrefix + contractPath
  if (workspacePrefix) {
    return join(baseDir, workspacePrefix, resolved);
  }

  // 4. No prefix: baseDir + contractPath
  return join(baseDir, resolved);
}



/**
 * Assemble a CapabilityConfig from pre-resolved field values.
 *
 * Called by `normalizePackageConfig()` after resolving capability-specific fields.
 */
function buildCapabilityConfig(
  cap: string,
  prompt: string | undefined,
  workspaceDir: string,
  readOnlyFiles: string[] | undefined,
  writeAllowlist: string[] | undefined,
  initialMessage: string | undefined,
  sessionParams: Record<string, unknown> | undefined,
  sessionName: string,
  prepareSession: PrepareSessionCallback | undefined,
  postValidate: PostValidateCallback | undefined,
  postExecute: PostExecuteCallback | undefined,
  skills: CapabilitySkills | undefined,
  contract: CapabilityContract,
  allowProjectWrites: boolean,
): CapabilityConfig {
  return {
    capability: cap,
    prompt,
    workspaceDir,
    readOnlyFiles,
    writeAllowlist,
    initialMessage,
    sessionParams,
    sessionName,
    prepareSession,
    postValidate,
    postExecute,
    skills,
    contract,
    allowProjectWrites,
  };
}

/**
 * Normalize a CapabilityPackageConfig (new-style default export) to CapabilityConfig.
 */
function normalizePackageConfig(
  cap: string,
  pkg: CapabilityPackageConfig,
  cwd: string,
  params?: Record<string, unknown>,
): CapabilityConfig {
  // Inline baseDir resolution — fallback to .pio/ root
  const baseDir =
    typeof params?.baseDir === "string" && params.baseDir
      ? params.baseDir
      : join(cwd, ".pio");

  // Resolve workspace directory from prefix — single source of truth
  const wsPrefix = typeof params?.workspacePrefix === "string" ? params.workspacePrefix : undefined;
  const workspaceDir = wsPrefix ? join(baseDir, wsPrefix) : baseDir;

  // Strip prefix from params so downstream code doesn't double-apply
  // resolveContractPath falls back to joining baseDir + contractPath when workspacePrefix is undefined
  const resolvedParams = wsPrefix ? { ...params, workspacePrefix: undefined } : params;

  // Mandatory: sessionName — read from original params (before stripping)
  const sessionName = typeof params?.sessionName === "string" ? params.sessionName : "";
  if (!sessionName) {
    throw new Error(`Capability "${cap}" requires a session name. Provide params.sessionName.`);
  }

  // Mandatory: initialMessage — read from params, fallback to defaultInitialMessage, throw if both missing
  const initialMsg =
    (typeof params?.initialMessage === "string" ? params.initialMessage : undefined)
    ?? pkg.defaultInitialMessage(workspaceDir, resolvedParams);
  if (!initialMsg) {
    throw new Error(`Capability "${cap}" requires an initial message. Provide params.initialMessage or define defaultInitialMessage.`);
  }

  const readOnlyFiles = resolveField<string[]>(pkg.readOnlyFiles, workspaceDir, resolvedParams);
  const writeAllowlist = resolveField<string[]>(pkg.writeAllowlist, workspaceDir, resolvedParams);
  const allowProjectWrites = pkg.allowProjectWrites ?? false;

  return buildCapabilityConfig(
    cap,
    undefined, // new-style: prompts compiled from component files
    workspaceDir,
    readOnlyFiles,
    writeAllowlist,
    initialMsg,
    resolvedParams,
    sessionName,
    pkg.prepareSession,
    pkg.postValidate,
    pkg.postExecute,
    pkg.skills,
    pkg.contract,
    allowProjectWrites,
  );
}

/**
 * Resolve a capability name to its full CapabilityConfig.
 *
 * Imports from `./capabilities/${cap}/config` and reads the default export
 * as `CapabilityPackageConfig`.
 */
export async function resolveCapabilityConfig(
  cwd: string,
  params?: Record<string, unknown>,
): Promise<CapabilityConfig | undefined> {
  const cap = typeof params?.capability === "string" ? params.capability : null;
  if (!cap) return undefined;

  let mod;
  try {
    mod = await import(`./capabilities/${cap}/config`);
  } catch (err) {
    console.warn(`pio: could not load capability "${cap}": ${err}`);
    return undefined;
  }

  if (!mod?.default) {
    console.warn(`pio: no default export found for capability "${cap}"`);
    return undefined;
  }
  return normalizePackageConfig(cap, mod.default as CapabilityPackageConfig, cwd, params);
}
