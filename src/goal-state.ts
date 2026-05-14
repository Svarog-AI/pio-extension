import * as fs from "node:fs";
import * as path from "node:path";
import { stepFolderName } from "./fs-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Specification files that define a step. */
const TASK_FILE = "TASK.md";
const TEST_FILE = "TEST.md";
const SUMMARY_FILE = "SUMMARY.md";

/** Regex to match step folder names like S01, S02, S100. */
const STEP_FOLDER_RE = /^S(\d+)$/;

// ---------------------------------------------------------------------------
// StepStatus — lazy-evaluated view of a single step folder
// ---------------------------------------------------------------------------

/** Describes the computed status of a single step folder (S01/, S02/, etc.). */
export interface StepStatus {
  /** The step number (e.g. 1 for S01). */
  stepNumber: number;
  /** Zero-padded folder name (e.g. "S01"). */
  folderName: string;
  /** Returns true when TASK.md exists in the step folder. */
  hasTask: () => boolean;
  /** Returns true when TEST.md exists in the step folder. */
  hasTest: () => boolean;
  /** Returns true when SUMMARY.md exists in the step folder. */
  hasSummary: () => boolean;
  /**
   * Returns the computed status of the step.
   * Priority: approved > rejected > blocked > implemented > defined > pending
   */
  status: () => "defined" | "implemented" | "approved" | "rejected" | "blocked" | "pending";
}

function createStepStatus(stepDir: string, stepNumber: number, folderName: string): StepStatus {
  return {
    stepNumber,
    folderName,
    hasTask: () => fs.existsSync(path.join(stepDir, TASK_FILE)),
    hasTest: () => fs.existsSync(path.join(stepDir, TEST_FILE)),
    hasSummary: () => fs.existsSync(path.join(stepDir, SUMMARY_FILE)),
    status: () => {
      // Check markers in priority order: APPROVED > REJECTED > BLOCKED > COMPLETED
      if (fs.existsSync(path.join(stepDir, "APPROVED"))) return "approved";
      if (fs.existsSync(path.join(stepDir, "REJECTED"))) return "rejected";
      if (fs.existsSync(path.join(stepDir, "BLOCKED"))) return "blocked";
      if (fs.existsSync(path.join(stepDir, "COMPLETED"))) return "implemented";

      // No markers — check if step is defined (has both spec files)
      if (
        fs.existsSync(path.join(stepDir, TASK_FILE)) &&
        fs.existsSync(path.join(stepDir, TEST_FILE))
      ) {
        return "defined";
      }

      return "pending";
    },
  };
}

// ---------------------------------------------------------------------------
// GoalState — lazy-evaluated view over the entire goal workspace
// ---------------------------------------------------------------------------

/**
 * Describes the computed status of an entire goal workspace.
 * Every attribute except `goalName` is a zero-argument function that reads
 * fresh state from the filesystem on access (no internal caching).
 */
