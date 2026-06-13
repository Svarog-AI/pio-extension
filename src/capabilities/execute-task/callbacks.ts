import * as fs from "node:fs";
import * as path from "node:path";

import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { createGoalState } from "../../goal-state";
import { validateInputs } from "../../guards/validation";
import { CONTRACT } from "./config";

// ---------------------------------------------------------------------------
// Config callbacks (used by config.ts and resolveCapabilityConfig)
// ---------------------------------------------------------------------------

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
  return [`${folder}/TASK.md`];
}

// ---------------------------------------------------------------------------
// Pre-launch validation
// ---------------------------------------------------------------------------

/**
 * Validate that the goal workspace exists with both GOAL.md and PLAN.md.
 * Then find the next step ready for execution using GoalState.
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

  const state = createGoalState(goalDir);

  // Check PLAN.md exists — required for currentStepNumber() and CONTRACT validation.
  if (!state.hasPlan()) {
    return {
      goalDir,
      ready: false,
      error: `Required file missing: PLAN.md. Run /pio-create-plan ${name} to generate a plan first.`,
    };
  }

  // Find the next step via GoalState.
  const stepNumber = state.currentStepNumber();
  const step = state.steps().find(s => s.stepNumber === stepNumber);

  // Step is "pending" (no TASK.md yet) — user needs to run evolve-plan first.
  // CONTRACT validation would fail with a generic "TASK.md missing" error,
  // so provide a specific message instead.
  if (step?.status() === "pending") {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} is not yet specified. Run /pio-evolve-plan ${name} to generate TASK.md.`,
    };
  }

  // All paths resolved — validate full CONTRACT with the discovered stepNumber.
  const fileCheck = validateInputs(goalDir, CONTRACT, { stepNumber });
  if (!fileCheck.success) {
    return { goalDir, ready: false, error: fileCheck.message! };
  }

  return { goalDir, ready: true, stepNumber };
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

  // Validate inputs via contract with placeholder resolution
  const fileCheck = validateInputs(goalDir, CONTRACT, { stepNumber });
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
