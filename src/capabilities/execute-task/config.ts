import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { CapState } from "../../capability-state";
import { launchCapability, setMergedSkills } from "../../capability-session";
import { mergeCapabilitySkills, parseCommandArgs } from "../../capability-utils";
import { stepFolderName } from "../../fs-utils";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import { TASK_FRONTMATTER_SCHEMA } from "../evolve-plan/schemas";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";
import { validateExecuteStep, resolveExecuteReadOnlyFiles } from "./callbacks";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ name: "goal", file: "GOAL.md" }, { name: "plan", file: "PLAN.md" }, { name: "task", file: "S{stepNumber:02d}/TASK.md", schema: TASK_FRONTMATTER_SCHEMA }],
  excludedFiles: ["S{stepNumber:02d}/REVISE_PLAN_NEEDED"],
  outputs: [{ name: "test", file: "S{stepNumber:02d}/TEST.md" }, { name: "summary", file: "S{stepNumber:02d}/SUMMARY.md" }],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "execute-task",
  contract: CONTRACT,
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

    return `${prefix}Working directory is ${workingDir}. You are responsible for **Step ${stepNumber}**. Read TASK.md inside the \`${folderName}/\` directory and resolve the task.`;
  },
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// prepareSession — read TASK.md skills and merge into capability config
// ---------------------------------------------------------------------------

function prepareExecuteSession(workingDir: string, params?: Record<string, unknown>): void {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) return;

  const capState = new CapState(CONTRACT, workingDir, { stepNumber });
  const taskFile = capState.input<{ skills?: unknown }>("task");
  const taskData = taskFile.read();
  const taskSkills = taskData?.skills ?? null;

  const merged = mergeCapabilitySkills(capabilityConfig.skills, taskSkills);
  setMergedSkills(merged);
}

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
    stepNumber: Type.Number({ description: "Step number to execute" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await validateExecuteStep(params.name, ctx.cwd, params.stepNumber);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error }], details: {} };
    }

    enqueueTask(ctx.cwd, params.name, {
      capability: "execute-task",
      params: {
        workspacePrefix: `goals/${params.name}`,
        sessionName: `${params.name} execute-task s${result.stepNumber}`,
        queueKey: params.name,
        stepNumber: result.stepNumber,
        initialMessage: `Working directory is goals/${params.name}. You are responsible for **Step ${result.stepNumber}**. Read TASK.md inside the step folder and resolve the task.`,
      },
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
  const parsed = parseCommandArgs(args);
  if (!parsed) {
    ctx.ui.notify("Usage: /pio-execute-task <goal-name> <step-number>", "warning");
    return;
  }

  if (parsed.stepNumber === undefined) {
    ctx.ui.notify("Step number is required. Usage: /pio-execute-task <goal-name> <step-number>", "error");
    return;
  }

  const result = await validateExecuteStep(parsed.name, ctx.cwd, parsed.stepNumber);

  if (!result.ready) {
    ctx.ui.notify(result.error, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "execute-task",
    workspacePrefix: `goals/${parsed.name}`,
    sessionName: `${parsed.name} execute-task s${result.stepNumber}`,
    queueKey: parsed.name,
    stepNumber: result.stepNumber,
    initialMessage: `Working directory is goals/${parsed.name}. You are responsible for **Step ${result.stepNumber}**. Read TASK.md inside the step folder and resolve the task.`,
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve execute-task config.", "error");
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
  pi.registerTool(executeTaskTool);
  pi.registerCommand("pio-execute-task", {
    description:
      "Execute a single plan step using an iterative TDD workflow (tracer bullet → incremental RED→GREEN cycles)",
    handler: handleExecuteTask,
  });
}


