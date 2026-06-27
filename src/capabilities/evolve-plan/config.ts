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
import { stepFolderName } from "../../fs-utils";
import { enqueueTask } from "../../queues";
import type { CapabilityContract } from "../../types";
import { PLAN_FRONTMATTER_SCHEMA } from "../create-plan/schemas";
import { resolveEvolveWriteAllowlist } from "./callbacks";
import { COMPLETION_SUMMARY_SCHEMA, TASK_FRONTMATTER_SCHEMA } from "./schemas";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ name: "plan", file: "PLAN.md", schema: PLAN_FRONTMATTER_SCHEMA }],
  excludedFiles: ["S{stepNumber:02d}/REVISE_PLAN_NEEDED"],
  outputs: [
    {
      name: "task",
      file: "S{stepNumber:02d}/TASK.md",
      schema: TASK_FRONTMATTER_SCHEMA,
    },
    {
      name: "decisions",
      file: "S{stepNumber:02d}/DECISIONS.md",
      requiredWhen: (params) =>
        typeof params?.stepNumber === "number" && params.stepNumber > 1,
    },
    {
      name: "completion-summary",
      file: "COMPLETION_SUMMARY.md",
      schema: COMPLETION_SUMMARY_SCHEMA,
      requiredWhen: () => false,
    },
  ],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "evolve-plan",
  contract: CONTRACT,
  writeAllowlist: resolveEvolveWriteAllowlist,
  skills: {
    mandatory: ["pio-planning", "grill-me"],
  },
  defaultInitialMessage: () => "Ready.",
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const evolvePlanTool = defineTool({
  name: "pio_evolve_plan",
  label: "Pio Evolve Plan",
  description:
    "Generate a step-by-step specification (TASK.md) for the next step in an existing PLAN.md. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Generate TASK.md for the next plan step.",
  parameters: Type.Object({
    ...BASE_TOOL_PARAMS,
    stepNumber: Type.Number({ description: "Step number to evolve" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "evolve-plan",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName:
          params.sessionName ?? `${queueKey} evolve-plan s${params.stepNumber}`,
        queueKey,
        stepNumber: params.stepNumber,
        initialMessage: params.initialMessage,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task queued for Step ${params.stepNumber} of workspace "${params.workspacePrefix}". Use \`/pio-next-task\` to start the sub-session.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleEvolvePlan(
  args: string | undefined,
  ctx: ExtensionCommandContext,
) {
  if (!args?.trim()) {
    ctx.ui.notify(
      "Usage: /pio-evolve-plan --workspace-prefix <prefix> --step-number <n>",
      "warning",
    );
    return;
  }

  const tokens = args.trim().split(/\s+/);
  let workspacePrefix: string | undefined;
  let stepNumber: number | undefined;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "--workspace-prefix" && tokens[i + 1]) {
      workspacePrefix = tokens[++i];
    } else if (tokens[i] === "--step-number" && tokens[i + 1]) {
      stepNumber = parseInt(tokens[++i], 10);
    }
  }
  if (!workspacePrefix) {
    ctx.ui.notify(
      "--workspace-prefix is required. Usage: /pio-evolve-plan --workspace-prefix <prefix> --step-number <n>",
      "error",
    );
    return;
  }
  if (stepNumber === undefined || Number.isNaN(stepNumber)) {
    ctx.ui.notify(
      "--step-number is required. Usage: /pio-evolve-plan --workspace-prefix <prefix> --step-number <n>",
      "error",
    );
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const queueKey = deriveQueueKey(workspacePrefix);
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "evolve-plan",
    workspacePrefix,
    sessionName: `${queueKey} evolve-plan s${stepNumber}`,
    queueKey,
    stepNumber,
    initialMessage: `Generate the specification for Step ${stepNumber}. Read PLAN.md — locate the step heading, review its description and acceptance criteria, then write TASK.md in ${stepFolderName(stepNumber)}/.`,
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve evolve-plan config.", "error");
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
  pi.registerTool(evolvePlanTool);
  pi.registerCommand("pio-evolve-plan", {
    description:
      "Generate a step specification for the next step in an existing plan",
    handler: handleEvolvePlan,
  });
}
