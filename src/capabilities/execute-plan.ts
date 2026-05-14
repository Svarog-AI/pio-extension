import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";

import { launchCapability } from "./session-capability";
import { resolveGoalDir } from "../fs-utils";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";

// ---------------------------------------------------------------------------
// Capability config — single source of truth for this capability's session shape
// ---------------------------------------------------------------------------

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "execute-plan.md",
  defaultInitialMessage: (goalDir) => `Goal workspace is at ${goalDir}. GOAL.md and PLAN.md exist. Implement all steps from PLAN.md in this session.`,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOAL_FILE = "GOAL.md";
const PLAN_FILE = "PLAN.md";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that the goal workspace exists, has both GOAL.md and PLAN.md.
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
    return { goalDir, ready: false, error: `GOAL.md not found at "${goalPath}". Create a goal first with /pio-create-goal ${name}.` };
  }

  const planPath = `${goalDir}/${PLAN_FILE}`;
  if (!fs.existsSync(planPath)) {
    return { goalDir, ready: false, error: `PLAN.md not found at "${planPath}". Create a plan first with /pio-create-plan ${name}.` };
  }

  return { goalDir, ready: true };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleExecutePlan(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-execute-plan <goal-name>", "warning");
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
  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "execute-plan", goalName: name });
  if (!config) {
    ctx.ui.notify("Failed to resolve execute-plan config.", "error");
    return;
  }
  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Setup (registers command only — no tool)
// ---------------------------------------------------------------------------

export function setupExecutePlan(pi: ExtensionAPI) {
  pi.registerCommand("pio-execute-plan", {
    description: "Implement all steps from an existing plan in a single session",
    handler: handleExecutePlan,
  });
}
