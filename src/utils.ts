import * as fs from "node:fs";
import * as path from "node:path";
import type { CapabilityConfig } from "./capabilities/session-capability";

/** Resolve a goal workspace path under .pio/goals/<name>. */
export function resolveGoalDir(cwd: string, name: string): string {
  return path.join(cwd, ".pio", "goals", name);
}

/** Check if a goal workspace exists. */
export function goalExists(goalDir: string): boolean {
  return fs.existsSync(goalDir);
}

// ---------------------------------------------------------------------------
// Session queue utilities
// ---------------------------------------------------------------------------

/** Minimal task descriptor written to `.pio/session-queue/` as JSON. */
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
 * Accepts a bare filename (e.g. `20260101_120000.md`), a basename,
 * or a relative/absolute path. Returns `undefined` if not found.
 */
export function findIssuePath(cwd: string, identifier: string): string | undefined {
  // If it's already an absolute path and exists, use it directly
  if (path.isAbsolute(identifier) && fs.existsSync(identifier)) {
    return identifier;
  }

  // Extract the basename from whatever was passed
  const basename = path.basename(identifier);
  const dir = path.join(cwd, ".pio", "issues");

  // Check for exact match in the issues directory
  const candidate = path.join(dir, basename);
  if (fs.existsSync(candidate)) {
    return candidate;
  }

  // If identifier is a relative path (not just a basename), try resolving it as-is
  if (identifier.includes(path.sep) || identifier.includes("/")) {
    const resolved = path.resolve(cwd, identifier);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
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

/** Writes a JSON queue file and returns the file path. */
export function enqueueTask(cwd: string, task: SessionQueueTask): string {
  const dir = queueDir(cwd);
  const ts = Date.now();
  const filename = `${ts}-${task.capability}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(task, null, 2), "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Capability transition helpers — deterministic task flow
// ---------------------------------------------------------------------------

/** Maps a capability name to the next capability name in the happy path. */
export const CAPABILITY_TRANSITIONS: Record<string, string> = {
  "create-goal": "create-plan",
  "create-plan": "evolve-plan",
};

/**
 * Builder that produces a CapabilityConfig from cwd and capability params.
 * Each capability exports one of these; the registry maps names → builders.
 */
export type CapabilitySessionFactory = (cwd: string, params?: Record<string, unknown>) => CapabilityConfig;

/** Registry of session factories — populated by each capability's setup. */
export const CAPABILITY_SESSIONS: Record<string, CapabilitySessionFactory> = {};
