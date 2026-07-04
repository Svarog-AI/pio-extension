import * as fs from "node:fs";
import * as path from "node:path";

import type { CapState } from "../../capability-state";
import { extractFrontmatter, validateAndCoerce } from "../../frontmatter";
import { stepFolderName } from "../../fs-utils";
import {
  PLAN_FRONTMATTER_SCHEMA,
  type PlanFrontmatter,
} from "../create-plan/schemas";
import {
  REVIEW_OUTPUT_SCHEMA,
  type ReviewOutputs,
} from "../review-task/schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_ARCHIVE_DIR = "PLAN_ARCHIVE";
export const REVISE_PLAN_REQUEST_FILE = "REVISE_PLAN_NEEDED.md";

// ---------------------------------------------------------------------------
// prepareSession — archive PLAN.md before the agent starts
// ---------------------------------------------------------------------------

/**
 * Archives current PLAN.md to PLAN_ARCHIVE/ with a timestamped filename.
 * Document cleanup is deferred to cleanupRevisionRequest (postExecute)
 * so the Plan Revision Agent can inspect the revision request document.
 */
export async function prepareSession(
  workspaceDir: string,
  _params?: Record<string, unknown>,
): Promise<void> {
  // Archive current PLAN.md
  const planPath = path.join(workspaceDir, "PLAN.md");
  if (fs.existsSync(planPath)) {
    const archiveDir = path.join(workspaceDir, PLAN_ARCHIVE_DIR);
    fs.mkdirSync(archiveDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "");
    const archiveFilename = `PLAN-${timestamp}.md`;
    const archivePath = path.join(archiveDir, archiveFilename);

    // Copy to archive — leave original PLAN.md in place for reference
    fs.copyFileSync(planPath, archivePath);
  }
}

// ---------------------------------------------------------------------------
// cleanupRevisionRequest — postExecute cleanup after the agent completes
// ---------------------------------------------------------------------------

/**
 * Deletes the workspace-root REVISE_PLAN_NEEDED.md document.
 * Runs as postExecute after pio_mark_complete — the agent has already finished reading.
 *
 * Single-file deletion: no disk scanning, no folder deletion.
 * The `force: true` flag makes this idempotent — silently ignores missing files.
 */
export async function cleanupRevisionRequest(
  workspaceDir: string,
  _params?: Record<string, unknown>,
  _capState?: CapState,
): Promise<void> {
  // Clean up workspace-root REVISE_PLAN_NEEDED.md unconditionally
  const revisePlanPath = path.join(workspaceDir, REVISE_PLAN_REQUEST_FILE);
  if (fs.existsSync(revisePlanPath)) {
    fs.unlinkSync(revisePlanPath);
  }
}

// ---------------------------------------------------------------------------
// Config callbacks (used by config.ts and resolveCapabilityConfig)
// ---------------------------------------------------------------------------

export function resolveReviseReadOnlyFiles(
  workspaceDir: string,
  _params?: Record<string, unknown>,
): string[] {
  const readOnly: string[] = [];

  // Read PLAN.md to get totalSteps
  const planRaw = extractFrontmatter(path.join(workspaceDir, "PLAN.md"));
  if (planRaw == null) return readOnly;

  const planResult = validateAndCoerce<PlanFrontmatter>(
    planRaw,
    PLAN_FRONTMATTER_SCHEMA,
  );
  if ("error" in planResult) return readOnly;

  const totalSteps = planResult.data.totalSteps;
  for (let i = 1; i <= totalSteps; i++) {
    const reviewPath = path.join(workspaceDir, stepFolderName(i), "REVIEW.md");
    const reviewRaw = extractFrontmatter(reviewPath);
    if (reviewRaw == null) continue;
    const reviewResult = validateAndCoerce<ReviewOutputs>(
      reviewRaw,
      REVIEW_OUTPUT_SCHEMA,
    );
    if ("data" in reviewResult && reviewResult.data?.decision === "APPROVED") {
      readOnly.push(`S${String(i).padStart(2, "0")}/*`);
    }
  }

  return readOnly;
}

export function resolveReviseWriteAllowlist(
  _workspaceDir: string,
  _params?: Record<string, unknown>,
): string[] {
  return ["PLAN.md"];
}