export interface GoalState {
  /** Constant — derived from the goal directory basename at construction. */
  goalName: string;
  /** Returns true when GOAL.md exists in the goal directory. */
  hasGoal: () => boolean;
  /** Returns true when PLAN.md exists in the goal directory. */
  hasPlan: () => boolean;
  /**
   * Returns the number of plan steps parsed from PLAN.md headings.
   * Matches `## Step N:` patterns and returns the highest N found.
   * Returns undefined if PLAN.md doesn't exist or has no step headings.
   */
  totalPlanSteps: () => number | undefined;
  /**
   * Scans for S{NN} folders and returns a StepStatus for each.
   * Sorted by stepNumber ascending. Only includes folders that exist on disk.
   */
  steps: () => StepStatus[];
  /**
   * Returns the next step to work on.
   * Sequential scan starting at 1: returns the first step without an APPROVED marker,
   * or the first missing folder (gap halts scanning). Only APPROVED advances past a step.
   * Always returns at least 1 — never undefined.
   */
  currentStepNumber: () => number;
  /**
   * Reads the pending task from `.pio/session-queue/task-{goalName}.json`.
   * Returns parsed `{ capability, params }` or undefined if the file doesn't exist.
   */
  pendingTask: () => { capability: string; params: Record<string, unknown> } | undefined;
  /**
   * Reads the last completed task from `<goalDir>/LAST_TASK.json`.
   * Returns the parsed object or undefined if the file doesn't exist.
   */
  lastCompleted: () => { capability: string; params: Record<string, unknown>; timestamp?: string } | undefined;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a lazy-evaluated `GoalState` view over the goal workspace filesystem.
 *
 * All methods read fresh from disk on every call — no internal caching.
 * The object never becomes stale between calls.
 *
 * @param goalDir - Absolute path to a goal workspace (e.g. `/repo/.pio/goals/my-feature`)
 */
export function createGoalState(goalDir: string): GoalState {
  const goalName = path.basename(goalDir);

  // Derive the repo root (cwd) from goalDir.
  // Pattern: <cwd>/.pio/goals/<name> → cwd is two levels above .pio/goals/<name>
  // We split by "/goals/" and go up one more level from ".pio".
  const goalsIdx = goalDir.indexOf("/goals/");
  let cwd: string;
  if (goalsIdx !== -1) {
    const beforeGoals = goalDir.slice(0, goalsIdx);
    // beforeGoals is now <cwd>/.pio
    cwd = path.dirname(beforeGoals);
  } else {
    // Fallback: if the path doesn't contain "/goals/", use the parent of .pio
    // This handles edge cases where goalDir might be constructed differently.
    const pioIdx = goalDir.indexOf("/.pio/");
    if (pioIdx !== -1) {
      cwd = goalDir.slice(0, pioIdx);
    } else {
      // Last resort: use dirname of dirname (handles relative-ish paths)
      cwd = path.dirname(path.dirname(goalDir));
    }
  }

  return {
    goalName,

    hasGoal: () => fs.existsSync(path.join(goalDir, "GOAL.md")),

    hasPlan: () => fs.existsSync(path.join(goalDir, "PLAN.md")),

    totalPlanSteps: () => {
      const planPath = path.join(goalDir, "PLAN.md");
      if (!fs.existsSync(planPath)) return undefined;

      try {
        const content = fs.readFileSync(planPath, "utf-8");
        let highestN = 0;
        for (const line of content.split("\n")) {
          const match = line.match(/^## Step (\d+):/);
          if (match) {
            const n = parseInt(match[1], 10);
            if (n > highestN) highestN = n;
          }
        }
        return highestN > 0 ? highestN : undefined;
      } catch {
        return undefined;
      }
    },

    steps: () => {
      if (!fs.existsSync(goalDir)) return [];

      const entries = fs.readdirSync(goalDir, { withFileTypes: true });
      const stepStatuses: StepStatus[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const match = entry.name.match(STEP_FOLDER_RE);
        if (!match) continue;

        const stepNumber = parseInt(match[1], 10);
        const stepDir = path.join(goalDir, entry.name);

        stepStatuses.push(createStepStatus(stepDir, stepNumber, entry.name));
      }

      // Sort by step number ascending
      stepStatuses.sort((a, b) => a.stepNumber - b.stepNumber);

      return stepStatuses;
    },

    currentStepNumber: () => {
      // Sequential scan: find the first step without an APPROVED marker.
      // If a folder doesn't exist, that's where we are (gap halts scanning).
      // Only APPROVED advances past a step — COMPLETED alone stays current.
      // Always returns at least 1 — never undefined.
      for (let i = 1; ; i++) {
        const folder = stepFolderName(i);
        const stepDir = path.join(goalDir, folder);

        if (!fs.existsSync(stepDir)) {
          // No folder for this step — this is the current step.
          return i;
        }

        if (!fs.existsSync(path.join(stepDir, "APPROVED"))) {
          // Folder exists but no APPROVED marker — work here.
          return i;
        }

        // Has APPROVED — move on to next.
      }
    },

    pendingTask: () => {
      const queuePath = path.join(cwd, ".pio", "session-queue", `task-${goalName}.json`);
      if (!fs.existsSync(queuePath)) return undefined;

      try {
        const raw = fs.readFileSync(queuePath, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.capability !== "string") return undefined;
        const params = typeof parsed.params === "object" && parsed.params !== null
          ? parsed.params as Record<string, unknown>
          : {};
        return { capability: parsed.capability, params };
      } catch {
        return undefined;
      }
    },

    lastCompleted: () => {
      const lastTaskPath = path.join(goalDir, "LAST_TASK.json");
      if (!fs.existsSync(lastTaskPath)) return undefined;

      try {
        const raw = fs.readFileSync(lastTaskPath, "utf-8");
        return JSON.parse(raw) as { capability: string; params: Record<string, unknown>; timestamp?: string };
      } catch {
        return undefined;
      }
    },
  };
}
