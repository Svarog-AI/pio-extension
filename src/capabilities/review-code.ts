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
function resolveReviewValidation(_dir: string, params?: Record<string, unknown>): { files: string[] } {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for review-code. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  return { files: [`${folder}/${REVIEW_FILE}`] };
}

function resolveReviewReadOnlyFiles(_dir: string, params?: Record<string, unknown>): string[] {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for review-code. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  return [
    GOAL_FILE,
    PLAN_FILE,
    `${folder}/${TASK_FILE}`,
    `${folder}/${TEST_FILE}`,
    `${folder}/${SUMMARY_FILE}`,
  ];
}

function resolveReviewWriteAllowlist(_dir: string, params?: Record<string, unknown>): string[] {
  const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
  if (stepNumber == null) {
    throw new Error("stepNumber is required for review-code. Ensure the task was enqueued with a valid step number.");
  }
  const folder = stepFolderName(stepNumber);
  return [`${folder}/${REVIEW_FILE}`, `${folder}/APPROVED`];
}

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "review-code.md",
  validation: resolveReviewValidation,
  readOnlyFiles: resolveReviewReadOnlyFiles,
  writeAllowlist: resolveReviewWriteAllowlist,
  defaultInitialMessage: (workingDir, params) => {
    const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
    if (stepNumber == null) {
      return "Error: stepNumber is required for review-code. The task was not enqueued with a valid step number.";
    }
    const folderName = stepFolderName(stepNumber);
    return `Goal workspace is at ${workingDir}. You are responsible for **Step ${stepNumber}**. Read TASK.md, TEST.md, and SUMMARY.md inside the \`${folderName}/\` directory. Review the implementation, write REVIEW.md, and decide whether to approve or reject.`;
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
const REVIEW_FILE = "REVIEW.md";

/**
 * Check whether a step has been completed and is ready for review:
 * COMPLETED marker exists, SUMMARY.md exists, and no BLOCKED marker.
 */
export function isStepReviewable(goalDir: string, stepNumber: number): boolean {
  const folder = stepFolderName(stepNumber);
  const stepDir = path.join(goalDir, folder);
  if (!fs.existsSync(stepDir)) return false;

  const hasCompleted = fs.existsSync(path.join(stepDir, COMPLETED_MARKER));
  const hasSummary = fs.existsSync(path.join(stepDir, SUMMARY_FILE));
  const hasBlocked = fs.existsSync(path.join(stepDir, BLOCKED_MARKER));

  return hasCompleted && hasSummary && !hasBlocked;
}

/**
 * Find the most recently completed step by scanning S01/, S02/, ... in descending order.
 * Returns the step number or undefined if no completed step found.
 */
export function findMostRecentCompletedStep(goalDir: string): number | undefined {
  // First, find the highest step folder that exists
  let maxStep = 0;
  for (let i = 1; ; i++) {
    const folder = stepFolderName(i);
    const stepDir = path.join(goalDir, folder);
    if (!fs.existsSync(stepDir)) break;
    maxStep = i;
  }

  // Scan from highest to lowest for a reviewable step
  for (let i = maxStep; i >= 1; i--) {
    if (isStepReviewable(goalDir, i)) {
      return i;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Validation / Preparation
// ---------------------------------------------------------------------------

/**
 * Validate that the goal workspace exists and the specified step is ready for review.
 * The step must have COMPLETED marker and SUMMARY.md (was executed successfully).
 */
async function validateStepForReview(
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

  if (!isStepReviewable(goalDir, stepNumber)) {
    const folder = stepFolderName(stepNumber);
    const stepDir = path.join(goalDir, folder);

    if (!fs.existsSync(stepDir)) {
      return {
        goalDir,
        ready: false,
        error: `Step ${stepNumber} folder "${folder}/" does not exist. Run /pio-evolve-plan ${name} to generate specs first.`,
      };
    }

    const hasCompleted = fs.existsSync(path.join(stepDir, COMPLETED_MARKER));
    if (!hasCompleted) {
      return {
        goalDir,
        ready: false,
        error: `Step ${stepNumber} is not yet completed. Run /pio-execute-task ${name} ${stepNumber} first.`,
      };
    }

    const hasSummary = fs.existsSync(path.join(stepDir, SUMMARY_FILE));
    if (!hasSummary) {
      return {
        goalDir,
        ready: false,
        error: `Step ${stepNumber} is missing SUMMARY.md. Re-run /pio-execute-task ${name} ${stepNumber}.`,
      };
    }

    const hasBlocked = fs.existsSync(path.join(stepDir, BLOCKED_MARKER));
    if (hasBlocked) {
      return {
        goalDir,
        ready: false,
        error: `Step ${stepNumber} is marked as BLOCKED. Resolve the blocking issue first.`,
      };
    }

    // COMPLETED + SUMMARY but we got here — shouldn't happen, but guard anyway
    return {
      goalDir,
      ready: false,
      error: `Step ${stepNumber} is not in a reviewable state.`,
    };
  }

  return { goalDir, ready: true, stepNumber };
}

/**
 * Validate that the goal workspace exists and find the most recently completed step for review.
 */
async function validateAndFindReviewStep(
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

  const stepNumber = findMostRecentCompletedStep(goalDir);
  if (stepNumber === undefined) {
    return {
      goalDir,
      ready: false,
      error: `No completed steps found for goal "${name}". Run /pio-execute-task ${name} to complete a step first.`,
    };
  }

  return { goalDir, ready: true, stepNumber };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const reviewCodeTool = defineTool({
  name: "pio_review_code",
  label: "Pio Review Code",
  description:
    "Review the implementation of a plan step. Reads TASK.md, TEST.md, SUMMARY.md and implementation files. Writes REVIEW.md with categorized issues and approves or rejects. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Review code implementation for a plan step (approve/reject).",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace (under .pio/goals/<name>)" }),
    stepNumber: Type.Optional(Type.Number({ description: "Explicit step number to review (optional — auto-finds most recently completed step)" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = params.stepNumber
      ? await validateStepForReview(params.name, ctx.cwd, params.stepNumber)
      : await validateAndFindReviewStep(params.name, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error }], details: {} };
    }

    enqueueTask(ctx.cwd, params.name, {
      capability: "review-code",
      params: { goalName: params.name, stepNumber: result.stepNumber },
    });

    return {
      content: [
        {
          type: "text",
          text: `Review queued for Step ${result.stepNumber} of goal "${params.name}". Use \`/pio-next-task\` to start the sub-session.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleReviewCode(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-review-code <goal-name> [step-number]", "warning");
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
    ? await validateStepForReview(name, ctx.cwd, explicitStep)
    : await validateAndFindReviewStep(name, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const folderName = stepFolderName(result.stepNumber);

  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "review-code", goalName: name, stepNumber: result.stepNumber });
  if (!config) {
    ctx.ui.notify("Failed to resolve review-code config.", "error");
    return;
  }

  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Setup (registers tool and command)
// ---------------------------------------------------------------------------

export function setupReviewCode(pi: ExtensionAPI) {
  pi.registerTool(reviewCodeTool);
  pi.registerCommand("pio-review-code", {
    description:
      "Review the implementation of a plan step (approve or reject based on code quality)",
    handler: handleReviewCode,
  });
}
