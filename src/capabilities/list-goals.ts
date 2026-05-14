import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

import { resolveGoalDir } from "../fs-utils";
import type { SessionQueueTask } from "../queues";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Infer the current phase of a goal from files on disk.
 *   - GOAL.md only → "defined"
 *   - PLAN.md present → "planned"
 *   - Step folders with TASK.md → "in progress"
 */
function inferPhase(goalDir: string): string {
  const hasGoal = fs.existsSync(path.join(goalDir, "GOAL.md"));
  if (!hasGoal) return "empty";

  const hasPlan = fs.existsSync(path.join(goalDir, "PLAN.md"));
  if (!hasPlan) return "defined";

  // Check for step folders with TASK.md (in progress)
  for (const entry of fs.readdirSync(goalDir)) {
    if (/^S\d{2}$/.test(entry)) {
      const stepDir = path.join(goalDir, entry);
      if (fs.existsSync(path.join(stepDir, "TASK.md"))) {
        return "in progress";
      }
    }
  }

  return "planned";
}

/**
 * Read LAST_TASK.json and extract the last capability name.
 */
function readLastTask(goalDir: string): string | undefined {
  const filePath = path.join(goalDir, "LAST_TASK.json");
  if (!fs.existsSync(filePath)) return undefined;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const task: SessionQueueTask = JSON.parse(raw);
    return task.capability;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleListGoals(_args: string | undefined, ctx: ExtensionCommandContext) {
  const goalsBaseDir = path.join(ctx.cwd, ".pio", "goals");

  if (!fs.existsSync(goalsBaseDir)) {
    ctx.ui.notify("No goals found. Create one with /pio-create-goal <name>.", "info");
    return;
  }

  const entries = fs.readdirSync(goalsBaseDir, { withFileTypes: true });
  const goalDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (goalDirs.length === 0) {
    ctx.ui.notify("No goals found. Create one with /pio-create-goal <name>.", "info");
    return;
  }

  // Build a table of goals with name, phase, and last task
  const rows = goalDirs.sort().map((name) => {
    const goalDir = resolveGoalDir(ctx.cwd, name);
    const phase = inferPhase(goalDir);
    const lastTask = readLastTask(goalDir);

    return `| ${name} | ${phase} | ${lastTask || "—"} |`;
  });

  const header = "| Goal | Phase | Last Task |";
  const separator = "|------|-------|-----------|";
  const table = [header, separator, ...rows].join("\n");

  ctx.ui.notify(`Goals:\n\n${table}`, "info");
}

// ---------------------------------------------------------------------------
// Setup (registers command)
// ---------------------------------------------------------------------------

export function setupListGoals(pi: ExtensionAPI) {
  pi.registerCommand("pio-list-goals", {
    description: "List all goal workspaces with inferred phase and last executed task",
    handler: handleListGoals,
  });
}
