import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { CapState } from "../../capability-state";
import { launchCapability } from "../../capability-session";
import { resolveGoalDir } from "../../fs-utils";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import type { CapabilityContract } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [{ name: "goal", file: "GOAL.md" }, { name: "plan", file: "PLAN.md" }, { name: "completion-summary", file: "COMPLETION_SUMMARY.md" }],
  outputs: [],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "finalize-goal",
  contract: CONTRACT,
  skills: {
    mandatory: ["pio-project-knowledge", "pio-git"],
  },
  writeAllowlist: (_workingDir: string, _params?: Record<string, unknown>) => {
    const projectDir = path.join(process.cwd(), ".pio", "PROJECT");
    return [
      path.join(projectDir, "OVERVIEW.md"),
      path.join(projectDir, "DEVELOPMENT.md"),
      path.join(projectDir, "CONVENTIONS.md"),
      path.join(projectDir, "GIT.md"),
      path.join(projectDir, "ARCHITECTURE.md"),
      path.join(projectDir, "DEPENDENCIES.md"),
      path.join(projectDir, "GLOSSARY.md"),
    ];
  },
  defaultInitialMessage: (_workingDir: string, params?: Record<string, unknown>) => {
    const goalDir = typeof params?.goalDir === "string" ? params.goalDir : "";
    const goalName = typeof params?.goalName === "string" ? params.goalName : "";
    const goalRef = goalName ? `"${goalName}"` : "goal workspace";
    const projectDir = path.join(process.cwd(), ".pio/PROJECT");
    return `Finalize the completed ${goalRef} at ${goalDir}. Read accumulated decisions (DECISIONS.md from the highest-numbered step folder), PLAN.md, and per-step SUMMARY.md files. Evaluate each decision against the update rules from the pio-project-knowledge skill. Update the 7 PROJECT files under ${projectDir} where warranted. Produce a summary of all changes made.`;
  },
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that the goal workspace exists and the COMPLETED marker is present.
 *
 * Returns { goalDir, ready: true } on success, or { goalDir, ready: false, error } when not ready.
 * Does NOT use ctx so it can be called safely before newSession().
 */
export async function validateFinalizeGoal(
  name: string,
  cwd: string,
): Promise<
  | { goalDir: string; ready: true }
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

  const capState = new CapState(CONTRACT, goalDir);

  if (!capState.input("completion-summary").exists()) {
    return {
      goalDir,
      ready: false,
      error: `Goal "${name}" is not yet complete. Wait for all steps to finish before finalizing.`,
    };
  }

  return { goalDir, ready: true };
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const finalizeGoalTool = defineTool({
  name: "pio_finalize_goal",
  label: "Pio Finalize Goal",
  description:
    "Finalize a completed goal by updating .pio/PROJECT/ documentation based on accumulated decisions. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Finalize a completed goal and update project documentation.",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace (under .pio/goals/<name>)" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await validateFinalizeGoal(params.name, ctx.cwd);

    if (!result.ready) {
      return { content: [{ type: "text", text: result.error }], details: {} };
    }

    enqueueTask(ctx.cwd, params.name, {
      capability: "finalize-goal",
      params: { goalDir: result.goalDir },
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

async function handleFinalizeGoal(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-finalize-goal <goal-name>", "warning");
    return;
  }

  const name = args.trim();
  const result = await validateFinalizeGoal(name, ctx.cwd);

  if (!result.ready) {
    ctx.ui.notify(result.error, "error");
    return;
  }

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  // All ctx-dependent work must happen before this line.
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "finalize-goal",
    goalDir: result.goalDir,
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve finalize-goal config.", "error");
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
  pi.registerTool(finalizeGoalTool);
  pi.registerCommand("pio-finalize-goal", {
    description: "Update .pio/PROJECT/ documentation based on completed goal decisions",
    handler: handleFinalizeGoal,
  });
}


