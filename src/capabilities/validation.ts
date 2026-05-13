import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as jsyaml from "js-yaml";
import type { ValidationRule } from "../types";
import { stepFolderName } from "../utils";
import { getSessionParams, getStepNumber } from "./session-capability";
import { resolveNextCapability, enqueueTask, writeLastTask, resolveGoalDir } from "../utils";

// Re-export for backward compatibility
export type { ValidationRule };

/** Result of a validation run. */
export interface ValidationResult {
  passed: boolean;
  missing: string[];
}

/** Parsed YAML frontmatter from a REVIEW.md file (before validation). */
interface RawReviewFrontmatter {
  decision: string;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}

/** Parsed YAML frontmatter from a REVIEW.md file. */
export interface ReviewFrontmatter {
  decision: "APPROVED" | "REJECTED";
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}

// ---------------------------------------------------------------------------
// Module-level cache (per-session, populated by resources_discover)
// ---------------------------------------------------------------------------

let validationRules: ValidationRule | undefined;
let baseDir: string | undefined;
let readOnlyFilePaths: string[] = [];
let writeAllowlistPaths: string[] = [];

/** Session working directory — the goal workspace dir (e.g. `/repo/.pio/goals/my-feature`). */
let workingDir: string | undefined;

/** Session capability name (e.g. "execute-task"). Captured for context; used for future policies. */
let capabilityName: string | undefined;

/** True after we've already warned once and let the switch through. */
let warnedOnce = false;

/** Total warnings sent this session — capped to avoid infinite loops. */
let warningsThisSession = 0;

/** Hard limit on total exit-gate warnings per session. */
const MAX_WARNINGS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter from a REVIEW.md file.
 * The file must start with `---\n`, contain valid YAML between two `---` delimiters,
 * and include all required fields.
 * Returns null if the file doesn't exist, doesn't start with `---`, or contains malformed YAML.
 */
export function parseReviewFrontmatter(reviewPath: string): RawReviewFrontmatter | null {
  let content: string;
  try {
    content = fs.readFileSync(reviewPath, "utf-8");
  } catch {
    return null;
  }

  // Content must start with ---\n (frontmatter at the very beginning)
  if (!content.startsWith("---\n")) {
    return null;
  }

  // Find the closing --- delimiter
  const firstDelimiter = 3; // length of "---\n"
  const rest = content.slice(firstDelimiter);
  const secondDelimiterIndex = rest.indexOf("\n---\n");

  if (secondDelimiterIndex === -1) {
    // Closing delimiter not found
    return null;
  }

  const yamlContent = rest.slice(0, secondDelimiterIndex);

  try {
    const parsed = jsyaml.load(yamlContent) as Record<string, unknown> | null;
    if (parsed == null || typeof parsed !== "object") {
      return null;
    }

    // Validate that all required fields are present and have correct types
    const {
      decision,
      criticalIssues,
      highIssues,
      mediumIssues,
      lowIssues,
    } = parsed as Record<string, unknown>;

    if (typeof decision !== "string") return null;
    if (!Number.isInteger(criticalIssues)) return null;
    if (!Number.isInteger(highIssues)) return null;
    if (!Number.isInteger(mediumIssues)) return null;
    if (!Number.isInteger(lowIssues)) return null;

    return {
      decision,
      criticalIssues,
      highIssues,
      mediumIssues,
      lowIssues,
    } as RawReviewFrontmatter;
  } catch {
    // YAML parsing failed
    return null;
  }
}

/**
 * Validate that all required fields exist and have correct types.
 * Narrows the decision type from string to "APPROVED" | "REJECTED" on success.
 * Returns null on success, or an error message string describing what's wrong.
 */
export function validateReviewFrontmatter(frontmatter: RawReviewFrontmatter): string | null {
  const { decision, criticalIssues, highIssues, mediumIssues, lowIssues } = frontmatter;

  // Validate decision value
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return `The 'decision' field must be either 'APPROVED' or 'REJECTED'. Found: '${decision}'.`;
  }

  // Validate count fields are non-negative integers
  const countFields = [
    { name: "criticalIssues", value: criticalIssues },
    { name: "highIssues", value: highIssues },
    { name: "mediumIssues", value: mediumIssues },
    { name: "lowIssues", value: lowIssues },
  ];

  for (const field of countFields) {
    if (typeof field.value !== "number" || !Number.isInteger(field.value)) {
      return `The '${field.name}' field must be a non-negative integer. Found: ${field.value}.`;
    }
    if (field.value < 0) {
      return `The '${field.name}' field must be a non-negative integer. Found: ${field.value}.`;
    }
  }

  // On success, narrow to ReviewFrontmatter type via the decision check above
  return null;
}

