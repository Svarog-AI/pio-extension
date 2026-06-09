import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import type { CapabilityConfig } from "../types";
import { getSessionConfig } from "../capability-utils";
import { validateOutputs, validateFrontmatter } from "./validation";
import { dispatch, getMachine } from "../state-machines";
import { recordTransition } from "../state-machines";
import { createGoalState } from "../goal-state";
import { enqueueTask, writeLastTask } from "../queues";

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
    const config = getSessionConfig(ctx);

    // No config — not a capability session, always pass
    if (!config) {
      return { content: [{ type: "text", text: "No validation rules configured for this session." }], details: {}, terminate: true };
    }
    const dir = config.workingDir;

    // No workingDir — can't do anything meaningful, pass and terminate
    if (!dir) {
      return { content: [{ type: "text", text: "No directory is defined for this session. Something went wrong." }], details: {}, terminate: true };
    }

    // 1. File-existence validation (generic, optional)
    if (config.validation) {
      const result = validateOutputs(config.validation, dir);

      if (!result.passed) {
        return { content: [{ type: "text", text: `Validation failed. Missing files:\n- ${result.missing.join("\n- ")}\n\nProduce these files and call pio_mark_complete again.` }], details: {} };
      }
    }

    // 1.5 Frontmatter schema validation (new)
    if (config.frontmatterSchemas && config.frontmatterSchemas.length > 0) {
      const fmResult = validateFrontmatter(config.frontmatterSchemas, dir);
      if (!fmResult.success) {
        return { content: [{ type: "text", text: `Frontmatter validation failed: ${fmResult.message}` }], details: {} };
      }
    }

    // 2. PostValidate hook — can fail to keep agent in session
    if (config.postValidate) {
      try {
        const postValidateResult = config.postValidate(dir, config.sessionParams);
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

    // Use the completing session's params directly — they are authoritative.
    const sessionParams = config.sessionParams || {};

    // GoalState is the single source of truth for goalName and stepNumber
    const state = createGoalState(dir);
    const goalName = state.goalName;

    // Use explicit stepNumber from session params first (authoritative for the completing step).
    // Fall back to state.currentStepNumber() only if not explicitly provided.
    // This is critical: postValidate may create APPROVED/REJECTED markers that change
    // currentStepNumber() before we read it (e.g., APPROVED for step 1 makes it return 2).
    const explicitStepNumber = typeof sessionParams.stepNumber === "number"
      ? sessionParams.stepNumber
      : undefined;
    const stepNumber = explicitStepNumber ?? state.currentStepNumber();

    // Multi-machine dispatch: read stateMachineId from session params, look up machine explicitly.
    // Falls back to dispatch(undefined, ...) for first transitions or legacy sessions.
    const machineId = typeof sessionParams.stateMachineId === "string"
      ? sessionParams.stateMachineId
      : undefined;
    const targetMachine = machineId ? getMachine(machineId) : undefined;

    const results = capability
      ? dispatch(targetMachine, capability, state, { goalName, stepNumber, _sessionContext: sessionParams })
      : [];

    if (capability && results.length === 1) {
      const nextTask = results[0];
      try {
        // Use adjusted params from the transition (may contain incremented stepNumber)
        const adjustedParams = nextTask.params || {};

        // After spreading adjusted params and _sessionContext, explicitly set stepNumber last
        // to guarantee it appears at top level (cannot be shadowed by nested _sessionContext).
        const finalStepNumber = typeof adjustedParams.stepNumber === "number"
          ? adjustedParams.stepNumber
          : stepNumber;

        // For subgoals completing via finalize-goal, resolveFinalizeGoalToEvolvePlan sets
        // goalName to parentGoalName in returned params. Use this as the queue key
        // to restore the parent workflow slot. For flat goals, this equals state.goalName.
        const queueGoalName = typeof adjustedParams.goalName === "string"
          ? adjustedParams.goalName
          : goalName;

        enqueueTask(process.cwd(), queueGoalName, {
          capability: nextTask.capability,
          params: {
            goalName,
            ...adjustedParams,
            _sessionContext: sessionParams,
            ...(finalStepNumber != null ? { stepNumber: finalStepNumber } : {}),
            ...(nextTask.stateMachineId ? { stateMachineId: nextTask.stateMachineId } : {}),
          },
        });

        // Record transition audit entry
        recordTransition(dir, capability, nextTask);

        // Record the completed task in the goal directory
        // dir IS the goal directory (config.workingDir) — no need to resolve it again
        writeLastTask(dir, {
          capability,
          params: { goalName, ...(stepNumber != null ? { stepNumber } : {}), _sessionContext: sessionParams },
        });

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
        const postExecuteResult = config.postExecute(dir, config.sessionParams);
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
