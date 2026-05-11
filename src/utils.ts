import * as fs from "node:fs";
import * as path from "node:path";
import type { CapabilityConfig, StaticCapabilityConfig } from "./types";

// ---------------------------------------------------------------------------
// Conditional transition types
// ---------------------------------------------------------------------------

/** Context passed to transition resolver callbacks. */
export interface TransitionContext {
  /** Current capability name (e.g. "review-code") */
  capability: string;
  /** Working directory (goal workspace directory) */
  workingDir: string;
  /** Session params from the completing session (goalName, stepNumber, …) */
  params?: Record<string, unknown>;
}

/** A function that inspects runtime state and returns the next capability name. */
export type CapabilityTransitionResolver = (ctx: TransitionContext) => string | undefined;

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
 * Write the pending task to a per-goal file `.pio/session-queue/task-{goalName}.json`.
 * Each goal gets its own slot — one pending task at a time.
 * Overwrites any existing task for that specific goal.
 */
export function enqueueTask(cwd: string, goalName: string, task: SessionQueueTask): void {
  const dir = queueDir(cwd);
  const filePath = path.join(dir, `task-${goalName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(task, null, 2), "utf-8");
}

/**
 * Read a specific goal's pending task from `.pio/session-queue/task-{goalName}.json`.
 * Returns the parsed task or `undefined` if the file does not exist.
 */
export function readPendingTask(cwd: string, goalName: string): SessionQueueTask | undefined {
  const dir = queueDir(cwd);
  const filePath = path.join(dir, `task-${goalName}.json`);
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SessionQueueTask;
}

/**
 * List all goal names that have a pending task file.
 * Scans `.pio/session-queue/` for files matching `task-*.json` pattern.
 */
export function listPendingGoals(cwd: string): string[] {
  const dir = queueDir(cwd);
  if (!fs.existsSync(dir)) return [];
  const goals: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith("task-") && entry.endsWith(".json")) {
      // Extract goal name from task-{goalName}.json
      const goalName = entry.slice(5, entry.length - 5);
      goals.push(goalName);
    }
  }
  return goals;
}

/**
 * Write the completed task record to `<goalDir>/LAST_TASK.json`.
 * Records what capability just finished and its params (including accumulated session history).
 */
export function writeLastTask(goalDir: string, task: SessionQueueTask): void {
  const filePath = path.join(goalDir, "LAST_TASK.json");
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
  };
}

// ---------------------------------------------------------------------------
// Capability transition helpers — deterministic task flow
// ---------------------------------------------------------------------------

/** Maps a capability name to the next capability name in the happy path.
 * Values can be plain strings (deterministic) or resolver callbacks (conditional). */
export const CAPABILITY_TRANSITIONS: Record<string, string | CapabilityTransitionResolver> = {
  "create-goal": "create-plan",
  "create-plan": "evolve-plan",
  "evolve-plan": "execute-task",
  "execute-task": "review-code",
  "review-code": (ctx): string => {
    const stepNumber = typeof ctx.params?.stepNumber === "number" ? ctx.params.stepNumber : undefined;
    if (stepNumber != null) {
      const folder = `S${String(stepNumber).padStart(2, "0")}`;
      const approvedPath = path.join(ctx.workingDir, folder, "APPROVED");
      if (fs.existsSync(approvedPath)) {
        return "evolve-plan";
      }
    }
    return "execute-task";
  },
};

/**
 * Resolve the next capability name for a given capability.
 * Handles both string entries (returned directly) and callback entries (invoked with context).
 */
export function resolveNextCapability(capability: string, ctx: TransitionContext): string | undefined {
  const value = CAPABILITY_TRANSITIONS[capability];
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return value(ctx);
}
