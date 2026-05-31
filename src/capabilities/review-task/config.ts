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
import { REVIEW_OUTPUT_SCHEMA } from "../../frontmatter-schemas";
import {
  validateStepForReview,
  validateAndFindReviewStep,
  resolveReviewValidation,
  resolveReviewReadOnlyFiles,
  resolveReviewWriteAllowlist,
  postValidateReview,
} from "./validators";

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

  const merged = mergeCapabilitySkills(CAPABILITY_CONFIG.skills, taskSkills);
  setMergedSkills(merged);
}

// ---------------------------------------------------------------------------
// Default export: CapabilityPackageConfig (new-style package config)
// ---------------------------------------------------------------------------

export default {
  capability: "review-task",
  validation: resolveReviewValidation,
  readOnlyFiles: resolveReviewReadOnlyFiles,
  writeAllowlist: resolveReviewWriteAllowlist,
  prepareSession: prepareReviewSession,
  postValidate: postValidateReview,
  skills: {
    mandatory: ["tdd"],
  },
  frontmatterSchemas: [
    { outputFile: "REVIEW.md", schema: REVIEW_OUTPUT_SCHEMA },
  ],
  defaultInitialMessage: (workingDir: string, params?: Record<string, unknown>) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
    if (stepNumber == null) {
      return "Error: stepNumber is required for review-task. The task was not enqueued with a valid step number.";
    }
    const folderName = stepFolderName(stepNumber);
    return `Goal workspace is at ${workingDir}. You are responsible for **Step ${stepNumber}**. Read TASK.md, TEST.md, and SUMMARY.md inside the \`${folderName}/\` directory. Review the implementation, write REVIEW.md, and decide whether to approve or reject.`;
  },
} satisfies CapabilityPackageConfig;

// ---------------------------------------------------------------------------
// Backward-compat export: CAPABILITY_CONFIG (for resolveCapabilityConfig until Step 21)
// ---------------------------------------------------------------------------

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "review-task.md",
  skills: {
    mandatory: ["tdd"],
  },
  validation: resolveReviewValidation,
  readOnlyFiles: resolveReviewReadOnlyFiles,
  writeAllowlist: resolveReviewWriteAllowlist,
  prepareSession: prepareReviewSession,
  postValidate: postValidateReview,
  defaultInitialMessage: (workingDir, params) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
    if (stepNumber == null) {
      return "Error: stepNumber is required for review-task. The task was not enqueued with a valid step number.";
    }
    const folderName = stepFolderName(stepNumber);
    return `Goal workspace is at ${workingDir}. You are responsible for **Step ${stepNumber}**. Read TASK.md, TEST.md, and SUMMARY.md inside the \`${folderName}/\` directory. Review the implementation, write REVIEW.md, and decide whether to approve or reject.`;
  },
};

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
    stepNumber: Type.Optional(Type.Number({ description: "Explicit step number to review (optional — auto-finds most recently completed step)" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = params.stepNumber
      ? await validateStepForReview(params.name, ctx.cwd, params.stepNumber)
      : await validateAndFindReviewStep(params.name, ctx.cwd);

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
    ctx.ui.notify("Usage: /pio-review-task <goal-name> [step-number]", "warning");
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
    ? await validateStepForReview(name, ctx.cwd, explicitStep)
    : await validateAndFindReviewStep(name, ctx.cwd);

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

// Backward-compat: old index.ts imports setupReviewTask
export { register as setupReviewTask };