/**
 * Coerce a validated RawReviewFrontmatter into the strict ReviewFrontmatter type.
 * Safe to call after validateReviewFrontmatter returns null.
 */
function toReviewFrontmatter(raw: RawReviewFrontmatter): ReviewFrontmatter {
  return {
    decision: raw.decision as "APPROVED" | "REJECTED",
    criticalIssues: raw.criticalIssues,
    highIssues: raw.highIssues,
    mediumIssues: raw.mediumIssues,
    lowIssues: raw.lowIssues,
  };
}

/**
 * Create marker files based on the parsed review decision.
 * APPROVED: creates empty S{NN}/APPROVED, leaves COMPLETED intact.
 * REJECTED: creates empty S{NN}/REJECTED, deletes S{NN}/COMPLETED.
 */
export function applyReviewDecision(
  workingDir: string,
  stepNumber: number,
  frontmatter: RawReviewFrontmatter,
): void {
  const folder = stepFolderName(stepNumber);
  const stepDir = path.join(workingDir, folder);

  // Ensure the step directory exists (should already exist with REVIEW.md, but be safe)
  fs.mkdirSync(stepDir, { recursive: true });

  if (frontmatter.decision === "APPROVED") {
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
  } else {
    // REJECTED
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");
    // Delete COMPLETED so isStepReady in execute-task.ts permits re-execution
    fs.rmSync(path.join(stepDir, "COMPLETED"), { force: true });
  }
}

/**
 * Post-creation consistency check.
 * Verifies exactly one of APPROVED/REJECTED exists in S{NN}/ and it matches expectedDecision.
 * Returns true if consistent, false otherwise.
 */
export function validateReviewState(
  workingDir: string,
  stepNumber: number,
  expectedDecision: "APPROVED" | "REJECTED",
): boolean {
  const folder = stepFolderName(stepNumber);
  const stepDir = path.join(workingDir, folder);

  const approvedExists = fs.existsSync(path.join(stepDir, "APPROVED"));
  const rejectedExists = fs.existsSync(path.join(stepDir, "REJECTED"));

  // Exactly one marker must exist
  if (approvedExists && rejectedExists) return false;
  if (!approvedExists && !rejectedExists) return false;

  // The existing marker must match the expected decision
  if (expectedDecision === "APPROVED" && !approvedExists) return false;
  if (expectedDecision === "REJECTED" && !rejectedExists) return false;

  return true;
}

export function extractGoalName(workingDir: string): string {
  const goalsIndex = workingDir.indexOf("/goals/");
  if (goalsIndex === -1) return "";
  const afterGoals = workingDir.slice(goalsIndex + 7);
  return afterGoals.split(path.sep)[0] || "";
}

// ---------------------------------------------------------------------------
// Core validation engine
// ---------------------------------------------------------------------------

/**
 * Check that all declared files exist on disk.
 * Paths are resolved relative to `baseDir` via `path.join(baseDir, file)`.
 */
