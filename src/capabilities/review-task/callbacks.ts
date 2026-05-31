import * as fs from "node:fs";
import * as path from "node:path";

import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { createGoalState, type StepStatus } from "../../goal-state";
import { REVIEW_OUTPUT_SCHEMA, type ReviewOutputs } from "./schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_FILE = "PLAN.md";
const GOAL_FILE = "GOAL.md";
const TASK_FILE = "TASK.md";
const TEST_FILE = "TEST.md";
const SUMMARY_FILE = "SUMMARY.md";
const REVIEW_FILE = "REVIEW.md";
const DECISIONS_FILE = "DECISIONS.md";

// ---------------------------------------------------------------------------
// Validation callbacks (used by config.ts and resolveCapabilityConfig)
// ---------------------------------------------------------------------------

/**
 * Callback used by the `validation` field in config.
 * Returns `{ files: string[] }` with REVIEW.md for the given step.
 */
export function resolveReviewValidation(_dir: string, params?: Record<string, unknown>): { files: string[] } {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for review-task. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  return { files: [`${folder}/${REVIEW_FILE}`] };
}

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
    GOAL_FILE,
    PLAN_FILE,
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
 * Post-validate hook: reads REVIEW.md frontmatter, validates against schema,
 * and creates APPROVED/REJECTED markers via applyReviewDecision().
 */
export function postValidateReview(goalDir: string, params?: Record<string, unknown>): { success: boolean; message?: string } {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for review-task. Ensure the task was enqueued with a valid step number.");
  }

  // Single parsing path through GoalState — uses shared frontmatter module + schema internally
  const state = createGoalState(goalDir);
  const result = state.getReviewOutputs(stepNumber, { errors: true }) as { data?: ReviewOutputs; error?: string };

  // On failure: propagate the detailed error from GoalState
  if (result.error) {
    return { success: false, message: result.error };
  }

  // On success: create markers (APPROVED/REJECTED) and return success
  applyReviewDecision(goalDir, stepNumber, result.data!);
  return { success: true };
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
    // Delete COMPLETED so isStepReady in execute-task.ts permits re-execution
    fs.rmSync(path.join(stepDir, "COMPLETED"), { force: true });
  }
}

/**
 * Shared check: is a step reviewable (COMPLETED + SUMMARY.md, not BLOCKED)?
 * Used by both `isStepReviewable` and `findMostRecentCompletedStep` to avoid duplication.
 *
 * @param step - A StepStatus from GoalState
 */
function isReviewable(step: StepStatus): boolean {
  // status() === "implemented" means COMPLETED exists and BLOCKED doesn't (BLOCKED has higher priority).
  // We also need SUMMARY.md — check that explicitly since it's not part of the status computation.
  return step.status() === "implemented" && step.hasSummary();
}

/**
 * Check whether a step has been completed and is ready for review:
 * COMPLETED marker exists, SUMMARY.md exists, and no BLOCKED marker.
 */
export function isStepReviewable(goalDir: string, stepNumber: number): boolean {
  const state = createGoalState(goalDir);
  const step = state.steps().find(s => s.stepNumber === stepNumber);
  if (!step) return false;

  return isReviewable(step);
}

/**
 * Find the most recently completed step by scanning S01/, S02/, ... in descending order.
 * Returns the step number or undefined if no completed step found.
 */
export function findMostRecentCompletedStep(goalDir: string): number | undefined {
  const state = createGoalState(goalDir);
  const allSteps = state.steps(); // sorted ascending by stepNumber

  // Scan from highest to lowest for a reviewable step
  for (let i = allSteps.length - 1; i >= 0; i--) {
    if (isReviewable(allSteps[i])) {
      return allSteps[i].stepNumber;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Pre-launch validation
// ---------------------------------------------------------------------------

/**
 * Validate that the goal workspace exists and the specified step is ready for review.
 * The step must have COMPLETED marker and SUMMARY.md (was executed successfully).
 */
export async function validateStepForReview(
  name: string,
  cwd: string,
  stepNumber: number,
): Promise<
  | { goalDir: string; ready: true; stepNumber: number }
  | { goalDir: string; ready: false; error: string }
> {
  const goalDir = resolveGoalDir(cwd, name);

  if (!fs.existsSync(goalDir)) {
    return {
      goalDir,
      ready: false,
      error: `Goal workspace "${name}" does not exist. Create it first with /pio-create-goal ${name}.`,
    };
  }

  const state = createGoalState(goalDir);

  if (!state.hasGoal()) {
    return {
      goalDir,
      ready: false,
      error: `GOAL.md not found at "${path.join(goalDir, GOAL_FILE)}". Create a goal first with /pio-create-goal ${name}.`,
    };
  }

  if (!state.hasPlan()) {
    return {
      goalDir,
      ready: false,
      error: `PLAN.md not found at "${path.join(goalDir, PLAN_FILE)}". Create a plan first with /pio-create-plan ${name}.`,
    };
  }

  const folder = stepFolderName(stepNumber);
  const step = state.steps().find(s => s.stepNumber === stepNumber);

  if (!step) {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} folder "${folder}/" does not exist. Run /pio-evolve-plan ${name} to generate specs first.`,
    };
  }

  const status = step.status();

  if (status === "blocked") {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} is marked as BLOCKED. Resolve the blocking issue first.`,
    };
  }

  // Not implemented yet (pending or defined, or never had COMPLETED)
  if (status !== "implemented") {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} is not yet completed. Run /pio-execute-task ${name} ${stepNumber} first.`,
    };
  }

  // Has COMPLETED, no BLOCKED — check for SUMMARY.md
  if (!step.hasSummary()) {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} is missing SUMMARY.md. Re-run /pio-execute-task ${name} ${stepNumber}.`,
    };
  }

  return { goalDir, ready: true, stepNumber };
}

/**
 * Validate that the goal workspace exists and find the most recently completed step for review.
 */
export async function validateAndFindReviewStep(
  name: string,
  cwd: string,
): Promise<
  | { goalDir: string; ready: true; stepNumber: number }
  | { goalDir: string; ready: false; error: string }
> {
  const goalDir = resolveGoalDir(cwd, name);

  if (!fs.existsSync(goalDir)) {
    return {
      goalDir,
      ready: false,
      error: `Goal workspace "${name}" does not exist. Create it first with /pio-create-goal ${name}.`,
    };
  }

  const state = createGoalState(goalDir);

  if (!state.hasGoal()) {
    return {
      goalDir,
      ready: false,
      error: `GOAL.md not found at "${path.join(goalDir, GOAL_FILE)}". Create a goal first with /pio-create-goal ${name}.`,
    };
  }

  if (!state.hasPlan()) {
    return {
      goalDir,
      ready: false,
      error: `PLAN.md not found at "${path.join(goalDir, PLAN_FILE)}". Create a plan first with /pio-create-plan ${name}.`,
    };
  }

  // Use the public function — it creates its own state.
  // The state above was already used for hasGoal/hasPlan checks.
  const stepNumber = findMostRecentCompletedStep(goalDir);
  if (stepNumber === undefined) {
    return {
      goalDir,
      ready: false,
      error: `No completed steps found for goal "${name}". Run /pio-execute-task ${name} to complete a step first.`,
    };
  }

  return { goalDir, ready: true, stepNumber };
}
