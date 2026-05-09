import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { issuesDir } from "../utils";

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

/**
 * Create an issue markdown file under .pio/issues/{timestamp}.md.
 */
async function createIssue(
  cwd: string,
  title: string,
  description: string,
  category?: string,
  context?: string,
): Promise<string> {
  const dir = issuesDir(cwd);

  // Generate timestamp-based filename: YYYYMMDD_HHmmss.md
  const now = new Date();
  const ts = now.toISOString().replace(/[T:.Z-]/g, "").slice(0, 15); // YYYYMMDDHHmmss
  const filename = `${ts.slice(0, 8)}_${ts.slice(8)}.md`;
  const filePath = path.join(dir, filename);

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

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const createIssueTool = defineTool({
  name: "pio_create_issue",
  label: "Pio Create Issue",
  description: "Create a new issue as a markdown file under .pio/issues/",
  parameters: Type.Object({
    title: Type.String({ description: "Issue title" }),
    description: Type.String({ description: "Issue body/description" }),
    category: Type.Optional(Type.String({ description: "Optional classification (e.g. bug, improvement, idea)" })),
    context: Type.Optional(Type.String({ description: "Optional additional context (file references, observed behavior)" })),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await createIssue(
      ctx.cwd,
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

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleCreateIssue(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-create-issue <title> [description]", "warning");
    return;
  }

  // Parse args: first word is title, rest is description
  const parts = args.trim().split(/\s+/);
  const title = parts[0];
  const description = parts.length > 1 ? parts.slice(1).join(" ") : "";

  if (!description) {
    ctx.ui.notify("Usage: /pio-create-issue <title> [description]", "warning");
    return;
  }

  const result = await createIssue(ctx.cwd, title, description);
  ctx.ui.notify(result, "info");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupCreateIssue(pi: ExtensionAPI) {
  pi.registerTool(createIssueTool);
  pi.registerCommand("pio-create-issue", {
    description: "Create a new issue as a markdown file under .pio/issues/",
    handler: handleCreateIssue,
  });
}
