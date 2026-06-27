import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveCapabilityConfig } from "../../capability-config";
import type { CapabilityPackageConfig } from "../../capability-package";
import { launchCapability } from "../../capability-session";
import { BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
import { enqueueTask } from "../../queues";
import type { CapabilityContract } from "../../types";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [
    { name: "goal", file: "GOAL.md" },
    { name: "plan", file: "PLAN.md" },
    { name: "completion-summary", file: "COMPLETION_SUMMARY.md" },
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
    mandatory: ["pio-project-knowledge", "pio-git"],
  },
  defaultInitialMessage: () => "Ready.",
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
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "finalize-goal",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? `${queueKey} finalize-goal`,
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

async function handleFinalizeGoal(
  args: string | undefined,
  ctx: ExtensionCommandContext,
) {
  if (!args?.trim()) {
    ctx.ui.notify(
      "Usage: /pio-finalize-goal --workspace-prefix <prefix>",
      "warning",
    );
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
    ctx.ui.notify(
      "--workspace-prefix is required. Usage: /pio-finalize-goal --workspace-prefix <prefix>",
      "error",
    );
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
    initialMessage:
      "All plan steps are complete. Read COMPLETION_SUMMARY.md, then update .pio/PROJECT/ documentation with accumulated decisions.",
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
    description:
      "Update .pio/PROJECT/ documentation based on completed workspace decisions",
    handler: handleFinalizeGoal,
  });
}
