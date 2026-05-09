import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability } from "./session-capability";
import { resolveCapabilityConfig, queueDir, type SessionQueueTask } from "../utils";

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleNextTask(_args: string | undefined, ctx: ExtensionCommandContext) {
  const dir = queueDir(ctx.cwd);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

  if (files.length === 0) {
    ctx.ui.notify("No tasks queued.", "info");
    return;
  }

  // Process the oldest file (timestamps in filenames ensure lexicographic = chronological order)
  const oldest = files[0];
  const filePath = path.join(dir, oldest);
  const raw = fs.readFileSync(filePath, "utf-8");
  const task: SessionQueueTask = JSON.parse(raw);

  try {
    const config = await resolveCapabilityConfig(ctx.cwd, { capability: task.capability, ...task.params });
    if (!config) {
      ctx.ui.notify(`Unknown capability "${task.capability}" in queued task.`, "error");
      return;
    }
    await launchCapability(ctx, config);
  } catch (err) {
    console.error(`pio-next-task: failed to launch ${task.capability}`, err);
    ctx.ui.notify(`Failed to start ${task.capability}: ${err instanceof Error ? err.message : String(err)}`, "error");
  } finally {
    // Always remove the queue file — avoid stuck tasks on error
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
    description: "Process the next queued session task from .pio/session-queue/",
    handler: handleNextTask,
  });
}
