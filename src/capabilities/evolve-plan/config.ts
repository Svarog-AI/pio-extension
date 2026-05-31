import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability } from "../session-capability";
import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../../capability-config";
import type { CapabilityPackageConfig } from "../../capability-package";
import { TASK_FRONTMATTER_SCHEMA } from "../../frontmatter-schemas";

// Re-export validator functions for backward compatibility and test access
import {
  validateAndFindNextStep,
  resolveEvolveValidation,
  resolveEvolveWriteAllowlist,
  REVISE_PLAN_MARKER,
} from "./validators";
export {
  validateAndFindNextStep,
  resolveEvolveValidation,
  resolveEvolveWriteAllowlist,
  REVISE_PLAN_MARKER,
};

// ---------------------------------------------------------------------------
// Default export: CapabilityPackageConfig (new-style package config)
// ---------------------------------------------------------------------------

export default {
  capability: "evolve-plan",
  validation: resolveEvolveValidation,
  writeAllowlist: resolveEvolveWriteAllowlist,
  skills: {
    mandatory: ["pio-planning", "grill-me"],
  },
  frontmatterSchemas: [
    { outputFile: "TASK.md", schema: TASK_FRONTMATTER_SCHEMA },
  ],
  defaultInitialMessage: (workingDir: string, params?: Record<string, unknown>) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
    if (stepNumber == null) {
      throw new Error("stepNumber is required for evolve-plan. Ensure the task was enqueued with a valid step number.");
    }
    const folderName = stepFolderName(stepNumber);
    return `Goal workspace is at ${workingDir}. PLAN.md exists. You are responsible for **Step ${stepNumber}**. Generate TASK.md inside the \`${folderName}/\` directory.`;
  },
} satisfies CapabilityPackageConfig;

// ---------------------------------------------------------------------------
// Backward-compat export: CAPABILITY_CONFIG (for resolveCapabilityConfig until Step 21)
// ---------------------------------------------------------------------------

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "evolve-plan.md",
  skills: {
    mandatory: ["pio-planning", "grill-me"],
  },
  validation: resolveEvolveValidation,
  writeAllowlist: resolveEvolveWriteAllowlist,
  defaultInitialMessage: (workingDir, params) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
    if (stepNumber == null) {
      throw new Error("stepNumber is required for evolve-plan. Ensure the task was enqueued with a valid step number.");
    }
    const folderName = stepFolderName(stepNumber);
    return `Goal workspace is at ${workingDir}. PLAN.md exists. You are responsible for **Step ${stepNumber}**. Generate TASK.md inside the \`${folderName}/\` directory.`;
  },
};

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

// Backward-compat: old index.ts imports setupEvolvePlan
export { register as setupEvolvePlan };
