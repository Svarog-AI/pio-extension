import * as fs from "node:fs";
import * as path from "node:path";
import { stepFolderName } from "../fs-utils";
import { CapState } from "../capability-state";
import { validateAndCoerce } from "../frontmatter";
import type { CapabilityContract } from "../types";

// ---------------------------------------------------------------------------
// Goal completion check
// ---------------------------------------------------------------------------

/**
 * Returns true when the COMPLETED marker file exists at `<goalDir>/COMPLETED`.
 * This is the canonical completion signal for a goal workspace.
 *
 * Replaces `state.goalCompleted()` from GoalState.
 */
export function isGoalComplete(goalDir: string): boolean {
  return fs.existsSync(path.join(goalDir, "COMPLETED"));
}

// ---------------------------------------------------------------------------
// Current step number
// ---------------------------------------------------------------------------

/**
 * Sequential scan for the first step folder (S01, S02, ...) without an APPROVED marker.
 *
 * - If folder S{N} doesn't exist → return N (gap halts scanning)
 * - If folder exists but has no APPROVED marker → return N (work here)
 * - Only APPROVED advances past a step — COMPLETED alone does not skip
 * - Always returns at least 1 — never undefined
 *
 * Replaces `state.currentStepNumber()` from GoalState.
 */
export function findCurrentStepNumber(goalDir: string): number {
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
}

// ---------------------------------------------------------------------------
// SimpleStepStatus — marker-based step status (no schema parsing)
// ---------------------------------------------------------------------------

/**
 * Simplified, schema-free step status.
 *
 * Checks marker files (APPROVED, REJECTED, BLOCKED, COMPLETED) and TASK.md
 * existence on disk. Does NOT parse REVIEW.md frontmatter — this is a deliberate
 * simplification to keep this module free of schema imports.
 *
 * Marker files are created by `postExecuteReview` after transitions, and review
 * decisions take effect on the next transition cycle. There's no race condition
 * between reading markers vs frontmatter at transition time.
 *
 * Status priority: approved > rejected > blocked > implemented > defined > pending
 */
export interface SimpleStepStatus {
  /** The step number (e.g. 1 for S01). */
  stepNumber: number;
  /** Zero-padded folder name (e.g. "S01"). */
  folderName: string;
  /** Returns true when TASK.md exists in the step folder. */
  hasTask(): boolean;
  /** Returns true when SUMMARY.md exists in the step folder. */
  hasSummary(): boolean;
  /** Returns true when REVISE_PLAN_NEEDED marker exists in the step folder. */
  revisionNeeded(): boolean;
  /**
   * Returns the computed status of the step based on marker files only.
   * Priority: approved > rejected > blocked > implemented > defined > pending
   * Does NOT parse REVIEW.md frontmatter — checks markers exclusively.
   */
  status(): "defined" | "implemented" | "approved" | "rejected" | "blocked" | "pending";
}

/**
 * Create a SimpleStepStatus for the given step directory.
 *
 * @param stepDir - Absolute path to the step folder (e.g. `<goalDir>/S01`)
 * @param stepNumber - The step number (e.g. 1)
 * @param folderName - Zero-padded folder name (e.g. "S01")
 */
export function createSimpleStepStatus(
  stepDir: string,
  stepNumber: number,
  folderName: string,
): SimpleStepStatus {
  return {
    stepNumber,
    folderName,
    hasTask: () => fs.existsSync(path.join(stepDir, "TASK.md")),
    hasSummary: () => fs.existsSync(path.join(stepDir, "SUMMARY.md")),
    revisionNeeded: () => fs.existsSync(path.join(stepDir, "REVISE_PLAN_NEEDED")),
    status: () => {
      // Marker-based status check — no schema parsing.
      // Priority: approved > rejected > blocked > implemented > defined > pending
      if (fs.existsSync(path.join(stepDir, "APPROVED"))) return "approved";
      if (fs.existsSync(path.join(stepDir, "REJECTED"))) return "rejected";
      if (fs.existsSync(path.join(stepDir, "BLOCKED"))) return "blocked";
      if (fs.existsSync(path.join(stepDir, "COMPLETED"))) return "implemented";
      if (fs.existsSync(path.join(stepDir, "TASK.md"))) return "defined";
      return "pending";
    },
  };
}

