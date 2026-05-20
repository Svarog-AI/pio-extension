import * as fs from "node:fs";
import * as path from "node:path";
import { stepFolderName } from "./fs-utils";
import { extractFrontmatter, validateAndCoerce } from "./frontmatter";
import { PLAN_FRONTMATTER_SCHEMA, REVIEW_OUTPUT_SCHEMA, type PlanFrontmatter, type ReviewOutputs } from "./frontmatter-schemas";

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
   * Returns the total number of plan steps from PLAN.md frontmatter.
   * Reads `totalSteps` from the YAML frontmatter block.
   * Returns undefined if PLAN.md doesn't exist or has invalid frontmatter.
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
  /**
   * Reads REVIEW.md frontmatter for a given step and returns typed review outputs.
   *
   * Without options: returns `ReviewOutputs | null` (backward compatible).
   * With `{ errors: true }`: returns `{ data?: ReviewOutputs; error?: string }`
   * with detailed error information instead of `null`. Suppresses `console.warn`.
   * Lazy-evaluated — reads fresh from disk on every call.
   */
  getReviewOutputs: (stepNumber: number, options?: { errors?: boolean }) =>
    | ReviewOutputs
    | null
    | { data?: ReviewOutputs; error?: string };
  /**
   * Reads PLAN.md frontmatter and returns typed plan metadata.
   *
   * Without options: returns `PlanFrontmatter | null`.
   * With `{ errors: true }`: returns `{ data?: PlanFrontmatter; error?: string }`
   * with detailed error information instead of `null`. Suppresses `console.warn`.
   * Lazy-evaluated — reads fresh from disk on every call.
   */
  planMetadata: (options?: { errors?: boolean }) =>
    | PlanFrontmatter
    | null
    | { data?: PlanFrontmatter; error?: string };
  /**
   * Returns true when the COMPLETED marker file exists at `<goalDir>/COMPLETED`.
   * This is the canonical completion signal — checked by `validateOutputs` to pass exit-gate validation.
   * The COMPLETED marker is written by the evolve-plan agent (prompt Step 2) when all plan steps
   * are already specified and the assigned step cannot be found in PLAN.md.
   * Lazy-evaluated — reads fresh on every call.
   */
  goalCompleted: () => boolean;
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

  // Extract planMetadata into a local variable so totalPlanSteps() can delegate.
  // Can't use `this` in a plain object literal — use a shared closure instead.
  const _planMetadata = (options?: { errors?: boolean }) => {
    const planPath = path.join(goalDir, "PLAN.md");

    // extractFrontmatter returns null for missing file, no frontmatter, or malformed YAML
    const raw = extractFrontmatter(planPath);
    if (raw === null) {
      if (options?.errors) {
        return { error: `could not extract frontmatter from PLAN.md` };
      }
      console.warn(
        `[GoalState] planMetadata(): could not extract frontmatter from ${planPath}`,
      );
      return null;
    }

    // validateAndCoerce returns { data } on success, { error } on validation failure
    const result = validateAndCoerce<PlanFrontmatter>(raw, PLAN_FRONTMATTER_SCHEMA);
    if ("error" in result) {
      if (options?.errors) {
        return { error: result.error };
      }
      console.warn(
        `[GoalState] planMetadata(): frontmatter validation failed: ${result.error}`,
      );
      return null;
    }

    if (options?.errors) {
      return { data: result.data };
    }

    return result.data;
  };

  return {
    goalName,

    hasGoal: () => fs.existsSync(path.join(goalDir, "GOAL.md")),

    hasPlan: () => fs.existsSync(path.join(goalDir, "PLAN.md")),

    planMetadata: _planMetadata,

    totalPlanSteps: () => {
      const metadata = _planMetadata() as PlanFrontmatter | null;
      return metadata ? metadata.totalSteps : undefined;
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

    getReviewOutputs: (stepNumber: number, options?: { errors?: boolean }) => {
      const folder = stepFolderName(stepNumber);
      const reviewPath = path.join(goalDir, folder, "REVIEW.md");

      // extractFrontmatter returns null for missing file, no frontmatter, or malformed YAML
      const raw = extractFrontmatter(reviewPath);
      if (raw === null) {
        if (options?.errors) {
          return { error: `could not extract frontmatter from REVIEW.md` };
        }
        console.warn(
          `[GoalState] getReviewOutputs(${stepNumber}): could not extract frontmatter from ${reviewPath}`,
        );
        return null;
      }

      // validateAndCoerce returns { data } on success, { error } on validation failure
      const result = validateAndCoerce<ReviewOutputs>(raw, REVIEW_OUTPUT_SCHEMA);
      if ("error" in result) {
        if (options?.errors) {
          return { error: result.error };
        }
        return null;
      }

      if (options?.errors) {
        return { data: result.data };
      }

      return result.data;
    },

    goalCompleted: () => {
      // Canonical completion signal: COMPLETED marker file at goal root.
      // Written by the evolve-plan agent (prompt Step 2) when all steps are already specified.
      return fs.existsSync(path.join(goalDir, "COMPLETED"));
    },
  };
}