export function validateOutputs(rules: ValidationRule, baseDir: string): ValidationResult {
  // If COMPLETED marker exists at baseDir, pass validation regardless of other expected files.
  // This allows evolve-plan to write just COMPLETED (when all steps are done) and have pio_mark_complete succeed.
  if (fs.existsSync(path.join(baseDir, "COMPLETED"))) {
    return { passed: true, missing: [] };
  }

  const missing: string[] = [];

  for (const file of rules.files || []) {
    const fullPath = path.join(baseDir, file);
    if (!fs.existsSync(fullPath)) {
      missing.push(file);
    }
  }

  return { passed: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// pio_mark_complete tool
// ---------------------------------------------------------------------------

const markCompleteTool = defineTool({
  name: "pio_mark_complete",
  label: "Pio Mark Complete",
  description: "Signal that your work is done. Validates that all expected output files have been produced and auto-enqueues the next workflow task.",
  promptSnippet: "Signal that your work is done. Validates expected output files.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    const entries = ctx.sessionManager.getEntries();
    const entry = entries.find(
      (e) => e.type === "custom" && e.customType === "pio-config",
    );

    // No config — not a capability session, always pass
    if (!entry || entry.type !== "custom") {
      return { content: [{ type: "text", text: "No validation rules configured for this session." }], details: {}, terminate: true };
    }

    const config = entry.data as { capability?: string; workingDir?: string; validation?: ValidationRule; fileCleanup?: string[]; sessionParams?: Record<string, unknown> };
    const rules = config.validation;
    const dir = config.workingDir;

    // No validation rules defined — always pass
    if (!rules || !dir) {
      return { content: [{ type: "text", text: "No validation rules configured for this session." }], details: {}, terminate: true };
    }

    const result = validateOutputs(rules, dir);

    if (result.passed) {
      let notification = "";

      // -----------------------------------------------------------------------
      // Review-code automation: parse frontmatter, create markers, validate state
      // -----------------------------------------------------------------------
      const capabilityForAutomation = config.capability;

      if (capabilityForAutomation === "review-code") {
        const autoStepNumber = getStepNumber();
        if (autoStepNumber != null) {
          const folder = stepFolderName(autoStepNumber);
          const reviewPath = path.join(dir, folder, "REVIEW.md");

          // Parse frontmatter
          const frontmatter = parseReviewFrontmatter(reviewPath);
          if (frontmatter === null) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `REVIEW.md is missing valid YAML frontmatter at the top of the file. Review your document and add a --- block containing 'decision', 'criticalIssues', 'highIssues', 'mediumIssues', and 'lowIssues'. Ensure the decision field matches your actual review outcome.`,
                },
              ],
              details: {},
            };
          }

          // Validate frontmatter fields
          const validationError = validateReviewFrontmatter(frontmatter);
          if (validationError !== null) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `REVIEW.md frontmatter validation failed: ${validationError} Please fix the frontmatter and call pio_mark_complete again.`,
                },
              ],
              details: {},
            };
          }

          // Apply decision: create marker files (coerce to strict type after validation passed)
          const validatedFrontmatter = toReviewFrontmatter(frontmatter);
          applyReviewDecision(dir, autoStepNumber, validatedFrontmatter);

          // validateState: verify consistency after automation
          const stateConsistent = validateReviewState(dir, autoStepNumber, validatedFrontmatter.decision);
          if (!stateConsistent) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Review state is inconsistent after automation. The marker files do not match the decision in REVIEW.md frontmatter.`,
                },
              ],
              details: {},
            };
          }
        }
      }

      // Auto-enqueue next task (single-slot, overwrites any existing pending task)
      const capability = config.capability;
      const cwd = process.cwd();
      const goalName = extractGoalName(dir);

      // Read enriched session params from session-capability (centralized source of truth).
      // Falls back to config.sessionParams if not yet populated.
      const sessionParams = getSessionParams() || config.sessionParams || {};

      // Get canonical stepNumber from enriched params (auto-discovered if needed)
      const stepNumber = getStepNumber();

      const nextTask = capability
        ? resolveNextCapability(capability, { capability, workingDir: dir, params: { goalName, stepNumber, _sessionContext: sessionParams } })
        : undefined;
      if (nextTask && goalName && capability) {
        try {
          // Use adjusted params from the transition (may contain incremented stepNumber)
          const adjustedParams = nextTask.params || {};

          // After spreading adjusted params and _sessionContext, explicitly set stepNumber last
          // to guarantee it appears at top level (cannot be shadowed by nested _sessionContext).
          const finalStepNumber = typeof adjustedParams.stepNumber === "number"
            ? adjustedParams.stepNumber
            : stepNumber;

          enqueueTask(cwd, goalName, {
            capability: nextTask.capability,
            params: {
              goalName,
              ...adjustedParams,
              _sessionContext: sessionParams,
              ...(finalStepNumber != null ? { stepNumber: finalStepNumber } : {}),
            },
          });

          // Record the completed task in the goal directory
          const goalDir = resolveGoalDir(cwd, goalName);
          writeLastTask(goalDir, {
            capability,
            params: { goalName, ...(stepNumber != null ? { stepNumber } : {}), _sessionContext: sessionParams },
          });

          notification = `\n\nNext task enqueued: ${nextTask.capability}. Use \`/pio-next-task\` to start the sub-session.`;
        } catch (err) {
          console.warn(`pio: failed to enqueue next task: ${err}`);
        }
      } else if (nextTask && goalName && capability) {
        // No next capability — record the final completed task
        try {
          const goalDir = resolveGoalDir(cwd, goalName);
          writeLastTask(goalDir, {
            capability,
            params: { goalName, ...(stepNumber != null ? { stepNumber } : {}), _sessionContext: sessionParams },
          });
        } catch (err) {
          console.warn(`pio: failed to write last task: ${err}`);
        }
      }

      // Cleanup files declared in config.fileCleanup
      if (Array.isArray(config.fileCleanup)) {
        for (const filePath of config.fileCleanup) {
          try {
            fs.rmSync(filePath, { force: true });
            console.log(`pio: cleaned up file after validation: ${filePath}`);
          } catch (err) {
            console.warn(`pio: failed to clean up file ${filePath}: ${err}`);
          }
        }
      }

      return { content: [{ type: "text", text: `Validation passed. All expected outputs have been produced.${notification}` }], details: {}, terminate: true };
    } else {
      return { content: [{ type: "text", text: `Validation failed. Missing files:\n- ${result.missing.join("\n- ")}\n\nProduce these files and call pio_mark_complete again.` }], details: {} };
    }
  },
});

