import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";

import { launchCapability, type CapabilityConfig } from "./session-capability";
import { enqueueTask, goalExists, resolveGoalDir, CAPABILITY_SESSIONS } from "../utils";

// ---------------------------------------------------------------------------
// Config builder — single source of truth for this capability's session shape
// ---------------------------------------------------------------------------

export function buildCreateGoalConfig(cwd: string, params?: Record<string, unknown>): CapabilityConfig {
  const name = typeof params?.goalName === "string" ? params.goalName : "";
  const goalDir = resolveGoalDir(cwd, name);
  return {
    capability: "create-goal",
    workingDir: goalDir,
    validation: { files: ["GOAL.md"] },
    initialMessage:
      typeof params?.initialMessage === "string"
        ? params.initialMessage
        : `Created goal workspace at ${goalDir}`,
  };
}

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

/**
 * Prepare the goal workspace (mkdir).
 * Returns { goalDir, ready } — call launchCapability separately.
 * Does NOT use ctx so it can be called safely before newSession().
 */
async function prepareGoal(name: string, cwd: string): Promise<{ goalDir: string; ready: boolean }> {
  const goalDir = resolveGoalDir(cwd, name);

  if (goalExists(goalDir)) {
    return { goalDir, ready: false };
  }

  fs.mkdirSync(goalDir, { recursive: true });
  return { goalDir, ready: true };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const createGoalTool = defineTool({
  name: "pio_create_goal",
  label: "Pio Create Goal",
  description: "Create a new goal workspace under .pio/goals/<name> and queue a session with the create-goal system prompt. Run /pio-next-task to start it.",
  parameters: Type.Object({
    name: Type.String({ description: "Name for the goal workspace" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const { goalDir, ready } = await prepareGoal(params.name, ctx.cwd);

    if (!ready) {
      return { content: [{ type: "text", text: `Goal workspace already exists at ${goalDir}` }], details: {} };
    }

    enqueueTask(ctx.cwd, {
      capability: "create-goal",
      params: { goalName: params.name },
    });

    return { content: [{ type: "text", text: `Goal workspace created at ${goalDir}. Task queued — run /pio-next-task to start it.` }], details: {} };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleCreateGoal(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-create-goal <name>", "warning");
    return;
  }

  const name = args.trim();
  const { goalDir, ready } = await prepareGoal(name, ctx.cwd);

  if (!ready) {
    ctx.ui.notify(`Goal workspace already exists at ${goalDir}`, "warning");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  await launchCapability(ctx, buildCreateGoalConfig(ctx.cwd, { goalName: name }));
}

// ---------------------------------------------------------------------------
// Setup (registers tool, command, and session capability handlers)
// ---------------------------------------------------------------------------

export function setupCreateGoal(pi: ExtensionAPI) {
  CAPABILITY_SESSIONS["create-goal"] = buildCreateGoalConfig;

  pi.registerTool(createGoalTool);
  pi.registerCommand("pio-create-goal", {
    description: "Create a new goal workspace and launch a create-goal session",
    handler: handleCreateGoal,
  });
}
