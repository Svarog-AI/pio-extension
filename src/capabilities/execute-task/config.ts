import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability, setMergedSkills, mergeCapabilitySkills } from "../session-capability";
import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../../capability-config";
import type { CapabilityPackageConfig } from "../../capability-package";
import { createGoalState } from "../../goal-state";
import {
  validateAndFindNextStep,
  validateExplicitStep,
  resolveExecuteValidation,
  resolveExecuteReadOnlyFiles,
} from "./validators";

// ---------------------------------------------------------------------------
// prepareSession — read TASK.md skills and merge into capability config
// ---------------------------------------------------------------------------

function prepareExecuteSession(workingDir: string, params?: Record<string, unknown>): void {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) return;

  const state = createGoalState(workingDir);
  const step = state.steps().find(s => s.stepNumber === stepNumber);
  const taskSkills = step?.taskSkills();

  const merged = mergeCapabilitySkills(CAPABILITY_CONFIG.skills, taskSkills);
  setMergedSkills(merged);
}

// ---------------------------------------------------------------------------
// Default export: CapabilityPackageConfig (new-style package config)
// ---------------------------------------------------------------------------

export default {
  capability: "execute-task",
  validation: resolveExecuteValidation,
  readOnlyFiles: resolveExecuteReadOnlyFiles,
  prepareSession: prepareExecuteSession,
  skills: {
    mandatory: ["tdd", "pio-git"],
  },
  defaultInitialMessage: (workingDir: string, params?: Record<string, unknown>) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
    if (stepNumber == null) {
      return "Error: stepNumber is required for execute-task. The task was not enqueued with a valid step number.";
    }
    const folderName = stepFolderName(stepNumber);

    // Check if this is a re-execution after review rejection
    let prefix = "";
    try {
      const rejectedPath = path.join(workingDir, folderName, "REJECTED");
      if (fs.existsSync(rejectedPath)) {
        prefix = `This step was previously rejected. Read \`${folderName}/REVIEW.md\` for detailed review feedback before implementing. Address all critical and high-priority issues identified in the review.\n\n`;
      }
    } catch {
      // If filesystem read fails, fall through to the normal message
    }

    return `${prefix}Goal workspace is at ${workingDir}. You are responsible for **Step ${stepNumber}**. Read TASK.md inside the \`${folderName}/\` directory and resolve the task.`;
  },
} satisfies CapabilityPackageConfig;

// ---------------------------------------------------------------------------
// Backward-compat export: CAPABILITY_CONFIG (for resolveCapabilityConfig until Step 21)
// ---------------------------------------------------------------------------

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "execute-task.md",
  skills: {
    mandatory: ["tdd", "pio-git"],
  },
  validation: resolveExecuteValidation,
  readOnlyFiles: resolveExecuteReadOnlyFiles,
  prepareSession: prepareExecuteSession,
  defaultInitialMessage: (workingDir, params) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
    if (stepNumber == null) {
      return "Error: stepNumber is required for execute-task. The task was not enqueued with a valid step number.";
    }
    const folderName = stepFolderName(stepNumber);

    // Check if this is a re-execution after review rejection
    let prefix = "";
    try {
      const rejectedPath = path.join(workingDir, folderName, "REJECTED");
      if (fs.existsSync(rejectedPath)) {
        prefix = `This step was previously rejected. Read \`${folderName}/REVIEW.md\` for detailed review feedback before implementing. Address all critical and high-priority issues identified in the review.\n\n`;
      }
    } catch {
      // If filesystem read fails, fall through to the normal message
    }

    return `${prefix}Goal workspace is at ${workingDir}. You are responsible for **Step ${stepNumber}**. Read TASK.md inside the \`${folderName}/\` directory and resolve the task.`;
  },
};

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const executeTaskTool = defineTool({
  name: "pio_execute_task",
  label: "Pio Execute Task",
  description:
    "Execute a single plan step using an iterative TDD workflow. Reads TASK.md, applies tracer-bullet development via the tdd skill, and produces implementation with post-hoc TEST.md. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Execute a single plan step (test-first implementation).",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace (under .pio/goals/<name>)" }),
    stepNumber: Type.Optional(Type.Number({ description: "Explicit step number to execute (optional — auto-finds next ready step)" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = params.stepNumber
      ? await validateExplicitStep(params.name, ctx.cwd, params.stepNumber)
      : await validateAndFindNextStep(params.name, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error }], details: {} };
    }

    enqueueTask(ctx.cwd, params.name, {
      capability: "execute-task",
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

async function handleExecuteTask(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-execute-task <goal-name> [step-number]", "warning");
    return;
  }

  const parts = args.trim().split(/\s+/);
  const name = parts[0];
  const explicitStep = parts[1] ? parseInt(parts[1], 10) : undefined;

  // Validate explicit step number if provided
  if (explicitStep !== undefined && (isNaN(explicitStep) || explicitStep < 1)) {
    ctx.ui.notify(`Invalid step number: "${parts[1]}". Must be a positive integer.`, "error");
    return;
  }

  const result = explicitStep
    ? await validateExplicitStep(name, ctx.cwd, explicitStep)
    : await validateAndFindNextStep(name, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const folderName = stepFolderName(result.stepNumber);
  const stepDir = path.join(result.goalDir, folderName);
  fs.mkdirSync(stepDir, { recursive: true });

  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "execute-task", goalName: name, stepNumber: result.stepNumber });
  if (!config) {
    ctx.ui.notify("Failed to resolve execute-task config.", "error");
    return;
  }

  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Setup (registers tool and command)
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI) {
  pi.registerTool(executeTaskTool);
  pi.registerCommand("pio-execute-task", {
    description:
      "Execute a single plan step using an iterative TDD workflow (tracer bullet → incremental RED→GREEN cycles)",
    handler: handleExecuteTask,
  });
}

// Backward-compat: old index.ts imports setupExecuteTask
export { register as setupExecuteTask };
