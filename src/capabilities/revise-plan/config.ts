import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CapabilityPackageConfig } from "../../capability-package";
import { BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
import { enqueueTask } from "../../queues";
import type { CapabilityContract } from "../../types";
import { PLAN_FRONTMATTER_SCHEMA } from "../create-plan/schemas";
import {
  prepareSession,
  resolveReviseReadOnlyFiles,
  resolveReviseWriteAllowlist,
} from "./callbacks";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [
    { name: "goal", paramKey: "goalFile" },
    { name: "existing-plan", paramKey: "planFile" },
    { name: "revision-context", paramKey: "revisionContextFile" },
  ],
  outputs: [{ name: "plan", file: "PLAN.md", schema: PLAN_FRONTMATTER_SCHEMA }],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "revise-plan",
  contract: CONTRACT,
  readOnlyFiles: resolveReviseReadOnlyFiles,
  writeAllowlist: resolveReviseWriteAllowlist,
  skills: {
    mandatory: ["pio-planning", "grill-me"],
    recommended: [
      {
        name: "source-research",
        condition: "when researching existing solutions or libraries",
      },
    ],
  },
  defaultInitialMessage: () => "Ready.",
  prepareSession,
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const revisePlanTool = defineTool({
  name: "pio_revise_plan",
  label: "Pio Revise Plan",
  description:
    "Archive the current PLAN.md, clean up incomplete step folders, and queue a planning session to write a fresh plan for remaining work. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Archive current plan and queue a fresh planning session.",
  parameters: Type.Object({
    ...BASE_TOOL_PARAMS,
    goalFile: Type.Optional(Type.String()),
    planFile: Type.Optional(Type.String()),
    revisionContextFile: Type.Optional(Type.String()),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "revise-plan",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? `${queueKey} revise-plan`,
        queueKey,
        initialMessage: params.initialMessage,
        goalFile: params.goalFile,
        planFile: params.planFile,
        revisionContextFile: params.revisionContextFile,
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
  pi.registerTool(revisePlanTool);
}
