import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Session task slot utilities
// ---------------------------------------------------------------------------

/** Minimal task descriptor written to `.pio/session-queue/task-{queueKey}.json` as JSON. */
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
 * Write the pending task to a queue file `.pio/session-queue/task-{queueKey}.json`.
 * Each queue key gets its own slot — one pending task at a time.
 * Overwrites any existing task for that specific key.
 */
export function enqueueTask(
  cwd: string,
  queueKey: string,
  task: SessionQueueTask,
): void {
  const dir = queueDir(cwd);
  const filePath = path.join(dir, `task-${queueKey}.json`);
  fs.writeFileSync(filePath, JSON.stringify(task, null, 2), "utf-8");
}

/**
 * Read a pending task from `.pio/session-queue/task-{queueKey}.json`.
 * Returns the parsed task or `undefined` if the file does not exist.
 */
export function readPendingTask(
  cwd: string,
  queueKey: string,
): SessionQueueTask | undefined {
  const dir = queueDir(cwd);
  const filePath = path.join(dir, `task-${queueKey}.json`);
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SessionQueueTask;
}

/**
 * List all queue keys that have a pending task file.
 * Scans `.pio/session-queue/` for files matching `task-*.json` pattern.
 * Returns keys (may contain `__` delimiters for hierarchical workflows).
 */
export function listPendingTasks(cwd: string): string[] {
  const dir = queueDir(cwd);
  if (!fs.existsSync(dir)) return [];
  const tasks: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith("task-") && entry.endsWith(".json")) {
      const key = entry.slice(5, entry.length - 5);
      tasks.push(key);
    }
  }
  return tasks;
}
