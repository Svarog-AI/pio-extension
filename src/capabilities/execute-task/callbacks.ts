import * as fs from "node:fs";
import * as path from "node:path";

import { CapState } from "../../capability-state";
import { CONTRACT } from "./config";
import { type ExecutionSummaryOutputs } from "./schemas";


// ---------------------------------------------------------------------------
// Config callbacks (used by config.ts and resolveCapabilityConfig)
// ---------------------------------------------------------------------------

/**
 * Callback used by the `readOnlyFiles` field in config.
 * Returns array of read-only files for the given step.
 * workspacePrefix already includes the step folder — plain name resolves correctly.
 */
export function resolveExecuteReadOnlyFiles(_workspaceDir: string, _params?: Record<string, unknown>): string[] {
  return ["TASK.md"];
}

// ---------------------------------------------------------------------------
// Post-execute hook
// ---------------------------------------------------------------------------

/**
 * Post-execute hook: reads SUMMARY.md frontmatter and auto-creates
 * COMPLETED or BLOCKED marker files based on the `status` field.
 * Runs after transition routing + task enqueuing (step 4 in mark-complete.ts).
 * Mirrors postExecuteReview() in review-task/callbacks.ts.
 */
export function postExecuteExecute(workspaceDir: string, params?: Record<string, unknown>): void {
  // Read SUMMARY.md via CapState (reads fresh from disk on every call)
  const capState = new CapState(CONTRACT, workspaceDir, params);
  const summaryFile = capState.output<ExecutionSummaryOutputs>("summary");

  if (!summaryFile.exists()) {
    console.warn("pio: postExecuteExecute — SUMMARY.md not found");
    return;
  }
  const data = summaryFile.read();
  if (data === null) {
    console.warn("pio: postExecuteExecute could not parse SUMMARY.md: frontmatter validation failed");
    return;
  }

  // Create markers (COMPLETED/BLOCKED) — irreversible side-effect
  applyExecutionStatus(workspaceDir, data.status);
}

// ---------------------------------------------------------------------------
// Helper functions (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Create marker files based on the execution status.
 * "completed": creates empty COMPLETED, removes BLOCKED.
 * "blocked": creates empty BLOCKED, removes COMPLETED.
 *
 * Idempotent — safe to call multiple times with different statuses.
 *
 * @param workspaceDir - Absolute path to the workspace directory (already the step directory)
 * @param status - Execution status from SUMMARY.md frontmatter
 */
export function applyExecutionStatus(
  workspaceDir: string,
  status: "completed" | "blocked",
): void {
  // workspaceDir is already the resolved step directory — no stepFolderName needed
  fs.mkdirSync(workspaceDir, { recursive: true });

  // Remove stale markers from previous attempts; force:true skips missing files.
  // This makes the function idempotent — safe to call multiple times with different statuses.
  fs.rmSync(path.join(workspaceDir, "COMPLETED"), { force: true });
  fs.rmSync(path.join(workspaceDir, "BLOCKED"), { force: true });

  if (status === "completed") {
    fs.writeFileSync(path.join(workspaceDir, "COMPLETED"), "", "utf-8");
  } else {
    // blocked
    fs.writeFileSync(path.join(workspaceDir, "BLOCKED"), "", "utf-8");
  }
}
