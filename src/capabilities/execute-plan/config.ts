import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";

import { launchCapability } from "../../capability-session";
import { enqueueTask } from "../../queues";
import { validateInputs } from "../../guards/validation";
import * as path from "node:path";
import { resolveCapabilityConfig } from "../../capability-config";
import { BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ name: "goal", file: "GOAL.md" }, { name: "plan", file: "PLAN.md" }],
  outputs: [],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "execute-plan",
  contract: CONTRACT,
  skills: {
    mandatory: ["tdd", "pio-git"],
  },
  defaultInitialMessage: () => "Ready.",
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that the workspace exists, has both GOAL.md and PLAN.md.
 * Returns { ready: boolean, error?: string }.
 * Does NOT use ctx so it can be called safely before newSession().
 */
async function validateGoal(workspacePrefix: string, cwd: string): Promise<{ ready: boolean; error?: string }> {
  const result = validateInputs(path.join(cwd, ".pio"), CONTRACT, { workspacePrefix });
  if (!result.success) {
    return { ready: false, error: result.message ?? `Workspace "${workspacePrefix}" does not have the required inputs.` };
  }

  return { ready: true };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const executePlanTool = defineTool({
  name: "pio_execute_plan",
  label: "Pio Execute Plan",
  description: "Execute all steps from an existing plan in a single session. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Execute all steps from an existing plan in a single session.",
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await validateGoal(params.workspacePrefix, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error! }], details: {} };
    }

    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "execute-plan",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? `${queueKey} execute-plan`,
        queueKey,
        initialMessage: params.initialMessage ?? `Execute all steps from the plan for workspace "${params.workspacePrefix}".`,
      },
    });

    return { content: [{ type: "text", text: `Task queued for workspace "${params.workspacePrefix}". Use \`/pio-next-task\` to start the sub-session.` }], details: {} };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleExecutePlan(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-execute-plan --workspace-prefix <prefix>", "warning");
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
    ctx.ui.notify("--workspace-prefix is required. Usage: /pio-execute-plan --workspace-prefix <prefix>", "error");
    return;
  }

  const result = await validateGoal(workspacePrefix, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error!, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const queueKey = deriveQueueKey(workspacePrefix);
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "execute-plan",
    workspacePrefix,
    sessionName: `${queueKey} execute-plan`,
    queueKey,
    initialMessage: `Execute all steps from the plan for workspace "${workspacePrefix}".`,
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve execute-plan config.", "error");
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
  pi.registerTool(executePlanTool);
  pi.registerCommand("pio-execute-plan", {
    description: "Implement all steps from an existing plan in a single session",
    handler: handleExecutePlan,
  });
}
