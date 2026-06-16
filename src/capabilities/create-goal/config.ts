import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { launchCapability } from "../../capability-session";
import { prepareGoal } from "../../fs-utils";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [],
  outputs: [{ name: "goal", file: "GOAL.md" }],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "create-goal",
  contract: CONTRACT,
  writeAllowlist: ["GOAL.md"],
  skills: {
    mandatory: ["pio-planning", "grill-me", "pio-git"],
    recommended: [
      { name: "source-research", condition: "when researching existing solutions or libraries" },
    ],
  },
  defaultInitialMessage: () => "Ready.",
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const createGoalTool = defineTool({
  name: "pio_create_goal",
  label: "Pio Create Goal",
  description: "Create a new goal workspace under .pio/goals/<name> and queue a session with the create-goal system prompt. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Create a new goal workspace and queue a session to define it.",
  parameters: Type.Object({
    name: Type.String({ description: "Name for the goal workspace" }),
    initialMessage: Type.Optional(Type.String({ description: "Optional context to send as the kickoff message to the create-goal session" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const { goalDir, ready } = await prepareGoal(params.name, ctx.cwd);

    if (!ready) {
      return { content: [{ type: "text", text: `Goal workspace already exists at ${goalDir}` }], details: {} };
    }

    enqueueTask(ctx.cwd, params.name, {
      capability: "create-goal",
      params: { goalName: params.name, initialMessage: typeof params.initialMessage === "string" ? params.initialMessage : undefined },
    });

    return { content: [{ type: "text", text: `Goal workspace created at ${goalDir}. Task queued. Use \`/pio-next-task\` to start the sub-session.` }], details: {} };
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
  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "create-goal", goalName: name });
  if (!config) {
    ctx.ui.notify("Failed to resolve create-goal config.", "error");
    return;
  }
  try {
    await launchCapability(ctx, config);
  } catch (err) {
    ctx.ui.notify(
      `Failed to start ${config.capability}: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
    return;
  }
}

// ---------------------------------------------------------------------------
// Setup (registers tool, command, and session capability handlers)
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI) {
  pi.registerTool(createGoalTool);
  pi.registerCommand("pio-create-goal", {
    description: "Create a new goal workspace and launch a create-goal session",
    handler: handleCreateGoal,
  });
}


