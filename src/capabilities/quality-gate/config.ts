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
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "quality-gate",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? `${queueKey} quality-gate`,
        queueKey,
        initialMessage: params.initialMessage,
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
// Command
// ---------------------------------------------------------------------------

async function handleQualityGate(
  args: string | undefined,
  ctx: ExtensionCommandContext,
) {
  if (!args?.trim()) {
    ctx.ui.notify(
      "Usage: /pio-quality-gate --workspace-prefix <prefix>",
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
      "--workspace-prefix is required. Usage: /pio-quality-gate --workspace-prefix <prefix>",
      "error",
    );
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const queueKey = deriveQueueKey(workspacePrefix);
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "quality-gate",
    workspacePrefix,
    sessionName: `${queueKey} quality-gate`,
    queueKey,
    initialMessage:
      "Perform quality gate: push commits, open PR, run E2E testing gate, run code review gate, then write QUALITY_GATE.md.",
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve quality-gate config.", "error");
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
  pi.registerTool(qualityGateTool);
  pi.registerCommand("pio-quality-gate", {
    description:
      "Run quality gate with E2E testing and code review checkpoints",
    handler: handleQualityGate,
  });
}
