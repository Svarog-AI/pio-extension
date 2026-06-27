import * as fs from "node:fs";
import * as path from "node:path";

import { CapState } from "../../capability-state";
import { extractFrontmatter, validateAndCoerce } from "../../frontmatter";
import { CONTRACT } from "./config";
import { REVIEW_OUTPUT_SCHEMA, type ReviewOutputs } from "./schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASK_FILE = "TASK.md";
const TEST_FILE = "TEST.md";
const SUMMARY_FILE = "SUMMARY.md";
const REVIEW_FILE = "REVIEW.md";
const DECISIONS_FILE = "DECISIONS.md";

// ---------------------------------------------------------------------------
// Config callbacks (used by config.ts and resolveCapabilityConfig)
// ---------------------------------------------------------------------------

/**
 * Callback used by the `readOnlyFiles` field in config.
 * Returns array of read-only files for the given step.
 * workspacePrefix already includes the step folder — plain names resolve correctly.
 */
export function resolveReviewReadOnlyFiles(
  _dir: string,
  _params?: Record<string, unknown>,
): string[] {
  return [TASK_FILE, TEST_FILE, SUMMARY_FILE, DECISIONS_FILE];
}

/**
 * Callback used by the `writeAllowlist` field in config.
 * Returns array of writable files for the given step.
 * workspacePrefix already includes the step folder — plain name resolves correctly.
 */
export function resolveReviewWriteAllowlist(
  _dir: string,
  _params?: Record<string, unknown>,
): string[] {
  return [REVIEW_FILE];
}

// ---------------------------------------------------------------------------
// Post-validate hook
// ---------------------------------------------------------------------------

/**
 * Post-validate hook: reads REVIEW.md frontmatter and validates against schema.
 * Does NOT create markers — that is the job of postExecuteReview().
 */
export function postValidateReview(
  workspaceDir: string,
  params?: Record<string, unknown>,
): { success: boolean; message?: string } {
  // Read REVIEW.md via CapState — uses CONTRACT.outputs schema for validation
  const capState = new CapState(CONTRACT, workspaceDir, params);
  const reviewFile = capState.output<ReviewOutputs>("review");

  if (!reviewFile.exists()) {
    return { success: false, message: "REVIEW.md not found" };
  }
  const data = reviewFile.read();
  if (data === null) {
    // Get detailed error message via direct validation
    const reviewPath = path.join(workspaceDir, REVIEW_FILE);
    const raw = extractFrontmatter(reviewPath);
    if (raw === null) {
      return {
        success: false,
        message: "REVIEW.md does not contain valid YAML frontmatter",
      };
    }
    const result = validateAndCoerce<ReviewOutputs>(raw, REVIEW_OUTPUT_SCHEMA);
    if ("error" in result) {
      return { success: false, message: result.error };
    }
    return {
      success: false,
      message: "REVIEW.md frontmatter validation failed",
    };
  }

  // Schema validation passed — do NOT create markers here (that's postExecute's job)
  return { success: true };
}

/**
 * Post-execute hook: creates APPROVED/REJECTED markers via applyReviewDecision().
 * Runs after transition routing + task enqueuing (step 4 in mark-complete.ts).
 * Re-reads REVIEW.md from disk — both hooks read independently.
 */
export function postExecuteReview(
  workspaceDir: string,
  params?: Record<string, unknown>,
): void {
  // Re-read REVIEW.md via CapState (reads fresh from disk on every call)
  const capState = new CapState(CONTRACT, workspaceDir, params);
  const reviewFile = capState.output<ReviewOutputs>("review");

  if (!reviewFile.exists()) {
    console.warn("pio: postExecuteReview — REVIEW.md not found");
    return;
  }
  const data = reviewFile.read();
  if (data === null) {
    console.warn(
      "pio: postExecuteReview could not parse REVIEW.md: frontmatter validation failed",
    );
    return;
  }

  // Create markers (APPROVED/REJECTED) — irreversible side-effect
  applyReviewDecision(workspaceDir, data);
}

// ---------------------------------------------------------------------------
// Helper functions (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Create marker files based on the review decision.
 * APPROVED: creates empty APPROVED, leaves COMPLETED intact.
 * REJECTED: creates empty REJECTED, deletes COMPLETED.
 *
 * @param workspaceDir - Absolute path to the workspace directory (already the step directory)
 * @param outputs - Validated review outputs (TypeScript guarantees correct types)
 */
export function applyReviewDecision(
  workspaceDir: string,
  outputs: ReviewOutputs,
): void {
  // workspaceDir is already the resolved step directory — no stepFolderName needed
  fs.mkdirSync(workspaceDir, { recursive: true });

  // Remove stale markers from previous review attempts; force:true skips missing files.
  // This makes the function idempotent — safe to call multiple times with different decisions.
  fs.rmSync(path.join(workspaceDir, "APPROVED"), { force: true });
  fs.rmSync(path.join(workspaceDir, "REJECTED"), { force: true });

  if (outputs.decision === "APPROVED") {
    fs.writeFileSync(path.join(workspaceDir, "APPROVED"), "", "utf-8");
  } else {
    // REJECTED
    fs.writeFileSync(path.join(workspaceDir, "REJECTED"), "", "utf-8");
    // Delete COMPLETED so execute-task permits re-execution
    fs.rmSync(path.join(workspaceDir, "COMPLETED"), { force: true });
  }
}
