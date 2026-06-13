import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Value from "typebox/value";
import type { FrontmatterSchemaDeclaration } from "../capability-package";
import { extractFrontmatter } from "../frontmatter";
import { getSessionConfig } from "../capability-utils";
import { resolvePaths } from "../capability-config";
import type { CapabilityContract, MarkdownFileSpec, OutputEntry, PostValidateCallback, ValidationRule } from "../types";

/** Result of a validation run. */
export interface ValidationResult {
  passed: boolean;
  missing: string[];
}

// ---------------------------------------------------------------------------
// Module-level cache (per-session, populated by resources_discover)
// ---------------------------------------------------------------------------

let readOnlyFilePaths: string[] = [];
let writeAllowlistPaths: string[] = [];

/** Session working directory — the goal workspace dir (e.g. `/repo/.pio/goals/my-feature`). */
let workingDir: string | undefined;

/** True after we've already warned once and let the switch through. */
let warnedOnce = false;

/** Total warnings sent this session — capped to avoid infinite loops. */
let warningsThisSession = 0;

/** Hard limit on total exit-gate warnings per session. */
const MAX_WARNINGS = 3;

// ---------------------------------------------------------------------------
// Core validation engine
// ---------------------------------------------------------------------------

/** Type guard: distinguish CapabilityContract from ValidationRule or FrontmatterSchemaDeclaration[]. */
function isCapabilityContract(input: CapabilityContract | ValidationRule | FrontmatterSchemaDeclaration[] | null | undefined): input is CapabilityContract {
  return typeof input === "object" && input !== null && "outputs" in input && "inputs" in input;
}

/** Type guard: distinguish MarkdownFileSpec from OneOfGroup within OutputEntry[]. */
function isMarkdownFileSpec(entry: OutputEntry): entry is MarkdownFileSpec {
  return "file" in entry && !("files" in entry);
}

/**
 * Check that all declared files exist on disk.
 * Accepts either a CapabilityContract (new) or ValidationRule (legacy).
 * Paths are resolved relative to `baseDir` via `path.join(baseDir, file)`.
 */
