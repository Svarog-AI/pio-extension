import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability, getSessionGoalName } from "./session-capability";
import { resolveCapabilityConfig, queueDir, readPendingTask, listPendingGoals, type SessionQueueTask } from "../utils";

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function handleNextTask(args: string | undefined, ctx: ExtensionCommandContext) {
  const dir = queueDir(ctx.cwd);

  // Case 1: goal name provided — read specific per-goal file
  if (args && args.trim()) {
    const goalName = args.trim();
    const task = readPendingTask(ctx.cwd, goalName);

    if (!task) {
      ctx.ui.notify(`No pending task for goal "${goalName}".`, "info");
      return;
    }

    await launchAndCleanup(ctx, dir, goalName, task);
    return;
  }

  // Case 2: no arg, but session has goalName from pio-config — use it directly
  const sessionGoalName = getSessionGoalName();
  if (sessionGoalName) {
    const task = readPendingTask(ctx.cwd, sessionGoalName);

    if (!task) {
      ctx.ui.notify(`No pending task for goal "${sessionGoalName}".`, "info");
      return;
    }

    await launchAndCleanup(ctx, dir, sessionGoalName, task);
    return;
  }

  // Case 3: no arg, no session goalName — scan all pending goals and auto-launch if exactly one
  const pendingGoals = listPendingGoals(ctx.cwd);

  if (pendingGoals.length === 0) {
    ctx.ui.notify("No tasks queued.", "info");
    return;
  }

  if (pendingGoals.length === 1) {
    const goalName = pendingGoals[0];
    const task = readPendingTask(ctx.cwd, goalName);
    if (!task) {
      ctx.ui.notify(`No pending task for goal "${goalName}".`, "info");
      return;
    }

    await launchAndCleanup(ctx, dir, goalName, task);
    return;
  }

  // Multiple goals pending — notify user to specify which one
  const list = pendingGoals.map((g) => `  - ${g}`).join("\n");
  ctx.ui.notify(`Multiple goals have pending tasks. Specify a goal:\n/pio-next-task <goal-name>\n\nPending: \n${list}`, "info");
}

/**
 * Resolve config, launch the capability session, and delete the queue file.
 */
async function launchAndCleanup(
  ctx: ExtensionCommandContext,
  dir: string,
  goalName: string,
  task: SessionQueueTask,
) {
  const filePath = path.join(dir, `task-${goalName}.json`);

  try {
    const config = await resolveCapabilityConfig(ctx.cwd, { ...task.params, capability: task.capability });
    if (!config) {
      ctx.ui.notify(`Unknown capability "${task.capability}" in queued task.`, "error");
      return;
    }
    await launchCapability(ctx, config);
  } catch (err) {
    console.error(`pio-next-task: failed to launch ${task.capability} for goal "${goalName}"`, err);
    ctx.ui.notify(`Failed to start ${task.capability}: ${err instanceof Error ? err.message : String(err)}`, "error");
  } finally {
    // Always remove the task file — avoid stuck tasks on error
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore — file may already be gone or locked
    }
  }
}

// ---------------------------------------------------------------------------
// Setup (registers command)
// ---------------------------------------------------------------------------

export function setupNextTask(pi: ExtensionAPI) {
  pi.registerCommand("pio-next-task", {
    description: "Process the pending session task",
    handler: handleNextTask,
  });
}
