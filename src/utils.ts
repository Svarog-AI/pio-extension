import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidationRule } from "./capabilities/validation";

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

/** A task descriptor written to `.pio/session-queue/` as JSON. */
export interface SessionQueueTask {
  capability: string;
  systemPromptName: string;
  workingDir?: string;
  validation?: ValidationRule;
  initialMessage: string;
  /** Files that must not be modified during this session (relative to workingDir) */
  readOnlyFiles?: string[];
  /** Files that MAY be written during this session (allowlist). Takes precedence over readOnlyFiles. */
  writeOnlyFiles?: string[];
}

/** Returns the path to `.pio/session-queue/`, creating it if needed. */
export function queueDir(cwd: string): string {
  const dir = path.join(cwd, ".pio", "session-queue");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
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
