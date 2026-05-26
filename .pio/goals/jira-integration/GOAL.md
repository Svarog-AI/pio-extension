# Jira Integration via Atlassian CLI (acli)

Add two commands and a skill to bridge Jira tickets with local `.pio/issues/` files using the Atlassian CLI (`acli`). This enables bi-directional sync: pull Jira tickets into local issue files, and push local issues back to Jira.

## Current State

- **Issue management lives locally:** Issues are stored as markdown files under `.pio/issues/<slug>.md`. The `create-issue` capability (`src/capabilities/create-issue.ts`) provides `pio_create_issue` tool and `/pio-create-issue` command for creating these files. Issue format is simple markdown with `# Title`, body, optional `## Category` and `## Context` sections.
- **No Jira connectivity exists:** There are no commands, tools, or skills that interact with Jira. The project has no integration with external ticketing systems.
- **acli is the target CLI:** The Atlassian CLI (`acli`) provides Jira operations including `acli jira workitem view KEY --json` (read ticket), `acli jira workitem create --summary "..." --project "PROJ" --type "Task" --description "..." --json` (create ticket), and `acli jira workitem search --jql "..." --json` (search). Auth is browser-based OAuth via `acli jira auth login`, stored in acli's own config — no credential management needed from pio.
- **Extension registration pattern:** New capabilities register in `src/index.ts` via `setup...()` import and call at the bottom of the default export. Skills auto-discover from `src/skills/*/SKILL.md`.
- **Existing tool structure** (`create-issue.ts`): Uses `defineTool()` with TypeBox `Type.Object(...)` parameters, an `execute` callback returning `{ content: [{ type: "text", text: result }], details: {} }`, and `pi.registerCommand()` for the CLI-side `/pio-*` handler.
- **Existing FS utilities** (`src/fs-utils.ts`): Provides `issuesDir()`, `findIssuePath()`, `readIssue()` — helpers for working with `.pio/issues/` files that the new capabilities should reuse.

## To-Be State

### Command 1: `jira-to-issue` (`/pio-jira-to-issue` + `pio_jira_to_issue` tool)

- Takes a Jira ticket key (e.g., `PROJ-123`) as input parameter
- Checks `acli` availability via `which acli` equivalent, returns helpful error if missing
- Runs `acli jira workitem view PROJ-123 --json` to fetch ticket details
- Parses JSON output to extract `summary` (title) and `description` (body)
- Creates `.pio/issues/jira-proj-123.md` with the ticket data (slug derived from key: lowercase, hyphenated prefix)
- If issue already exists, returns a warning message instead of overwriting
- Registers as both tool (`pi.registerTool()`) and command (`pi.registerCommand("pio-jira-to-issue", ...)`)

### Command 2: `issue-to-jira` (`/pio-issue-to-jira` + `pio_issue_to_jira` tool)

- Takes a local issue slug (e.g., `fix-type-error`) as input parameter
- Reads `.pio/issues/<slug>.md` to extract title and description using existing `readIssue()` from `fs-utils.ts`
- Requires `--project` parameter, with optional default from `.pio/jira-config.yaml`
- Runs `acli jira workitem create --summary "..." --project "PROJ" --type "Task" --description "..." --json` to create the Jira ticket
- Returns the created Jira key in the output (parsed from JSON response)
- Registers as both tool and command

### Config file: `.pio/jira-config.yaml` (optional, per-repo)

```yaml
projectKey: "PROJ"      # default project for issue-to-jira
defaultType: "Task"     # default Jira issue type
```

- Read by `issue-to-jira` to provide defaults — all fields optional
- If file doesn't exist or a field is missing, the command still works if the user provides `--project` explicitly
- No credentials stored here — auth is entirely handled by `acli` itself

### Skill: `pio-jira` (`src/skills/pio-jira/SKILL.md`)

- Instructs agents on using `acli` for Jira operations
- Covers:
  - Auth status check: `acli jira auth status`
  - Creating tickets: `acli jira workitem create --summary "..." --project "PROJ" --type "Task" --description "..." --json`
  - Reading tickets: `acli jira workitem view KEY --json`
  - Searching with JQL: `acli jira workitem search --jql "project = PROJ AND status = Open" --json`
- Notes that `--json` flag should always be used for programmatic output
- Explains error handling: if `acli` is not installed (`which acli` fails) or user not authenticated (unauthorized error), report a helpful message directing to `acli jira auth login`

### New files to create

- `src/capabilities/jira-to-issue.ts` — function + tool + command for pulling Jira → local issue
- `src/capabilities/issue-to-jira.ts` — function + tool + command for pushing local issue → Jira
- `src/skills/pio-jira/SKILL.md` — skill documentation for agents

### Existing files to modify

- `src/index.ts` — import and call `setupJiraToIssue()` and `setupIssueToJira()`
- Optionally extend `src/fs-utils.ts` with a helper for reading `.pio/jira-config.yaml`, or read inline in the capability

## Open Assumptions

- **acli JSON structure:** Assumes `acli jira workitem view KEY --json` returns a JSON object with `summary` and `description` fields at the top level. The actual key names may differ — implementer must verify by running a test command (or checking help output) if auth is available.
- **acli create response:** Assumes `acli jira workitem create ... --json` returns JSON containing the new issue key (likely `key` field). Implementer must verify.
- **Jira description format:** The local issue markdown body may not be valid Jira ADF (Atlassian Document Format). The implementation should pass the raw text and let acli handle plain-text → ADF conversion, or document that complex formatting may not transfer perfectly.
- **acli auth error message:** Confirmed error for unauthenticated state is `"unauthorized: use 'acli jira auth login' to authenticate"`. The error detection should check stderr/output for this string or "unauthorized".
