import type { CapabilityConfig, ConfigCallback, PostExecuteCallback, PostValidateCallback, PrepareSessionCallback, StaticCapabilityConfig, ValidationRule } from "./types";
import type { CapabilityPackageConfig, FrontmatterSchemaDeclaration, CapabilitySkills } from "./capability-package";
import {
  resolveGoalDir,
  deriveSessionName,
} from "./fs-utils";

// Re-export for backward compatibility — originally defined in types.ts
export type { StaticCapabilityConfig } from "./types";

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

/**
 * Normalize a CapabilityPackageConfig (new-style default export) to CapabilityConfig.
 */
function normalizePackageConfig(
  cap: string,
  pkg: CapabilityPackageConfig,
  cwd: string,
  params?: Record<string, unknown>,
): CapabilityConfig {
  const goalName = typeof params?.goalName === "string" ? params.goalName : "";
  const explicitWorkingDir = typeof params?.workingDir === "string" && params.workingDir
    ? params.workingDir
    : "";
  const workingDir = explicitWorkingDir
    ? explicitWorkingDir
    : goalName
      ? resolveGoalDir(cwd, goalName)
      : cwd;

  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;

  const validation = resolveField<ValidationRule>(pkg.validation, workingDir, params);
  const readOnlyFiles = resolveField<string[]>(pkg.readOnlyFiles, workingDir, params);
  const writeAllowlist = resolveField<string[]>(pkg.writeAllowlist, workingDir, params);

  return {
    capability: cap,
    // New-style capabilities don't have a prompt field — prompts are compiled from component files
    prompt: undefined,
    workingDir,
    validation,
    readOnlyFiles,
    writeAllowlist,
    initialMessage:
      typeof params?.initialMessage === "string"
        ? params.initialMessage
        : pkg.defaultInitialMessage(workingDir, params),
    fileCleanup: Array.isArray(params?.fileCleanup) ? params.fileCleanup : undefined,
    sessionParams: params,
    sessionName: deriveSessionName(goalName, cap, stepNumber),
    prepareSession: pkg.prepareSession,
    postValidate: pkg.postValidate,
    postExecute: pkg.postExecute,
    skills: pkg.skills,
    frontmatterSchemas: pkg.frontmatterSchemas,
  };
}

/**
 * Normalize a StaticCapabilityConfig (old-style CAPABILITY_CONFIG) to CapabilityConfig.
 */
function normalizeStaticConfig(
  cap: string,
  config: StaticCapabilityConfig,
  cwd: string,
  params?: Record<string, unknown>,
): CapabilityConfig {
  const goalName = typeof params?.goalName === "string" ? params.goalName : "";
  const explicitWorkingDir = typeof params?.workingDir === "string" && params.workingDir
    ? params.workingDir
    : "";
  const workingDir = explicitWorkingDir
    ? explicitWorkingDir
    : goalName
      ? resolveGoalDir(cwd, goalName)
      : cwd;

  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;

  const validation = typeof config.validation === "function"
    ? config.validation(workingDir, params)
    : config.validation;
  const readOnlyFiles = typeof config.readOnlyFiles === "function"
    ? config.readOnlyFiles(workingDir, params)
    : config.readOnlyFiles;
  const writeAllowlist = typeof config.writeAllowlist === "function"
    ? config.writeAllowlist(workingDir, params)
    : config.writeAllowlist;

  return {
    capability: cap,
    prompt: config.prompt,
    workingDir,
    validation,
    readOnlyFiles,
    writeAllowlist,
    initialMessage:
      typeof params?.initialMessage === "string"
        ? params.initialMessage
        : config.defaultInitialMessage(workingDir, params),
    fileCleanup: Array.isArray(params?.fileCleanup) ? params.fileCleanup : undefined,
    sessionParams: params,
    sessionName: deriveSessionName(goalName, cap, stepNumber),
    prepareSession: config.prepareSession,
    postValidate: config.postValidate,
    postExecute: config.postExecute,
    skills: config.skills,
    frontmatterSchemas: config.frontmatterSchemas,
  };
}

/**
 * Resolve a capability name to its full CapabilityConfig.
 *
 * Resolution order:
 * 1. Try directory-based `config.ts` default export (`./capabilities/${cap}/config`)
 * 2. Fall back to old-style `CAPABILITY_CONFIG` named export (`./capabilities/${cap}`)
 */
export async function resolveCapabilityConfig(
  cwd: string,
  params?: Record<string, unknown>,
): Promise<CapabilityConfig | undefined> {
  const cap = typeof params?.capability === "string" ? params.capability : null;
  if (!cap) return undefined;

  // 1. Try directory-based default export first
  try {
    const mod = await import(`./capabilities/${cap}/config`);
    if (mod.default) {
      return normalizePackageConfig(cap, mod.default as CapabilityPackageConfig, cwd, params);
    }
  } catch {
    // Not a directory package or import failed — fall through to old-style
  }

  // 2. Fall back to old-style CAPABILITY_CONFIG named export
  let oldMod: { CAPABILITY_CONFIG: StaticCapabilityConfig } | undefined;
  try {
    oldMod = await import(`./capabilities/${cap}`);
  } catch (err) {
    console.warn(`pio: could not load capability "${cap}": ${err}`);
    return undefined;
  }

  const config = oldMod?.CAPABILITY_CONFIG;
  if (!config) {
    console.warn(`pio: no CAPABILITY_CONFIG found for "${cap}"`);
    return undefined;
  }

  return normalizeStaticConfig(cap, config, cwd, params);
}
