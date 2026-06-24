import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability, getSessionParams } from "../capability-session";
import { queueDir, readPendingTask, listPendingTasks, type SessionQueueTask } from "../queues";
import { resolveCapabilityConfig } from "../capability-config";

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function handleNextTask(args: string | undefined, ctx: ExtensionCommandContext) {
  const dir = queueDir(ctx.cwd);

  // Case 1: queue key provided — read specific queue file
  if (args && args.trim()) {
    const queueKey = args.trim();
    const task = readPendingTask(ctx.cwd, queueKey);

    if (!task) {
      ctx.ui.notify(`No pending task for "${queueKey}".`, "info");
      return;
    }

    await launchAndCleanup(ctx, dir, queueKey, task);
    return;
  }

  // Case 2: no arg, but session has queueKey from pio-config — use it directly
  const params = getSessionParams();
  const queueKey = typeof params?.queueKey === "string" ? params.queueKey : undefined;
  if (queueKey) {
    const task = readPendingTask(ctx.cwd, queueKey);

    if (!task) {
      ctx.ui.notify(`No pending task for "${queueKey}".`, "info");
      return;
    }

    await launchAndCleanup(ctx, dir, queueKey, task);
    return;
  }

  // Case 3: no arg, no session goalName — scan all pending tasks and auto-launch if exactly one
  const pendingTasks = listPendingTasks(ctx.cwd);

  if (pendingTasks.length === 0) {
    ctx.ui.notify("No tasks queued.", "info");
    return;
  }

  if (pendingTasks.length === 1) {
    const queueKey = pendingTasks[0];
    const task = readPendingTask(ctx.cwd, queueKey);
    if (!task) {
      ctx.ui.notify(`No pending task for "${queueKey}".`, "info");
      return;
    }

    await launchAndCleanup(ctx, dir, queueKey, task);
    return;
  }

  // Multiple tasks pending — notify user to specify which one
  const list = pendingTasks.map((k) => `  - ${k}`).join("\n");
  ctx.ui.notify(`Multiple tasks have pending queues. Specify a queue key:\n/pio-next-task <queue-key>\n\nPending: \n${list}`, "info");
}

/**
 * Resolve config, launch the capability session, and delete the queue file.
 */
async function launchAndCleanup(
  ctx: ExtensionCommandContext,
  dir: string,
  queueKey: string,
  task: SessionQueueTask,
) {
  const filePath = path.join(dir, `task-${queueKey}.json`);

  try {
    const config = await resolveCapabilityConfig(ctx.cwd, { ...task.params, capability: task.capability });
    if (!config) {
      ctx.ui.notify(`Unknown capability "${task.capability}" in queued task.`, "error");
      return;
    }
    await launchCapability(ctx, config);
  } catch (err) {
    console.error(`pio-next-task: failed to launch ${task.capability} for "${queueKey}"`, err);
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
