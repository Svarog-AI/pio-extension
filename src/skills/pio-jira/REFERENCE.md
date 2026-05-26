# pio-jira — Reference

Detailed execution steps, edge cases, and command patterns for the protocols in [SKILL.md](SKILL.md). Split from the main skill file per write-a-skill conventions (SKILL.md ≤100 lines).

## Pull Jira → Local Issue — Execution

### Step-by-step

```bash
# 1. Fetch ticket data
acli jira workitem view PROJ-123 --json

# 2. Parse output — inspect actual field names first
# Common fields: summary, description, key, status
# Adapt if your acli version uses different names

# 3. Derive slug (lowercase, hyphenated)
# PROJ-123 → jira-proj-123
# MY-PROJ-456 → jira-my-proj-456

# 4. Check if issue already exists
ls .pio/issues/jira-proj-123.md 2>/dev/null

# 5. Create via pio_create_issue tool (NOT manual file writes)
# Use the pio_create_issue tool with:
#   slug: "jira-proj-123"
#   title: "<from summary field>"
#   description: "<from description field>"
```

### Slug derivation examples

| Jira Key | Slug |
|----------|------|
| `PROJ-123` | `jira-proj-123` |
| `MY-PROJ-456` | `jira-my-proj-456` |
| `JIRA-1` | `jira-jira-1` |
| `ABC-DEF-789` | `jira-abc-def-789` |

## Goal from Pulled Issue — Execution

### Step-by-step

After `pio_create_issue` creates `.pio/issues/jira-proj-123.md`:

```bash
# 1. Convert the local issue into a goal workspace
# Use the pio_goal_from_issue tool (not a bash command):
#   issuePath: "jira-proj-123"
#
# This queues a create-goal session with the issue content as initial context.
# The goal name is derived from the issue slug: jira-proj-123

# 2. User runs /pio-next-task to start the Goal Definition Assistant
# The assistant receives the issue content as starting context,
# interviews about the feature, and produces GOAL.md

# 3. Expected outcome:
# Goal workspace created at .pio/goals/jira-proj-123/
# Original issue file is cleaned up after goal creation
```

### Workflow summary

```
Jira ticket (PROJ-123)
  → acli jira workitem view PROJ-123 --json
  → pio_create_issue (slug: jira-proj-123)
  → pio_goal_from_issue jira-proj-123
  → /pio-next-task (Goal Definition Assistant)
  → .pio/goals/jira-proj-123/GOAL.md
  → /pio-create-plan → /pio-evolve-plan → /pio-execute-task → ...
```

## Push Local Issue → Jira — Execution

### Step-by-step

```bash
# 1. Read the issue file
# Title: first "# heading" in markdown
# Body: content after the heading

# 2. Resolve project key
# Check .pio/jira-config.yaml for projectKey
# If not found, ask user for project key

# 3. Create the ticket
# For single-line descriptions:
acli jira workitem create \
  --summary "Fix type error in fs-utils" \
  --project "PROJ" \
  --type "Task" \
  --description "Fix the type error reported in fs-utils.ts" \
  --json

# For multi-line descriptions, use heredoc or proper escaping:
acli jira workitem create \
  --summary "Fix type error" \
  --project "PROJ" \
  --type "Task" \
  --description "$(cat <<'EOF'
Line one of description.
Line two of description.
EOF
)" --json

# 4. Parse response for the created key
# Look for "key" field in JSON output
```

### Shell quoting for multi-line descriptions

When passing multi-line text to `acli` via bash:

- Use heredoc syntax `$(cat <<'EOF' ... EOF)` for multi-line descriptions
- Use single quotes `'...'` for single-line descriptions with special characters
- Escape double quotes inside double-quoted strings: `\"`
- Avoid unescaped newlines in double-quoted strings

## Auth Status Check — Execution

```bash
# Check auth status
acli jira auth status

# Expected output on success: authenticated user info
# Expected output on failure: contains "unauthorized" or similar

# If not authenticated, instruct user to run:
acli jira auth login
# This opens a browser for OAuth authentication
```

## Jira Config Setup — Execution

### Step-by-step

