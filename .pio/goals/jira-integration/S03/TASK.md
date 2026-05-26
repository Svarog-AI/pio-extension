---
skills:
  mandatory:
    - pio
    - write-a-skill
---

# Task: Create the pio-jira Skill

Create `src/skills/pio-jira/SKILL.md` — a skill that instructs agents on performing all Jira operations via `acli` using the `bash` tool, combined with existing pio tools.

## Context

The project adopted a **skill-only approach** for Jira integration. Instead of dedicated TypeScript capabilities, agents use `bash` to run `acli` commands directly, guided by this skill. This provides more flexibility — agents can handle search, comments, transitions, and updates, not just create/pull. The skill auto-discovers from `src/skills/pio-jira/SKILL.md` with no manual registration needed.

## What to Build

A single markdown file: `src/skills/pio-jira/SKILL.md`. It must follow the existing skill structure conventions (see `src/skills/pio-git/SKILL.md` for format reference): YAML frontmatter with `name` and `description`, organized sections, progressive disclosure where appropriate.

### Code Components

The skill is a documentation file — no TypeScript code. It defines **protocols** that agents follow when interacting with Jira via `bash` + existing pio tools. The skill must cover five operation areas:

#### 1. Auth Status Check

- Instruct agents to run `acli jira auth status` before any Jira operation
- If not authenticated, direct the user to `acli jira auth login`
- This should be the first step in any Jira workflow

#### 2. Pull Jira → Local Issue (jira-to-issue replacement)

The agent follows this protocol:

1. Run `acli jira workitem view KEY --json` (e.g., `PROJ-123`)
2. Parse JSON output for `summary` (title) and `description` (body) fields
   - **Note:** actual field names may differ from `summary`/`description` — instruct agents to inspect actual output and adapt if needed
3. Derive slug: `jira-<project>-<number>` (lowercase, hyphenated). Example: `PROJ-123` → `jira-proj-123`, `MY-PROJ-456` → `jira-my-proj-456`
4. Check if `.pio/issues/<slug>.md` already exists (using `ls` or similar)
5. If exists: warn without overwriting
6. If not exists: call `pio_create_issue` tool with slug, title (from `summary`), and description (from `description`)
7. **Instruct agents to use `pio_create_issue`, not manual file writes** — this ensures consistent issue format

#### 3. Push Local Issue → Jira (issue-to-jira replacement)

The agent follows this protocol:

1. Read `.pio/issues/<slug>.md` to extract title and description
   - Title: first `# heading` in the markdown
   - Description: body content after the heading
2. Resolve project key from user-provided parameter or from `.pio/jira-config.yaml` (if it exists)
3. Run `acli jira workitem create --summary "..." --project "KEY" --type "Task" --description "..." --json`
4. Parse JSON response to extract the created Jira key (likely `key` field)
5. Return/report the created Jira key

#### 4. Search with JQL

- Run `acli jira workitem search --jql "..." --json` for flexible querying
- Document common patterns:
  - `project = PROJ AND status = Open`
  - `project = PROJ AND assignee = currentUser()`
  - `key in (PROJ-123, PROJ-456)`

#### 5. Error Handling

- If `which acli` fails or `command -v acli` returns nothing: report helpful message about installing `acli`
- If output contains `"unauthorized"`: direct to `acli jira auth login`
- Non-zero exit codes from `acli`: log stderr and proceed gracefully

### Approach and Decisions

- **Follow `pio-git/SKILL.md` format:** YAML frontmatter with `name: pio-jira` and a concise description. Organized sections with clear headings. Use progressive disclosure — put detailed execution steps (exact command strings) in a `REFERENCE.md` if the skill body would be too long, keeping SKILL.md focused on protocols and decision points.
- **Emphasize `--json` flag:** Every `acli` command should use `--json` for programmatic output parsing.
- **Plain-text descriptions:** Note that local markdown may not transfer perfectly to Jira ADF — instruct agents to pass raw text and let `acli` handle conversion.
- **Config file convention:** Document `.pio/jira-config.yaml` format:
  ```yaml
  projectKey: "PROJ"      # default project for push operations
  defaultType: "Task"     # default Jira issue type
  ```
  All fields optional. If file doesn't exist, agent must ask user for project key.
- **No credentials in config:** Auth is entirely handled by `acli` itself via `acli jira auth login`.

### Prior Step Decisions (from DECISIONS.md)

Steps 1–2 built TypeScript code (`src/jira-utils.ts`, `src/capabilities/jira-to-issue.ts`) that will be deleted in Step 4. The skill should not reference these modules. Use the slug derivation convention from Step 1: `jira-<project>-<number>` (lowercase). Use the auth error string confirmed in GOAL.md: check for `"unauthorized"`.

## Skills

- **write-a-skill** (mandatory) — provides the skill structure template, description requirements (`name`/`description` frontmatter), progressive disclosure guidelines, and review checklist for creating `src/skills/pio-jira/SKILL.md`. The executor should follow the SKILL.md template, split into REFERENCE.md if the body exceeds 100 lines, and use the review checklist before completion.

## Dependencies

- **Step 1 and Step 2 must be completed** (their implementations exist but will be deleted in Step 4). The skill replaces the functionality of both steps.
- **No runtime dependencies** — this is a documentation-only step. No new TypeScript files, no imports.

## Files Affected

- `src/skills/pio-jira/SKILL.md` — created: agent skill documentation for all Jira/acli operations
- `src/skills/pio-jira/REFERENCE.md` — created (optional but recommended): execution reference with exact `acli` command strings, field mapping examples, and edge case tables

## Acceptance Criteria

- [ ] `npm run check` reports no errors
- [ ] `npm test` passes with no regressions (skill files are not tested, but no code changes should break anything)
- [ ] `src/skills/pio-jira/SKILL.md` exists with YAML frontmatter containing `name: pio-jira` and a description
- [ ] Skill covers all five operation areas: auth check, pull Jira → local, push local → Jira, JQL search, error handling
- [ ] Skill documents using `--json` flag for programmatic output
- [ ] Skill documents the optional `.pio/jira-config.yaml` format and its fields (`projectKey`, `defaultType`)
- [ ] Skill instructs agents to use existing `pio_create_issue` tool (not manual file writes) for pull operations
- [ ] Skill follows the format conventions of `src/skills/pio-git/SKILL.md` (frontmatter, organized sections, progressive disclosure)
- [ ] Slug derivation convention is documented: `jira-<project>-<number>` (lowercase, hyphenated)

## Risks and Edge Cases

- **acli JSON structure unverified:** GOAL.md explicitly notes that actual field names from `acli jira workitem view --json` may differ from assumed `summary`/`description`. The skill should instruct agents to inspect actual output first and adapt.
- **Skill auto-discovery:** Skills under `src/skills/*/SKILL.md` are auto-discovered by pi. Verify the directory structure is correct (`pio-jira/SKILL.md`, not `pio-jira.md`).
- **Plain-text vs ADF:** Jira expects Atlassian Document Format (ADF) for descriptions. Passing raw markdown may produce unexpected formatting. The skill should note this limitation and recommend plain text.
- **Multi-line description handling:** When passing descriptions to `acli jira workitem create`, the agent must properly escape or quote multi-line text in the bash command. Reference exact shell quoting patterns.
