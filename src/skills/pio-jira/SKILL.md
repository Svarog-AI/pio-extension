---
name: pio-jira
description: Perform Jira operations via the Atlassian CLI (`acli`) — pull tickets into local issues, push local issues to Jira, search with JQL. Use when a pio agent needs to interact with Jira tickets, create or read work items, or bridge Jira with `.pio/issues/` files.
---

## Overview

This skill defines how pio agents perform Jira operations using `acli` (Atlassian CLI) via the `bash` tool, combined with existing pio tools like `pio_create_issue`. It is capability-agnostic — any pio prompt can invoke these protocols.

**Always use `--json`** on every `acli` command for programmatic output parsing.

## Auth Status Check

Before any Jira operation, verify authentication:

1. Run `acli jira auth status`
2. If not authenticated, direct the user to `acli jira auth login`
3. Proceed only after auth is confirmed

## Pull Jira → Local Issue

Pull a Jira ticket into a local `.pio/issues/` file. Follow this protocol:

1. Run `acli jira workitem view KEY --json` (e.g., `PROJ-123`)
2. Parse JSON output — inspect actual field names first (may differ from `summary`/`description`)
3. Derive slug: `jira-<project>-<number>` (lowercase, hyphenated). Example: `PROJ-123` → `jira-proj-123`
4. Check if `.pio/issues/<slug>.md` already exists (using `ls` or similar)
5. If exists: warn without overwriting
6. If not exists: call `pio_create_issue` tool with slug, title, and description
7. **Use `pio_create_issue`, not manual file writes** — this ensures consistent issue format

## Goal Creation from Pulled Issue

After pulling a Jira ticket into a local issue, convert it into a pio goal workspace if the user asks for it:

1. Call `pio_goal_from_issue <slug>` (e.g., `pio_goal_from_issue jira-proj-123`)
2. The tool derives the goal name from the issue slug and queues a create-goal session
3. The user runs `/pio-next-task` to start the Goal Definition Assistant session
4. The assistant interviews about the feature, produces `GOAL.md`, which feeds into planning and implementation
5. The original issue file is cleaned up (moved/deleted) after the goal is created

This is the natural "Jira → code" workflow: ticket → local issue → goal → plan → implementation.

## Push Local Issue → Jira

Push a local `.pio/issues/<slug>.md` file to Jira. Follow this protocol:

1. Read `.pio/issues/<slug>.md` — extract title (first `# heading`) and body (content after heading)
2. Resolve project key from user parameter or `.pio/jira-config.yaml` (if it exists)
3. Run `acli jira workitem create --summary "..." --project "KEY" --type "Task" --description "..." --json`
4. Parse JSON response to extract the created Jira key (likely `key` field)
5. Report the created Jira key

**Config file:** `.pio/jira-config.yaml` (optional, per-repo):
```yaml
projectKey: "PROJ"      # default project for push operations
defaultType: "Task"     # default Jira issue type
```
All fields optional. No credentials — auth is handled by `acli` itself.

## Search with JQL

Run `acli jira workitem search --jql "..." --json` for flexible querying. Common patterns:

- `project = PROJ AND status = Open`
- `project = PROJ AND assignee = currentUser()`
- `key in (PROJ-123, PROJ-456)`

## Error Handling

- **`acli` not installed:** If `command -v acli` fails, report a helpful message about installing `acli`
- **Not authenticated:** If output contains `"unauthorized"`, direct to `acli jira auth login`
- **Non-zero exit codes:** Log stderr and proceed gracefully — never block workflow completion
- **Plain-text descriptions:** Local markdown may not transfer perfectly to Jira ADF. Pass raw text and let `acli` handle conversion. Note this limitation to the user.

**Edge cases and exact command strings:** See [REFERENCE.md](REFERENCE.md)
