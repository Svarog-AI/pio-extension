import * as fs from "node:fs";
import * as path from "node:path";

import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { createGoalState } from "../../goal-state";
import { validateInputs } from "../../guards/validation";
import type { PlanFrontmatter } from "../create-plan/schemas";
import { CONTRACT } from "./config";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASK_FILE = "TASK.md";
const DECISIONS_FILE = "DECISIONS.md";
export const REVISE_PLAN_MARKER = "REVISE_PLAN_NEEDED";

// ---------------------------------------------------------------------------
// Write allowlist callback (used by config.ts)
// ---------------------------------------------------------------------------

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
 * Validate inputs via CONTRACT.
 * Step number must be provided — no step discovery in pre-launch.
 */
export async function validateEvolveStep(
  name: string,
  cwd: string,
  stepNumber: number,
): Promise<
  | { goalDir: string; ready: true; stepNumber: number }
  | { goalDir: string; ready: false; error: string }
> {
  const goalDir = resolveGoalDir(cwd, name);

  // Validate inputs via CONTRACT — the single source of truth.
  const fileCheck = validateInputs(goalDir, CONTRACT, { stepNumber });
  if (!fileCheck.success) {
    return { goalDir, ready: false, error: fileCheck.message! };
  }

  return { goalDir, ready: true, stepNumber };
}