export function validateOutputs(
  input: CapabilityContract | ValidationRule,
  baseDir: string,
  params?: Record<string, unknown>,
): ValidationResult {
  // If COMPLETED marker exists at baseDir, pass validation regardless of other expected files.
  // This allows evolve-plan to write just COMPLETED (when all steps are done) and have pio_mark_complete succeed.
  if (fs.existsSync(path.join(baseDir, "COMPLETED"))) {
    return { passed: true, missing: [] };
  }

  const missing: string[] = [];

  if (isCapabilityContract(input)) {
    // New path: iterate contract.outputs[]
    for (const entry of input.outputs) {
      if (!isMarkdownFileSpec(entry)) {
        // OneOfGroup — treat as no-op (deferred to later step)
        continue;
      }

      // Evaluate requiredWhen predicate
      if (entry.requiredWhen !== undefined && !entry.requiredWhen(params)) {
        continue;
      }

      // Resolve placeholder tokens in file path
      const resolvedPaths = resolvePaths([entry.file], params || {});
      const resolvedFile = resolvedPaths[0];

      const fullPath = path.join(baseDir, resolvedFile);
      if (!fs.existsSync(fullPath)) {
        missing.push(resolvedFile);
      }
    }
  } else {
    // Legacy path: iterate rules.files
    for (const file of input.files || []) {
      const fullPath = path.join(baseDir, file);
      if (!fs.existsSync(fullPath)) {
        missing.push(file);
      }
    }
  }

  return { passed: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Frontmatter schema validation
// ---------------------------------------------------------------------------

/**
 * Validate YAML frontmatter of output files against declared TypeBox schemas.
 * Accepts either a CapabilityContract (new) or FrontmatterSchemaDeclaration[] (legacy).
 *
 * Iterates over declarations, reads each file via extractFrontmatter(), and
 * validates the parsed object against the declared schema using Value.Check().
 *
 * Returns on the first failure (fail-fast). Error messages include the
 * outputFile name so the executor knows which file failed.
 *
 * This is a schema-only validation — it does NOT perform cross-field checks
 * that require reading document body content (e.g., totalSteps vs heading count).
 */
export function validateFrontmatter(
  input: CapabilityContract | FrontmatterSchemaDeclaration[],
  workingDir: string,
): { success: boolean; message?: string } {
  if (isCapabilityContract(input)) {
    // New path: iterate contract.outputs[] — only entries with schema defined
    for (const entry of input.outputs) {
      if (!isMarkdownFileSpec(entry)) {
        // OneOfGroup — skip for frontmatter validation
        continue;
      }
      if (!entry.schema) {
        // No schema — skip frontmatter validation for this file
        continue;
      }

      const filePath = path.join(workingDir, entry.file);

      // Check file exists
      if (!fs.existsSync(filePath)) {
        return { success: false, message: `Output file '${entry.file}' does not exist` };
      }

      // Parse frontmatter
      const raw = extractFrontmatter(filePath);
      if (raw === null) {
        return { success: false, message: `Output file '${entry.file}' has no valid YAML frontmatter` };
      }

      // Validate against schema
      if (!Value.Check(entry.schema, raw)) {
        const errors = [...Value.Errors(entry.schema, raw)];
        const messages = errors
          .map((e) => {
            const field = e.instancePath ? e.instancePath.replace(/^\//, "") : "root";
            return `Field '${field}': ${e.message}`;
          })
          .join("; ");
        return { success: false, message: `Frontmatter validation failed for '${entry.file}': ${messages}` };
      }
    }
  } else {
    // Legacy path: iterate FrontmatterSchemaDeclaration[]
    if (!input || input.length === 0) {
      return { success: true };
    }

    for (const decl of input) {
      const filePath = path.join(workingDir, decl.outputFile);

      // Check file exists
      if (!fs.existsSync(filePath)) {
        return { success: false, message: `Output file '${decl.outputFile}' does not exist` };
      }

      // Parse frontmatter
      const raw = extractFrontmatter(filePath);
      if (raw === null) {
        return { success: false, message: `Output file '${decl.outputFile}' has no valid YAML frontmatter` };
      }

      // Validate against schema
      if (!Value.Check(decl.schema, raw)) {
        const errors = [...Value.Errors(decl.schema, raw)];
        const messages = errors
          .map((e) => {
            const field = e.instancePath ? e.instancePath.replace(/^\//, "") : "root";
            return `Field '${field}': ${e.message}`;
          })
          .join("; ");
        return { success: false, message: `Frontmatter validation failed for '${decl.outputFile}': ${messages}` };
      }
    }
  }

  return { success: true };
}

/** Type guard: distinguish CapabilityContract from string[] (old requiredFiles). */
function isContractSecondArg(input: CapabilityContract | string[]): input is CapabilityContract {
  return typeof input === "object" && "inputs" in input;
}

/**
 * Check that required files exist and excluded files do not exist.
 * Accepts either a CapabilityContract (new) or string[] of required files (legacy).
 *
 * Iterates requiredFiles first (fail-fast on first missing), then
 * excludedFiles (fail-fast on first existing). Returns success only
 * when all checks pass.
 *
 * When receiving a CapabilityContract, paths are resolved via resolvePaths()
 * using the provided params for placeholder substitution.
 *
 * @param baseDir - Base directory for resolving relative paths
 * @param input - CapabilityContract (new) or string[] of required files (legacy)
 * @param paramsOrExcluded - Session params for placeholder resolution (new) or excludedFiles (legacy)
 * @param excludedOrUnused - Unused in new path; legacy param
 * @returns Success result or failure with descriptive message
 */
export function validateInputs(
  baseDir: string,
  input: CapabilityContract | string[],
  paramsOrExcluded?: Record<string, unknown> | string[],
  excludedOrUnused?: string[],
): { success: boolean; message?: string } {
  if (isContractSecondArg(input)) {
    // New path: read from contract.inputs[] and contract.excludedFiles[]
    const params = (paramsOrExcluded as Record<string, unknown>) || {};

    // Check required inputs
    for (const spec of input.inputs) {
      const resolvedPaths = resolvePaths([spec.file], params);
      const resolvedFile = resolvedPaths[0];
      if (!fs.existsSync(path.join(baseDir, resolvedFile))) {
        return { success: false, message: `Required file missing: ${resolvedFile}` };
      }
    }

    // Check excluded files
    if (input.excludedFiles) {
      for (const file of input.excludedFiles) {
        const resolvedPaths = resolvePaths([file], params);
        const resolvedFile = resolvedPaths[0];
        if (fs.existsSync(path.join(baseDir, resolvedFile))) {
          return { success: false, message: `File must not exist: ${resolvedFile}` };
        }
      }
    }
  } else {
    // Legacy path: input is requiredFiles (string[]), paramsOrExcluded is excludedFiles
    const requiredFiles = input;
    const excludedFiles = paramsOrExcluded as string[] | undefined;

    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(baseDir, file))) {
        return { success: false, message: `Required file missing: ${file}` };
      }
    }

    if (excludedFiles) {
      for (const file of excludedFiles) {
        if (fs.existsSync(path.join(baseDir, file))) {
          return { success: false, message: `File must not exist: ${file}` };
        }
      }
    }
  }

  return { success: true };
}

/**
 * Factory that produces a ready-to-use PostValidateCallback from
 * either a CapabilityContract (new) or FrontmatterSchemaDeclaration[] (legacy).
 *
 * Bridge between frontmatterSchemas declarations and the existing
 * postValidate hook system until the exit-gate integrates schema
 * validation directly.
 *
 * Usage in migrated capabilities:
 *   postValidate: createFrontmatterValidator(config.contract)
 */
export function createFrontmatterValidator(
  input: CapabilityContract | FrontmatterSchemaDeclaration[],
): PostValidateCallback {
  return (goalDir, _params) => validateFrontmatter(input, goalDir);
}

// ---------------------------------------------------------------------------
// Setup — registers event handlers for file protection
// ---------------------------------------------------------------------------

export function setupValidation(pi: ExtensionAPI) {
  // 1. Read validation config on session discovery; reset counters
  pi.on("resources_discover", async (_event, ctx) => {
    const config = getSessionConfig(ctx);
    if (!config) return;
    workingDir = config.workingDir;

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
