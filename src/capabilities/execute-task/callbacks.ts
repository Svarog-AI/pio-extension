import { resolveGoalDir, stepFolderName } from "../../fs-utils";
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
 * Validate inputs via CONTRACT.
 * Step number must be provided — no step discovery in pre-launch.
 */
export async function validateExecuteStep(
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
