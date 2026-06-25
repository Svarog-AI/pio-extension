import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { launchCapability } from "../../capability-session";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import { PLAN_FRONTMATTER_SCHEMA } from "../create-plan/schemas";
import { BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";
import { prepareSession, cleanupIncompleteSteps, resolveReviseReadOnlyFiles, resolveReviseWriteAllowlist } from "./callbacks";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ name: "goal", file: "GOAL.md" }, { name: "existing-plan", file: "PLAN.md" }],
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
      { name: "source-research", condition: "when researching existing solutions or libraries" },
    ],
  },
  defaultInitialMessage: () => "Ready.",
  prepareSession,
  postExecute: cleanupIncompleteSteps,
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
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "revise-plan",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? `${queueKey} revise-plan`,
        queueKey,
        initialMessage: params.initialMessage,
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
// Command
// ---------------------------------------------------------------------------

async function handleRevisePlan(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-revise-plan --workspace-prefix <prefix>", "warning");
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
    ctx.ui.notify("--workspace-prefix is required. Usage: /pio-revise-plan --workspace-prefix <prefix>", "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const queueKey = deriveQueueKey(workspacePrefix);
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "revise-plan",
    workspacePrefix,
    sessionName: `${queueKey} revise-plan`,
    queueKey,
    initialMessage: "Revise the plan. Read PLAN_ARCHIVE/ for previous plans, GOAL.md for scope boundaries, and write a fresh PLAN.md.",
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve revise-plan config.", "error");
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
// Setup (registers tool and command)
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI) {
  pi.registerTool(revisePlanTool);
  pi.registerCommand("pio-revise-plan", {
    description: "Archive the current plan and launch a session to write a fresh plan",
    handler: handleRevisePlan,
  });
}
