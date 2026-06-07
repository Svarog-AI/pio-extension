import * as fs from "node:fs";
import * as path from "node:path";

import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { createGoalState } from "../../goal-state";
import { resolvePaths } from "../../capability-config";
import { validateInputs } from "../../guards/validation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_FILE = "PLAN.md";
const GOAL_FILE = "GOAL.md";
const TASK_FILE = "TASK.md";
const TEST_FILE = "TEST.md";
const SUMMARY_FILE = "SUMMARY.md";

// ---------------------------------------------------------------------------
// Validation callbacks (used by config.ts and resolveCapabilityConfig)
// ---------------------------------------------------------------------------

/**
 * Callback used by the `validation` field in config.
 * Returns `{ files: string[] }` with TEST.md and SUMMARY.md for the given step.
 */
export function resolveExecuteValidation(_workingDir: string, params?: Record<string, unknown>): { files: string[] } {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for execute-task. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  return { files: [`${folder}/${TEST_FILE}`, `${folder}/${SUMMARY_FILE}`] };
}

/**
 * Callback used by the `readOnlyFiles` field in config.
 * Returns array of read-only files for the given step.
 */
export function resolveExecuteReadOnlyFiles(_workingDir: string, params?: Record<string, unknown>): string[] {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for execute-task. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  return [`${folder}/${TASK_FILE}`];
}

// ---------------------------------------------------------------------------
// Helper functions (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Check whether a step is ready for execution: TASK.md exists,
 * but neither COMPLETED nor BLOCKED marker has been written yet.
 */
export function isStepReady(goalDir: string, stepNumber: number): boolean {
  const state = createGoalState(goalDir);
  const step = state.steps().find(s => s.stepNumber === stepNumber);
  if (!step) return false;

  // "defined" status means TASK.md exists with no COMPLETED/BLOCKED/APPROVED/REJECTED markers.
  return step.status() === "defined";
}

// ---------------------------------------------------------------------------
// Pre-launch validation
// ---------------------------------------------------------------------------

/**
 * Validate that the goal workspace exists with both GOAL.md and PLAN.md.
 * Then scan S01/, S02/, … for the first step where TASK.md exists
 * but no COMPLETED/BLOCKED marker is present yet.
 *
 * Returns { goalDir, ready: true, stepNumber } on success,
 * or { goalDir, ready: false, error } when not ready.
 */
export async function validateAndFindNextStep(
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

  // Validate required base files first (GOAL.md, PLAN.md) — needed before step scanning.
  const baseCheck = validateInputs(goalDir, [GOAL_FILE, PLAN_FILE]);
  if (!baseCheck.success) {
    return { goalDir, ready: false, error: baseCheck.message! };
  }

  // Find the first step number (starting at 1) that is ready for execution.
  const state = createGoalState(goalDir);
  const allSteps = state.steps();
  let foundStep: number | undefined;
  for (let i = 1; ; i++) {
    const step = state.steps().find(s => s.stepNumber === i);
    if (step && step.status() === "defined") {
      foundStep = i;
      break;
    }

    // If we reach a step where the folder doesn't exist at all in state.steps(),
    // there's no ready step beyond this point.
    if (!allSteps.some(s => s.stepNumber === i)) break;
  }

  if (foundStep == null) {
    return {
      goalDir,
      ready: false,
      error: `No ready steps found for goal "${name}". All steps are either completed or missing specs (TASK.md). Run /pio-evolve-plan ${name} to generate specs.`,
    };
  }

  // Resolve full file list from inputValidation contract and validate
  const requiredFiles = resolvePaths([GOAL_FILE, PLAN_FILE, `S{stepNumber:02d}/${TASK_FILE}`], { stepNumber: foundStep });
  const excludedFiles = resolvePaths([`S{stepNumber:02d}/REVISE_PLAN_NEEDED`], { stepNumber: foundStep });
  const fileCheck = validateInputs(goalDir, requiredFiles, excludedFiles);
  if (!fileCheck.success) {
    return { goalDir, ready: false, error: fileCheck.message! };
  }

  return { goalDir, ready: true, stepNumber: foundStep };
}

/**
 * Validate that an explicitly requested step has TASK.md.
 */
export async function validateExplicitStep(
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

  // Resolve full file list from inputValidation contract and validate
  const requiredFiles = resolvePaths([GOAL_FILE, PLAN_FILE, `S{stepNumber:02d}/${TASK_FILE}`], { stepNumber });
  const excludedFiles = resolvePaths([`S{stepNumber:02d}/REVISE_PLAN_NEEDED`], { stepNumber });
  const fileCheck = validateInputs(goalDir, requiredFiles, excludedFiles);
  if (!fileCheck.success) {
    return { goalDir, ready: false, error: fileCheck.message! };
  }

  // Check step status (implemented/approved/rejected/blocked)
  const state = createGoalState(goalDir);
  const folder = stepFolderName(stepNumber);
  const step = state.steps().find(s => s.stepNumber === stepNumber);

  if (!step) {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} folder "${folder}/" does not exist in goal "${name}". Run /pio-evolve-plan ${name} to generate specs.`,
    };
  }

  const currentStatus = step.status();

  if (currentStatus === "implemented" || currentStatus === "approved" || currentStatus === "rejected") {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} is already marked as COMPLETED.`,
    };
  }

  if (currentStatus === "blocked") {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} is marked as BLOCKED. Resolve the blocking issue or re-run /pio-evolve-plan ${name} to regenerate specs.`,
    };
  }

  return { goalDir, ready: true, stepNumber };
}
