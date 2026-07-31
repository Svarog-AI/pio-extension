import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CapabilityPackageConfig } from "../../capability-package";
import { setMergedSkills } from "../../capability-session";
import { CapState } from "../../capability-state";
import {
  BASE_TOOL_PARAMS,
  deriveQueueKey,
  mergeCapabilitySkills,
} from "../../capability-utils";
import { enqueueTask } from "../../queues";
import type { CapabilityContract } from "../../types";
import { TASK_FRONTMATTER_SCHEMA } from "../evolve-plan/schemas";
import {
  postValidateReview,
  resolveReviewReadOnlyFiles,
  resolveReviewWriteAllowlist,
} from "./callbacks";
import { REVIEW_OUTPUT_SCHEMA } from "./schemas";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [
    { name: "completed", paramKey: "completedMarker" },
    { name: "summary", paramKey: "summaryFile" },
    { name: "task", paramKey: "taskFile", schema: TASK_FRONTMATTER_SCHEMA },
  ],
  outputs: [
    { name: "review", file: "REVIEW.md", schema: REVIEW_OUTPUT_SCHEMA },
  ],
  markers: [
    {
      outputFile: "review",
      field: "decision",
      values: {
        APPROVED: "APPROVED",
        REJECTED: "REJECTED",
        BLOCKED: "BLOCKED",
      },
    },
  ],
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
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// prepareSession — read TASK.md skills and merge into capability config
// ---------------------------------------------------------------------------

function prepareReviewSession(
  workspaceDir: string,
  params?: Record<string, unknown>,
): void {
  // Read TASK.md skills and merge into capability config
  const capState = new CapState(CONTRACT, workspaceDir, params);
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
    ...BASE_TOOL_PARAMS,
    completedMarker: Type.Optional(Type.String()),
    summaryFile: Type.Optional(Type.String()),
    taskFile: Type.Optional(Type.String()),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    const sessionName = params.sessionName ?? `${queueKey} review-task`;
    enqueueTask(ctx.cwd, queueKey, {
      capability: "review-task",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName,
        queueKey,
        additionalContext: params.additionalContext,
        completedMarker: params.completedMarker,
        summaryFile: params.summaryFile,
        taskFile: params.taskFile,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Review queued for workspace "${params.workspacePrefix}". Use \`/pio-next-task\` to start the sub-session.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Setup (registers tool)
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI) {
  pi.registerTool(reviewTaskTool);
}
