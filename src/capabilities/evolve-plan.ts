import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability } from "./session-capability";
import { enqueueTask, resolveGoalDir, resolveCapabilityConfig, type StaticCapabilityConfig } from "../utils";

// ---------------------------------------------------------------------------
// Capability config — single source of truth for this capability's session shape
// ---------------------------------------------------------------------------

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "evolve-plan.md",
  // validation is set dynamically per-step; placeholder here since we override via params
  defaultInitialMessage: (workingDir, params) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : 1;
    const folderName = `S${String(stepNumber).padStart(2, "0")}`;
    return `Goal workspace is at ${workingDir}. PLAN.md exists. You are responsible for **Step ${stepNumber}**. Generate TASK.md and TEST.md inside the \`${folderName}/\` directory.`;
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_FILE = "PLAN.md";
const TASK_FILE = "TASK.md";
const TEST_FILE = "TEST.md";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a step number as a zero-padded folder name (S01, S02, ...).
 */
function stepFolderName(stepNumber: number): string {
  return `S${String(stepNumber).padStart(2, "0")}`;
}

/**
 * Check whether a step folder has both TASK.md and TEST.md.
 */
function isStepSpecComplete(goalDir: string, stepNumber: number): boolean {
  const folder = stepFolderName(stepNumber);
  const stepDir = path.join(goalDir, folder);
  if (!fs.existsSync(stepDir)) return false;

  return (
    fs.existsSync(path.join(stepDir, TASK_FILE)) &&
    fs.existsSync(path.join(stepDir, TEST_FILE))
  );
}

// ---------------------------------------------------------------------------
// Validation / Preparation
// ---------------------------------------------------------------------------

/**
 * Validate that the goal workspace exists and has a PLAN.md.
 * Then find the next step to evolve by scanning for existing S{NN}/ folders:
 *   - Check S01, S02, ... in order — if both TASK.md and TEST.md exist, move on.
 *   - The first incomplete or missing folder is the target.
 *
 * Returns { goalDir, ready, stepNumber } on success, or { goalDir, error } when not ready.
 * Does NOT use ctx so it can be called safely before newSession().
 */
async function validateAndFindNextStep(
  name: string,
  cwd: string,
): Promise<
  | { goalDir: string; ready: true; stepNumber: number }
  | { goalDir: string; ready: false; error: string }
> {
  const goalDir = resolveGoalDir(cwd, name);

  if (!fs.existsSync(goalDir)) {
    return {
      goalDir,
      ready: false,
      error: `Goal workspace "${name}" does not exist. Create it first with /pio-create-goal ${name}.`,
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

  // Find the first step number (starting at 1) whose spec folder doesn't have both TASK.md and TEST.md.
  for (let i = 1; ; i++) {
    if (!isStepSpecComplete(goalDir, i)) {
      return { goalDir, ready: true, stepNumber: i };
    }
  }
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const evolvePlanTool = defineTool({
  name: "pio_evolve_plan",
  label: "Pio Evolve Plan",
  description:
    "Generate a step-by-step specification (TASK.md + TEST.md) for the next uncompleted step in an existing PLAN.md. Queues the task — run /pio-next-task to start it.",
  promptSnippet: "Generate TASK.md + TEST.md for the next incomplete plan step.",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace (under .pio/goals/<name>)" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await validateAndFindNextStep(params.name, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error }], details: {} };
    }

    enqueueTask(ctx.cwd, {
      capability: "evolve-plan",
      params: { goalName: params.name, stepNumber: result.stepNumber },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task queued for Step ${result.stepNumber} of goal "${params.name}" — run /pio-next-task to start it.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleEvolvePlan(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-evolve-plan <goal-name>", "warning");
    return;
  }

  const name = args.trim();
  const result = await validateAndFindNextStep(name, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const folderName = stepFolderName(result.stepNumber);
  const stepDir = path.join(result.goalDir, folderName);
  fs.mkdirSync(stepDir, { recursive: true });

  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "evolve-plan", goalName: name, stepNumber: result.stepNumber });
  if (!config) {
    ctx.ui.notify("Failed to resolve evolve-plan config.", "error");
    return;
  }
  // Override validation since it's step-dependent
  config.validation = { files: [`${folderName}/TASK.md`, `${folderName}/TEST.md`] };

  // Restrict writes to the step spec files only (prevents .pio/ pre-writing)
  config.writeAllowlist = [
    `${folderName}/${TASK_FILE}`,
    `${folderName}/${TEST_FILE}`,
  ];

  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Setup (registers tool and command)
// ---------------------------------------------------------------------------

export function setupEvolvePlan(pi: ExtensionAPI) {
  pi.registerTool(evolvePlanTool);
  pi.registerCommand("pio-evolve-plan", {
    description:
      "Generate a step specification for the next uncompleted step in an existing plan",
    handler: handleEvolvePlan,
  });
}
