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
// Contract (single source of truth)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [],
  outputs: [{ name: "playground-output", file: "PLAYGROUND.md" }],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "workflow-playground",
  contract: CONTRACT,
  writeAllowlist: ["PLAYGROUND.md"],
  allowProjectWrites: true,
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const playgroundTool = defineTool({
  name: "pio_launch_playground",
  label: "Pio Launch Playground",
  description:
    "Launch a workflow playground sandbox session for testing loop engine features. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Launch a workflow playground sandbox session.",
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    // Apply default workspace prefix in execute body
    const workspacePrefix = params.workspacePrefix ?? "goals/test-playground";
    const queueKey = deriveQueueKey(workspacePrefix);
    const sessionName = params.sessionName ?? `${queueKey} workflow-playground`;
    const additionalContext = params.additionalContext;

    // Resolve workspace directory
    const workspaceDir = path.join(ctx.cwd, ".pio", workspacePrefix);

    // Playground sandbox is always writable — no existence check
    fs.mkdirSync(workspaceDir, { recursive: true });

    enqueueTask(ctx.cwd, queueKey, {
      capability: "workflow-playground",
      params: {
        workspacePrefix,
        sessionName,
        queueKey,
        additionalContext,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Playground workspace created at ${workspaceDir}. Task queued. Use \`/pio-next-task\` to start the sub-session.`,
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
  pi.registerTool(playgroundTool);
}
