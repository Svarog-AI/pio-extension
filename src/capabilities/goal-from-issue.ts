import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { launchCapability } from "./session-capability";
import { enqueueTask, findIssuePath, goalExists, resolveGoalDir, resolveCapabilityConfig } from "../utils";

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

/**
 * Validate that the issue exists and no goal workspace collides.
 * Returns { ok, error? }. If ok, caller should still create the goal directory.
 */
async function validateGoalFromIssue(
  cwd: string,
  name: string,
  issuePath: string,
): Promise<{ ok: boolean; error?: string; issuePath?: string }> {
  // 1. Issue must exist — resolve to absolute path
  const resolvedPath = findIssuePath(cwd, issuePath);
  if (!resolvedPath) {
    return { ok: false, error: `Issue not found: ${issuePath}` };
  }

  // 2. Goal workspace must not already exist
  const goalDir = resolveGoalDir(cwd, name);
  if (goalExists(goalDir)) {
    return { ok: false, error: `Goal workspace already exists at ${goalDir}` };
  }

  return { ok: true, issuePath: resolvedPath };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const goalFromIssueTool = defineTool({
  name: "pio_goal_from_issue",
  label: "Pio Goal From Issue",
  description: "Convert an existing issue into a structured goal by queuing a create-goal session. Run /pio-next-task to start it.",
  parameters: Type.Object({
    name: Type.String({ description: "Name for the goal workspace" }),
    issuePath: Type.String({ description: "Issue filename or identifier (e.g. 20260101_120000.md)" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const validation = await validateGoalFromIssue(ctx.cwd, params.name, params.issuePath);
    if (!validation.ok) {
      return { content: [{ type: "text", text: validation.error! }], details: {} };
    }

    enqueueTask(ctx.cwd, {
      capability: "create-goal",
      params: {
        goalName: params.name,
        initialMessage: `Convert the following issue into a goal:\n\nIssue file: ${validation.issuePath}`,
        fileCleanup: [validation.issuePath!],
      },
    });

    return {
      content: [{ type: "text", text: `Task queued from issue — run /pio-next-task to start the goal definition session for "${params.name}".` }],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleGoalFromIssue(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-goal-from-issue <issue-identifier> <goal-name>", "warning");
    return;
  }

  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    ctx.ui.notify("Usage: /pio-goal-from-issue <issue-identifier> <goal-name>", "warning");
    return;
  }

  const issuePath = parts[0];
  const name = parts.slice(1).join(" ");

  // All validation must happen before launchCapability (ctx staleness)
  const validation = await validateGoalFromIssue(ctx.cwd, name, issuePath);
  if (!validation.ok) {
    ctx.ui.notify(validation.error!, "warning");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "create-goal",
    goalName: name,
    initialMessage: `Convert the following issue into a goal:\n\nIssue file: ${validation.issuePath}`,
    fileCleanup: [validation.issuePath!],
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve create-goal config.", "error");
    return;
  }
  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupGoalFromIssue(pi: ExtensionAPI) {
  pi.registerTool(goalFromIssueTool);
  pi.registerCommand("pio-goal-from-issue", {
    description: "Convert an existing issue into a structured goal",
    handler: handleGoalFromIssue,
  });
}
