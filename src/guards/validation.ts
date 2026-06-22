import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Value from "typebox/value";
import { extractFrontmatter, formatSchemaDescription } from "../frontmatter";
import { getSessionConfig } from "../capability-utils";
import { resolveContractPath } from "../capability-config";
import type { CapabilityContract, MarkdownFileSpec, OutputEntry, PostValidateCallback } from "../types";

// ---------------------------------------------------------------------------
// Module-level cache (per-session, populated by resources_discover)
// ---------------------------------------------------------------------------

let readOnlyFilePaths: string[] = [];
let writeAllowlistPaths: string[] = [];
let allowProjectWrites: boolean = false;

/** Session workspace directory — resolved directory for resolving validation file paths. */
let workspaceDir: string | undefined;

/** Project root directory — boundary for allowProjectWrites. */
let projectRoot: string | undefined;

/** True after we've already warned once and let the switch through. */
let warnedOnce = false;

/** Total warnings sent this session — capped to avoid infinite loops. */
let warningsThisSession = 0;

/** Hard limit on total exit-gate warnings per session. */
const MAX_WARNINGS = 3;

// ---------------------------------------------------------------------------
// Test accessors
// ---------------------------------------------------------------------------

/**
 * Test-only accessor for the internal file protection state.
 *
 * @internal — Do not use in production code. Exists solely to allow unit tests
 * to read and manipulate validation state without mocking the full ExtensionAPI.
 */
export function __testSetFileProtectionState(state?: {
  allowProjectWrites?: boolean;
  projectRoot?: string | undefined;
  writeAllowlistPaths?: string[];
  readOnlyFilePaths?: string[];
}) {
  if (state?.allowProjectWrites !== undefined) allowProjectWrites = state.allowProjectWrites;
  if (state?.projectRoot !== undefined) projectRoot = state.projectRoot;
  if (state?.writeAllowlistPaths !== undefined) writeAllowlistPaths = state.writeAllowlistPaths;
  if (state?.readOnlyFilePaths !== undefined) readOnlyFilePaths = state.readOnlyFilePaths;
}

// ---------------------------------------------------------------------------
// Core validation engine
// ---------------------------------------------------------------------------

/** Type guard: distinguish MarkdownFileSpec from OneOfGroup within OutputEntry[]. */
function isMarkdownFileSpec(entry: OutputEntry): entry is MarkdownFileSpec {
  return "file" in entry && !("files" in entry);
}

/**
 * Check that all declared output files exist on disk and validate frontmatter
 * against declared schemas. Collects all issues into a single message string.
 *
 * Paths are resolved through `resolveContractPath()` which handles workspace
 * prefix injection and placeholder resolution.
 */
