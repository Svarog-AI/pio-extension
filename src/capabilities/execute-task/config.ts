import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { CapState } from "../../capability-state";
import { launchCapability, setMergedSkills } from "../../capability-session";
import { mergeCapabilitySkills } from "../../capability-utils";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import { TASK_FRONTMATTER_SCHEMA } from "../evolve-plan/schemas";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";
import { resolveExecuteReadOnlyFiles } from "./callbacks";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ name: "task", file: "TASK.md", schema: TASK_FRONTMATTER_SCHEMA }],
  excludedFiles: ["REVISE_PLAN_NEEDED"],
  outputs: [{ name: "test", file: "TEST.md" }, { name: "summary", file: "SUMMARY.md" }],
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
  defaultInitialMessage: (workspaceDir: string, _params?: Record<string, unknown>) => {
    // workspaceDir is already the resolved step directory (from Step 9).
    // Check for REJECTED marker at workspace root — no folder construction needed.
    let prefix = "";
    try {
      if (fs.existsSync(path.join(workspaceDir, "REJECTED"))) {
        prefix = "This step was previously rejected. Read `REVIEW.md` for detailed review feedback before implementing. Address all critical and high-priority issues identified in the review.\n\n";
      }
    } catch {
      // If filesystem read fails, fall through to the normal message
    }
    return `${prefix}Working directory is ${workspaceDir}. Read TASK.md and resolve the task.`;
  },
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// prepareSession — read TASK.md skills and merge into capability config
// ---------------------------------------------------------------------------

function prepareExecuteSession(workingDir: string, params?: Record<string, unknown>): void {
  // CONTRACT uses plain "TASK.md" — no placeholders need resolving
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

const executeTaskTool = defineTool({
  name: "pio_execute_task",
  label: "Pio Execute Task",
  description:
    "Execute a single plan step using an iterative TDD workflow. Reads TASK.md, applies tracer-bullet development via the tdd skill, and produces implementation with post-hoc TEST.md. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Execute a single plan step (test-first implementation).",
  parameters: Type.Object({
    name: Type.String({ description: "Workspace name (used as queue key)" }),
    workspacePrefix: Type.String({ description: "Workspace prefix for path resolution, e.g. 'goals/my-feature/S03'" }),
    sessionName: Type.Optional(Type.String({ description: "Human-readable session name" })),
    initialMessage: Type.Optional(Type.String({ description: "Custom kickoff message for the session" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const sessionName = params.sessionName ?? `${params.name} execute-task`;
    const initialMessage = params.initialMessage ?? "Ready.";
    enqueueTask(ctx.cwd, params.name, {
      capability: "execute-task",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName,
        queueKey: params.name,
        initialMessage,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task queued for workspace "${params.name}". Use \`/pio-next-task\` to start the sub-session.`,
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
  // Parse args locally: <name> --workspace-prefix <prefix>
  if (!args || args.trim().length === 0) {
    ctx.ui.notify("Usage: /pio-execute-task <name> --workspace-prefix <prefix>", "warning");
    return;
  }
  const tokens = args.trim().split(/\s+/);
  const name = tokens[0];
  let workspacePrefix: string | undefined;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === "--workspace-prefix" && tokens[i + 1]) {
      workspacePrefix = tokens[++i];
    }
  }
  if (!workspacePrefix) {
    ctx.ui.notify("--workspace-prefix is required. Usage: /pio-execute-task <name> --workspace-prefix <prefix>", "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "execute-task",
    workspacePrefix,
    sessionName: `${name} execute-task`,
    queueKey: name,
    initialMessage: `Working directory is ${workspacePrefix}. Read TASK.md and resolve the task.`,
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


