import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability } from "../../capability-session";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import { BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
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
  description: "Create a workspace and queue a session with the create-goal system prompt. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Create a workspace and queue a session to define it.",
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    const sessionName = params.sessionName ?? `${queueKey} create-goal`;
    const initialMessage = params.initialMessage;

    // Resolve workspace directory: workspaceDir is .pio/, prefix tells us where within it
    const workspaceDir = path.join(ctx.cwd, ".pio", params.workspacePrefix);
    if (fs.existsSync(workspaceDir)) {
      return { content: [{ type: "text", text: `Workspace at "${params.workspacePrefix}" already exists. Call ask_user to let the human decide what to do (pick a new name, reuse existing, or run /pio-delete-goal to remove the old workspace).` }], details: {} };
    }
    fs.mkdirSync(workspaceDir, { recursive: true });

    enqueueTask(ctx.cwd, queueKey, {
      capability: "create-goal",
      params: { workspacePrefix: params.workspacePrefix, sessionName, queueKey, initialMessage },
    });

    return { content: [{ type: "text", text: `Workspace created at ${workspaceDir}. Task queued. Use \`/pio-next-task\` to start the sub-session.` }], details: {} };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleCreateGoal(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-create-goal --workspace-prefix <prefix>", "warning");
    return;
  }

  const tokens = args.trim().split(/\s+/);
  let workspacePrefix: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "--workspace-prefix" && tokens[i + 1]) {
      workspacePrefix = tokens[++i];
    }
  }
  if (!workspacePrefix) {
    ctx.ui.notify("--workspace-prefix is required. Usage: /pio-create-goal --workspace-prefix <prefix>", "error");
    return;
  }

  // Resolve workspace directory
  const workspaceDir = path.join(ctx.cwd, ".pio", workspacePrefix);
  if (fs.existsSync(workspaceDir)) {
    ctx.ui.notify(`Workspace at "${workspacePrefix}" already exists. Pick a new name, reuse the existing one, or run /pio-delete-goal to remove it.`, "warning");
    return;
  }
  fs.mkdirSync(workspaceDir, { recursive: true });

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const queueKey = deriveQueueKey(workspacePrefix);
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "create-goal",
    workspacePrefix,
    sessionName: `${queueKey} create-goal`,
    queueKey,
    initialMessage: "Create a goal definition. Interview about scope and constraints, then write GOAL.md.",
  });
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
    description: "Create a workspace and launch a create-goal session",
    handler: handleCreateGoal,
  });
}
