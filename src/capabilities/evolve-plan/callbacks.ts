import { stepFolderName } from "../../fs-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASK_FILE = "TASK.md";
const DECISIONS_FILE = "DECISIONS.md";
export const REVISE_PLAN_REQUEST_FILE = "REVISE_PLAN_NEEDED.md";

// ---------------------------------------------------------------------------
// Write allowlist callback (used by config.ts)
// ---------------------------------------------------------------------------

/**
 * Callback used by the `writeAllowlist` field in config.
 * Returns array of allowed write paths for the given step number.
 */
export function resolveEvolveWriteAllowlist(
  _workspaceDir: string,
  params?: Record<string, unknown>,
): string[] {
  const stepNumber =
    typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error(
      "stepNumber is required for evolve-plan. Ensure the task was enqueued with a valid step number.",
    );
  }
  const folder = stepFolderName(stepNumber);
  const allowlist: string[] = [
    "COMPLETION_SUMMARY.md",
    `${folder}/${TASK_FILE}`,
    REVISE_PLAN_REQUEST_FILE, // workspace root, not step folder
  ];
  if (stepNumber > 1) {
    allowlist.push(`${folder}/${DECISIONS_FILE}`);
  }
  return allowlist;
}
