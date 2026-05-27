---
skills:
  mandatory:
    - test-driven-development
  recommended:
    - name: write-a-skill
      condition: when verifying REFERENCE.md structure conventions (progressive disclosure, edge case table format)
    - name: ask-user
      condition: when drafting example ask_user payloads for collecting site URL and project key
---

# Task: Update REFERENCE.md — Add Config Setup Execution Reference

Add an execution reference section and edge case entries to `src/skills/pio-jira/REFERENCE.md` so agents have concrete command strings, example payloads, and error-handling patterns for the Jira Config Setup flow.

## Context

Step 1 created `scripts/setup-config.sh`. Step 2 added the "Jira Config Setup" section to SKILL.md (high-level instructions with a pointer to REFERENCE.md). Step 3 delivers those execution details: exact command sequences, example `ask_user` payloads, and edge case handling. The current REFERENCE.md is 185 lines with sections for Pull, Goal from Issue, Push, Auth Status Check, JQL Search, and Edge Cases.

## What to Build

### New section: "Jira Config Setup — Execution"

Insert a new heading in REFERENCE.md **after** "Auth Status Check — Execution" and **before** "JQL Search — Execution". This ordering matches SKILL.md's logical flow (Auth → Config Setup → Pull → Push → Search).

The section must contain:

1. **Step-by-step code block** showing the full sequence:
   - Step 1: `acli jira auth status` — verify authentication
   - Step 1b (if not authenticated): guide user through `acli jira auth login`, wait for confirmation
   - Step 2: Collect site URL via `ask_user` — show a complete example payload (JSON object with `question`, `allowFreeform: true`)
   - Step 3: Collect project key via `ask_user` — show a complete example payload with the question "Which Jira project should we use?" and freeform input
   - Step 4: Run `bash src/skills/pio-jira/scripts/setup-config.sh "$SITE" "$PROJECT_KEY" [DEFAULT_TYPE]` — use bash variable interpolation to pass collected values
   - Step 5: Verify success — check exit code 0, optionally read back `.pio/jira-config.yaml`
   - Step 6: Proceed with the original Jira operation

2. **Example `ask_user` payloads** (two complete JSON examples):
   - First call for site URL: `question: "Which Jira site should we use? (e.g., https://mycompany.atlassian.net)"`, `allowFreeform: true`
   - Second call for project key: `question: "Which Jira project should we use?"`, `allowFreeform: true`, with context note that project keys are short codes like `PROJ`

### Updated Edge Cases section

Add a new edge case table subsection titled "**Jira Config Setup**" inside the existing "## Edge Cases" section. Place it between "Pull Jira → Local Issue" and "Push Local Issue → Jira" subsections (alphabetical/logical ordering). Rows:

| Edge Case | Handling |
|-----------|----------|
| Config already exists (`\.pio/jira-config\.yaml` present) | Script overwrites silently (idempotent) — no special handling needed, but warn user that existing config will be replaced |
| User not authenticated with `acli` | Run Auth Status Check first. If unauthenticated, guide through `acli jira auth login` before proceeding to ask_user calls |
| Project key collection fails (user cancels `ask_user`) | Abort setup, report "Config setup cancelled" to user — do not create a partial config file |
| Site URL collection fails (user cancels `ask_user`) | Abort setup, report "Config setup cancelled" to user — do not proceed to project key collection |
| Script execution fails (disk full, permissions) | Check non-zero exit code, log stderr, report error to user |

### Approach and Decisions

- **Script signature must be correct:** Document `SITE PROJECT_KEY [DEFAULT_TYPE]` (three-field signature). The `site` argument was added by user request during Step 1 — this is a deviation from the original plan which had only `PROJECT_KEY [DEFAULT_TYPE]`. REFERENCE.md MUST match the actual script.
- **Config YAML format example:** When showing what the config file looks like, include all three fields:
  ```yaml
  site: "https://mycompany.atlassian.net"
  projectKey: "PROJ"
  defaultType: "Task"
  ```
- **Bash variable interpolation:** Show `$SITE` and `$PROJECT_KEY` in the bash command to demonstrate how collected values flow into the script. This is clearer than showing literal values.
- **Existing content preserved:** Only additions to REFERENCE.md — no modifications to existing sections, headings, or edge case rows.
- **Follow existing REFERENCE.md conventions:** Use the same code block format (` ```bash `), same table structure for edge cases, and same heading style (`## Section Name — Execution`) as existing sections.

## Skills

- **ask-user** (recommended): Draft the example `ask_user` payloads. Consult this skill for payload quality standards — concrete questions, freeform input configuration, and optional context field usage.
- **write-a-skill** (recommended): Verify REFERENCE.md structure conventions — edge case table format, code block styling, progressive disclosure pattern (high-level in SKILL.md, details in REFERENCE.md).

## Dependencies

- Step 1 must be completed: `scripts/setup-config.sh` must exist with the documented signature (`SITE PROJECT_KEY [DEFAULT_TYPE]`).
- Step 2 must be completed: SKILL.md "Jira Config Setup" section already references REFERENCE.md for execution details — this step delivers on that promise.

## Files Affected

- `src/skills/pio-jira/REFERENCE.md` — add "Jira Config Setup — Execution" section (~45 lines) and new edge case table subsection (~8 rows)

## Acceptance Criteria

- REFERENCE.md contains a "Jira Config Setup — Execution" heading (e.g., `## Jira Config Setup — Execution`)
- The execution section is placed after "Auth Status Check — Execution" and before "JQL Search — Execution"
- The step-by-step sequence includes: auth check → ask_user for site URL → ask_user for project key → bash script invocation → success verification
- Two complete example `ask_user` payloads are included (one for site URL, one for project key), each as a JSON-like code block with `question`, `allowFreeform`, and optional `context` fields
- The bash script invocation uses the correct path: `src/skills/pio-jira/scripts/setup-config.sh`
- The bash script invocation uses the correct three-field signature: `SITE PROJECT_KEY [DEFAULT_TYPE]`
- A config YAML format example shows all three fields: `site`, `projectKey`, `defaultType`
- Edge case table includes a "Jira Config Setup" subsection with rows for: config already exists (idempotent), unauthenticated user, cancelled ask_user (both site and project key), script execution failure
- All existing REFERENCE.md content is preserved — only additions, no modifications to pre-existing sections or rows
- `npx tsc --noEmit` passes with no errors
- Existing test suite passes with no regressions (`npm test`)

## Risks and Edge Cases

- **Placement precision:** Inserting a new section mid-file requires finding the exact insertion point. The edit must preserve all surrounding content precisely — verify by checking that pre-existing headings and edge case rows are unchanged after the edit.
- **Signature mismatch risk:** If REFERENCE.md documents `PROJECT_KEY [DEFAULT_TYPE]` without `SITE`, it won't match the actual script. Always verify against the real script at `src/skills/pio-jira/scripts/setup-config.sh`.
- **ask_user payload accuracy:** The example payloads should use exact question text matching SKILL.md: "Which Jira site should we use? (e.g., https://mycompany.atlassian.net)" and "Which Jira project should we use?" — consistency between SKILL.md and REFERENCE.md is critical.
- **Edge case table format:** Match the existing pipe-table format exactly (`| Edge Case | Handling |`) to maintain document consistency.
