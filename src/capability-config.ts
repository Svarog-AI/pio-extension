import type { CapabilityConfig, StaticCapabilityConfig } from "./types";
import {
  resolveGoalDir,
  deriveSessionName,
} from "./fs-utils";

// Re-export for backward compatibility — originally defined in types.ts
export type { StaticCapabilityConfig } from "./types";

/**
 * Resolve a capability name to its full CapabilityConfig.
 * Imports the capability module dynamically and reads its `CAPABILITY_CONFIG` export.
 */
export async function resolveCapabilityConfig(
  cwd: string,
  params?: Record<string, unknown>,
): Promise<CapabilityConfig | undefined> {
  const cap = typeof params?.capability === "string" ? params.capability : null;
  if (!cap) return undefined;

  let mod: { CAPABILITY_CONFIG: StaticCapabilityConfig } | undefined;
  try {
    // Convention: capability name matches the module filename under src/capabilities/
    mod = await import(`./capabilities/${cap}`);
  } catch (err) {
    console.warn(`pio: could not load capability "${cap}": ${err}`);
    return undefined;
  }

  const config = mod?.CAPABILITY_CONFIG;
  if (!config) {
    console.warn(`pio: no CAPABILITY_CONFIG found for "${cap}"`);
    return undefined;
  }

  // Derive workingDir from params.goalName, or fall back to cwd for project-scoped capabilities
  const goalName = typeof params?.goalName === "string" ? params.goalName : "";
  const workingDir = goalName ? resolveGoalDir(cwd, goalName) : cwd;

  // Resolve step number from params (used for session name and step-dependent config)
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;

  // Resolve step-dependent config fields: callbacks are invoked with (workingDir, params);
  // static values pass through unchanged. This mirrors the defaultInitialMessage pattern.
  const validation = typeof config.validation === "function"
    ? config.validation(workingDir, params)
    : config.validation;
  const readOnlyFiles = typeof config.readOnlyFiles === "function"
    ? config.readOnlyFiles(workingDir, params)
    : config.readOnlyFiles;
  const writeAllowlist = typeof config.writeAllowlist === "function"
    ? config.writeAllowlist(workingDir, params)
    : config.writeAllowlist;

  // prepareSession is always a callback (or undefined) — pass through directly
  const prepareSession = config.prepareSession;

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
    prepareSession,
  };
}
