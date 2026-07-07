import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CapabilityPackageConfig } from "../../capability-package";
import { BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
import { enqueueTask } from "../../queues";
import type { CapabilityContract } from "../../types";

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
      {
        name: "source-research",
        condition: "when researching existing solutions or libraries",
      },
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
  description:
    "Create a workspace and queue a session with the create-goal system prompt. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Create a workspace and queue a session to define it.",
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    const sessionName = params.sessionName ?? `${queueKey} create-goal`;
    const initialMessage = params.initialMessage;

    // Resolve workspace directory: workspaceDir is .pio/, prefix tells us where within it
    const workspaceDir = path.join(ctx.cwd, ".pio", params.workspacePrefix);
    if (fs.existsSync(workspaceDir)) {
      return {
        content: [
          {
            type: "text",
            text: `Workspace at "${params.workspacePrefix}" already exists. Call ask_user to let the human decide what to do (pick a new name, reuse existing, or run /pio-delete-goal to remove the old workspace).`,
          },
        ],
        details: {},
      };
    }
    fs.mkdirSync(workspaceDir, { recursive: true });

    enqueueTask(ctx.cwd, queueKey, {
      capability: "create-goal",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName,
        queueKey,
        initialMessage,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Workspace created at ${workspaceDir}. Task queued. Use \`/pio-next-task\` to start the sub-session.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Setup (registers tool)
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI) {
  pi.registerTool(createGoalTool);
}
