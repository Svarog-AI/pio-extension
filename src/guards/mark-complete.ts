import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { CapState } from "../capability-state";
import { getSessionConfig } from "../capability-utils";
import { extractFrontmatter } from "../frontmatter";
import { enqueueTask } from "../queues";
import { dispatch, getMachine, recordTransition } from "../state-machines";
import type { CapabilityContract } from "../types";
import { validateOutputs } from "./validation";

// ---------------------------------------------------------------------------
// Marker engine — reads frontmatter from output files and creates marker files
// ---------------------------------------------------------------------------

/**
 * Iterate over `contract.markers` and create/clean up marker files based on
 * frontmatter field values.
 *
 * For each marker declaration:
 * 1. Look up the output file by name in contract outputs
 * 2. Read frontmatter from that file
 * 3. Extract the field value and look up the marker filename
 * 4. Delete all stale markers from the values mapping
 * 5. Create the matched marker file (if value found)
 *
 * All errors are non-fatal — warnings are logged via console.warn.
 *
 * @param workspaceDir - Absolute path to the workspace directory
 * @param contract - Capability contract with markers declarations
 * @param params - Optional session params for placeholder resolution
 */
export function applyMarkers(
  workspaceDir: string,
  contract: CapabilityContract,
  params?: Record<string, unknown>,
): void {
  if (!contract.markers || contract.markers.length === 0) {
    return;
  }

  const capState = new CapState(contract, workspaceDir, params);

  for (const markerDeclaration of contract.markers) {
    try {
      // 1. Look up output file by name (O(1) via CapState internal map)
      const resolved = capState.tryResolveOutput(markerDeclaration.outputFile);
      if (!resolved) {
        console.warn(
          `pio: applyMarkers — output '${markerDeclaration.outputFile}' not found in contract`,
        );
        continue;
      }

      const { path: resolvedPath } = resolved;

      // 2. Read frontmatter (CapState typed read + raw fallback)
      let frontmatter: Record<string, unknown> | null = null;

      try {
        const fileState = capState.output<Record<string, unknown>>(
          markerDeclaration.outputFile,
        );
        if (fileState.exists()) {
          frontmatter = fileState.read();
        }
      } catch {
        // CapState.output throws if name not found — already handled above
      }

      // Fallback: raw extraction if CapState returned null
      if (frontmatter === null) {
        frontmatter = extractFrontmatter(resolvedPath);
      }

      if (frontmatter === null) {
        console.warn(
          `pio: applyMarkers — could not read frontmatter from '${resolvedPath}'`,
        );
        continue;
      }

      // 3. Extract field value
      const fieldValue = frontmatter[markerDeclaration.field];
      if (fieldValue === undefined) {
        console.warn(
          `pio: applyMarkers — field '${markerDeclaration.field}' not found in frontmatter of '${markerDeclaration.outputFile}'`,
        );
        continue;
      }

      const fieldValueStr = String(fieldValue);
      const markerFileName = markerDeclaration.values[fieldValueStr];

      // 4. Always delete stale markers (all values in the mapping)
      for (const staleMarker of Object.values(markerDeclaration.values)) {
        try {
          fs.rmSync(path.join(workspaceDir, staleMarker), { force: true });
        } catch {
          // ignore delete errors
        }
      }

      // 5. Create matched marker or warn if unknown value
      if (markerFileName) {
        fs.writeFileSync(path.join(workspaceDir, markerFileName), "", "utf-8");
      } else {
        console.warn(
          `pio: applyMarkers — unknown value '${fieldValueStr}' for field '${markerDeclaration.field}' in marker declaration`,
        );
      }
    } catch (err) {
      console.warn(
        `pio: applyMarkers — error processing marker declaration '${markerDeclaration.outputFile}': ${err}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// pio_mark_complete tool — orchestrates the full capability exit lifecycle
// ---------------------------------------------------------------------------

export const markCompleteTool = defineTool({
  name: "pio_mark_complete",
  label: "Pio Mark Complete",
  description:
    "Signal that your work is done. Validates that all expected output files have been produced and auto-enqueues the next workflow task.",
  promptSnippet:
    "Signal that your work is done. Validates expected output files.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    const config = await getSessionConfig(ctx);

    // No config — not a capability session, always pass
    if (!config) {
      return {
        content: [
          {
            type: "text",
            text: "No validation rules configured for this session.",
          },
        ],
        details: {},
        terminate: true,
      };
    }
    const dir = config.workspaceDir;

    // No workspaceDir — can't do anything meaningful, pass and terminate
    if (!dir) {
      return {
        content: [
          {
            type: "text",
            text: "No directory is defined for this session. Something went wrong.",
          },
        ],
        details: {},
        terminate: true,
      };
    }

    // Use the completing session's params directly — they are authoritative.
    const sessionParams = config.sessionParams || {};

    // Read queueKey from session params (set by the state machine)
    const queueKey =
      typeof sessionParams.queueKey === "string"
        ? sessionParams.queueKey
        : undefined;
    if (!queueKey) {
      throw new Error(
        `mark-complete: queueKey missing from session params — ensure enqueue provides it`,
      );
    }

    // config.workspaceDir is already the resolved directory (includes workspacePrefix).
    // workspacePrefix is stripped from sessionParams during normalization.
    // Use `dir` (= config.workspaceDir) everywhere — it's the resolved workspace directory.

    // 1. Output validation (existence + frontmatter schema — single call)
    // workspacePrefix is stripped from sessionParams during normalization.
    // workspaceDir already has the prefix baked in, so CapState.workspacePrefix = undefined.
    const capState = new CapState(config.contract, dir, config.sessionParams);
    const outputsResult = validateOutputs(capState);

    if (!outputsResult.success) {
      return {
        content: [
          {
            type: "text",
            text: `Validation failed: ${outputsResult.message}\n\nProduce these files and call pio_mark_complete again.`,
          },
        ],
        details: {},
      };
    }

    // 2. PostValidate hook — can fail to keep agent in session
    if (config.postValidate) {
      try {
        const postValidateResult = config.postValidate(dir, sessionParams);
        if (!postValidateResult.success) {
          return {
            content: [
              {
                type: "text",
                text: postValidateResult.message || "Post-validation failed.",
              },
            ],
            details: {},
          };
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: `Post-validation error: ${err}` }],
          details: {},
        };
      }
    }

    let notification = "";

    // 3. Transition routing + task enqueuing
    const capability = config.capability;

    // Multi-machine dispatch: read stateMachineId from session params, look up machine explicitly.
    // Falls back to dispatch(undefined, ...) for first transitions or legacy sessions.
    const machineId =
      typeof sessionParams.stateMachineId === "string"
        ? sessionParams.stateMachineId
        : undefined;
    const targetMachine = machineId ? getMachine(machineId) : undefined;

    const results = capability
      ? dispatch(
          targetMachine,
          capability,
          { workspaceDir: dir },
          sessionParams,
        )
      : [];

    if (capability && results.length === 1) {
      const nextTask = results[0];
      try {
        // adjustedParams from resolve functions already contain the correct values
        // (stepNumber, queueKey, etc.) — pass through as-is
        const adjustedParams = nextTask.params || {};

        // Enriched params: same object passed to both enqueueTask and recordTransition
        // so transitions.json accurately reflects what was actually dispatched.
        // sessionName and initialMessage are required on TransitionResult — propagate unconditionally.
        const enrichedParams = {
          ...adjustedParams,
          stateMachineId: nextTask.stateMachineId,
          sessionName: nextTask.sessionName,
          initialMessage: nextTask.initialMessage,
        };

        // Queue key for scheduling: use adjustedParams.queueKey if set (e.g. subgoal → parent),
        // otherwise fall back to completing session's own key.
        const nextQueueKey =
          typeof adjustedParams.queueKey === "string"
            ? adjustedParams.queueKey
            : queueKey;

        enqueueTask(process.cwd(), nextQueueKey, {
          capability: nextTask.capability,
          params: enrichedParams,
        });

        // Record transition audit entry with enriched params
        recordTransition(dir, capability, nextTask, enrichedParams);

        notification = `\n\nNext task enqueued: ${nextTask.capability}. Use \`/pio-next-task\` to start the sub-session.`;
      } catch (err) {
        console.warn(`pio: failed to enqueue next task: ${err}`);
      }
    } else if (capability && results.length > 1) {
      const capabilities = results.map((r) => r.capability).join(", ");
      notification = `\n\nMultiple transitions available: ${capabilities}. Transition is not supported at the moment and will be reimplemented. Transition manually via tool call.`;
    }

    // 4a. Marker engine — create/clean up marker files based on frontmatter
    // Runs before postExecute so markers exist when capability-specific logic runs.
    if (config.contract.markers && config.contract.markers.length > 0) {
      applyMarkers(dir, config.contract, sessionParams);
    }

    // 4b. PostExecute hook — runs after transitions, errors are non-fatal
    if (config.postExecute) {
      try {
        const postExecuteResult = config.postExecute(dir, sessionParams);
        if (postExecuteResult instanceof Promise) {
          await postExecuteResult;
        }
      } catch (err) {
        console.warn(
          `pio: postExecute failed for capability "${config.capability}": ${err}`,
        );
      }
    }

    // 5. Cleanup files declared in config.fileCleanup
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

    return {
      content: [
        {
          type: "text",
          text: `Validation passed. All expected outputs have been produced.${notification}`,
        },
      ],
      details: {},
      terminate: true,
    };
  },
});

// ---------------------------------------------------------------------------
// Setup — registers the pio_mark_complete tool
// ---------------------------------------------------------------------------

export function setupMarkComplete(pi: ExtensionAPI): void {
  pi.registerTool(markCompleteTool);
}
