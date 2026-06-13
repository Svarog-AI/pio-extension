import * as fs from "node:fs";
import * as path from "node:path";

import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { createGoalState } from "../../goal-state";
import { validateInputs } from "../../guards/validation";
import type { PlanFrontmatter } from "./schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_FILE = "PLAN.md";
const TASK_FILE = "TASK.md";
const DECISIONS_FILE = "DECISIONS.md";
export const REVISE_PLAN_MARKER = "REVISE_PLAN_NEEDED";

// ---------------------------------------------------------------------------
// Validation callbacks (used by config.ts and resolveCapabilityConfig)
// ---------------------------------------------------------------------------

/**
 * Callback used by the `validation` field in config.
 * Returns `{ files: string[] }` based on step number.
 * Step 1: TASK.md only. Step 2+: TASK.md + DECISIONS.md.
 */
export function resolveEvolveValidation(_workingDir: string, params?: Record<string, unknown>): { files: string[] } {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for evolve-plan. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  const files: string[] = [`${folder}/${TASK_FILE}`];
  if (stepNumber > 1) {
    files.push(`${folder}/${DECISIONS_FILE}`);
  }
  return { files };
}

/**
 * Callback used by the `writeAllowlist` field in config.
 * Returns array of allowed write paths for the given step number.
 */
export function resolveEvolveWriteAllowlist(_workingDir: string, params?: Record<string, unknown>): string[] {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for evolve-plan. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  const allowlist: string[] = ["COMPLETED", `${folder}/${TASK_FILE}`, `${folder}/${REVISE_PLAN_MARKER}`];
  if (stepNumber > 1) {
    allowlist.push(`${folder}/${DECISIONS_FILE}`);
  }
  return allowlist;
}

// ---------------------------------------------------------------------------
// Pre-launch validation
// ---------------------------------------------------------------------------

/**
 * Validate that the goal workspace exists and has a PLAN.md.
 * Then find the next step to evolve by scanning for existing S{NN}/ folders:
 *   - Scan S01, S02, ... in order — track the highest step number where
 *     TASK.md exists.
 *   - Stop when a folder doesn't exist (no more steps defined).
 *   - Return highestDefined + 1 (or 1 if no defined steps found).
 *
 * Returns { goalDir, ready, stepNumber } on success, or { goalDir, error } when not ready.
 * Does NOT use ctx so it can be called safely before newSession().
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

  const fileCheck = validateInputs(goalDir, { inputs: [{ file: PLAN_FILE }], outputs: [] });
  if (!fileCheck.success) {
    return {
      goalDir,
      ready: false,
      error: fileCheck.message!,
    };
  }

  const state = createGoalState(goalDir);

  // Pre-launch guard: if COMPLETED marker already exists, all steps are specified — do not relaunch.
  if (state.goalCompleted()) {
    return {
      goalDir,
      ready: false,
      error: `All plan steps for "${name}" have already been specified. COMPLETED marker exists at the goal workspace root.`,
    };
  }

  // Frontmatter-based completion detection: if currentStepNumber() exceeds totalSteps,
  // all plan steps are already specified — write COMPLETED marker and return not-ready.
  // This is the single place where frontmatter is consumed to decide whether to write the marker.
  // Frontmatter is mandatory (enforced by create-plan postValidate). Null means invalid state.
  const metadata = state.planMetadata() as PlanFrontmatter | null;
  if (metadata === null) {
    throw new Error(
      `PLAN.md for "${name}" has invalid or missing frontmatter. ` +
      `Expected YAML frontmatter with "totalSteps" field. This should have been caught by create-plan validation. ` +
      `To fix it manually, add "---\ntotalSteps: N\n---" at the top of PLAN.md, where N is the number of steps.`,
    );
  }

  const currentStep = state.currentStepNumber();
  if (currentStep > metadata.totalSteps) {
    const completedPath = path.join(goalDir, "COMPLETED");
    fs.writeFileSync(completedPath, "", "utf-8");
    return {
      goalDir,
      ready: false,
      error: `All ${metadata.totalSteps} plan steps for "${name}" have been specified. No further specification work required.`,
    };
  }

  // Find next step via GoalState.
  const nextStep = state.currentStepNumber();

  return { goalDir, ready: true, stepNumber: nextStep };
}
