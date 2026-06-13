import * as fs from "node:fs";
import * as path from "node:path";

import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { createGoalState } from "../../goal-state";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_ARCHIVE_DIR = "PLAN_ARCHIVE";
export const REVISE_PLAN_MARKER = "REVISE_PLAN_NEEDED";
const STEP_FOLDER_RE = /^S(\d+)$/;

// ---------------------------------------------------------------------------
// Pre-launch validation
// ---------------------------------------------------------------------------

/**
 * Resolve the goal directory for revise-plan.
 * Input validation is handled automatically by launchCapability().
 */
export async function validateRevisePlan(
  name: string,
  cwd: string,
): Promise<{ goalDir: string; ready: boolean; error?: string }> {
  const goalDir = resolveGoalDir(cwd, name);

  return { goalDir, ready: true };
}

// ---------------------------------------------------------------------------
// prepareSession — archive PLAN.md before the agent starts
// ---------------------------------------------------------------------------

/**
 * Archives current PLAN.md to PLAN_ARCHIVE/ with a timestamped filename.
 * Step folder deletion is deferred to cleanupIncompleteSteps (postExecute)
 * so the Plan Revision Agent can inspect trigger step content.
 */
export async function prepareSession(
  workingDir: string,
  _params?: Record<string, unknown>,
): Promise<void> {
  // Archive current PLAN.md
  const planPath = path.join(workingDir, "PLAN.md");
  if (fs.existsSync(planPath)) {
    const archiveDir = path.join(workingDir, PLAN_ARCHIVE_DIR);
    fs.mkdirSync(archiveDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "");
    const archiveFilename = `PLAN-${timestamp}.md`;
    const archivePath = path.join(archiveDir, archiveFilename);

    // Copy-then-delete is safe: if delete fails, we still have both files
    fs.copyFileSync(planPath, archivePath);
    fs.unlinkSync(planPath);
  }
}

// ---------------------------------------------------------------------------
// cleanupIncompleteSteps — postExecute cleanup after the agent completes
// ---------------------------------------------------------------------------

/**
 * Deletes non-APPROVED S{NN}/ step folders and cleans up the REVISE_PLAN_NEEDED marker.
 * Runs as postExecute after pio_mark_complete — the agent has already finished reading.
 *
 * Scans disk for S{NN}/ folders rather than relying on PLAN.md frontmatter,
 * since the revision agent may have written a new PLAN.md with a different step list.
 */
export async function cleanupIncompleteSteps(
  goalDir: string,
  params?: Record<string, unknown>,
): Promise<void> {
  // Scan disk for S{NN}/ folders
  const entries = fs.readdirSync(goalDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!STEP_FOLDER_RE.test(entry.name)) continue;

    const stepDir = path.join(goalDir, entry.name);
    const approvedPath = path.join(stepDir, "APPROVED");

    if (!fs.existsSync(approvedPath)) {
      // Non-APPROVED folder — delete entirely
      fs.rmSync(stepDir, { recursive: true, force: true });
    }
  }

  // Clean up REVISE_PLAN_NEEDED marker from trigger step folder if it still exists
  const revisionTriggerStep = typeof params?.revisionTriggerStep === "number"
    ? params.revisionTriggerStep
    : undefined;

  if (revisionTriggerStep != null) {
    const folderName = stepFolderName(revisionTriggerStep);
    const markerPath = path.join(goalDir, folderName, REVISE_PLAN_MARKER);
    // Use force: true to handle case where folder was already deleted
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Config callbacks (used by config.ts and resolveCapabilityConfig)
// ---------------------------------------------------------------------------

export function resolveReviseReadOnlyFiles(workingDir: string, _params?: Record<string, unknown>): string[] {
  const state = createGoalState(workingDir);
  const readOnly: string[] = [];

  // All remaining S{NN}/ folders (those with APPROVED markers) are read-only
  for (const step of state.steps()) {
    if (step.status() === "approved") {
      readOnly.push(`${step.folderName}/*`);
    }
  }

  return readOnly;
}

export function resolveReviseWriteAllowlist(_workingDir: string, _params?: Record<string, unknown>): string[] {
  return ["PLAN.md"];
}
