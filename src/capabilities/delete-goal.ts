import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";

import { resolveGoalDir, goalExists } from "../utils";

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

async function deleteGoal(name: string, cwd: string): Promise<string> {
  const goalDir = resolveGoalDir(cwd, name);

  if (!goalExists(goalDir)) {
    return `Goal workspace not found at ${goalDir}`;
  }

  fs.rmSync(goalDir, { recursive: true });
  return `Deleted goal workspace at ${goalDir}`;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const deleteGoalTool = defineTool({
  name: "pio_delete_goal",
  label: "Pio Delete Goal",
  description: "Delete a goal workspace under .pio/<name>",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace to delete" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const extCtx = ctx as unknown as ExtensionCommandContext;
    const result = await deleteGoal(params.name, extCtx.cwd);
    return {
      content: [{ type: "text", text: result }],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleDeleteGoal(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-delete-goal <name>", "warning");
    return;
  }

  const result = await deleteGoal(args.trim(), ctx.cwd);
  ctx.ui.notify(result, "info");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupDeleteGoal(pi: ExtensionAPI) {
  pi.registerTool(deleteGoalTool);
  pi.registerCommand("pio-delete-goal", {
    description: "Delete a goal workspace under .pio/<name>",
    handler: handleDeleteGoal,
  });
}