export function validateOutputs(
  contract: CapabilityContract,
  workspaceDir: string,
  params?: Record<string, unknown>,
): { success: boolean; message?: string } {
  const workspacePrefix = typeof params?.workspacePrefix === "string"
    ? params.workspacePrefix
    : undefined;

  // If COMPLETION_SUMMARY.md exists (resolved through prefix layer), pass validation regardless of other expected files.
  // This allows evolve-plan to write just COMPLETION_SUMMARY.md (when all steps are done) and have pio_mark_complete succeed.
  if (fs.existsSync(resolveContractPath("COMPLETION_SUMMARY.md", workspaceDir, workspacePrefix, params))) {
    return { success: true };
  }

  try {
    const issues: string[] = [];

    for (const entry of contract.outputs) {
      if (!isMarkdownFileSpec(entry)) {
        // OneOfGroup — treat as no-op (deferred to later step)
        continue;
      }

      // Evaluate requiredWhen predicate
      if (entry.requiredWhen !== undefined && !entry.requiredWhen(params)) {
        continue;
      }

      // Use resolveContractPath for prefix-aware resolution (handles placeholders internally)
      const fullPath = resolveContractPath(entry.file, workspaceDir, workspacePrefix, params);

      if (!fs.existsSync(fullPath)) {
        issues.push(`Output file '${entry.file}' is missing`);
        continue;
      }

      // Frontmatter validation when schema is declared
      if (entry.schema) {
        const raw = extractFrontmatter(fullPath);
        if (raw === null) {
          issues.push(`Output file '${entry.file}' has no valid YAML frontmatter`);
        } else if (!Value.Check(entry.schema, raw)) {
          const errors = [...Value.Errors(entry.schema, raw)];
          const fieldErrors = errors.map((e) => {
            const field = e.instancePath ? e.instancePath.replace(/^\//, "") : "root";
            return `Field '${field}': ${e.message}`;
          }).join("; ");
          const schemaDesc = formatSchemaDescription(entry.schema);
          issues.push(`Frontmatter validation failed for '${entry.file}': ${fieldErrors}\nExpected frontmatter structure:\n${schemaDesc}`);
        }
      }
    }

    if (issues.length > 0) {
      return { success: false, message: issues.join("\n") };
    }
    return { success: true };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Frontmatter schema validation
// ---------------------------------------------------------------------------

/**
 * Validate YAML frontmatter of output files against declared TypeBox schemas.
 *
 * Iterates over contract.outputs[] entries with schema defined, reads each file
 * via extractFrontmatter(), and validates the parsed object against the declared
 * schema using Value.Check().
 *
 * Returns on the first failure (fail-fast). Error messages include the
 * outputFile name so the executor knows which file failed.
 *
 * This is a schema-only validation — it does NOT perform cross-field checks
 * that require reading document body content (e.g., totalSteps vs heading count).
 */
export function validateFrontmatter(
  contract: CapabilityContract,
  workspaceDir: string,
  params?: Record<string, unknown>,
): { success: boolean; message?: string } {
  const workspacePrefix = typeof params?.workspacePrefix === "string"
    ? params.workspacePrefix
    : undefined;

  try {
    for (const entry of contract.outputs) {
      if (!isMarkdownFileSpec(entry)) {
        // OneOfGroup — skip for frontmatter validation
        continue;
      }
      if (!entry.schema) {
        // No schema — skip frontmatter validation for this file
        continue;
      }

      // Use resolveContractPath for prefix-aware resolution (handles placeholders internally)
      const filePath = resolveContractPath(entry.file, workspaceDir, workspacePrefix, params);

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
        const schemaDesc = formatSchemaDescription(entry.schema);
        return { success: false, message: `Frontmatter validation failed for '${entry.file}': ${messages}\nExpected frontmatter structure:\n${schemaDesc}` };
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Check that required files exist and excluded files do not exist.
 *
 * Iterates contract.inputs[] first (fail-fast on first missing), then
 * contract.excludedFiles[] (fail-fast on first existing). Returns success only
 * when all checks pass.
 *
 * Paths are resolved through `resolveContractPath()` which handles workspace
 * prefix injection and placeholder resolution.
 *
 * @param workspaceDir - Resolved workspace directory for resolving relative paths
 * @param contract - CapabilityContract with inputs and excludedFiles
 * @param params - Session params for placeholder resolution (must include workspacePrefix if used)
 * @returns Success result or failure with descriptive message
 */
export function validateInputs(
  workspaceDir: string,
  contract: CapabilityContract,
  params?: Record<string, unknown>,
): { success: boolean; message?: string } {
  const workspacePrefix = typeof params?.workspacePrefix === "string"
    ? params.workspacePrefix
    : undefined;

  try {
    // Check required inputs
    for (const spec of contract.inputs) {
      const fullPath = resolveContractPath(spec.file, workspaceDir, workspacePrefix, params);

      if (!fs.existsSync(fullPath)) {
        return { success: false, message: `Required file missing: ${spec.file}` };
      }

      // Frontmatter validation when schema is declared on the input entry
      if (spec.schema) {
        const raw = extractFrontmatter(fullPath);
        if (raw === null) {
          return { success: false, message: `Input file '${spec.file}' has no valid YAML frontmatter` };
        }

        if (!Value.Check(spec.schema, raw)) {
          const errors = [...Value.Errors(spec.schema, raw)];
          const messages = errors.map((e) => {
            const field = e.instancePath ? e.instancePath.replace(/^\//, "") : "root";
            return `Field '${field}': ${e.message}`;
          }).join("; ");
          const schemaDesc = formatSchemaDescription(spec.schema);
          return { success: false, message: `Frontmatter validation failed for '${spec.file}': ${messages}\nExpected frontmatter structure:\n${schemaDesc}` };
        }
      }
    }

    // Check excluded files
    if (contract.excludedFiles) {
      for (const file of contract.excludedFiles) {
        const fullPath = resolveContractPath(file, workspaceDir, workspacePrefix, params);
        if (fs.existsSync(fullPath)) {
          return { success: false, message: `File must not exist: ${file}` };
        }
      }
    }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }

  return { success: true };
}

/**
 * Factory that produces a ready-to-use PostValidateCallback from
 * a CapabilityContract.
 *
 * Bridge between contract declarations and the existing
 * postValidate hook system.
 *
 * Usage in capabilities:
 *   postValidate: createFrontmatterValidator(config.contract)
 */
export function createFrontmatterValidator(
  contract: CapabilityContract,
): PostValidateCallback {
  return (workspaceDir, params) => validateFrontmatter(contract, workspaceDir, params);
}

// ---------------------------------------------------------------------------
// Setup — registers event handlers for file protection
// ---------------------------------------------------------------------------

export function setupValidation(pi: ExtensionAPI) {
  // 1. Read validation config on session discovery; reset counters
  pi.on("resources_discover", async (_event, ctx) => {
    const config = await getSessionConfig(ctx);
    if (!config) return;
    workspaceDir = config.workspaceDir;

    const workspacePrefix = typeof config.sessionParams?.workspacePrefix === "string"
      ? config.sessionParams.workspacePrefix
      : undefined;

    // Resolve read-only file paths through prefix layer
    if (config.readOnlyFiles && config.workspaceDir) {
      readOnlyFilePaths = config.readOnlyFiles.map((f) =>
        path.resolve(resolveContractPath(f, workspaceDir!, workspacePrefix, config.sessionParams))
      );
    } else {
      readOnlyFilePaths = [];
    }

    // Start with explicit writeAllowlist from config
    let baseAllowlist: string[] = [];
    if (config.writeAllowlist && config.workspaceDir) {
      baseAllowlist = config.writeAllowlist.map((f) =>
        path.resolve(resolveContractPath(f, workspaceDir!, workspacePrefix, config.sessionParams))
      );
    }

    // Auto-derive from contract outputs — "zero manual configuration per capability"
    // Root-level paths (/PROJECT/...) resolve directly from workspaceDir; prefixed paths
    // resolve through workspacePrefix. Merge with explicit allowlist via Set dedup.
    const contractOutputPaths: string[] = [];
    if (config.contract?.outputs && workspaceDir) {
      for (const entry of config.contract.outputs) {
        if (isMarkdownFileSpec(entry)) {
          contractOutputPaths.push(path.resolve(resolveContractPath(
            entry.file, workspaceDir, workspacePrefix, config.sessionParams
          )));
        }
      }
    }

    writeAllowlistPaths = [...new Set([...baseAllowlist, ...contractOutputPaths])];

    allowProjectWrites = config.allowProjectWrites ?? false;

    // Project root boundary for allowProjectWrites — constrains writes to project workspace
    projectRoot = path.resolve(ctx.cwd ?? process.cwd());

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

  // 5. File protection: unified write check + read-only blocklist fallback
  pi.on("tool_call", async (event) => {
    const input = event.input as Record<string, unknown> | undefined;

    // Collect all target file paths from write tools (done once)
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

    // No write targets — pass through
    if (targetPaths.length === 0) return;

    // Unified write check — single pass over all targets
    for (const tp of targetPaths) {
      // Allowed: contract output files (auto-derived allowlist)
      if (writeAllowlistPaths.includes(tp)) continue;

      // Allowed: project files when capability has allowProjectWrites (scoped to project root)
      if (allowProjectWrites && !tp.includes("/.pio/") && projectRoot && tp.startsWith(projectRoot + "/")) continue;

      // Allowed: /tmp/ writes (temporary scratch files)
      if (tp.startsWith("/tmp/")) continue;

      // Block everything else — always list what IS allowed to guide the agent
      return { block: true, reason: buildAllowanceMessage(writeAllowlistPaths, allowProjectWrites) };
    }

    // Read-only blocklist — final fallback (blocks writes to explicitly read-only files)
    if (readOnlyFilePaths.length > 0) {
      for (const tp of targetPaths) {
        if (readOnlyFilePaths.includes(tp)) {
          return { block: true, reason: `${tp} is read-only during this session. If you need changes to this file, flag them to the user and do not modify it.` };
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Helper — build helpful error message listing all permitted write categories
// ---------------------------------------------------------------------------

function buildAllowanceMessage(allowlist: string[], hasProjectWrites: boolean): string {
  const parts: string[] = [];
  if (allowlist.length > 0) {
    parts.push(`contract output files: ${allowlist.join(", ")}`);
  }
  if (hasProjectWrites) {
    parts.push("project source files outside .pio/");
  }
  parts.push("temporary files in /tmp/");
  return `Writing is restricted during this session. Allowed write targets: ${parts.join("; ")}.`;
}
