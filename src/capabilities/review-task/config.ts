import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability, setMergedSkills } from "../../capability-session";
import { mergeCapabilitySkills } from "../../capability-utils";
import { resolveGoalDir, stepFolderName } from "../../fs-utils";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import { REVIEW_OUTPUT_SCHEMA } from "./schemas";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";
import { createGoalState } from "../../goal-state";
import {
  validateReviewStep,
  resolveReviewReadOnlyFiles,
  resolveReviewWriteAllowlist,
  postValidateReview,
} from "./callbacks";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ file: "GOAL.md" }, { file: "PLAN.md" }, { file: "S{stepNumber:02d}/COMPLETED" }, { file: "S{stepNumber:02d}/SUMMARY.md" }],
  outputs: [{ file: "S{stepNumber:02d}/REVIEW.md", schema: REVIEW_OUTPUT_SCHEMA }],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "review-task",
  contract: CONTRACT,
  readOnlyFiles: resolveReviewReadOnlyFiles,
  writeAllowlist: resolveReviewWriteAllowlist,
  prepareSession: prepareReviewSession,
  postValidate: postValidateReview,
  skills: {
    mandatory: ["tdd"],
  },
  defaultInitialMessage: (workingDir: string, params?: Record<string, unknown>) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
    if (stepNumber == null) {
      return "Error: stepNumber is required for review-task. The task was not enqueued with a valid step number.";
    }
    const folderName = stepFolderName(stepNumber);
    return `Goal workspace is at ${workingDir}. You are responsible for **Step ${stepNumber}**. Read TASK.md, TEST.md, and SUMMARY.md inside the \`${folderName}/\` directory. Review the implementation, write REVIEW.md, and decide whether to approve or reject.`;
  },
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// prepareSession — read TASK.md skills and merge into capability config
// ---------------------------------------------------------------------------

function prepareReviewSession(workingDir: string, params?: Record<string, unknown>): void {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for review-task. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  const stepDir = path.join(workingDir, folder);

  // Delete stale markers from previous review attempts; force:true skips missing files.
  fs.rmSync(path.join(stepDir, "APPROVED"), { force: true });
  fs.rmSync(path.join(stepDir, "REJECTED"), { force: true });

  // Read TASK.md skills and merge into capability config
  const state = createGoalState(workingDir);
  const step = state.steps().find(s => s.stepNumber === stepNumber);
  const taskSkills = step?.taskSkills();

  const merged = mergeCapabilitySkills(capabilityConfig.skills, taskSkills);
  setMergedSkills(merged);
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const reviewTaskTool = defineTool({
  name: "pio_review_task",
  label: "Pio Review Task",
  description:
    "Review the implementation of a plan step. Reads TASK.md, TEST.md, SUMMARY.md and implementation files. Writes REVIEW.md with categorized issues and approves or rejects. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Review code implementation for a plan step (approve/reject).",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace (under .pio/goals/<name>)" }),
    stepNumber: Type.Number({ description: "Step number to review" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await validateReviewStep(params.name, ctx.cwd, params.stepNumber);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error }], details: {} };
    }

    enqueueTask(ctx.cwd, params.name, {
      capability: "review-task",
      params: { goalName: params.name, stepNumber: result.stepNumber },
    });

    return {
      content: [
        {
          type: "text",
          text: `Review queued for Step ${result.stepNumber} of goal "${params.name}". Use \`/pio-next-task\` to start the sub-session.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleReviewTask(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-review-task <goal-name> <step-number>", "warning");
    return;
  }

  const parts = args.trim().split(/\s+/);
  const name = parts[0];
  const stepNumber = parts[1] ? parseInt(parts[1], 10) : undefined;

  if (stepNumber === undefined || isNaN(stepNumber) || stepNumber < 1) {
    ctx.ui.notify(`Step number is required. Usage: /pio-review-task <goal-name> <step-number>`, "error");
    return;
  }

  const result = await validateReviewStep(name, ctx.cwd, stepNumber);

  if (!result.ready) {
    ctx.ui.notify(result.error, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const folderName = stepFolderName(result.stepNumber);

  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "review-task", goalName: name, stepNumber: result.stepNumber });
  if (!config) {
    ctx.ui.notify("Failed to resolve review-task config.", "error");
    return;
  }

  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Setup (registers tool and command)
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI) {
  pi.registerTool(reviewTaskTool);
  pi.registerCommand("pio-review-task", {
    description:
      "Review the implementation of a plan step (approve or reject based on code quality)",
    handler: handleReviewTask,
  });
}


