import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";

import { launchCapability } from "./session-capability";
import { resolveGoalDir } from "../fs-utils";
import { enqueueTask } from "../queues";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";
import { createGoalState } from "../goal-state";
import { type PlanFrontmatter } from "../frontmatter-schemas";

// ---------------------------------------------------------------------------
// postValidate — validates PLAN.md frontmatter correctness
// ---------------------------------------------------------------------------

/**
 * Regex to match step headings like "## Step 1:", "## Step 12: Add schema".
 * The `m` flag enables `^` to match start of each line.
 */
const STEP_HEADING_RE = /^## Step \d+:/gm;

/**
 * postValidate callback for the create-plan capability.
 * Runs after file-existence validation passes but before transition routing.
 *
 * Validates:
 * 1. PLAN.md has valid YAML frontmatter with a correct `totalSteps` field
 * 2. `totalSteps` matches the actual count of `## Step N:` headings in the document
 *
 * Delegates frontmatter validation to GoalState.planMetadata() — does not
 * import low-level frontmatter utilities directly.
 */
function postValidateCreatePlan(goalDir: string): { success: boolean; message?: string } {
  // Step 1: Validate frontmatter via GoalState
  const state = createGoalState(goalDir);
  const result = state.planMetadata({ errors: true });

  // Type assertion: when { errors: true }, result is always { data?: ...; error?: string }
  const typedResult = result as { data?: PlanFrontmatter; error?: string };

  if (typedResult.error) {
    return { success: false, message: typedResult.error };
  }

  const { totalSteps, steps } = typedResult.data!;

  // Step 2: Validate steps array length matches totalSteps
  if (steps.length !== totalSteps) {
    return {
      success: false,
      message: `steps array has ${steps.length} entries but totalSteps is ${totalSteps}. Update the steps array to match totalSteps.`,
    };
  }

  // Step 3: Validate each entry has a non-empty name (TypeBox minLength:1 catches empty strings,
  // but we provide a user-friendly message for whitespace-only names)
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].name || steps[i].name.trim() === "") {
      return {
        success: false,
        message: `step entry at index ${i} has an empty name`,
      };
    }
  }

  // Step 4: Count actual ## Step N: headings in PLAN.md
  const planPath = `${goalDir}/PLAN.md`;
  const planContent = fs.readFileSync(planPath, "utf-8");
  const headingMatches = planContent.match(STEP_HEADING_RE);
  const headingCount = headingMatches ? headingMatches.length : 0;

  // Step 5: Compare heading count to totalSteps
  if (headingCount !== totalSteps) {
    return {
      success: false,
      message: `totalSteps is ${totalSteps} but found ${headingCount} step heading(s) in PLAN.md. Update totalSteps or add/remove step headings to match.`,
    };
  }

  // Step 6: Validate unique subgoal names (only subgoal entries need unique names)
  const subgoalEntries = steps.filter((s) => s.complexity === "subgoal");
  if (subgoalEntries.length > 0) {
    const subgoalNames = subgoalEntries.map((s) => s.name);
    const uniqueNames = new Set(subgoalNames);
    if (uniqueNames.size !== subgoalNames.length) {
      const duplicates = [...subgoalNames].filter(
        (name, i) => subgoalNames.indexOf(name) !== i,
      );
      const uniqueDups = [...new Set(duplicates)].join(", ");
      return {
        success: false,
        message: `Duplicate subgoal name(s) found: ${uniqueDups}. Each subgoal must have a unique name to prevent path collisions.`,
      };
    }
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Capability config — single source of truth for this capability's session shape
// ---------------------------------------------------------------------------

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "create-plan.md",
  validation: { files: ["PLAN.md"] },
  readOnlyFiles: ["GOAL.md"],
  writeAllowlist: ["PLAN.md"],
  defaultInitialMessage: (goalDir) => `Goal workspace is at ${goalDir}. GOAL.md exists. Create PLAN.md in this directory.`,
  postValidate: postValidateCreatePlan,
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
