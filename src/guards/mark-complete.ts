import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import { getSessionConfig } from "../capability-utils";
import { validateOutputs } from "./validation";
import { dispatch, getMachine, recordTransition } from "../state-machines";
import { enqueueTask } from "../queues";

// ---------------------------------------------------------------------------
// pio_mark_complete tool — orchestrates the full capability exit lifecycle
// ---------------------------------------------------------------------------

export const markCompleteTool = defineTool({
  name: "pio_mark_complete",
  label: "Pio Mark Complete",
  description: "Signal that your work is done. Validates that all expected output files have been produced and auto-enqueues the next workflow task.",
  promptSnippet: "Signal that your work is done. Validates expected output files.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    const config = await getSessionConfig(ctx);

    // No config — not a capability session, always pass
    if (!config) {
      return { content: [{ type: "text", text: "No validation rules configured for this session." }], details: {}, terminate: true };
    }
    const dir = config.workingDir;

    // No workingDir — can't do anything meaningful, pass and terminate
    if (!dir) {
      return { content: [{ type: "text", text: "No directory is defined for this session. Something went wrong." }], details: {}, terminate: true };
    }

    // Use the completing session's params directly — they are authoritative.
    const sessionParams = config.sessionParams || {};

    // Read queueKey from session params (set by the state machine)
    const queueKey = typeof sessionParams.queueKey === "string"
      ? sessionParams.queueKey
      : undefined;
    if (!queueKey) {
      throw new Error(
        `mark-complete: queueKey missing from session params — ensure enqueue provides it`,
      );
    }

    // config.workingDir is already the resolved directory (includes workspacePrefix).
    // After Step 9 normalization, workspacePrefix is stripped from sessionParams.
    // Use `dir` (= config.workingDir) everywhere — it's the resolved workspace directory.

    // 1. Output validation (existence + frontmatter schema — single call)
    // validateOutputs falls back to joining baseDir + contractPath when workspacePrefix is absent
    const outputsResult = validateOutputs(config.contract, dir, sessionParams);

    if (!outputsResult.success) {
      return { content: [{ type: "text", text: `Validation failed: ${outputsResult.message}\n\nProduce these files and call pio_mark_complete again.` }], details: {} };
    }

    // 2. PostValidate hook — can fail to keep agent in session
    if (config.postValidate) {
      try {
        const postValidateResult = config.postValidate(dir, sessionParams);
        if (!postValidateResult.success) {
          return { content: [{ type: "text", text: postValidateResult.message || "Post-validation failed." }], details: {} };
        }
      } catch (err) {
        return { content: [{ type: "text", text: `Post-validation error: ${err}` }], details: {} };
      }
    }

    let notification = "";

    // 3. Transition routing + task enqueuing
    const capability = config.capability;

    // Use explicit stepNumber from session params — authoritative for the completing step.
    const stepNumber = typeof sessionParams.stepNumber === "number"
      ? sessionParams.stepNumber
      : undefined;

    // Multi-machine dispatch: read stateMachineId from session params, look up machine explicitly.
    // Falls back to dispatch(undefined, ...) for first transitions or legacy sessions.
    const machineId = typeof sessionParams.stateMachineId === "string"
      ? sessionParams.stateMachineId
      : undefined;
    const targetMachine = machineId ? getMachine(machineId) : undefined;

    const results = capability
      ? dispatch(targetMachine, capability, { baseDir: dir }, sessionParams)
      : [];

    if (capability && results.length === 1) {
      const nextTask = results[0];
      try {
        // Use adjusted params from the transition (may contain incremented stepNumber)
        const adjustedParams = nextTask.params || {};

        // After spreading adjusted params, explicitly set stepNumber last
        // to guarantee it appears at top level (cannot be shadowed by nested _sessionContext).
        const finalStepNumber = typeof adjustedParams.stepNumber === "number"
          ? adjustedParams.stepNumber
          : stepNumber;

        // Enriched params: same object passed to both enqueueTask and recordTransition
        // so transitions.json accurately reflects what was actually dispatched.
        const enrichedParams = {
          ...adjustedParams,
          _sessionContext: sessionParams,
          ...(finalStepNumber != null ? { stepNumber: finalStepNumber } : {}),
          stateMachineId: nextTask.stateMachineId,
        };

        // Queue key for scheduling: use adjustedParams.queueKey if set (e.g. subgoal → parent),
        // otherwise fall back to completing session's own key.
        const nextQueueKey = typeof adjustedParams.queueKey === "string"
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
      notification = `\n\nMultiple transitions available: ${capabilities}. Use \`/pio-transition\` to select one.`;
    }

    // 4. PostExecute hook — runs after transitions, errors are non-fatal
    if (config.postExecute) {
      try {
        const postExecuteResult = config.postExecute(dir, sessionParams);
        if (postExecuteResult instanceof Promise) {
          await postExecuteResult;
        }
      } catch (err) {
        console.warn(`pio: postExecute failed for capability "${config.capability}": ${err}`);
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

    return { content: [{ type: "text", text: `Validation passed. All expected outputs have been produced.${notification}` }], details: {}, terminate: true };
  },
});

// ---------------------------------------------------------------------------
// Setup — registers the pio_mark_complete tool
// ---------------------------------------------------------------------------

export function setupMarkComplete(pi: ExtensionAPI): void {
  pi.registerTool(markCompleteTool);
}
