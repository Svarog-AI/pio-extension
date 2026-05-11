import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import { Type } from "typebox";
import { launchCapability } from "./session-capability";
import { enqueueTask, findIssuePath, goalExists, resolveGoalDir, resolveCapabilityConfig } from "../utils";

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

/**
 * Validate that the issue exists and no goal workspace collides.
 * Derives the goal name from the issue filename (stripping .md).
 * Returns { ok, error?, goalName?, issuePath? }. If ok, caller should still create the goal directory.
 */
async function validateGoalFromIssue(
  cwd: string,
  issuePath: string,
): Promise<{ ok: boolean; error?: string; goalName?: string; issuePath?: string }> {
  // 1. Issue must exist — resolve to absolute path
  const resolvedPath = findIssuePath(cwd, issuePath);
  if (!resolvedPath) {
    return { ok: false, error: `Issue not found: ${issuePath}` };
  }

  // 2. Derive goal name from the issue filename slug
  const goalName = path.basename(resolvedPath, ".md");

  // 3. Goal workspace must not already exist
  const goalDir = resolveGoalDir(cwd, goalName);
  if (goalExists(goalDir)) {
    return { ok: false, error: `Goal workspace already exists at ${goalDir}` };
  }

  return { ok: true, goalName, issuePath: resolvedPath };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const goalFromIssueTool = defineTool({
  name: "pio_goal_from_issue",
  label: "Pio Goal From Issue",
  description: "Convert an existing issue into a structured goal by queuing a create-goal session. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  parameters: Type.Object({
    issuePath: Type.String({ description: "Issue filename or identifier (e.g. fix-something.md or fix-something)" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const validation = await validateGoalFromIssue(ctx.cwd, params.issuePath);
    if (!validation.ok) {
      return { content: [{ type: "text", text: validation.error! }], details: {} };
    }

    const goalName = validation.goalName!;

    enqueueTask(ctx.cwd, goalName, {
      capability: "create-goal",
      params: {
        goalName,
        initialMessage: `Convert the following issue into a goal:\n\nIssue file: ${validation.issuePath}`,
        fileCleanup: [validation.issuePath!],
      },
    });

    return {
      content: [{ type: "text", text: `Task queued from issue. Use \`/pio-next-task\` to start the goal definition session for "${goalName}".` }],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleGoalFromIssue(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-goal-from-issue <issue-identifier>", "warning");
    return;
  }

  const issuePath = args.trim();

  // All validation must happen before launchCapability (ctx staleness)
  const validation = await validateGoalFromIssue(ctx.cwd, issuePath);
  if (!validation.ok) {
    ctx.ui.notify(validation.error!, "warning");
    return;
  }

  const goalName = validation.goalName!;

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "create-goal",
    goalName,
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
