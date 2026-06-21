import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { CapState } from "../../capability-state";
import { launchCapability } from "../../capability-session";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import { validateInputs } from "../../guards/validation";
import * as path from "node:path";
import { BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ name: "goal", file: "GOAL.md" }, { name: "plan", file: "PLAN.md" }, { name: "completion-summary", file: "COMPLETION_SUMMARY.md" }],
  outputs: [
    { name: "overview", file: "/PROJECT/OVERVIEW.md", requiredWhen: () => false },
    { name: "development", file: "/PROJECT/DEVELOPMENT.md", requiredWhen: () => false },
    { name: "conventions", file: "/PROJECT/CONVENTIONS.md", requiredWhen: () => false },
    { name: "git", file: "/PROJECT/GIT.md", requiredWhen: () => false },
    { name: "architecture", file: "/PROJECT/ARCHITECTURE.md", requiredWhen: () => false },
    { name: "dependencies", file: "/PROJECT/DEPENDENCIES.md", requiredWhen: () => false },
    { name: "glossary", file: "/PROJECT/GLOSSARY.md", requiredWhen: () => false },
  ],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "finalize-goal",
  contract: CONTRACT,
  skills: {
    mandatory: ["pio-project-knowledge", "pio-git"],
  },
  defaultInitialMessage: () => "Ready.",
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that the workspace exists and the COMPLETED marker is present.
 *
 * Returns { ready: true } on success, or { ready: false, error } when not ready.
 * Does NOT use ctx so it can be called safely before newSession().
 */
export async function validateFinalizeGoal(
  workspacePrefix: string,
  cwd: string,
): Promise<
  | { ready: true }
  | { ready: false; error: string }
> {
  const result = validateInputs(path.join(cwd, ".pio"), CONTRACT, { workspacePrefix });
  if (!result.success) {
    return { ready: false, error: result.message ?? `Workspace "${workspacePrefix}" does not have the required inputs.` };
  }

  return { ready: true };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const finalizeGoalTool = defineTool({
  name: "pio_finalize_goal",
  label: "Pio Finalize Goal",
  description:
    "Finalize a completed workspace by updating .pio/PROJECT/ documentation based on accumulated decisions. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Finalize a completed workspace and update project documentation.",
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await validateFinalizeGoal(params.workspacePrefix, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error }], details: {} };
    }

    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "finalize-goal",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? `${queueKey} finalize-goal`,
        queueKey,
        initialMessage: params.initialMessage ?? `Finalize workspace "${params.workspacePrefix}" — update .pio/PROJECT/ documentation.`,
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

async function handleFinalizeGoal(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-finalize-goal --workspace-prefix <prefix>", "warning");
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
    ctx.ui.notify("--workspace-prefix is required. Usage: /pio-finalize-goal --workspace-prefix <prefix>", "error");
    return;
  }

  const result = await validateFinalizeGoal(workspacePrefix, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const queueKey = deriveQueueKey(workspacePrefix);
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "finalize-goal",
    workspacePrefix,
    sessionName: `${queueKey} finalize-goal`,
    queueKey,
    initialMessage: `Finalize workspace "${workspacePrefix}" — update .pio/PROJECT/ documentation.`,
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve finalize-goal config.", "error");
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
  pi.registerTool(finalizeGoalTool);
  pi.registerCommand("pio-finalize-goal", {
    description: "Update .pio/PROJECT/ documentation based on completed workspace decisions",
    handler: handleFinalizeGoal,
  });
}