// ---------------------------------------------------------------------------
// Setup — registers tool, resources_discover handler, exit-gate
// ---------------------------------------------------------------------------

export function setupValidation(pi: ExtensionAPI) {
  // 1. Register the pio_mark_complete tool globally
  pi.registerTool(markCompleteTool);

  // 2. Read validation config on session discovery; reset counters
  pi.on("resources_discover", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const entry = entries.find(
      (e) => e.type === "custom" && e.customType === "pio-config",
    );

    if (!entry || entry.type !== "custom") return;

    const config = entry.data as { capability?: string; workingDir?: string; validation?: ValidationRule; readOnlyFiles?: string[]; writeAllowlist?: string[] };
    validationRules = config.validation;
    baseDir = config.workingDir;
    workingDir = config.workingDir;
    capabilityName = config.capability;

    // Resolve read-only file paths to absolute paths
    if (config.readOnlyFiles && config.workingDir) {
      readOnlyFilePaths = config.readOnlyFiles.map((f) => path.resolve(config.workingDir!, f));
    } else {
      readOnlyFilePaths = [];
    }

    // Resolve write-allowlist paths to absolute paths
    if (config.writeAllowlist && config.workingDir) {
      writeAllowlistPaths = config.writeAllowlist.map((f) => path.resolve(config.workingDir!, f));
    } else {
      writeAllowlistPaths = [];
    }

    warnedOnce = false;
    warningsThisSession = 0;
  });

  // 3. Reset one-shot gate when the agent starts a new turn
  pi.on("turn_start", async () => {
    warnedOnce = false;
  });

  // // 4. Exit-gate: block the first switch if validation fails, then let it go.
  // //    Hard cap after MAX_WARNINGS to avoid infinite loops.
  // pi.on("session_before_switch", async (_event, ctx) => {
  //   if (!validationRules || !baseDir) return; // no rules — allow switch

  //   const result = validateOutputs(validationRules, baseDir);

  //   if (result.passed) return; // all good — allow switch

  //   if (warnedOnce) return; // already warned this round — let them leave

  //   if (warningsThisSession >= MAX_WARNINGS) return; // cap reached — stop blocking

  //   // Warn and block so the agent has a chance to fix things
  //   warnedOnce = true;
  //   warningsThisSession++;
  //   pi.sendUserMessage(`Validation failed. The following expected output files are missing:\n- ${result.missing.join("\n- ")}\n\nPlease produce these files before switching sessions.`);
  //   ctx.ui.notify(`Capability validation failed. Missing: ${result.missing.join(", ")}`, "warning");

  //   return { cancel: true };
  // });

  // 5. File protection: default-deny for .pio/ writes + write-allowlist + read-only blocklist
  pi.on("tool_call", async (event) => {
    const input = event.input as Record<string, unknown> | undefined;

    // --- Default-deny: block all writes to .pio/ unless explicitly allowed ---
    // Collect all target file paths from write tools
    let pioWriteTargets: string[] = [];

    if (event.toolName === "write" && typeof input?.path === "string") {
      pioWriteTargets = [path.resolve(input.path)];
    } else if (event.toolName === "edit" && typeof input?.path === "string") {
      pioWriteTargets = [path.resolve(input.path)];
    } else if (event.toolName === "vscode_apply_workspace_edit" && Array.isArray(input?.edits)) {
      for (const edit of input.edits as Array<Record<string, unknown>>) {
        if (typeof edit.filePath === "string") {
          pioWriteTargets.push(path.resolve(edit.filePath));
        }
      }
    }

    // Check if any target is inside a .pio/ directory
    for (const tp of pioWriteTargets) {
      if (tp.includes("/.pio/")) {
        // Permit if the path is in the session's write-allowlist
        if (writeAllowlistPaths.includes(tp)) {
          continue;
        }

        // Permit if the path is inside the session's own workingDir (goal workspace)
        if (workingDir && (tp.startsWith(workingDir + path.sep) || tp === workingDir)) {
          continue;
        }

        // Block writes to .pio/ areas outside the session's goal workspace
        return { block: true, reason: `Writing to .pio/ files is not allowed. These files are managed by the pio workflow and should not be modified directly from this session.` };
      }
    }

    // --- Write-allowlist check (takes precedence over blocklist) ---
    if (writeAllowlistPaths.length > 0) {
      // Collect all target file paths from this tool call
      let targetPaths: string[] = [];

      if (event.toolName === "write" && typeof input?.path === "string") {
        targetPaths = [path.resolve(input.path)];
      } else if (event.toolName === "edit" && typeof input?.path === "string") {
        targetPaths = [path.resolve(input.path)];
      } else if (event.toolName === "vscode_apply_workspace_edit" && Array.isArray(input?.edits)) {
        for (const edit of input.edits as Array<Record<string, unknown>>) {
          if (typeof edit.filePath === "string") {
            targetPaths.push(path.resolve(edit.filePath));
          }
        }
      }

      // Block any write tool targeting a file NOT in the allowlist
      if (targetPaths.length > 0) {
        for (const tp of targetPaths) {
          if (!writeAllowlistPaths.includes(tp)) {
            return { block: true, reason: `Writing is restricted during this session. Allowed write targets: ${writeAllowlistPaths.join(", ")}. You attempted to write to a file outside this list.` };
          }
        }
      }

      // Allowlist check passed — no need to check blocklist (allowlist takes precedence)
      return;
    }

    // --- Read-only blocklist check (only if no allowlist is configured) ---
    if (readOnlyFilePaths.length === 0) return; // no read-only files configured

    // Check `write` tool — input.path
    if (event.toolName === "write" && typeof input?.path === "string") {
      const targetPath = path.resolve(input.path);
      if (readOnlyFilePaths.includes(targetPath)) {
        return { block: true, reason: `${input.path} is read-only during this session. If you need changes to ${input.path}, flag them to the user and do not modify it.` };
      }
    }

    // Check `edit` tool — input.path
    if (event.toolName === "edit" && typeof input?.path === "string") {
      const targetPath = path.resolve(input.path);
      if (readOnlyFilePaths.includes(targetPath)) {
        return { block: true, reason: `${input.path} is read-only during this session. If you need changes to ${input.path}, flag them to the user and do not modify it.` };
      }
    }

    // Check `vscode_apply_workspace_edit` tool — input.edits[].filePath
    if (event.toolName === "vscode_apply_workspace_edit" && Array.isArray(input?.edits)) {
      for (const edit of input.edits as Array<Record<string, unknown>>) {
        if (typeof edit.filePath === "string") {
          const targetPath = path.resolve(edit.filePath);
          if (readOnlyFilePaths.includes(targetPath)) {
            return { block: true, reason: `${edit.filePath} is read-only during this session. If you need changes to ${edit.filePath}, flag them to the user and do not modify it.` };
          }
        }
      }
    }
  });
}
