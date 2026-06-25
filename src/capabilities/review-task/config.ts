import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { CapState } from "../../capability-state";
import { launchCapability, setMergedSkills } from "../../capability-session";
import { mergeCapabilitySkills, BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
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

function prepareReviewSession(workspaceDir: string, params?: Record<string, unknown>): void {
  // workspaceDir is already the resolved step directory (from Step 9) — no prefix needed
  fs.rmSync(path.join(workspaceDir, "APPROVED"), { force: true });
  fs.rmSync(path.join(workspaceDir, "REJECTED"), { force: true });

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
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    const sessionName = params.sessionName ?? `${queueKey} review-task`;
    enqueueTask(ctx.cwd, queueKey, {
      capability: "review-task",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName,
        queueKey,
        initialMessage: params.initialMessage,
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
// Command
// ---------------------------------------------------------------------------

async function handleReviewTask(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || args.trim().length === 0) {
    ctx.ui.notify("Usage: /pio-review-task --workspace-prefix <prefix>", "warning");
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
    ctx.ui.notify("--workspace-prefix is required. Usage: /pio-review-task --workspace-prefix <prefix>", "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const queueKey = deriveQueueKey(workspacePrefix);
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "review-task",
    workspacePrefix,
    sessionName: `${queueKey} review-task`,
    queueKey,
    initialMessage: "Read TASK.md for the specification, SUMMARY.md for what was implemented, and verify against acceptance criteria. Write REVIEW.md.",
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
