import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as Value from "typebox/value";
import { CapState } from "../capability-state";
import { getSessionConfig } from "../capability-utils";
import { extractFrontmatter, formatSchemaDescription } from "../frontmatter";
import type { MarkdownFileSpec, OutputEntry } from "../types";

// ---------------------------------------------------------------------------
// Module-level cache (per-session, populated by resources_discover)
// ---------------------------------------------------------------------------

let readOnlyFilePaths: string[] = [];
let writeAllowlistPaths: string[] = [];
let allowProjectWrites: boolean = false;
let isActivePioSession: boolean = false;

/** Project root directory — boundary for allowProjectWrites. */
let projectRoot: string | undefined;

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
  isActivePioSession?: boolean;
}) {
  if (state?.allowProjectWrites !== undefined)
    allowProjectWrites = state.allowProjectWrites;
  if (state?.projectRoot !== undefined) projectRoot = state.projectRoot;
  if (state?.writeAllowlistPaths !== undefined)
    writeAllowlistPaths = state.writeAllowlistPaths;
  if (state?.readOnlyFilePaths !== undefined)
    readOnlyFilePaths = state.readOnlyFilePaths;
  if (state?.isActivePioSession !== undefined)
    isActivePioSession = state.isActivePioSession;
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
 * Paths are resolved through CapState.resolvePath() which handles workspace
 * prefix injection, placeholder resolution, and projectRelative paths.
 */
export function validateOutputs(capState: CapState): {
  success: boolean;
  message?: string;
} {
  // biome-ignore lint/complexity/useLiteralKeys: 'params' is a private field — bracket notation required
  const params = capState["params"] as Record<string, unknown> | undefined;

  try {
    const issues: string[] = [];

    for (const entry of capState.contract.outputs) {
      if (!isMarkdownFileSpec(entry)) {
        // OneOfGroup — treat as no-op (deferred to later step)
        continue;
      }

      // Evaluate requiredWhen predicate
      if (
        entry.requiredWhen !== undefined &&
        !entry.requiredWhen(params, capState)
      ) {
        continue;
      }

      // Use CapState.resolvePath for prefix-aware resolution (handles projectRelative internally)
      const fullPath = capState.resolvePath(entry);

      if (!fs.existsSync(fullPath)) {
        issues.push(`Output file '${fullPath}' is missing`);
        continue;
      }

      // Frontmatter validation when schema is declared
      if (entry.schema) {
        const raw = extractFrontmatter(fullPath);
        if (raw === null) {
          issues.push(
            `Output file '${fullPath}' has no valid YAML frontmatter`,
          );
        } else if (!Value.Check(entry.schema, raw)) {
          const errors = [...Value.Errors(entry.schema, raw)];
          const fieldErrors = errors
            .map((e) => {
              const field = e.instancePath
                ? e.instancePath.replace(/^\//, "")
                : "root";
              return `Field '${field}': ${e.message}`;
            })
            .join("; ");
          const schemaDesc = formatSchemaDescription(entry.schema);
          issues.push(
            `Frontmatter validation failed for '${fullPath}': ${fieldErrors}\nExpected frontmatter structure:\n${schemaDesc}`,
          );
        }
      }
    }

    if (issues.length > 0) {
      return { success: false, message: issues.join("\n") };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check that required files exist and excluded files do not exist.
 *
 * Iterates contract.inputs[] first (fail-fast on first missing), then
 * contract.excludedFiles[] (fail-fast on first existing). Returns success only
 * when all checks pass.
 *
 * Paths are resolved through CapState.resolvePath() which handles workspace
 * prefix injection, placeholder resolution, and projectRelative paths.
 *
 * @param capState - CapState wrapping the capability contract with resolution context
 * @returns Success result or failure with descriptive message
 */
export function validateInputs(capState: CapState): {
  success: boolean;
  message?: string;
} {
  try {
    // Check required inputs
    for (const spec of capState.contract.inputs) {
      const fullPath = capState.resolvePath(spec);

      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          message: `Required file missing: ${fullPath}`,
        };
      }

      // Frontmatter validation when schema is declared on the input entry
      if (spec.schema) {
        const raw = extractFrontmatter(fullPath);
        if (raw === null) {
          return {
            success: false,
            message: `Input file '${fullPath}' has no valid YAML frontmatter`,
          };
        }

        if (!Value.Check(spec.schema, raw)) {
          const errors = [...Value.Errors(spec.schema, raw)];
          const messages = errors
            .map((e) => {
              const field = e.instancePath
                ? e.instancePath.replace(/^\//, "")
                : "root";
              return `Field '${field}': ${e.message}`;
            })
            .join("; ");
          const schemaDesc = formatSchemaDescription(spec.schema);
          return {
            success: false,
            message: `Frontmatter validation failed for '${fullPath}': ${messages}\nExpected frontmatter structure:\n${schemaDesc}`,
          };
        }
      }
    }

    // Check excluded files (always non-projectRelative — resolve through CapState with synthetic entry)
    if (capState.contract.excludedFiles) {
      for (const file of capState.contract.excludedFiles) {
        const fullPath = capState.resolvePath({ name: "_excluded", file });
        if (fs.existsSync(fullPath)) {
          return {
            success: false,
            message: `File must not exist: ${fullPath}`,
          };
        }
      }
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Setup — registers event handlers for file protection
// ---------------------------------------------------------------------------

export function setupValidation(pi: ExtensionAPI) {
  // 1. Read validation config on session discovery; reset counters
  pi.on("resources_discover", async (_event, ctx) => {
    const config = await getSessionConfig(ctx);

    if (config) {
      isActivePioSession = true;

      // workspacePrefix is stripped from sessionParams after normalization (Step 9).
      // config.workspaceDir already has the prefix baked in, so CapState.workspacePrefix = undefined.
      const capState = new CapState(
        config.contract,
        // biome-ignore lint/style/noNonNullAssertion: config.workspaceDir is always set when config exists
        config.workspaceDir!,
        config.sessionParams,
      );

      // Resolve read-only file paths through CapState (always non-projectRelative)
      if (config.readOnlyFiles && config.workspaceDir) {
        readOnlyFilePaths = config.readOnlyFiles.map((f) =>
          path.resolve(capState.resolvePath({ name: "_ro", file: f })),
        );
      } else {
        readOnlyFilePaths = [];
      }

      // Start with explicit writeAllowlist from config
      let baseAllowlist: string[] = [];
      if (config.writeAllowlist && config.workspaceDir) {
        baseAllowlist = config.writeAllowlist.map((f) =>
          path.resolve(capState.resolvePath({ name: "_wl", file: f })),
        );
      }

      // Auto-derive from contract outputs — "zero manual configuration per capability"
      // Uses CapState.resolvePath() which handles projectRelative: true entries
      // (resolves to .pio/PROJECT/* via global pioRootDir).
      const contractOutputPaths: string[] = [];
      if (config.contract?.outputs) {
        for (const entry of config.contract.outputs) {
          if (isMarkdownFileSpec(entry)) {
            contractOutputPaths.push(path.resolve(capState.resolvePath(entry)));
          }
        }
      }

      writeAllowlistPaths = [
        ...new Set([...baseAllowlist, ...contractOutputPaths]),
      ];

      allowProjectWrites = config.allowProjectWrites ?? false;

      // Project root boundary for allowProjectWrites — constrains writes to project workspace
      projectRoot = path.resolve(ctx.cwd ?? process.cwd());
    } else {
      // Not a pio sub-session — reset all state to prevent stale restrictions from leaking
      isActivePioSession = false;
      writeAllowlistPaths = [];
      readOnlyFilePaths = [];
      allowProjectWrites = false;

      projectRoot = undefined;
    }
  });

  // 3. File protection: unified write check + read-only blocklist fallback
  pi.on("tool_call", async (event) => {
    // Skip if not in a pio sub-session — regular sessions should not be restricted
    if (!isActivePioSession) return;

    const input = event.input as Record<string, unknown> | undefined;

    // Collect all target file paths from write tools (done once)
    let targetPaths: string[] = [];

    if (event.toolName === "write" && typeof input?.path === "string") {
      targetPaths = [path.resolve(input.path)];
    } else if (event.toolName === "edit" && typeof input?.path === "string") {
      targetPaths = [path.resolve(input.path)];
    } else if (
      event.toolName === "vscode_apply_workspace_edit" &&
      Array.isArray(input?.edits)
    ) {
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
      if (
        allowProjectWrites &&
        !tp.includes("/.pio/") &&
        projectRoot &&
        tp.startsWith(`${projectRoot}/`)
      )
        continue;

      // Allowed: /tmp/ writes (temporary scratch files)
      if (tp.startsWith("/tmp/")) continue;

      // Block everything else — always list what IS allowed to guide the agent
      return {
        block: true,
        reason: buildAllowanceMessage(writeAllowlistPaths, allowProjectWrites),
      };
    }

    // Read-only blocklist — final fallback (blocks writes to explicitly read-only files)
    if (readOnlyFilePaths.length > 0) {
      for (const tp of targetPaths) {
        if (readOnlyFilePaths.includes(tp)) {
          return {
            block: true,
            reason: `${tp} is read-only during this session. If you need changes to this file, flag them to the user and do not modify it.`,
          };
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Helper — build helpful error message listing all permitted write categories
// ---------------------------------------------------------------------------

function buildAllowanceMessage(
  allowlist: string[],
  hasProjectWrites: boolean,
): string {
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
