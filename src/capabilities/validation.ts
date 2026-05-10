import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ValidationRule } from "../types";
import { CAPABILITY_TRANSITIONS, enqueueTask } from "../utils";

// Re-export for backward compatibility
export type { ValidationRule };

/** Result of a validation run. */
interface ValidationResult {
  passed: boolean;
  missing: string[];
}

// ---------------------------------------------------------------------------
// Module-level cache (per-session, populated by resources_discover)
// ---------------------------------------------------------------------------

let validationRules: ValidationRule | undefined;
let baseDir: string | undefined;
let readOnlyFilePaths: string[] = [];
let writeAllowlistPaths: string[] = [];

/** True after we've already warned once and let the switch through. */
let warnedOnce = false;

/** Total warnings sent this session — capped to avoid infinite loops. */
let warningsThisSession = 0;

/** Hard limit on total exit-gate warnings per session. */
const MAX_WARNINGS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the goal name from a workingDir path like `.pio/goals/my-feature/`. */
function extractGoalName(workingDir: string): string {
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
  description: "Signal that your work is done. Validates that all expected output files have been produced.",
  promptSnippet: "Signal that your work is done. Validates expected output files.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    const entries = ctx.sessionManager.getEntries();
    const entry = entries.find(
      (e) => e.type === "custom" && e.customType === "pio-config",
    );

    // No config — not a capability session, always pass
    if (!entry || entry.type !== "custom") {
      return { content: [{ type: "text", text: "No validation rules configured for this session." }], details: {} };
    }

    const config = entry.data as { capability?: string; workingDir?: string; validation?: ValidationRule; fileCleanup?: string[] };
    const rules = config.validation;
    const dir = config.workingDir;

    // No validation rules defined — always pass
    if (!rules || !dir) {
      return { content: [{ type: "text", text: "No validation rules configured for this session." }], details: {} };
    }

    const result = validateOutputs(rules, dir);

    if (result.passed) {
      let notification = "";

      // Auto-enqueue next task (single-slot, overwrites any existing pending task)
      const capability = config.capability;
      const cwd = process.cwd();
      const goalName = extractGoalName(dir);

      const nextCapability = capability ? CAPABILITY_TRANSITIONS[capability] : undefined;
      if (nextCapability) {
        try {
          enqueueTask(cwd, {
            capability: nextCapability,
            params: { goalName },
          });

          notification = `\n\nNext task enqueued: ${nextCapability}. Run /pio-next-task to start it.`;
        } catch (err) {
          console.warn(`pio: failed to enqueue next task: ${err}`);
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

      return { content: [{ type: "text", text: `Validation passed. All expected outputs have been produced.${notification}` }], details: {} };
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

    const config = entry.data as { workingDir?: string; validation?: ValidationRule; readOnlyFiles?: string[]; writeAllowlist?: string[] };
    validationRules = config.validation;
    baseDir = config.workingDir;

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
        if (!writeAllowlistPaths.includes(tp)) {
          return { block: true, reason: `Writing to .pio/ files is not allowed. These files are managed by the pio workflow and should not be modified directly from this session.` };
        }
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
