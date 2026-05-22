import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Session task slot utilities
// ---------------------------------------------------------------------------

/**
 * Derive a unique queue key from a goal directory path.
 *
 * Strips the `<cwd>/.pio/goals/` prefix, filters out `subgoals` directory
 * markers, and joins remaining segments with `__`.
 *
 * @example Flat goal: `/repo/.pio/goals/my-feature` → `"my-feature"`
 * @example Nested: `/repo/.pio/goals/parent/S03/subgoals/nested` → `"parent__S03__nested"`
 *
 * @param goalDir - Absolute path to a goal workspace
 * @param cwd - Repository root directory
 * @returns Unique queue key string
 */
export function deriveQueueKey(goalDir: string, cwd: string): string {
  const prefix = cwd + "/.pio/goals/";
  const idx = goalDir.indexOf(prefix);

  if (idx === -1) {
    throw new Error(
      `deriveQueueKey: goalDir "${goalDir}" does not contain the expected prefix "${prefix}"`,
    );
  }

  const relativePath = goalDir.slice(idx + prefix.length);

  const segments = relativePath.split("/");

  // Filter out "subgoals" markers and join with "__"
  const filtered = segments.filter((seg) => seg !== "subgoals" && seg.length > 0);

  if (filtered.length === 0) {
    throw new Error(
      `deriveQueueKey: no path segments remain after filtering from "${goalDir}"`,
    );
  }

  return filtered.join("__");
}

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
export function enqueueTask(
  cwd: string,
  goalName: string,
  task: SessionQueueTask,
  qualifiedName?: string,
): void {
  const dir = queueDir(cwd);
  const key = qualifiedName !== undefined ? qualifiedName : goalName;
  const filePath = path.join(dir, `task-${key}.json`);
  fs.writeFileSync(filePath, JSON.stringify(task, null, 2), "utf-8");
}

/**
 * Read a specific goal's pending task from `.pio/session-queue/task-{goalName}.json`.
 * Returns the parsed task or `undefined` if the file does not exist.
 */
export function readPendingTask(
  cwd: string,
  goalName: string,
  qualifiedName?: string,
): SessionQueueTask | undefined {
  const dir = queueDir(cwd);
  const key = qualifiedName !== undefined ? qualifiedName : goalName;
  const filePath = path.join(dir, `task-${key}.json`);
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SessionQueueTask;
}

/**
 * List all goal names that have a pending task file.
 * Scans `.pio/session-queue/` for files matching `task-*.json` pattern.
 * Returns qualified names for hierarchical goals (may contain `__` delimiters).
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
