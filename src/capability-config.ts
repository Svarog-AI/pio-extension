import type { CapabilityConfig, CapabilityContract, ConfigCallback, InputValidationSpec, PostExecuteCallback, PostValidateCallback, PrepareSessionCallback, ValidationRule } from "./types";
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
  return paths.map((p) =>
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
  contract: CapabilityContract | undefined,
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
    contract,
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
  const contract = pkg.contract; // optional, pass through as-is

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
    contract,
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
