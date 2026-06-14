import * as fs from "node:fs";
import * as path from "node:path";
import { stepFolderName } from "../fs-utils";
import { CapState } from "../capability-state";
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
  /**
   * Step metadata from PLAN.md frontmatter `steps` array (or null).
   * Provided at construction time — not read from disk.
   */
  metadata: Record<string, unknown> | null;
  /** Returns true when TASK.md exists in the step folder. */
  hasTask(): boolean;
  /** Returns true when TEST.md exists in the step folder. */
  hasTest(): boolean;
  /** Returns true when SUMMARY.md exists in the step folder. */
  hasSummary(): boolean;
  /** Returns true when REVISE_PLAN_NEEDED marker exists in the step folder. */
  revisionNeeded(): boolean;
  /**
   * Returns step metadata from PLAN.md frontmatter `steps` array.
   * Provided at construction time — not read from disk.
   */
  getMetadata(): Record<string, unknown> | null;
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
 * @param metadata - Step metadata from PLAN.md frontmatter (or null)
 */
export function createSimpleStepStatus(
  stepDir: string,
  stepNumber: number,
  folderName: string,
  metadata: Record<string, unknown> | null,
): SimpleStepStatus {
  return {
    stepNumber,
    folderName,
    metadata,
    hasTask: () => fs.existsSync(path.join(stepDir, "TASK.md")),
    hasTest: () => fs.existsSync(path.join(stepDir, "TEST.md")),
    hasSummary: () => fs.existsSync(path.join(stepDir, "SUMMARY.md")),
    revisionNeeded: () => fs.existsSync(path.join(stepDir, "REVISE_PLAN_NEEDED")),
    getMetadata: () => metadata,
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
// Contract cache — populated at startup from auto-discovered capabilities
// ---------------------------------------------------------------------------

let _discoveredContracts: Record<string, CapabilityContract> | null = null;

/**
 * Populate the contract cache from auto-discovered capabilities.
 * Called once from index.ts after discoverCapabilities() returns.
 */
export function setDiscoveredContracts(
  contracts: Record<string, CapabilityContract>,
): void {
  _discoveredContracts = contracts;
}

/**
 * Build a CapState for the given capability name.
 * Looks up the cached contract and returns a CapState instance.
 * Throws if the capability is not found in the cache.
 */
export function getCapState(
  capability: string,
  baseDir: string,
  params?: Record<string, unknown>,
): CapState {
  const contract = _discoveredContracts?.[capability];
  if (!contract) throw new Error(`No contract found for "${capability}"`);
  return new CapState(contract, baseDir, params);
}
