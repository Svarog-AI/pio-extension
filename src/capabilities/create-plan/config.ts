import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability } from "../../capability-session";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import { validateInputs } from "../../guards/validation";
import { CapState } from "../../capability-state";
import { extractFrontmatter, validateAndCoerce } from "../../frontmatter";
import { BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";
import { type PlanFrontmatter, PLAN_FRONTMATTER_SCHEMA } from "./schemas";

// ---------------------------------------------------------------------------
// postValidate — validates PLAN.md frontmatter correctness
// ---------------------------------------------------------------------------

/**
 * Regex to match step headings like "### Step 1:", "### Step 12: Add schema".
 * The `m` flag enables `^` to match start of each line.
 */
const STEP_HEADING_RE = /^### Step \d+:/gm;

/**
 * postValidate callback for the create-plan capability.
 * Runs after file-existence validation passes but before transition routing.
 *
 * Validates:
 * 1. PLAN.md has valid YAML frontmatter with a correct `totalSteps` field
 * 2. `totalSteps` matches the actual count of `### Step N:` headings in the document
 *
 * Delegates frontmatter validation to GoalState.planMetadata() — does not
 * import low-level frontmatter utilities directly.
 */
export function postValidateCreatePlan(workspaceDir: string): { success: boolean; message?: string } {
  // Step 1: Validate frontmatter via CapState
  const capState = new CapState(CONTRACT, workspaceDir);
  const planFile = capState.output<PlanFrontmatter>("plan");

  if (!planFile.exists()) {
    return { success: false, message: "PLAN.md not found" };
  }
  const data = planFile.read();
  if (data === null) {
    // Get detailed error message via direct validation
    const raw = extractFrontmatter(path.join(workspaceDir, "PLAN.md"));
    if (raw === null) {
      return { success: false, message: "PLAN.md does not contain valid YAML frontmatter" };
    }
    const result = validateAndCoerce<PlanFrontmatter>(raw, PLAN_FRONTMATTER_SCHEMA);
    if ("error" in result) {
      return { success: false, message: result.error };
    }
    return { success: false, message: "PLAN.md frontmatter validation failed" };
  }

  const { totalSteps, steps } = data;

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
  const planPath = `${workspaceDir}/PLAN.md`;
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
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ name: "goal", file: "GOAL.md" }],
  excludedFiles: ["PLAN.md"],
  outputs: [{ name: "plan", file: "PLAN.md", schema: PLAN_FRONTMATTER_SCHEMA }],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "create-plan",
  contract: CONTRACT,
  readOnlyFiles: ["GOAL.md"],
  writeAllowlist: ["PLAN.md"],
  skills: {
    mandatory: ["pio-planning", "grill-me"],
    recommended: [
      { name: "source-research", condition: "when researching existing solutions or libraries" },
    ],
  },
  defaultInitialMessage: () => "Ready.",
  postValidate: postValidateCreatePlan,
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that the workspace exists, has a GOAL.md, and does not yet have a PLAN.md.
 * Returns { ready: boolean, error?: string }.
 * Does NOT use ctx so it can be called safely before newSession().
 */
async function validateGoal(workspacePrefix: string, cwd: string): Promise<{ ready: boolean; error?: string }> {
  const result = validateInputs(path.join(cwd, ".pio"), CONTRACT, { workspacePrefix });
  if (!result.success) {
    return { ready: false, error: result.message ?? `Workspace "${workspacePrefix}" does not have the required inputs.` };
  }

  return { ready: true };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const createPlanTool = defineTool({
  name: "pio_create_plan",
  label: "Pio Create Plan",
  description: "Create a detailed implementation plan (PLAN.md) for an existing workspace. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Create an implementation plan (PLAN.md) for an existing workspace.",
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await validateGoal(params.workspacePrefix, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error! }], details: {} };
    }

    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "create-plan",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? `${queueKey} create-plan`,
        queueKey,
        initialMessage: params.initialMessage ?? `Create an implementation plan for workspace "${params.workspacePrefix}".`,
      },
    });

    return { content: [{ type: "text", text: `Task queued for workspace "${params.workspacePrefix}". Use \`/pio-next-task\` to start the sub-session.` }], details: {} };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleCreatePlan(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-create-plan --workspace-prefix <prefix>", "warning");
    return;
  }

  const tokens = args.trim().split(/\s+/);
  let workspacePrefix: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "--workspace-prefix" && tokens[i + 1]) {
      workspacePrefix = tokens[++i];
    }
  }
  if (!workspacePrefix) {
    ctx.ui.notify("--workspace-prefix is required. Usage: /pio-create-plan --workspace-prefix <prefix>", "error");
    return;
  }

  const result = await validateGoal(workspacePrefix, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error!, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const queueKey = deriveQueueKey(workspacePrefix);
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "create-plan",
    workspacePrefix,
    sessionName: `${queueKey} create-plan`,
    queueKey,
    initialMessage: `Create an implementation plan for workspace "${workspacePrefix}".`,
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve create-plan config.", "error");
    return;
  }
  try {
    await launchCapability(ctx, config);
  } catch (err) {
    ctx.ui.notify(
      `Failed to start ${config.capability}: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
    return;
  }
}

// ---------------------------------------------------------------------------
// Setup (registers tool and command)
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI) {
  pi.registerTool(createPlanTool);
  pi.registerCommand("pio-create-plan", {
    description: "Create an implementation plan for a workspace and launch a create-plan session",
    handler: handleCreatePlan,
  });
}
