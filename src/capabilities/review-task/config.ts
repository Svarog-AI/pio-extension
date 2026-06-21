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
import { REVIEW_OUTPUT_SCHEMA } from "./schemas";
import { TASK_FRONTMATTER_SCHEMA } from "../evolve-plan/schemas";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";
import {
  resolveReviewReadOnlyFiles,
  resolveReviewWriteAllowlist,
  postValidateReview,
  postExecuteReview,
} from "./callbacks";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [
    { name: "completed", file: "COMPLETED" },
    { name: "summary", file: "SUMMARY.md" },
    { name: "task", file: "TASK.md", schema: TASK_FRONTMATTER_SCHEMA },
  ],
  outputs: [{ name: "review", file: "REVIEW.md", schema: REVIEW_OUTPUT_SCHEMA }],
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
  postExecute: postExecuteReview,
  skills: {
    mandatory: ["tdd"],
  },
  defaultInitialMessage: () => "Ready.",
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

  // workingDir is already the resolved step directory (from Step 9) — no prefix needed
  fs.rmSync(path.join(workingDir, "APPROVED"), { force: true });
  fs.rmSync(path.join(workingDir, "REJECTED"), { force: true });

  // Read TASK.md skills and merge into capability config
  const capState = new CapState(CONTRACT, workingDir, params);
  const taskFile = capState.input<{ skills?: unknown }>("task");
  const taskData = taskFile.read();
  const taskSkills = taskData?.skills ?? null;

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
    const stepNumber = params.stepNumber;
    enqueueTask(ctx.cwd, params.name, {
      capability: "review-task",
      params: {
        workspacePrefix: `goals/${params.name}/${stepFolderName(stepNumber)}`,
        sessionName: `${params.name} review-task s${stepNumber}`,
        queueKey: params.name,
        stepNumber,
        initialMessage: `Review the implementation of Step ${stepNumber} of goal "${params.name}".`,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Review queued for Step ${stepNumber} of goal "${params.name}". Use \`/pio-next-task\` to start the sub-session.`,
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
  const parsed = parseCommandArgs(args);
  if (!parsed) {
    ctx.ui.notify("Usage: /pio-review-task <goal-name> <step-number>", "warning");
    return;
  }

  if (parsed.stepNumber === undefined) {
    ctx.ui.notify("Step number is required. Usage: /pio-review-task <goal-name> <step-number>", "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "review-task",
    workspacePrefix: `goals/${parsed.name}/${stepFolderName(parsed.stepNumber)}`,
    sessionName: `${parsed.name} review-task s${parsed.stepNumber}`,
    queueKey: parsed.name,
    stepNumber: parsed.stepNumber,
    initialMessage: `Review the implementation of Step ${parsed.stepNumber} of goal "${parsed.name}".`,
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve review-task config.", "error");
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
  pi.registerTool(reviewTaskTool);
  pi.registerCommand("pio-review-task", {
    description:
      "Review the implementation of a plan step (approve or reject based on code quality)",
    handler: handleReviewTask,
  });
}


