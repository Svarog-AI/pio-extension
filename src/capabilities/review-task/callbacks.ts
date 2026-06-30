import * as path from "node:path";

import { CapState } from "../../capability-state";
import { extractFrontmatter, validateAndCoerce } from "../../frontmatter";
import { CONTRACT } from "./config";
import { REVIEW_OUTPUT_SCHEMA, type ReviewOutputs } from "./schemas";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASK_FILE = "TASK.md";
const TEST_FILE = "TEST.md";
const SUMMARY_FILE = "SUMMARY.md";
const REVIEW_FILE = "REVIEW.md";
const DECISIONS_FILE = "DECISIONS.md";

// ---------------------------------------------------------------------------
// Config callbacks (used by config.ts and resolveCapabilityConfig)
// ---------------------------------------------------------------------------

/**
 * Callback used by the `readOnlyFiles` field in config.
 * Returns array of read-only files for the given step.
 * workspacePrefix already includes the step folder — plain names resolve correctly.
 */
export function resolveReviewReadOnlyFiles(
  _dir: string,
  _params?: Record<string, unknown>,
): string[] {
  return [TASK_FILE, TEST_FILE, SUMMARY_FILE, DECISIONS_FILE];
}

/**
 * Callback used by the `writeAllowlist` field in config.
 * Returns array of writable files for the given step.
 * workspacePrefix already includes the step folder — plain name resolves correctly.
 */
export function resolveReviewWriteAllowlist(
  _dir: string,
  _params?: Record<string, unknown>,
): string[] {
  return [REVIEW_FILE];
}

// ---------------------------------------------------------------------------
// Post-validate hook
// ---------------------------------------------------------------------------

/**
 * Post-validate hook: reads REVIEW.md frontmatter and validates against schema.
 * Does NOT create markers — that is handled by the framework marker engine.
 */
export function postValidateReview(
  workspaceDir: string,
  params?: Record<string, unknown>,
): { success: boolean; message?: string } {
  // Read REVIEW.md via CapState — uses CONTRACT.outputs schema for validation
  const capState = new CapState(CONTRACT, workspaceDir, params);
  const reviewFile = capState.output<ReviewOutputs>("review");

  if (!reviewFile.exists()) {
    return { success: false, message: "REVIEW.md not found" };
  }
  const data = reviewFile.read();
  if (data === null) {
    // Get detailed error message via direct validation
    const reviewPath = path.join(workspaceDir, REVIEW_FILE);
    const raw = extractFrontmatter(reviewPath);
    if (raw === null) {
      return {
        success: false,
        message: "REVIEW.md does not contain valid YAML frontmatter",
      };
    }
    const result = validateAndCoerce<ReviewOutputs>(raw, REVIEW_OUTPUT_SCHEMA);
    if ("error" in result) {
      return { success: false, message: result.error };
    }
    return {
      success: false,
      message: "REVIEW.md frontmatter validation failed",
    };
  }

  // Schema validation passed — markers are handled by the framework marker engine
  return { success: true };
}
