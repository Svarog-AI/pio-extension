import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";

import { launchCapability } from "./session-capability";
import { resolveGoalDir } from "../fs-utils";
import { enqueueTask } from "../queues";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";

// ---------------------------------------------------------------------------
// Capability config — single source of truth for this capability's session shape
// ---------------------------------------------------------------------------

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "create-plan.md",
  validation: { files: ["PLAN.md"] },
  readOnlyFiles: ["GOAL.md"],
  writeAllowlist: ["PLAN.md"],
  defaultInitialMessage: (goalDir) => `Goal workspace is at ${goalDir}. GOAL.md exists. Create PLAN.md in this directory.`,
};

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

const GOAL_FILE = "GOAL.md";
const PLAN_FILE = "PLAN.md";

/**
 * Validate that the goal workspace exists, has a GOAL.md, and does not yet have a PLAN.md.
 * Returns { goalDir, ready } — call launchCapability separately.
 * Does NOT use ctx so it can be called safely before newSession().
 */
async function validateGoal(name: string, cwd: string): Promise<{ goalDir: string; ready: boolean; error?: string }> {
  const goalDir = resolveGoalDir(cwd, name);

  if (!fs.existsSync(goalDir)) {
    return { goalDir, ready: false, error: `Goal workspace "${name}" does not exist. Create it first with /pio-create-goal ${name}.` };
  }

  const goalPath = `${goalDir}/${GOAL_FILE}`;
  if (!fs.existsSync(goalPath)) {
    return { goalDir, ready: false, error: `GOAL.md not found at "${goalPath}". Complete the goal definition first.` };
  }

  const planPath = `${goalDir}/${PLAN_FILE}`;
  if (fs.existsSync(planPath)) {
    return { goalDir, ready: false, error: `PLAN.md already exists at "${planPath}". Delete it or start executing steps if you want to redo the plan.` };
  }

  return { goalDir, ready: true };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const createPlanTool = defineTool({
  name: "pio_create_plan",
  label: "Pio Create Plan",
  description: "Create a detailed implementation plan (PLAN.md) for an existing goal. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Create an implementation plan (PLAN.md) for an existing goal.",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace (under .pio/goals/<name>)" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await validateGoal(params.name, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error! }], details: {} };
    }

    enqueueTask(ctx.cwd, params.name, {
      capability: "create-plan",
      params: { goalName: params.name },
    });

    return { content: [{ type: "text", text: `Task queued for goal "${params.name}". Use \`/pio-next-task\` to start the sub-session.` }], details: {} };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleCreatePlan(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-create-plan <goal-name>", "warning");
    return;
  }

  const name = args.trim();
  const result = await validateGoal(name, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error!, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "create-plan", goalName: name });
  if (!config) {
    ctx.ui.notify("Failed to resolve create-plan config.", "error");
    return;
  }
  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Setup (registers tool and command)
// ---------------------------------------------------------------------------

export function setupCreatePlan(pi: ExtensionAPI) {
  pi.registerTool(createPlanTool);
  pi.registerCommand("pio-create-plan", {
    description: "Create an implementation plan for a goal and launch a create-plan session",
    handler: handleCreatePlan,
  });
}
