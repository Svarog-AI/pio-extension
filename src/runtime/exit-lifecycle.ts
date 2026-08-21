/**
 * Exit lifecycle — reusable capability exit logic extracted from the
 * `pio_mark_complete` tool body.
 *
 * Runs mark-complete Steps 1–5 with verbatim logic and order:
 *   Step 1  output validation (existence + frontmatter schemas)
 *   Step 2  postValidate hook (can fail to keep the session alive)
 *   Step 3  transition routing + task enqueuing (+ resolver cleanup[])
 *   Step 4a marker engine (create/clean up marker files)
 *   Step 4b postExecute hook (non-fatal errors)
 *   Step 5  fileCleanup (delete declared absolute paths)
 *
 * Engine-callable and stateless: receives a `CapabilityConfig` as a parameter
 * and owns no session state — in particular it does NOT set
 * `markCompleteCalled` (the caller's responsibility) and never throws for
 * flow-control reasons (guards return failure results).
 *
 * Copy-not-move: the duplicated logic in the tool body is deleted later; until
 * then both copies must stay character-faithful.
 */

import * as fs from "node:fs";
import { CapState } from "../capability-state";
import { applyMarkers } from "../guards/mark-complete";
import { validateOutputs } from "../guards/validation";
import { enqueueTask } from "../queues";
import { dispatch, getMachine, recordTransition } from "../state-machines";
import type { CapabilityConfig } from "../types";

// ---------------------------------------------------------------------------
// Exit lifecycle result
// ---------------------------------------------------------------------------

/**
 * Result of a capability exit-lifecycle run.
 *
 * - Success: `message` is the standard validation-passed text; `notification`
 *   is the enqueue/multi-transition line or `undefined` (empty normalized away).
 * - Failure: `message` is the reason (raw validation message, postValidate
 *   message/throw text, or the missing-workspaceDir text). No side effects
 *   before Step 1 ran.
 */
export interface ExitResult {
  success: boolean;
  message?: string;
  notification?: string;
}

// ---------------------------------------------------------------------------
// runExitLifecycle — Steps 1–5 of the capability exit
// ---------------------------------------------------------------------------

/**
 * Run the full capability exit lifecycle for a completing session.
 *
 * @param config - The completing session's capability config (passed in — this
 *   module performs no config lookup and mutates no session state).
 * @returns Exit result; never throws for flow-control reasons.
 */
export async function runExitLifecycle(
  config: CapabilityConfig,
): Promise<ExitResult> {
  const dir = config.workspaceDir;

  // No workspaceDir — can't do anything meaningful (verbatim tool-body text)
  if (!dir) {
    return {
      success: false,
      message:
        "No directory is defined for this session. Something went wrong.",
    };
  }

  // Use the completing session's params directly — they are authoritative.
  const sessionParams = config.sessionParams || {};

  // Read queueKey from session params (set by the state machine).
  // Guard sits before Step 1; engine-side skip instead of a throw.
  const queueKey =
    typeof sessionParams.queueKey === "string"
      ? sessionParams.queueKey
      : undefined;
  if (!queueKey) {
    console.error(
      "mark-complete: queueKey missing from session params — ensure enqueue provides it",
    );
    return {
      success: true,
      notification: "(skipped transition: queueKey missing)",
    };
  }

  // Step 1. Output validation (existence + frontmatter schema — single call)
  const capState = new CapState(config.contract, dir, config.sessionParams);
  const outputsResult = validateOutputs(capState);

  if (!outputsResult.success) {
    return { success: false, message: outputsResult.message };
  }

  // Step 2. PostValidate hook — can fail to keep agent in session
  if (config.postValidate) {
    try {
      const postValidateResult = config.postValidate(dir, sessionParams);
      if (!postValidateResult.success) {
        return {
          success: false,
          message: postValidateResult.message || "Post-validation failed.",
        };
      }
    } catch (err) {
      return { success: false, message: `Post-validation error: ${err}` };
    }
  }

  let notification = "";

  // Step 3. Transition routing + task enqueuing
  const capability = config.capability;

  // Multi-machine dispatch: read stateMachineId from session params, look up machine explicitly.
  // Falls back to dispatch(undefined, ...) for first transitions or legacy sessions.
  const machineId =
    typeof sessionParams.stateMachineId === "string"
      ? sessionParams.stateMachineId
      : undefined;
  const targetMachine = machineId ? getMachine(machineId) : undefined;

  const results = capability
    ? dispatch(targetMachine, capability, { workspaceDir: dir }, sessionParams)
    : [];

  if (capability && results.length === 1) {
    const nextTask = results[0];
    try {
      // adjustedParams from resolve functions already contain the correct values
      // (stepNumber, queueKey, etc.) — pass through as-is
      const adjustedParams = nextTask.params || {};

      // Enriched params: same object passed to both enqueueTask and recordTransition
      // so transitions.json accurately reflects what was actually dispatched.
      // sessionName is required on TransitionResult; additionalContext is optional.
      // previousCapability identifies the completing capability for downstream resolvers.
      const enrichedParams = {
        ...adjustedParams,
        stateMachineId: nextTask.stateMachineId,
        sessionName: nextTask.sessionName,
        additionalContext: nextTask.additionalContext,
        previousCapability: capability,
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

      notification = `Next task enqueued: ${nextTask.capability}. Use \`/pio-next-task\` to start the sub-session.`;
    } catch (err) {
      console.warn(`pio: failed to enqueue next task: ${err}`);
    }

    // Apply resolver-declared cleanup — delete input files consumed by this transition
    if (Array.isArray(nextTask.cleanup) && nextTask.cleanup.length > 0) {
      for (const specName of nextTask.cleanup) {
        const resolved = capState.tryResolveInput(specName);
        if (!resolved) {
          console.warn(
            `pio: cleanup — input '${specName}' not found in capability "${capability}" contract`,
          );
          continue;
        }
        try {
          fs.rmSync(resolved.path, { force: true });
          console.log(`pio: cleaned up transition artifact: ${resolved.path}`);
        } catch (err) {
          console.warn(`pio: failed to clean up '${resolved.path}': ${err}`);
        }
      }
    }
  } else if (capability && results.length > 1) {
    const capabilities = results.map((r) => r.capability).join(", ");
    notification = `Multiple transitions available: ${capabilities}. Transition is not supported at the moment and will be reimplemented. Transition manually via tool call.`;
  }

  // Step 4a. Marker engine — create/clean up marker files based on frontmatter
  // Runs before postExecute so markers exist when capability-specific logic runs.
  if (config.contract.markers && config.contract.markers.length > 0) {
    applyMarkers(dir, config.contract, sessionParams);
  }

  // Step 4b. PostExecute hook — runs after transitions, errors are non-fatal
  if (config.postExecute) {
    try {
      const postExecuteResult = config.postExecute(
        dir,
        sessionParams,
        capState,
      );
      if (postExecuteResult instanceof Promise) {
        await postExecuteResult;
      }
    } catch (err) {
      console.warn(
        `pio: postExecute failed for capability "${config.capability}": ${err}`,
      );
    }
  }

  // Step 5. Cleanup files declared in config.fileCleanup
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
    success: true,
    message: "Validation passed. All expected outputs have been produced.",
    notification: notification || undefined,
  };
}
