import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { resolveGoalDir, goalExists } from "./fs-utils";
import type { SessionQueueTask } from "./queues";

// ---------------------------------------------------------------------------
// pio_init
// ---------------------------------------------------------------------------

/**
 * Initialize a new pio project in the current working directory.
 */
async function init(): Promise<string> {
  const cwd = process.cwd();
  const pioDir = path.join(cwd, ".pio");

  if (fs.existsSync(pioDir)) {
    return `Directory .pio already exists at ${pioDir}`;
  }

  fs.mkdirSync(pioDir, { recursive: true });
  fs.mkdirSync(path.join(pioDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(pioDir, "work-memory"), { recursive: true });

  return `Initialized pio project at ${pioDir}`;
}

const initTool = defineTool({
  name: "pio_init",
  label: "Pio Init",
  description: "Initialize a new pio project in the current working directory. Use this tool directly — all filesystem operations are handled internally.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
    const result = await init();
    return {
      content: [{ type: "text", text: result }],
      details: {},
    };
  },
});

async function handleInit(_args: string | undefined, ctx: ExtensionCommandContext) {
  const result = await init();
  ctx.ui.notify(result, "info");
}

// ---------------------------------------------------------------------------
// pio_delete_goal
// ---------------------------------------------------------------------------

async function deleteGoal(name: string, cwd: string): Promise<string> {
  const goalDir = resolveGoalDir(cwd, name);

  if (!goalExists(goalDir)) {
    return `Goal workspace not found at ${goalDir}`;
  }

  fs.rmSync(goalDir, { recursive: true });
  return `Deleted goal workspace at ${goalDir}`;
}

const deleteGoalTool = defineTool({
  name: "pio_delete_goal",
  label: "Pio Delete Goal",
  description: "Delete a goal workspace under .pio/<name>. Use this tool directly — all filesystem operations are handled internally.",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace to delete" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const extCtx = ctx as unknown as ExtensionCommandContext;
    const result = await deleteGoal(params.name, extCtx.cwd);
    return {
      content: [{ type: "text", text: result }],
      details: {},
    };
  },
});

async function handleDeleteGoal(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-delete-goal <name>", "warning");
    return;
  }

  const result = await deleteGoal(args.trim(), ctx.cwd);
  ctx.ui.notify(result, "info");
}

// ---------------------------------------------------------------------------
// pio_list_goals (command only — helpers exported for tests)
// ---------------------------------------------------------------------------

/**
 * Infer the current phase of a goal from files on disk.
 *   - GOAL.md only → "defined"
 *   - PLAN.md present → "planned"
 *   - Step folders with TASK.md → "in progress"
 */
export function inferPhase(goalDir: string): string {
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
export function readLastTask(goalDir: string): string | undefined {
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

/**
 * Recursively discover subgoals under a goal's step directories.
 * Scans for S{NN}/subgoals/<name>/ directories containing GOAL.md.
 * Returns an array of { dir, displayName } entries with hierarchical names.
 */
export function findSubgoals(
  goalDir: string,
  parentDisplayName: string,
): Array<{ dir: string; displayName: string }> {
  const results: Array<{ dir: string; displayName: string }> = [];

  try {
    const entries = fs.readdirSync(goalDir, { withFileTypes: true });
    for (const entry of entries) {
      // Match step folders: S01, S02, etc.
      if (!entry.isDirectory() || !/^S\d{2}$/.test(entry.name)) continue;

      const stepDir = path.join(goalDir, entry.name);
      const subgoalsDir = path.join(stepDir, "subgoals");

      if (!fs.existsSync(subgoalsDir)) continue;

      try {
        const subgoalEntries = fs.readdirSync(subgoalsDir, { withFileTypes: true });
        for (const subEntry of subgoalEntries) {
          if (!subEntry.isDirectory()) continue;

          const subgoalDir = path.join(subgoalsDir, subEntry.name);
          const hasGoal = fs.existsSync(path.join(subgoalDir, "GOAL.md"));
          if (!hasGoal) continue;

          const displayName = `${parentDisplayName}/${entry.name}/${subEntry.name}`;
          results.push({ dir: subgoalDir, displayName });

          // Recurse into this subgoal to find further nesting
          results.push(...findSubgoals(subgoalDir, displayName));
        }
      } catch {
        // Empty or unreadable subgoals directory — skip silently
      }
    }
  } catch {
    // Empty or unreadable goal directory — skip silently
  }

  return results;
}

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
  const rows: string[] = [];

  // Top-level goals
  for (const name of goalDirs.sort()) {
    const goalDir = resolveGoalDir(ctx.cwd, name);
    const phase = inferPhase(goalDir);
    const lastTask = readLastTask(goalDir);

    rows.push(`| ${name} | ${phase} | ${lastTask || "—"} |`);
  }

  // Nested subgoals (discovered recursively)
  for (const name of goalDirs.sort()) {
    const goalDir = resolveGoalDir(ctx.cwd, name);
    const subgoals = findSubgoals(goalDir, name);
    for (const subgoal of subgoals) {
      const phase = inferPhase(subgoal.dir);
      const lastTask = readLastTask(subgoal.dir);

      rows.push(`| ${subgoal.displayName} | ${phase} | ${lastTask || "—"} |`);
    }
  }

  const header = "| Goal | Phase | Last Task |";
  const separator = "|------|-------|-----------|";
  const table = [header, separator, ...rows].join("\n");

  ctx.ui.notify(`Goals:\n\n${table}`, "info");
}

// ---------------------------------------------------------------------------
// pio_parent
// ---------------------------------------------------------------------------

/** Find the parent session path from the header (set by pi on newSession). */
async function findParentPath(ctx: ExtensionCommandContext): Promise<string | null> {
  const header = ctx.sessionManager.getHeader();
  if (header?.parentSession && fs.existsSync(header.parentSession)) {
    return header.parentSession;
  }
  return null;
}

async function handleParent(_args: string | undefined, ctx: ExtensionCommandContext) {
  const parentPath = await findParentPath(ctx);

  if (!parentPath) {
    ctx.ui.notify("No parent session found", "warning");
    return;
  }

  await ctx.switchSession(parentPath);
}

// ---------------------------------------------------------------------------
// Setup (registers all direct tools and commands)
// ---------------------------------------------------------------------------

export function setupDirectTools(pi: ExtensionAPI): void {
  // pio_init
  pi.registerTool(initTool);
  pi.registerCommand("pio-init", {
    description: "Initialize a new pio project in the current directory",
    handler: handleInit,
  });

  // pio_delete_goal
  pi.registerTool(deleteGoalTool);
  pi.registerCommand("pio-delete-goal", {
    description: "Delete a goal workspace under .pio/<name>",
    handler: handleDeleteGoal,
  });

  // pio_list_goals
  pi.registerCommand("pio-list-goals", {
    description: "List all goal workspaces with inferred phase and last executed task",
    handler: handleListGoals,
  });

  // pio_parent
  pi.registerCommand("pio-parent", {
    description: "Switch back to the parent session",
    handler: handleParent,
  });
}
