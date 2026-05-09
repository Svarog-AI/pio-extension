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
 * Create an issue markdown file under .pio/issues/{slug}.md.
 * Returns error text if the slug is already taken.
 */
async function createIssue(
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

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const createIssueTool = defineTool({
  name: "pio_create_issue",
  label: "Pio Create Issue",
  description: "Create a new issue as a markdown file under .pio/issues/",
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

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

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
// Setup
// ---------------------------------------------------------------------------

export function setupCreateIssue(pi: ExtensionAPI) {
  pi.registerTool(createIssueTool);
  pi.registerCommand("pio-create-issue", {
    description: "Create a new issue as a markdown file under .pio/issues/",
    handler: handleCreateIssue,
  });
}
