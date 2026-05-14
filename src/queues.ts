import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Session task slot utilities
// ---------------------------------------------------------------------------

/** Minimal task descriptor written to `.pio/session-queue/task-{goalName}.json` as JSON. */
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
