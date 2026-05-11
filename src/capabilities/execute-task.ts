import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability } from "./session-capability";
import { enqueueTask, resolveGoalDir, resolveCapabilityConfig, stepFolderName, type StaticCapabilityConfig } from "../utils";

// ---------------------------------------------------------------------------
// Capability config — single source of truth for this capability's session shape
// ---------------------------------------------------------------------------

// Callbacks for step-dependent config fields (used by resolveCapabilityConfig)
function resolveExecuteValidation(_dir: string, params?: Record<string, unknown>): { files: string[] } {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for execute-task. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  return { files: [`${folder}/${SUMMARY_FILE}`] };
}

function resolveExecuteReadOnlyFiles(_dir: string, params?: Record<string, unknown>): string[] {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for execute-task. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  return [`${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`];
}

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "execute-task.md",
  validation: resolveExecuteValidation,
  readOnlyFiles: resolveExecuteReadOnlyFiles,
  defaultInitialMessage: (workingDir, params) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
    if (stepNumber == null) {
      return "Error: stepNumber is required for execute-task. The task was not enqueued with a valid step number.";
    }
    const folderName = stepFolderName(stepNumber);
    return `Goal workspace is at ${workingDir}. You are responsible for **Step ${stepNumber}**. Read TASK.md and TEST.md inside the \`${folderName}/\` directory, write tests first, then implement the feature to make them pass.`;
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_FILE = "PLAN.md";
const GOAL_FILE = "GOAL.md";
const TASK_FILE = "TASK.md";
const TEST_FILE = "TEST.md";
const COMPLETED_MARKER = "COMPLETED";
const BLOCKED_MARKER = "BLOCKED";
const SUMMARY_FILE = "SUMMARY.md";

/**
 * Check whether a step is ready for execution: both TASK.md and TEST.md exist,
 * but neither COMPLETED nor BLOCKED marker has been written yet.
 */
export function isStepReady(goalDir: string, stepNumber: number): boolean {
  const folder = stepFolderName(stepNumber);
  const stepDir = path.join(goalDir, folder);
  if (!fs.existsSync(stepDir)) return false;

  const hasTask = fs.existsSync(path.join(stepDir, TASK_FILE));
  const hasTest = fs.existsSync(path.join(stepDir, TEST_FILE));
  const hasCompleted = fs.existsSync(path.join(stepDir, COMPLETED_MARKER));
  const hasBlocked = fs.existsSync(path.join(stepDir, BLOCKED_MARKER));

  return hasTask && hasTest && !hasCompleted && !hasBlocked;
}

// ---------------------------------------------------------------------------
// Validation / Preparation
// ---------------------------------------------------------------------------

/**
 * Validate that the goal workspace exists with both GOAL.md and PLAN.md.
 * Then scan S01/, S02/, … for the first step where TASK.md + TEST.md exist
 * but no COMPLETED/BLOCKED marker is present yet.
 *
 * Returns { goalDir, ready: true, stepNumber } on success,
 * or { goalDir, ready: false, error } when not ready.
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

  const goalPath = path.join(goalDir, GOAL_FILE);
  if (!fs.existsSync(goalPath)) {
    return {
      goalDir,
      ready: false,
      error: `GOAL.md not found at "${goalPath}". Create a goal first with /pio-create-goal ${name}.`,
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

  // Find the first step number (starting at 1) that is ready for execution.
  for (let i = 1; ; i++) {
    if (isStepReady(goalDir, i)) {
      return { goalDir, ready: true, stepNumber: i };
    }

    // If we reach a step where the folder doesn't exist or specs are missing,
    // there's no ready step beyond this point.
    const folder = stepFolderName(i);
    const stepDir = path.join(goalDir, folder);
    if (!fs.existsSync(stepDir)) break;

    const hasTask = fs.existsSync(path.join(stepDir, TASK_FILE));
    const hasTest = fs.existsSync(path.join(stepDir, TEST_FILE));
    if (!hasTask || !hasTest) break;
  }

  return {
    goalDir,
    ready: false,
    error: `No ready steps found for goal "${name}". All steps are either completed or missing specs (TASK.md/TEST.md). Run /pio-evolve-plan ${name} to generate specs.`,
  };
}

/**
 * Validate that an explicitly requested step has both TASK.md and TEST.md.
 */
