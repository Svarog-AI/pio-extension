import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidationRule, CapabilityConfig, StaticCapabilityConfig } from "./types";

/** Resolve a goal workspace path under .pio/goals/<name>. */
export function resolveGoalDir(cwd: string, name: string): string {
  return path.join(cwd, ".pio", "goals", name);
}

/** Check if a goal workspace exists. */
export function goalExists(goalDir: string): boolean {
  return fs.existsSync(goalDir);
}

// ---------------------------------------------------------------------------
// Session task slot utilities
// ---------------------------------------------------------------------------

/** Minimal task descriptor written to `.pio/session-queue/task.json` as JSON. */
export interface SessionQueueTask {
  capability: string;
  params?: Record<string, unknown>;
}

/** Returns the path to `.pio/session-queue/`, creating it if needed. */
export function queueDir(cwd: string): string {
  const dir = path.join(cwd, ".pio", "session-queue");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
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

/**
 * Write the pending task to a single fixed file `.pio/session-queue/task.json`.
 * Overwrites any existing task — only the most recently enqueued task survives.
 */
export function enqueueTask(cwd: string, task: SessionQueueTask): void {
  const dir = queueDir(cwd);
  const filePath = path.join(dir, "task.json");
  fs.writeFileSync(filePath, JSON.stringify(task, null, 2), "utf-8");
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

  return {
    capability: cap,
    prompt: config.prompt,
    workingDir,
    validation: config.validation,
    readOnlyFiles: config.readOnlyFiles,
    writeOnlyFiles: config.writeOnlyFiles,
    initialMessage:
      typeof params?.initialMessage === "string"
        ? params.initialMessage
        : config.defaultInitialMessage(workingDir, params),
    fileCleanup: Array.isArray(params?.fileCleanup) ? params.fileCleanup : undefined,
  };
}

// ---------------------------------------------------------------------------
// Capability transition helpers — deterministic task flow
// ---------------------------------------------------------------------------

/** Maps a capability name to the next capability name in the happy path. */
export const CAPABILITY_TRANSITIONS: Record<string, string> = {
  "create-goal": "create-plan",
  "create-plan": "evolve-plan",
  "evolve-plan": "execute-task",
  "execute-task": "evolve-plan",
};
