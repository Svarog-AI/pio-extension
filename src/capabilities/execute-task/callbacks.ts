import { stepFolderName } from "../../fs-utils";
import { validateInputs } from "../../guards/validation";
import * as path from "node:path";
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
 * Resolve the goal directory for execute-task.
 * Input validation is handled automatically by launchCapability().
 */
export async function validateExecuteStep(
  name: string,
  cwd: string,
  stepNumber: number,
): Promise<
  | { ready: true; stepNumber: number }
  | { ready: false; error: string }
> {
  const result = validateInputs(path.join(cwd, ".pio"), CONTRACT, { workspacePrefix: `goals/${name}`, stepNumber });
  if (!result.success) {
    return { ready: false, error: result.message ?? `Step ${stepNumber} validation failed for goal "${name}".` };
  }

  return { ready: true, stepNumber };
}