```bash
# Step 1: Verify authentication
acli jira auth status

# Step 1b (if not authenticated): guide user through login
# acli jira auth login
# Wait for user to confirm authentication is complete

# Step 2: Collect site URL
# Use ask_user with the following payload:
{
  "question": "Which Jira site should we use? (e.g., https://mycompany.atlassian.net)",
  "allowFreeform": true
}
# Store the response as $SITE

# Step 3: Collect project key
# Use ask_user with the following payload:
{
  "question": "Which Jira project should we use?",
  "context": "Project keys are short codes like PROJ, JIRA, or MYAPP.",
  "allowFreeform": true
}
# Store the response as $PROJECT_KEY

# Step 4: Run the setup script with collected values
bash src/skills/pio-jira/scripts/setup-config.sh "$SITE" "$PROJECT_KEY" [DEFAULT_TYPE]
# DEFAULT_TYPE is optional — defaults to "Task"

# Step 5: Verify success
# Check exit code 0. Optionally verify the config file:
# cat .pio/jira-config.yaml
# Expected output:
site: "https://mycompany.atlassian.net"
projectKey: "PROJ"
defaultType: "Task"

# Step 6: Proceed with the original Jira operation using values from the new config
```

### Example ask_user payloads

**Collect site URL:**
```json
{
  "question": "Which Jira site should we use? (e.g., https://mycompany.atlassian.net)",
  "allowFreeform": true
}
```

**Collect project key:**
```json
{
  "question": "Which Jira project should we use?",
  "context": "Project keys are short codes like PROJ, JIRA, or MYAPP.",
  "allowFreeform": true
}
```

## JQL Search — Execution

```bash
# Basic project search
acli jira workitem search --jql "project = PROJ AND status = Open" --json

# Current user's issues
acli jira workitem search --jql "project = PROJ AND assignee = currentUser()" --json

# Specific keys
acli jira workitem search --jql "key in (PROJ-123, PROJ-456)" --json

# Complex queries
acli jira workitem search --jql "project = PROJ AND type = Bug AND priority = High ORDER BY created DESC" --json
```

## Edge Cases

### Pull Jira → Local Issue

| Edge Case | Handling |
|-----------|----------|
| `acli` not installed | `command -v acli` fails → report helpful install message |
| Not authenticated | Output contains `"unauthorized"` → direct to `acli jira auth login` |
| Issue already exists | `.pio/issues/<slug>.md` exists → warn, do not overwrite |
| JSON field names differ | Inspect actual output first, adapt field names accordingly |
| Empty description | Pass empty string to `pio_create_issue`, let tool handle defaults |
| Network failure | `acli` exits non-zero → log stderr, proceed gracefully |
| Goal workspace already exists | `pio_goal_from_issue` returns error: "Goal workspace already exists at ..." → advise using a different slug or deleting the existing goal first |

### Jira Config Setup

| Edge Case | Handling |
|-----------|----------|
| Config already exists (`.pio/jira-config.yaml` present) | Script overwrites silently (idempotent) — no special handling needed, but warn user that existing config will be replaced |
| User not authenticated with `acli` | Run Auth Status Check first. If unauthenticated, guide through `acli jira auth login` before proceeding to ask_user calls |
| Project key collection fails (user cancels `ask_user`) | Abort setup, report "Config setup cancelled" to user — do not create a partial config file |
| Site URL collection fails (user cancels `ask_user`) | Abort setup, report "Config setup cancelled" to user — do not proceed to project key collection |
| Script execution fails (disk full, permissions) | Check non-zero exit code, log stderr, report error to user |

### Push Local Issue → Jira

| Edge Case | Handling |
|-----------|----------|
| `acli` not installed | `command -v acli` fails → report helpful install message |
| Not authenticated | Output contains `"unauthorized"` → direct to `acli jira auth login` |
| No project key | `.pio/jira-config.yaml` missing and no user param → ask user for project key |
| Markdown → ADF conversion | Complex formatting may not transfer perfectly → note limitation to user |
| Multi-line description quoting | Use heredoc `$(cat <<'EOF' ... EOF)` or proper escaping |
| Create fails (network) | `acli` exits non-zero → log stderr, proceed gracefully |
| Duplicate issue | `acli` returns error → log, report to user |

### General

| Edge Case | Handling |
|-----------|----------|
| `acli` command not found | `command -v acli` returns nothing → report: "acli is not installed. Install via npm: `npm install -g @atlassianlabs/acli`" |
| Unauthorized access | stderr or stdout contains `"unauthorized"` → report: "Not authenticated. Run `acli jira auth login` to authenticate." |
| Non-zero exit code | Log stderr output, proceed gracefully — never block workflow completion |
| `.pio/jira-config.yaml` missing | All fields optional — if file doesn't exist, ask user for required values |
| Invalid JSON response | `acli` output is not valid JSON → log raw output, ask user to verify `acli` version |
