---
skills:
  mandatory:
    - pio-git
    - test-driven-development
---

# Task: jira-to-issue Capability

Implement the `pio_jira_to_issue` tool and `/pio-jira-to-issue` command to pull Jira tickets into local `.pio/issues/` files.

## Context

PIO currently manages issues as local markdown files only. This step bridges Jira by fetching a ticket via `acli jira workitem view KEY --json` and creating a corresponding `.pio/issues/jira-<project>-<number>.md` file. Step 1 already produced the shared `jira-utils` module at `src/jira-utils.ts` with `runAcli()`, `readJiraConfig()`, and `jiraKeyToSlug()`.

## What to Build

A new capability module that:
1. Accepts a Jira ticket key (e.g., `PROJ-123`) as input
2. Calls `acli jira workitem view KEY --json` via `runAcli()`
3. Extracts `summary` and `description` from the JSON response
4. Derives slug via `jiraKeyToSlug(key)` → `jira-proj-123`
5. Checks if `.pio/issues/jira-proj-123.md` already exists — returns a warning without overwriting
6. Creates the issue file using existing `createIssue()` from `create-issue.ts`

### Code Components

**`fetchJiraIssue(cwd, key)`** — core business logic function:
- Validates that the derived slug doesn't already exist (call `fs.existsSync` on `.pio/issues/<slug>.md`)
- Calls `runAcli(cwd, ["jira", "workitem", "view", key, "--json"])`
- On `AcliError`: returns error text directly from `result.error`
- On success: extracts `summary` and `description` from `result.stdout`
- Builds markdown content: `# {summary}\n\n{description}`
- Writes file to `.pio/issues/{slug}.md` (or delegates to `createIssue()`)
- Returns success message with file path

**`jiraToIssueTool`** — tool definition via `defineTool()`:
- Parameters: `key` (Type.String) — Jira ticket key like `PROJ-123`
- Executes `fetchJiraIssue()` with `ctx.cwd` and `params.key`
- Returns `{ content: [{ type: "text", text: result }], details: {} }`

**`handleJiraToIssue(args, ctx)`** — command handler:
- Parses args to extract the Jira key (first non-empty token)
- Shows usage message if no args provided
- Calls `fetchJiraIssue(ctx.cwd, key)`
- Notifies result via `ctx.ui.notify()`

**`setupJiraToIssue(pi: ExtensionAPI)`** — exported setup function:
- Registers tool via `pi.registerTool(jiraToIssueTool)`
- Registers command via `pi.registerCommand("pio-jira-to-issue", ...)`

### Approach and Decisions

- **Import path:** `jira-utils` is at `src/jira-utils.ts` (plan deviation from Step 1). Import as `import { runAcli, jiraKeyToSlug } from "../jira-utils"`. See DECISIONS.md for details.
- **Reusing createIssue:** Export the `createIssue` function from `create-issue.ts` so it can be called by jira-to-issue. This avoids duplicating file creation logic and ensures consistent issue format. The exported function should preserve all existing parameters (`cwd`, `slug`, `title`, `description`, optional `category`, `context`).
- **acli JSON field names:** GOAL.md notes that actual field names may differ from assumed `summary`/`description`. The executor must handle missing fields gracefully — if `summary` is missing, fall back to the `key` parameter as title. If `description` is missing, use an empty string. Log a warning about unexpected field names in the output message.
- **Order of operations:** Check for slug collision BEFORE calling `runAcli()` to avoid unnecessary network/API calls when the issue already exists locally.
- **Issue file format:** Follow the existing `createIssue` pattern: `# Title`, blank line, description body. No `## Category` or `## Context` sections unless the acli response provides them (e.g., from custom fields).

## Skills

- **test-driven-development:** Mandatory — write tests before implementation. Verify tool registration, command handling, error cases, and file creation.
- **pio-git:** Mandatory — commit changes following pio conventions after implementation.
No additional skills recommended beyond the mandatory pio skill.

## Dependencies

- Step 1 (Jira Utilities Module) — requires `runAcli`, `jiraKeyToSlug` from `src/jira-utils.ts`
- Existing `createIssue` function in `src/capabilities/create-issue.ts` (must be exported)

## Files Affected

- `src/capabilities/create-issue.ts` — export the `createIssue` function (currently private/internal)
- `src/capabilities/jira-to-issue.ts` — new file: tool, command, and setup function following create-issue.ts pattern
- `src/capabilities/jira-to-issue.test.ts` — new file: unit tests for fetchJiraIssue, tool, command, and setup
- `src/index.ts` — import `setupJiraToIssue` and call `setupJiraToIssue(pi)` in the default export

## Acceptance Criteria

- `npm run check` reports no errors (tsc --noEmit)
- `pio_jira_to_issue` is registered as a tool via `pi.registerTool()` with parameter `key` (Type.String)
- `/pio-jira-to-issue` is registered as a command via `pi.registerCommand()`
- Returns an error when `acli` is not installed (delegated to `runAcli` — ENOENT case)
- Returns an error when user is not authenticated (detected by `runAcli` — unauthorized in output)
- Creates `.pio/issues/jira-proj-123.md` with correct slug derived from key via `jiraKeyToSlug()`
- File content follows the existing issue format: `# {summary}\n\n{description}`
- Returns a warning message when the issue file already exists, without overwriting
- Slug collision check happens before calling `runAcli()` (no unnecessary API calls)
- `createIssue` is exported from `src/capabilities/create-issue.ts` and reused by jira-to-issue
- `setupJiraToIssue(pi)` is called from the default export in `src/index.ts`

## Risks and Edge Cases

- **acli JSON field names unknown:** The actual response from `acli jira workitem view --json` may use different field names than `summary`/`description`. Executor must handle gracefully with fallbacks. If possible, verify by running `acli jira workitem view --help` or a test command.
- **Description format:** Jira descriptions may contain HTML or Atlassian Document Format (ADF). The implementation should store raw text as-is — the executor doesn't need to transform formats.
- **Multi-line descriptions:** Ensure newlines in the description are preserved when writing the file.
- **Special characters in key:** Jira keys like `PROJ-123` are straightforward, but edge cases like `MY-PROJ-456` should produce valid slugs (`jira-my-proj-456`).
- **Empty `.pio/issues/` directory:** The `issuesDir()` function creates the directory if it doesn't exist. Ensure this is called or the directory creation logic is handled before writing files.
