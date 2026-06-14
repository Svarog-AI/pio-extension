import * as fs from "node:fs";
import * as path from "node:path";

import { extractFrontmatter, validateAndCoerce } from "../../frontmatter";
import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { PLAN_FRONTMATTER_SCHEMA, type PlanFrontmatter } from "../create-plan/schemas";
import { REVIEW_OUTPUT_SCHEMA, type ReviewOutputs } from "../review-task/schemas";


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

    // Copy to archive — leave original PLAN.md in place for reference
    fs.copyFileSync(planPath, archivePath);
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
  const readOnly: string[] = [];

  // Read PLAN.md to get totalSteps
  const planRaw = extractFrontmatter(path.join(workingDir, "PLAN.md"));
  if (planRaw == null) return readOnly;

  const planResult = validateAndCoerce<PlanFrontmatter>(planRaw, PLAN_FRONTMATTER_SCHEMA);
  if ("error" in planResult) return readOnly;

  const totalSteps = planResult.data.totalSteps;
  for (let i = 1; i <= totalSteps; i++) {
    const reviewPath = path.join(workingDir, stepFolderName(i), "REVIEW.md");
    const reviewRaw = extractFrontmatter(reviewPath);
    if (reviewRaw == null) continue;
    const reviewResult = validateAndCoerce<ReviewOutputs>(reviewRaw, REVIEW_OUTPUT_SCHEMA);
    if ("data" in reviewResult && reviewResult.data?.decision === "APPROVED") {
      readOnly.push(`S${String(i).padStart(2, "0")}/*`);
    }
  }

  return readOnly;
}

export function resolveReviseWriteAllowlist(_workingDir: string, _params?: Record<string, unknown>): string[] {
  return ["PLAN.md"];
}
