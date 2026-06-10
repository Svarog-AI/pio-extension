import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { resolveGoalDir, goalExists, issuesDir, findIssuePath } from "./fs-utils";
import type { SessionQueueTask } from "./queues";
import { enqueueTask } from "./queues";
import { launchCapability } from "./capability-session";
import { resolveCapabilityConfig } from "./capability-config";
import { dispatch } from "./state-machines";
import { recordTransition } from "./state-machines";
import { createGoalState } from "./goal-state";
import { getSessionConfig } from "./capability-utils";

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
// pio_create_issue
// ---------------------------------------------------------------------------

/**
 * Create an issue markdown file under .pio/issues/{slug}.md.
 * Returns error text if the slug is already taken.
 */
export async function createIssue(
  cwd: string,
  slug: string,
  title: string,
  description: string,
  category?: string,
  context?: string,
): Promise<string> {
  const dir = issuesDir(cwd);

  // Ensure slug ends with .md
  const filename = slug.endsWith(".md") ? slug : `${slug}.md`;
  const filePath = path.join(dir, filename);

  if (fs.existsSync(filePath)) {
    return `Issue already exists at ${filePath}. Choose a different slug.`;
  }

  // Build markdown content
  const lines: string[] = [`# ${title}`, "", description];

  if (category) {
    lines.push("", "## Category", "", category);
  }

  if (context) {
    lines.push("", "## Context", "", context);
  }

  const content = lines.join("\n") + "\n";
  fs.writeFileSync(filePath, content, "utf-8");

  return `Issue created at ${filePath}`;
}