async function validateExplicitStep(
  name: string,
  cwd: string,
  stepNumber: number,
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

  const folder = stepFolderName(stepNumber);
  const stepDir = path.join(goalDir, folder);

  if (!fs.existsSync(stepDir)) {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} folder "${folder}/" does not exist in goal "${name}". Run /pio-evolve-plan ${name} to generate specs.`,
    };
  }

  const hasTask = fs.existsSync(path.join(stepDir, TASK_FILE));
  const hasTest = fs.existsSync(path.join(stepDir, TEST_FILE));

  if (!hasTask || !hasTest) {
    const missing: string[] = [];
    if (!hasTask) missing.push(TASK_FILE);
    if (!hasTest) missing.push(TEST_FILE);
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} is missing ${missing.join(" and ")} in "${folder}/". Run /pio-evolve-plan ${name} to generate specs.`,
    };
  }

  // Check if already completed or blocked
  const hasCompleted = fs.existsSync(path.join(stepDir, COMPLETED_MARKER));
  const hasBlocked = fs.existsSync(path.join(stepDir, BLOCKED_MARKER));

  if (hasCompleted) {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} is already marked as COMPLETED.`,
    };
  }

  if (hasBlocked) {
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} is marked as BLOCKED. Resolve the blocking issue or re-run /pio-evolve-plan ${name} to regenerate specs.`,
    };
  }

  return { goalDir, ready: true, stepNumber };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const executeTaskTool = defineTool({
  name: "pio_execute_task",
  label: "Pio Execute Task",
  description:
    "Execute a single plan step using a test-first workflow. Reads TASK.md and TEST.md, writes tests first, then implements the feature. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Execute a single plan step (test-first implementation).",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace (under .pio/goals/<name>)" }),
    stepNumber: Type.Optional(Type.Number({ description: "Explicit step number to execute (optional — auto-finds next ready step)" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = params.stepNumber
      ? await validateExplicitStep(params.name, ctx.cwd, params.stepNumber)
      : await validateAndFindNextStep(params.name, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error }], details: {} };
    }

    enqueueTask(ctx.cwd, params.name, {
      capability: "execute-task",
      params: { goalName: params.name, stepNumber: result.stepNumber },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task queued for Step ${result.stepNumber} of goal "${params.name}". Use \`/pio-next-task\` to start the sub-session.`,
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
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-execute-task <goal-name> [step-number]", "warning");
    return;
  }

  const parts = args.trim().split(/\s+/);
  const name = parts[0];
  const explicitStep = parts[1] ? parseInt(parts[1], 10) : undefined;

  // Validate explicit step number if provided
  if (explicitStep !== undefined && (isNaN(explicitStep) || explicitStep < 1)) {
    ctx.ui.notify(`Invalid step number: "${parts[1]}". Must be a positive integer.`, "error");
    return;
  }

  const result = explicitStep
    ? await validateExplicitStep(name, ctx.cwd, explicitStep)
    : await validateAndFindNextStep(name, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const folderName = stepFolderName(result.stepNumber);
  const stepDir = path.join(result.goalDir, folderName);
  fs.mkdirSync(stepDir, { recursive: true });

  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "execute-task", goalName: name, stepNumber: result.stepNumber });
  if (!config) {
    ctx.ui.notify("Failed to resolve execute-task config.", "error");
    return;
  }

  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Setup (registers tool and command)
// ---------------------------------------------------------------------------

export function setupExecuteTask(pi: ExtensionAPI) {
  pi.registerTool(executeTaskTool);
  pi.registerCommand("pio-execute-task", {
    description:
      "Execute a single plan step using a test-first workflow (write tests first, then implement)",
    handler: handleExecuteTask,
  });
}
