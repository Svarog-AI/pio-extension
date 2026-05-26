import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { runAcli, jiraKeyToSlug } from "../jira-utils";
import { issuesDir } from "../fs-utils";
import { createIssue } from "./create-issue";

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

/**
 * Fetch a Jira ticket by key and create a local issue file.
 *
 * Order of operations:
 * 1. Derive slug from key
 * 2. Check if issue file already exists (slug collision) — return warning early
 * 3. Call runAcli to fetch ticket data
 * 4. Extract summary and description with fallbacks
 * 5. Delegate to createIssue to write the file
 *
 * Returns a success message with the file path, or an error/warning message.
 */
export async function fetchJiraIssue(cwd: string, key: string): Promise<string> {
  const slug = jiraKeyToSlug(key);

  // Check for slug collision BEFORE calling runAcli (avoid unnecessary API calls)
  const dir = issuesDir(cwd);
  const filePath = path.join(dir, `${slug}.md`);

  if (fs.existsSync(filePath)) {
    return `Issue already exists at ${filePath}. Skipping.`;
  }

  // Fetch ticket data from Jira
  const result = await runAcli(cwd, ["jira", "workitem", "view", key, "--json"]);

  // Handle AcliError
  if ("error" in result) {
    return result.error;
  }

  // Extract summary and description with graceful fallbacks
  const stdout = result.stdout;
  const summary = (stdout.summary ?? stdout.key ?? key) as string;
  const description = (stdout.description ?? "") as string;

  // Delegate to createIssue for consistent file format
  return createIssue(cwd, slug, summary, description);
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const jiraToIssueTool = defineTool({
  name: "pio_jira_to_issue",
  label: "Pio Jira To Issue",
  description: `Pull a Jira ticket into a local .pio/issues/ markdown file.

Takes a Jira ticket key (e.g., PROJ-123), fetches ticket details via acli,
and creates a local issue file at .pio/issues/jira-<project>-<number>.md.

If the issue already exists locally, returns a warning without overwriting.
Requires acli to be installed and authenticated (acli jira auth login).`,

  parameters: Type.Object({
    key: Type.String({ description: "Jira ticket key (e.g., PROJ-123)" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const result = await fetchJiraIssue(ctx.cwd, params.key);
    return {
      content: [{ type: "text", text: result }],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function handleJiraToIssue(args: string | undefined, ctx: ExtensionCommandContext) {
  if (!args || !args.trim()) {
    ctx.ui.notify("Usage: /pio-jira-to-issue <JIRA-KEY>", "warning");
    return;
  }

  const key = args.trim().split(/\s+/)[0];

  const result = await fetchJiraIssue(ctx.cwd, key);
  ctx.ui.notify(result, "info");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupJiraToIssue(pi: ExtensionAPI) {
  pi.registerTool(jiraToIssueTool);
  pi.registerCommand("pio-jira-to-issue", {
    description: "Pull a Jira ticket into a local .pio/issues/ markdown file",
    handler: handleJiraToIssue,
  });
}