const createIssueTool = defineTool({
  name: "pio_create_issue",
  label: "Pio Create Issue",
  description: `Create a new issue as a markdown file under .pio/issues/.

Issue creation is a quick capture, not an investigation. Before calling this tool:
- Skip deep code tracing, root-cause analysis, and fix proposals. Those belong in the later goal/planning workflow.
- Provide minimum viable content: a clear title, a short description of the problem, and relevant file references only if immediately obvious from the error or current context.
- If understanding the issue requires more than 1–2 file reads, create the issue with what you already know and let the goal workflow (goal-from-issue → Goal Definition Assistant) handle the detailed research.

Use this tool directly — no bash commands or manual file creation needed.`,

  parameters: Type.Object({
    slug: Type.String({ description: "Unique slug used as the filename (e.g. fix-type-error). If it already exists, pick a different one." }),
    title: Type.String({ description: "Issue title" }),
    description: Type.String({ description: "Issue body/description" }),
    category: Type.Optional(Type.String({ description: "Optional classification (e.g. bug, improvement, idea)" })),
    context: Type.Optional(Type.String({ description: "Optional additional context (file references, observed behavior)" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await createIssue(
      ctx.cwd,
      params.slug,
      params.title,
      params.description,
      params.category,
      params.context,
    );
    return {
      content: [{ type: "text", text: result }],
      details: {},
    };
  },
});

async function handleCreateIssue(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-create-issue <slug> <title> [description]", "warning");
    return;
  }

  // Parse args: first word is slug, rest is title+description
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    ctx.ui.notify("Usage: /pio-create-issue <slug> <title>", "warning");
    return;
  }

  const slug = parts[0];
  const titleAndDesc = parts.slice(1).join(" ");

  // Split on the first dash-separator between slug and title if present, otherwise just use as title
  // Simple heuristic: use remaining string as title, no description for command form
  const result = await createIssue(ctx.cwd, slug, titleAndDesc, "");
  ctx.ui.notify(result, "info");
}

// ---------------------------------------------------------------------------
// pio_goal_from_issue
// ---------------------------------------------------------------------------

/**
 * Validate that the issue exists and no goal workspace collides.
 * Derives the goal name from the issue filename (stripping .md).
 * Returns { ok, error?, goalName?, issuePath? }. If ok, caller should still create the goal directory.
 */
async function validateGoalFromIssue(
  cwd: string,
  issuePath: string,
): Promise<{ ok: boolean; error?: string; goalName?: string; issuePath?: string }> {
  // 1. Issue must exist — resolve to absolute path
  const resolvedPath = findIssuePath(cwd, issuePath);
  if (!resolvedPath) {
    return { ok: false, error: `Issue not found: ${issuePath}` };
  }

  // 2. Derive goal name from the issue filename slug
  const goalName = path.basename(resolvedPath, ".md");

  // 3. Goal workspace must not already exist
  const goalDir = resolveGoalDir(cwd, goalName);
  if (goalExists(goalDir)) {
    return { ok: false, error: `Goal workspace already exists at ${goalDir}` };
  }

  return { ok: true, goalName, issuePath: resolvedPath };
}

const goalFromIssueTool = defineTool({
  name: "pio_goal_from_issue",
  label: "Pio Goal From Issue",
  description: "Convert an existing issue into a structured goal by queuing a create-goal session. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  parameters: Type.Object({
    issuePath: Type.String({ description: "Issue filename or identifier (e.g. fix-something.md or fix-something)" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const validation = await validateGoalFromIssue(ctx.cwd, params.issuePath);
    if (!validation.ok) {
      return { content: [{ type: "text", text: validation.error! }], details: {} };
    }

    const goalName = validation.goalName!;

    enqueueTask(ctx.cwd, goalName, {
      capability: "create-goal",
      params: {
        goalName,
        initialMessage: `The following issue has been selected for this goal. Use its content as starting context:\n\nIssue file: ${validation.issuePath}`,
        fileCleanup: [validation.issuePath!],
      },
    });

    return {
      content: [{ type: "text", text: `Task queued from issue. Use \`/pio-next-task\` to start the goal definition session for "${goalName}".` }],
      details: {},
    };
  },
});

async function handleGoalFromIssue(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-goal-from-issue <issue-identifier>", "warning");
    return;
  }

  const issuePath = args.trim();

  // All validation must happen before launchCapability (ctx staleness)
  const validation = await validateGoalFromIssue(ctx.cwd, issuePath);
  if (!validation.ok) {
    ctx.ui.notify(validation.error!, "warning");
    return;
  }

  const goalName = validation.goalName!;

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "create-goal",
    goalName,
    initialMessage: `The following issue has been selected for this goal. Use its content as starting context:\n\nIssue file: ${validation.issuePath}`,
    fileCleanup: [validation.issuePath!],
  });
  if (!config) {
    ctx.ui.notify("Failed to resolve create-goal config.", "error");
    return;
  }
  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Helpers (shared by tool and command)
// ---------------------------------------------------------------------------

/** Check if a working directory path looks like a goal workspace. */
export function isGoalWorkspace(workingDir?: string): boolean {
  return !!workingDir && workingDir.includes("/.pio/goals/");
}

// ---------------------------------------------------------------------------
// pio_transition tool
// ---------------------------------------------------------------------------

const transitionTool = defineTool({
  name: "pio_transition",
  label: "Pio Transition",
  description: `Manually override the default transition routing. Enqueues a task for the target capability using context from the current session. Returns success message with next-task hint.`,
  parameters: Type.Object({
    capability: Type.String({ description: "Target capability name to transition to" }),
    params: Type.Optional(Type.Object({}, { description: "Optional session params to propagate with the enqueued task" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const config = getSessionConfig(ctx as unknown as ExtensionCommandContext);
    if (!config) {
      return { content: [{ type: "text", text: "Not inside a capability session. Cannot determine transition context." }], details: {} };
    }

    // Derive stateMachineId from session params (prior dispatch result) or default
    const sessionId = typeof config.sessionParams?.stateMachineId === "string"
      ? config.sessionParams.stateMachineId
      : "goal-driven-development";

    // Merge params: session params first, user overrides on top
    const mergedParams = { ...config.sessionParams, ...params.params };

    // Derive queue key from goalName if present
    const queueKey = typeof config.sessionParams?.goalName === "string"
      ? config.sessionParams.goalName
      : config.capability;

    enqueueTask(process.cwd(), queueKey!, {
      capability: params.capability,
      params: mergedParams,
    });

    // Record audit only for goal workspaces
    if (isGoalWorkspace(config.workingDir)) {
      recordTransition(
        config.workingDir!,
        config.capability!,
        { capability: params.capability, stateMachineId: sessionId, params: mergedParams },
      );
    }

    return {
      content: [{ type: "text", text: `Task enqueued: ${params.capability}. Use /pio-next-task to start the sub-session.` }],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// /pio-transition command
// ---------------------------------------------------------------------------

async function handleTransition(_args: string | undefined, ctx: ExtensionCommandContext) {
  const config = getSessionConfig(ctx);

  if (!config?.capability) {
    ctx.ui.notify("Not inside a capability session. Cannot determine transition context.", "info");
    return;
  }

  const fromCapability = config.capability;
  const params = typeof config.sessionParams?.goalName === "string"
    ? { goalName: config.sessionParams.goalName, stepNumber: config.sessionParams.stepNumber, _sessionContext: config.sessionParams }
    : { ...config.sessionParams };

  // Build state: GoalState for goal workspaces, raw params otherwise
  const state = isGoalWorkspace(config.workingDir)
    ? createGoalState(config.workingDir!)
    : (config.sessionParams as unknown as any);

  const results = dispatch(undefined, fromCapability, state, params);

  if (results.length > 1) {
    const list = results.map((r, i) => `${i + 1}. ${r.capability}`).join("\n");
    ctx.ui.notify(`Multiple transitions available from "${fromCapability}":\n${list}\n\nUse the pio_transition tool to select one.`, "info");
  } else if (results.length === 1) {
    ctx.ui.notify(`Only transition from "${fromCapability}": ${results[0].capability}. Use the pio_transition tool to execute it, or /pio-next-task for auto-advance.`, "info");
  } else {
    ctx.ui.notify(`No outgoing transitions from "${fromCapability}" — terminal state.`, "info");
  }
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

  // pio_create_issue
  pi.registerTool(createIssueTool);
  pi.registerCommand("pio-create-issue", {
    description: "Create a new issue as a markdown file under .pio/issues/",
    handler: handleCreateIssue,
  });

  // pio_goal_from_issue
  pi.registerTool(goalFromIssueTool);
  pi.registerCommand("pio-goal-from-issue", {
    description: "Convert an existing issue into a structured goal",
    handler: handleGoalFromIssue,
  });

  // pio_transition
  pi.registerTool(transitionTool);
  pi.registerCommand("pio-transition", {
    description: "Manually override transition routing — list and select transitions",
    handler: handleTransition,
  });
}
