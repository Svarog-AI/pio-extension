import type { CapabilityConfig, ConfigCallback, InputValidationSpec, PostExecuteCallback, PostValidateCallback, PrepareSessionCallback, ValidationRule } from "./types";
import type { CapabilityPackageConfig, FrontmatterSchemaDeclaration, CapabilitySkills } from "./capability-package";
import {
  resolveGoalDir,
  deriveSessionName,
} from "./fs-utils";

/**
 * Resolve a step-dependent config field: if it's a callback, invoke it;
 * otherwise pass through the static value.
 */
function resolveField<T>(
  value: T | ConfigCallback<T> | undefined,
  workingDir: string,
  params?: Record<string, unknown>,
): T | undefined {
  if (typeof value === "function") {
    return (value as ConfigCallback<T>)(workingDir, params);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Path placeholder resolution
// ---------------------------------------------------------------------------

/**
 * Replace `{key}` placeholder tokens in file paths with values from params.
 *
 * Uses regex /\{(\w+)\}/g to find placeholders. If a key exists in params,
 * its value is converted to a string and substituted. If the key is missing,
 * the original `{key}` token is preserved as-is.
 *
 * Example: resolvePaths(["S{stepNumber}/TASK.md"], { stepNumber: 3 })
 *   → ["S3/TASK.md"]
 *
 * @param paths - Array of file paths (possibly containing `{key}` tokens)
 * @param params - Key-value map for placeholder substitution
 * @returns Paths with placeholders replaced
 */
export function resolvePaths(
  paths: string[],
  params: Record<string, unknown>,
): string[] {
  return paths.map((p) =>
    p.replace(/\{(\w+)\}/g, (_match, key) => {
      const value = params[key];
      return value !== undefined && value !== null ? String(value) : `{${key}}`;
    }),
  );
}

// ---------------------------------------------------------------------------
// Shared parameter extraction and config assembly
// ---------------------------------------------------------------------------

/**
 * Parameters extracted from session params shared by both normalize functions.
 */
interface ExtractedParams {
  goalName: string;
  workingDir: string;
  stepNumber: number | undefined;
  initialMessage: string | undefined;
  fileCleanup: string[] | undefined;
}

/**
 * Extract shared parameters from session params and cwd.
 */
function extractParams(
  cwd: string,
  params?: Record<string, unknown>,
): ExtractedParams {
  const goalName = typeof params?.goalName === "string" ? params.goalName : "";
  const explicitWorkingDir =
    typeof params?.workingDir === "string" && params.workingDir
      ? params.workingDir
      : "";
  const workingDir = explicitWorkingDir
    ? explicitWorkingDir
    : goalName
      ? resolveGoalDir(cwd, goalName)
      : cwd;

  return {
    goalName,
    workingDir,
    stepNumber: typeof params?.stepNumber === "number" ? params.stepNumber : undefined,
    initialMessage:
      typeof params?.initialMessage === "string" ? params.initialMessage : undefined,
    fileCleanup: Array.isArray(params?.fileCleanup) ? params.fileCleanup : undefined,
  };
}

/**
 * Assemble a CapabilityConfig from pre-resolved field values.
 *
 * Called by `normalizePackageConfig()` after resolving capability-specific fields.
 */
function buildCapabilityConfig(
  cap: string,
  prompt: string | undefined,
  workingDir: string,
  validation: ValidationRule | undefined,
  readOnlyFiles: string[] | undefined,
  writeAllowlist: string[] | undefined,
  initialMessage: string | undefined,
  fileCleanup: string[] | undefined,
  sessionParams: Record<string, unknown> | undefined,
  sessionName: string,
  prepareSession: PrepareSessionCallback | undefined,
  postValidate: PostValidateCallback | undefined,
  postExecute: PostExecuteCallback | undefined,
  skills: CapabilitySkills | undefined,
  frontmatterSchemas: FrontmatterSchemaDeclaration[] | undefined,
  inputValidation: InputValidationSpec | undefined,
): CapabilityConfig {
  return {
    capability: cap,
    prompt,
    workingDir,
    validation,
    readOnlyFiles,
    writeAllowlist,
    initialMessage,
    fileCleanup,
    sessionParams,
    sessionName,
    prepareSession,
    postValidate,
    postExecute,
    skills,
    frontmatterSchemas,
    inputValidation,
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
  const extracted = extractParams(cwd, params);

  const validation = resolveField<ValidationRule>(pkg.validation, extracted.workingDir, params);
  const readOnlyFiles = resolveField<string[]>(pkg.readOnlyFiles, extracted.workingDir, params);
  const writeAllowlist = resolveField<string[]>(pkg.writeAllowlist, extracted.workingDir, params);
  const inputValidation = resolveField<InputValidationSpec>(pkg.inputValidation, extracted.workingDir, params);

  return buildCapabilityConfig(
    cap,
    undefined, // new-style: prompts compiled from component files
    extracted.workingDir,
    validation,
    readOnlyFiles,
    writeAllowlist,
    extracted.initialMessage ?? pkg.defaultInitialMessage(extracted.workingDir, params),
    extracted.fileCleanup,
    params,
    deriveSessionName(extracted.goalName, cap, extracted.stepNumber),
    pkg.prepareSession,
    pkg.postValidate,
    pkg.postExecute,
    pkg.skills,
    pkg.frontmatterSchemas,
    inputValidation,
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

  try {
    const mod = await import(`./capabilities/${cap}/config`);
    if (mod.default) {
      return normalizePackageConfig(cap, mod.default as CapabilityPackageConfig, cwd, params);
    }
  } catch (err) {
    console.warn(`pio: could not load capability "${cap}": ${err}`);
    return undefined;
  }

  console.warn(`pio: no default export found for capability "${cap}"`);
  return undefined;
}
