import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CapabilityPackageConfig } from "../../capability-package";
import { BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
import { enqueueTask } from "../../queues";
import type { CapabilityContract } from "../../types";
import { QUALITY_GATE_SCHEMA } from "./schemas";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ name: "requirements", paramKey: "requirementsFile" }],
  outputs: [
    {
      name: "quality-gate-report",
      file: "QUALITY_GATE.md",
      schema: QUALITY_GATE_SCHEMA,
    },
  ],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "quality-gate",
  contract: CONTRACT,
  skills: {
    mandatory: ["pio-git", "ask-user"],
  },
  defaultInitialMessage: () => "Ready.",
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const qualityGateTool = defineTool({
  name: "pio_quality_gate",
  label: "Pio Quality Gate",
  description:
    "Perform a quality gate with manual E2E testing and code review checkpoints. Produces QUALITY_GATE.md with approved or rejected status. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet:
    "Run quality gate (E2E testing + code review) before finalization.",
  parameters: Type.Object({
    ...BASE_TOOL_PARAMS,
    requirementsFile: Type.Optional(Type.String()),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "quality-gate",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? `${queueKey} quality-gate`,
        queueKey,
        initialMessage: params.initialMessage,
        requirementsFile: params.requirementsFile,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Quality gate task queued for workspace "${params.workspacePrefix}". Use \`/pio-next-task\` to start the sub-session.`,
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
  pi.registerTool(qualityGateTool);
}
