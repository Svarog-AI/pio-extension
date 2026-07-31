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
  inputs: [
    { name: "goal", paramKey: "goalFile" },
    { name: "plan", paramKey: "planFile" },
    { name: "quality-gate", paramKey: "qualityGateFile" },
  ],
  outputs: [
    {
      name: "overview",
      file: "PROJECT/OVERVIEW.md",
      projectRelative: true,
      requiredWhen: () => false,
    },
    {
      name: "development",
      file: "PROJECT/DEVELOPMENT.md",
      projectRelative: true,
      requiredWhen: () => false,
    },
    {
      name: "conventions",
      file: "PROJECT/CONVENTIONS.md",
      projectRelative: true,
      requiredWhen: () => false,
    },
    {
      name: "git",
      file: "PROJECT/GIT.md",
      projectRelative: true,
      requiredWhen: () => false,
    },
    {
      name: "architecture",
      file: "PROJECT/ARCHITECTURE.md",
      projectRelative: true,
      requiredWhen: () => false,
    },
    {
      name: "dependencies",
      file: "PROJECT/DEPENDENCIES.md",
      projectRelative: true,
      requiredWhen: () => false,
    },
    {
      name: "glossary",
      file: "PROJECT/GLOSSARY.md",
      projectRelative: true,
      requiredWhen: () => false,
    },
  ],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "finalize-goal",
  contract: CONTRACT,
  skills: {
    mandatory: ["pio-project-knowledge"],
  },
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const finalizeGoalTool = defineTool({
  name: "pio_finalize_goal",
  label: "Pio Finalize Goal",
  description:
    "Finalize a completed workspace by updating .pio/PROJECT/ documentation based on accumulated decisions. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet:
    "Finalize a completed workspace and update project documentation.",
  parameters: Type.Object({
    ...BASE_TOOL_PARAMS,
    goalFile: Type.Optional(Type.String()),
    planFile: Type.Optional(Type.String()),
    qualityGateFile: Type.Optional(Type.String()),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "finalize-goal",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? `${queueKey} finalize-goal`,
        queueKey,
        additionalContext: params.additionalContext,
        goalFile: params.goalFile,
        planFile: params.planFile,
        qualityGateFile: params.qualityGateFile,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task queued for workspace "${params.workspacePrefix}". Use \`/pio-next-task\` to start the sub-session.`,
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
  pi.registerTool(finalizeGoalTool);
}
