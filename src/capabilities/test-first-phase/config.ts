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
  outputs: [{ name: "first-phase-result", file: "FIRST_PHASE_RESULT.md" }],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "test-first-phase",
  contract: CONTRACT,
  writeAllowlist: ["FIRST_PHASE_RESULT.md"],
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const firstPhaseTestTool = defineTool({
  name: "pio_first_phase_test",
  label: "Pio First Phase Test",
  description:
    "Launch a diagnostic sandbox session to verify CustomMessage injection on the first phase without minIterations. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Launch a first-phase diagnostic sandbox session.",
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const workspacePrefix = params.workspacePrefix ?? "goals/test-first-phase";
    const queueKey = deriveQueueKey(workspacePrefix);
    const sessionName = params.sessionName ?? `${queueKey} test-first-phase`;
    const additionalContext = params.additionalContext;

    // Resolve workspace directory
    const workspaceDir = path.join(ctx.cwd, ".pio", workspacePrefix);

    // Sandbox is always writable — no existence check
    fs.mkdirSync(workspaceDir, { recursive: true });

    enqueueTask(ctx.cwd, queueKey, {
      capability: "test-first-phase",
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
          text: `First-phase test workspace created at ${workspaceDir}. Task queued. Use \`/pio-next-task\` to start the sub-session.`,
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
  pi.registerTool(firstPhaseTestTool);
}
