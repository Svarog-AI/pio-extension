import * as fs from "node:fs";
import * as path from "node:path";

import { CapState } from "../../capability-state";
import { extractFrontmatter, validateAndCoerce } from "../../frontmatter";
import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { REVIEW_OUTPUT_SCHEMA, type ReviewOutputs } from "./schemas";
import { CONTRACT } from "./config";


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
 */
export function resolveReviewReadOnlyFiles(_dir: string, params?: Record<string, unknown>): string[] {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for review-task. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  return [
    "GOAL.md",
    "PLAN.md",
    `${folder}/${TASK_FILE}`,
    `${folder}/${TEST_FILE}`,
    `${folder}/${SUMMARY_FILE}`,
    `${folder}/${DECISIONS_FILE}`,
  ];
}

/**
 * Callback used by the `writeAllowlist` field in config.
 * Returns array of writable files for the given step.
 */
export function resolveReviewWriteAllowlist(_dir: string, params?: Record<string, unknown>): string[] {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for review-task. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  return [`${folder}/${REVIEW_FILE}`];
}

// ---------------------------------------------------------------------------
// Post-validate hook
// ---------------------------------------------------------------------------

/**
 * Post-validate hook: reads REVIEW.md frontmatter and validates against schema.
 * Does NOT create markers — that is the job of postExecuteReview().
 */
export function postValidateReview(goalDir: string, params?: Record<string, unknown>): { success: boolean; message?: string } {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for review-task. Ensure the task was enqueued with a valid step number.");
  }

  // Read REVIEW.md via CapState — uses CONTRACT.outputs schema for validation
  const capState = new CapState(CONTRACT, goalDir, { stepNumber });
  const reviewFile = capState.output<ReviewOutputs>("review");

  if (!reviewFile.exists()) {
    return { success: false, message: `REVIEW.md not found in S${String(stepNumber).padStart(2, "0")}/` };
  }
  const data = reviewFile.read();
  if (data === null) {
    // Get detailed error message via direct validation
    const reviewPath = path.join(goalDir, stepFolderName(stepNumber), "REVIEW.md");
    const raw = extractFrontmatter(reviewPath);
    if (raw === null) {
      return { success: false, message: `REVIEW.md does not contain valid YAML frontmatter for step ${stepNumber}` };
    }
    const result = validateAndCoerce<ReviewOutputs>(raw, REVIEW_OUTPUT_SCHEMA);
    if ("error" in result) {
      return { success: false, message: result.error };
    }
    return { success: false, message: `REVIEW.md frontmatter validation failed for step ${stepNumber}` };
  }

  // Schema validation passed — do NOT create markers here (that's postExecute's job)
  return { success: true };
}

/**
 * Post-execute hook: creates APPROVED/REJECTED markers via applyReviewDecision().
 * Runs after transition routing + task enqueuing (step 4 in mark-complete.ts).
 * Re-reads REVIEW.md from disk — both hooks read independently.
 */
export function postExecuteReview(goalDir: string, params?: Record<string, unknown>): void {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for review-task. Ensure the task was enqueued with a valid step number.");
  }

  // Re-read REVIEW.md via CapState (reads fresh from disk on every call)
  const capState = new CapState(CONTRACT, goalDir, { stepNumber });
  const reviewFile = capState.output<ReviewOutputs>("review");

  if (!reviewFile.exists()) {
    console.warn(`pio: postExecuteReview — REVIEW.md not found in S${String(stepNumber).padStart(2, "0")}/`);
    return;
  }
  const data = reviewFile.read();
  if (data === null) {
    console.warn(`pio: postExecuteReview could not parse REVIEW.md for step ${stepNumber}: frontmatter validation failed`);
    return;
  }

  // Create markers (APPROVED/REJECTED) — irreversible side-effect
  applyReviewDecision(goalDir, stepNumber, data);
}

// ---------------------------------------------------------------------------
// Helper functions (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Create marker files based on the review decision.
 * APPROVED: creates empty S{NN}/APPROVED, leaves COMPLETED intact.
 * REJECTED: creates empty S{NN}/REJECTED, deletes S{NN}/COMPLETED.
 *
 * @param goalDir - Absolute path to the goal workspace
 * @param stepNumber - Step number (zero-padded automatically)
 * @param outputs - Validated review outputs (TypeScript guarantees correct types)
 */
export function applyReviewDecision(
  goalDir: string,
  stepNumber: number,
  outputs: ReviewOutputs,
): void {
  const folder = stepFolderName(stepNumber);
  const stepDir = path.join(goalDir, folder);

  // Ensure the step directory exists (should already exist with REVIEW.md, but be safe)
  fs.mkdirSync(stepDir, { recursive: true });

  // Remove stale markers from previous review attempts; force:true skips missing files.
  // This makes the function idempotent — safe to call multiple times with different decisions.
  fs.rmSync(path.join(stepDir, "APPROVED"), { force: true });
  fs.rmSync(path.join(stepDir, "REJECTED"), { force: true });

  if (outputs.decision === "APPROVED") {
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
  } else {
    // REJECTED
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");
    // Delete COMPLETED so execute-task permits re-execution
    fs.rmSync(path.join(stepDir, "COMPLETED"), { force: true });
  }
}

// ---------------------------------------------------------------------------
// Pre-launch validation
// ---------------------------------------------------------------------------

/**
 * Resolve the goal directory for review-task.
 * Input validation is handled automatically by launchCapability().
 */
export async function validateReviewStep(
  name: string,
  cwd: string,
  stepNumber: number,
): Promise<
  | { goalDir: string; ready: true; stepNumber: number }
  | { goalDir: string; ready: false; error: string }
> {
  const goalDir = resolveGoalDir(cwd, name);

  return { goalDir, ready: true, stepNumber };
}
