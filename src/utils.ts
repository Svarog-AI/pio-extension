import * as fs from "node:fs";
import * as path from "node:path";
import type { CapabilityConfig, StaticCapabilityConfig } from "./types";

// Re-export transition system from dedicated module (Step 1)
export {
  resolveNextCapability,
  CAPABILITY_TRANSITIONS,
} from "./transitions";
export type { TransitionContext, TransitionResult, CapabilityTransitionResolver } from "./transitions";

// Re-export session queue utilities from dedicated module (Step 2)
export {
  queueDir,
  enqueueTask,
  readPendingTask,
  listPendingGoals,
  writeLastTask,
} from "./queues";
export type { SessionQueueTask } from "./queues";

/** Resolve a goal workspace path under .pio/goals/<name>. */
export function resolveGoalDir(cwd: string, name: string): string {
  return path.join(cwd, ".pio", "goals", name);
}

/** Check if a goal workspace exists. */
export function goalExists(goalDir: string): boolean {
  return fs.existsSync(goalDir);
}

// ---------------------------------------------------------------------------
// Issue utilities
// ---------------------------------------------------------------------------

/** Returns the path to `.pio/issues/`, creating it if needed. */
export function issuesDir(cwd: string): string {
  const dir = path.join(cwd, ".pio", "issues");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Resolve an issue identifier to a full filesystem path.
 * Accepts a slug (`my-issue`), filename (`my-issue.md`), or relative/absolute path.
 * Returns `undefined` if not found.
 */
export function findIssuePath(cwd: string, identifier: string): string | undefined {
  // Absolute path — check directly
  if (path.isAbsolute(identifier) && fs.existsSync(identifier)) {
    return identifier;
  }

  const dir = path.join(cwd, ".pio", "issues");
  const basename = path.basename(identifier);

  // Exact filename match (e.g. `my-issue.md`)
  const exact = path.join(dir, basename);
  if (fs.existsSync(exact)) return exact;

  // Bare slug — append .md (e.g. `my-issue` → `my-issue.md`)
  if (!basename.endsWith(".md")) {
    const withExt = path.join(dir, basename + ".md");
    if (fs.existsSync(withExt)) return withExt;
  }

  return undefined;
}

/**
 * Read an issue file by identifier. Returns the file contents or `undefined` if not found.
 */
export function readIssue(cwd: string, identifier: string): string | undefined {
  const filePath = findIssuePath(cwd, identifier);
  if (!filePath) {
    return undefined;
  }
  return fs.readFileSync(filePath, "utf-8");
}

// ---------------------------------------------------------------------------
// Session name derivation
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable session name from goal name, capability, and optional step number.
 *
 * Format:
 * - `<goal-name> <capability> s{N}` when all three are present
 * - `<goal-name> <capability>` when only goal name is present
 * - `<capability>` for non-goal sessions (empty or missing goalName)
 */
export function deriveSessionName(goalName: string, capability: string, stepNumber?: number): string {
  if (!goalName) return capability;

  let name = `${goalName} ${capability}`;
  if (typeof stepNumber === "number") {
    name += ` s${stepNumber}`;
  }
  return name;
}

// ---------------------------------------------------------------------------
// Step folder helpers
// ---------------------------------------------------------------------------

/** Format a step number as a zero-padded folder name (S01, S02, ...). */
export function stepFolderName(stepNumber: number): string {
  return `S${String(stepNumber).padStart(2, "0")}`;
}

/**
 * Auto-discover the next step number by scanning for completed step folders.
 * A step folder is considered complete when it contains both TASK.md and TEST.md.
 * Returns N+1 where N is the highest complete step (or 1 if none found).
 */
export function discoverNextStep(goalDir: string): number {
  const TASK_FILE = "TASK.md";
  const TEST_FILE = "TEST.md";

  let highestDefined = 0;
  for (let i = 1; ; i++) {
    const folder = stepFolderName(i);
    const stepDir = path.join(goalDir, folder);
    if (!fs.existsSync(stepDir)) {
      // No more step folders — stop scanning.
      break;
    }
    if (
      fs.existsSync(path.join(stepDir, TASK_FILE)) &&
      fs.existsSync(path.join(stepDir, TEST_FILE))
    ) {
      highestDefined = i;
    }
  }

  return highestDefined + 1;
}

// ---------------------------------------------------------------------------
// Capability config resolution
// ---------------------------------------------------------------------------

/** Static shape each capability exports as `CAPABILITY_CONFIG`. */
// Re-export for backward compatibility — moved to types.ts
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


