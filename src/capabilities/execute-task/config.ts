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

import { EXECUTION_SUMMARY_SCHEMA } from "./schemas";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [
    { name: "task", paramKey: "taskFile", schema: TASK_FRONTMATTER_SCHEMA },
  ],
  excludedFiles: ["REVISE_PLAN_NEEDED"],
  outputs: [
    { name: "test", file: "TEST.md" },
    { name: "summary", file: "SUMMARY.md", schema: EXECUTION_SUMMARY_SCHEMA },
  ],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "execute-task",
  contract: CONTRACT,

  prepareSession: prepareExecuteSession,
  allowProjectWrites: true,
  skills: {
    mandatory: ["tdd", "pio-git"],
  },
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// prepareSession — read TASK.md skills and merge into capability config
// ---------------------------------------------------------------------------

function prepareExecuteSession(
  workspaceDir: string,
  params?: Record<string, unknown>,
): void {
  // CONTRACT uses plain "TASK.md" — no placeholders need resolving
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

const executeTaskTool = defineTool({
  name: "pio_execute_task",
  label: "Pio Execute Task",
  description:
    "Execute a single plan step using an iterative TDD workflow. Reads TASK.md, applies tracer-bullet development via the tdd skill, and produces implementation with post-hoc TEST.md. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Execute a single plan step (test-first implementation).",
  parameters: Type.Object({
    ...BASE_TOOL_PARAMS,
    taskFile: Type.Optional(Type.String()),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    const sessionName = params.sessionName ?? `${queueKey} execute-task`;
    enqueueTask(ctx.cwd, queueKey, {
      capability: "execute-task",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName,
        queueKey,
        additionalContext: params.additionalContext,
        taskFile: params.taskFile,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task queued for workspace "${params.workspacePrefix}". Use \`/pio-next-task\` to start the sub-session.`,
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
  pi.registerTool(executeTaskTool);
}
