import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability } from "../../capability-session";
import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";
import { TASK_FRONTMATTER_SCHEMA } from "./schemas";
import { validateAndFindNextStep, resolveEvolveWriteAllowlist } from "./callbacks";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ file: "PLAN.md" }],
  excludedFiles: ["S{stepNumber:02d}/REVISE_PLAN_NEEDED"],
  outputs: [
    { file: "S{stepNumber:02d}/TASK.md", schema: TASK_FRONTMATTER_SCHEMA },
    { file: "S{stepNumber:02d}/DECISIONS.md", requiredWhen: (params) => typeof params?.stepNumber === "number" && params.stepNumber > 1 },
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
  defaultInitialMessage: (workingDir: string, params?: Record<string, unknown>) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
    if (stepNumber == null) {
      throw new Error("stepNumber is required for evolve-plan. Ensure the task was enqueued with a valid step number.");
    }
    const folderName = stepFolderName(stepNumber);
    return `Goal workspace is at ${workingDir}. PLAN.md exists. You are responsible for **Step ${stepNumber}**. Generate TASK.md inside the \`${folderName}/\` directory.`;
  },
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
    name: Type.String({ description: "Name of the goal workspace (under .pio/goals/<name>)" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await validateAndFindNextStep(params.name, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error }], details: {} };
    }

    enqueueTask(ctx.cwd, params.name, {
      capability: "evolve-plan",
      params: { goalName: params.name, stepNumber: result.stepNumber },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task queued for Step ${result.stepNumber} of goal "${params.name}". Use \`/pio-next-task\` to start the sub-session.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleEvolvePlan(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-evolve-plan <goal-name>", "warning");
    return;
  }

  const name = args.trim();
  const result = await validateAndFindNextStep(name, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const folderName = stepFolderName(result.stepNumber);
  const stepDir = path.join(result.goalDir, folderName);
  fs.mkdirSync(stepDir, { recursive: true });

  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "evolve-plan", goalName: name, stepNumber: result.stepNumber });
  if (!config) {
    ctx.ui.notify("Failed to resolve evolve-plan config.", "error");
    return;
  }

  await launchCapability(ctx, config);
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


