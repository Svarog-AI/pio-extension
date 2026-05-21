import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability } from "./session-capability";
import { resolveGoalDir, stepFolderName } from "../fs-utils";
import { enqueueTask } from "../queues";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";
import { createGoalState } from "../goal-state";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOAL_FILE = "GOAL.md";
const PLAN_FILE = "PLAN.md";
const PLAN_ARCHIVE_DIR = "PLAN_ARCHIVE";
export const REVISE_PLAN_MARKER = "REVISE_PLAN_NEEDED";

// ---------------------------------------------------------------------------
// Validation — inline, before queuing/launching
// ---------------------------------------------------------------------------

/**
 * Validate that the goal workspace exists, has GOAL.md, and has PLAN.md.
 * Returns { goalDir, ready } on success, or { goalDir, error } when not ready.
 * Does NOT use ctx so it can be called safely before newSession().
 */
export async function validateRevisePlan(
  name: string,
  cwd: string,
): Promise<{ goalDir: string; ready: boolean; error?: string }> {
  const goalDir = resolveGoalDir(cwd, name);

  if (!fs.existsSync(goalDir)) {
    return {
      goalDir,
      ready: false,
      error: `Goal workspace "${name}" does not exist. Create it first with /pio-create-goal ${name}.`,
    };
  }

  const goalPath = path.join(goalDir, GOAL_FILE);
  if (!fs.existsSync(goalPath)) {
    return {
      goalDir,
      ready: false,
      error: `GOAL.md not found at "${goalPath}". Complete the goal definition first.`,
    };
  }

  const planPath = path.join(goalDir, PLAN_FILE);
  if (!fs.existsSync(planPath)) {
    return {
      goalDir,
      ready: false,
      error: `PLAN.md not found at "${planPath}". Create a plan first with /pio-create-plan ${name}.`,
    };
  }

  return { goalDir, ready: true };
}

// ---------------------------------------------------------------------------
// prepareSession — mechanical cleanup before the agent starts
// ---------------------------------------------------------------------------

/**
 * Handles all mechanical filesystem cleanup before the revise-plan agent starts:
 * 1. Archives current PLAN.md to PLAN_ARCHIVE/ with a timestamped filename
 * 2. Deletes all non-APPROVED S{NN}/ step folders
 * 3. Cleans up REVISE_PLAN_NEEDED marker if revisionTriggerStep is provided
 */
export async function prepareSession(
  workingDir: string,
  params?: Record<string, unknown>,
): Promise<void> {
  // Step 1: Archive current PLAN.md
  const planPath = path.join(workingDir, PLAN_FILE);
  if (fs.existsSync(planPath)) {
    const archiveDir = path.join(workingDir, PLAN_ARCHIVE_DIR);
    fs.mkdirSync(archiveDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "");
    const archiveFilename = `PLAN-${timestamp}.md`;
    const archivePath = path.join(archiveDir, archiveFilename);

    // Copy-then-delete is safe: if delete fails, we still have both files
    fs.copyFileSync(planPath, archivePath);
    fs.unlinkSync(planPath);
  }

  // Step 2: Delete non-APPROVED step folders
  const state = createGoalState(workingDir);
  for (const step of state.steps()) {
    if (step.status() !== "approved") {
      const stepDir = path.join(workingDir, step.folderName);
      fs.rmSync(stepDir, { recursive: true, force: true });
    }
  }

  // Step 3: Clean up REVISE_PLAN_NEEDED marker if revisionTriggerStep is provided
  const revisionTriggerStep = typeof params?.revisionTriggerStep === "number"
    ? params.revisionTriggerStep
    : undefined;

  if (revisionTriggerStep != null) {
    const folderName = stepFolderName(revisionTriggerStep);
    const markerPath = path.join(workingDir, folderName, REVISE_PLAN_MARKER);
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Config callbacks
// ---------------------------------------------------------------------------

function resolveReviseReadOnlyFiles(workingDir: string, _params?: Record<string, unknown>): string[] {
  const state = createGoalState(workingDir);
  const readOnly: string[] = [];

  // All remaining S{NN}/ folders (those with APPROVED markers) are read-only
  for (const step of state.steps()) {
    if (step.status() === "approved") {
      readOnly.push(`${step.folderName}/*`);
    }
  }

  return readOnly;
}

function resolveReviseWriteAllowlist(_workingDir: string, _params?: Record<string, unknown>): string[] {
  return ["PLAN.md"];
}

// ---------------------------------------------------------------------------
// Capability config — single source of truth for this capability's session shape
// ---------------------------------------------------------------------------

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "revise-plan.md",
  validation: { files: [PLAN_FILE] },
  readOnlyFiles: resolveReviseReadOnlyFiles,
  writeAllowlist: resolveReviseWriteAllowlist,
  defaultInitialMessage: (workingDir, params) => {
    const triggerStep = typeof params?.revisionTriggerStep === "number"
      ? ` Revision was triggered from Step ${params.revisionTriggerStep}.`
      : "";

    return `Goal workspace is at ${workingDir}. The current plan has been archived to PLAN_ARCHIVE/ and incomplete step folders have been cleaned up.${triggerStep} Read the archived plans and completed step folders, then write a fresh PLAN.md continuing from the last completed step.`;
  },
  prepareSession,
};

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

export function setupRevisePlan(pi: ExtensionAPI) {
  pi.registerTool(revisePlanTool);
  pi.registerCommand("pio-revise-plan", {
    description: "Archive the current plan and launch a session to write a fresh plan",
    handler: handleRevisePlan,
  });
}