// ---------------------------------------------------------------------------
// EnrichedStepStatus — extends SimpleStepStatus with schema-aware methods
// ---------------------------------------------------------------------------

/**
 * Extends SimpleStepStatus with CapState-backed methods for schema-aware
 * file access: REVIEW.md frontmatter parsing for status(), TASK.md frontmatter
 * for taskSkills(), and TEST.md existence check.
 *
 * The status() method replicates GoalState's frontmatter-aware behavior:
 * REVIEW.md frontmatter decision takes priority over marker files.
 */
export interface EnrichedStepStatus extends SimpleStepStatus {
  /** Returns true when TEST.md exists in the step folder. */
  hasTest(): boolean;
  /**
   * Returns step metadata from PLAN.md frontmatter steps array.
   * Provided at construction time — not read from disk.
   */
  getMetadata(): Record<string, unknown> | null;
  /**
   * Reads TASK.md frontmatter and returns the skills field.
   * Lazy-evaluated — reads fresh from disk on every call.
   */
  taskSkills(): Record<string, unknown> | null;
}

/**
 * Create an EnrichedStepStatus that wraps SimpleStepStatus with CapState-backed
 * schema-aware reads for status() (REVIEW.md), taskSkills() (TASK.md), and hasTest().
 *
 * @param stepDir - Absolute path to the step folder (e.g. `<goalDir>/S01`)
 * @param goalDir - Absolute path to the goal workspace (for CapState path resolution)
 * @param stepNumber - The step number (e.g. 1)
 * @param folderName - Zero-padded folder name (e.g. "S01")
 * @param metadata - Step metadata from PLAN.md frontmatter (or null)
 * @param evolvePlanContract - Contract for reading TASK.md (evolve-plan outputs)
 * @param reviewTaskContract - Contract for reading REVIEW.md (review-task outputs)
 */
export function createEnrichedStepStatus(
  stepDir: string,
  goalDir: string,
  stepNumber: number,
  folderName: string,
  metadata: Record<string, unknown> | null,
  evolvePlanContract: CapabilityContract,
  reviewTaskContract: CapabilityContract,
): EnrichedStepStatus {
  const base = createSimpleStepStatus(stepDir, stepNumber, folderName);

  return {
    ...base,
    hasTest: () => fs.existsSync(path.join(stepDir, "TEST.md")),
    getMetadata: () => metadata,
    taskSkills: () => {
      const capState = new CapState(evolvePlanContract, goalDir, { stepNumber });
      const data = capState.file<Record<string, unknown>>("S{stepNumber:02d}/TASK.md").read();
      return data?.skills as Record<string, unknown> | null ?? null;
    },
    status: () => {
      // Check REVIEW.md frontmatter first — the decision is the source of truth.
      const capState = new CapState(reviewTaskContract, goalDir, { stepNumber });
      const reviewFile = capState.file<Record<string, unknown>>("S{stepNumber:02d}/REVIEW.md");

      if (reviewFile.exists()) {
        const raw = reviewFile.read();
        if (raw && typeof raw.decision === "string") {
          // Validate against schema to ensure it's a valid decision value
          const reviewSchema = reviewTaskContract.outputs.find(
            (e): e is { file: string; schema?: import("typebox").TSchema } =>
              "file" in e && !("files" in e),
          )?.schema;

          if (reviewSchema) {
            const result = validateAndCoerce<Record<string, unknown>>(raw, reviewSchema);
            if ("data" in result && result.data) {
              if (result.data.decision === "APPROVED") return "approved";
              if (result.data.decision === "REJECTED") return "rejected";
            }
          } else {
            // No schema — trust the raw value
            if (raw.decision === "APPROVED") return "approved";
            if (raw.decision === "REJECTED") return "rejected";
          }
        }
      }

      // Fallback: marker-based status from SimpleStepStatus
      return base.status();
    },
  };
}
