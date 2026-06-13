import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { launchCapability } from "../../capability-session";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import { PLAN_FRONTMATTER_SCHEMA } from "../create-plan/schemas";
import type { CapabilityPackageConfig } from "../../capability-package";
import { validateRevisePlan, prepareSession, cleanupIncompleteSteps, resolveReviseReadOnlyFiles, resolveReviseWriteAllowlist } from "./callbacks";

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "revise-plan",
  contract: {
    inputs: [{ file: "GOAL.md" }, { file: "PLAN.md" }],
    outputs: [{ file: "PLAN.md", schema: PLAN_FRONTMATTER_SCHEMA }],
  },
  readOnlyFiles: resolveReviseReadOnlyFiles,
  writeAllowlist: resolveReviseWriteAllowlist,
  skills: {
    mandatory: ["pio-planning", "grill-me"],
    recommended: [
      { name: "source-research", condition: "when researching existing solutions or libraries" },
    ],
  },
  defaultInitialMessage: (workingDir: string, params?: Record<string, unknown>) => {
    const triggerStep = typeof params?.revisionTriggerStep === "number"
      ? ` Revision was triggered from Step ${params.revisionTriggerStep}. Read its TASK.md, DECISIONS.md, and REVISE_PLAN_NEEDED files to understand why revision was needed.`
      : "";

    return `Goal workspace is at ${workingDir}. The current plan has been archived to PLAN_ARCHIVE/. Incomplete step folders are preserved for inspection during this session and will be cleaned up after completion.${triggerStep} Read the archived plans and completed step folders, then write a fresh PLAN.md continuing from the last completed step.`;
  },
  prepareSession,
  postExecute: cleanupIncompleteSteps,
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const revisePlanTool = defineTool({
  name: "pio_revise_plan",
  label: "Pio Revise Plan",
  description:
    "Archive the current PLAN.md, clean up incomplete step folders, and queue a planning session to write a fresh plan for remaining work. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Archive current plan and queue a fresh planning session.",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace (under .pio/goals/<name>)" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await validateRevisePlan(params.name, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error! }], details: {} };
    }

    enqueueTask(ctx.cwd, params.name, {
      capability: "revise-plan",
      params: { goalName: params.name },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task queued for goal "${params.name}". Use \`/pio-next-task\` to start the sub-session.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleRevisePlan(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-revise-plan <goal-name>", "warning");
    return;
  }

  const name = args.trim();
  const result = await validateRevisePlan(name, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error!, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "revise-plan", goalName: name });
  if (!config) {
    ctx.ui.notify("Failed to resolve revise-plan config.", "error");
    return;
  }

  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Setup (registers tool and command)
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI) {
  pi.registerTool(revisePlanTool);
  pi.registerCommand("pio-revise-plan", {
    description: "Archive the current plan and launch a session to write a fresh plan",
    handler: handleRevisePlan,
  });
}


