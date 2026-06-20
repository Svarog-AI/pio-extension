import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
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
  outputs: [
    { name: "overview", file: "/PROJECT/OVERVIEW.md", requiredWhen: () => false },
    { name: "development", file: "/PROJECT/DEVELOPMENT.md", requiredWhen: () => false },
    { name: "conventions", file: "/PROJECT/CONVENTIONS.md", requiredWhen: () => false },
    { name: "git", file: "/PROJECT/GIT.md", requiredWhen: () => false },
    { name: "architecture", file: "/PROJECT/ARCHITECTURE.md", requiredWhen: () => false },
    { name: "dependencies", file: "/PROJECT/DEPENDENCIES.md", requiredWhen: () => false },
    { name: "glossary", file: "/PROJECT/GLOSSARY.md", requiredWhen: () => false },
  ],
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
  defaultInitialMessage: (_workingDir: string, params?: Record<string, unknown>) => {
    const goalName = typeof params?.goalName === "string" ? params.goalName : "";
    return goalName
      ? `Finalize goal "${goalName}" — update .pio/PROJECT/ documentation with accumulated decisions.`
      : "Ready.";
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
      params: {
        goalName: params.name,
        workspacePrefix: `goals/${params.name}`,
        sessionName: `${params.name} finalize-goal`,
        queueKey: params.name,
        initialMessage: `Finalize goal "${params.name}" — update .pio/PROJECT/ documentation.`,
      },
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
    goalName: name,
    workspacePrefix: `goals/${name}`,
    sessionName: `${name} finalize-goal`,
    queueKey: name,
    initialMessage: `Finalize goal "${name}" — update .pio/PROJECT/ documentation.`,
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


