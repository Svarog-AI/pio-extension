---
totalSteps: 4
steps:
  - name: create-setup-script
    complexity: task
  - name: update-skill-documentation
    complexity: task
  - name: update-reference-documentation
    complexity: task
  - name: integrate-push-protocol
    complexity: task
---

# Plan: Improve pio-jira Skill — Jira Config Setup Script

Add a shell script and documentation to enable agents to create `.pio/jira-config.yaml` when missing, with auth guidance integrated into the workflow. See GOAL.md for full context.

## Prerequisites

- None. All changes are confined to `src/skills/pio-jira/`.

## Steps

### Step 1: Create setup-config.sh

**Description:** Write a POSIX shell script at `src/skills/pio-jira/scripts/setup-config.sh` that creates `.pio/jira-config.yaml` with the provided values. The script takes `PROJECT_KEY` as the first required argument and `DEFAULT_TYPE` as an optional second argument (defaults to `"Task"`). It creates the `.pio/` directory if needed, writes a properly formatted YAML file, overwrites silently if the file already exists (idempotent), and exits with code 0 on success or non-zero on error. Paths resolve relative to `process.cwd()` so agents invoke it from the project root.

**Acceptance Criteria:**
- File exists at `src/skills/pio-jira/scripts/setup-config.sh`
- Script has a POSIX shebang (`#!/bin/sh`) and is executable (`chmod +x`)
- Running `bash src/skills/pio-jira/scripts/setup-config.sh PROJ` from project root creates `.pio/jira-config.yaml` with `projectKey: "PROJ"` and `defaultType: "Task"`
- Running with a second argument (`bash ... PROJ Story`) sets `defaultType: "Story"`
- Running without arguments exits non-zero
- Running the script twice produces identical output (idempotent overwrite)

**Files Affected:**
- `src/skills/pio-jira/scripts/setup-config.sh` — new file: POSIX shell script for config creation

### Step 2: Update SKILL.md

**Description:** Add a "Jira Config Setup" section to `src/skills/pio-jira/SKILL.md` that instructs agents when and how to trigger the setup script. The section should cover: (1) **When to trigger** — during Push, when `.pio/jira-config.yaml` doesn't exist and no project key was provided inline; (2) **Auth prerequisite** — verify `acli jira auth status` before setup; if not authenticated, guide the user through `acli jira auth login` first, then proceed; (3) **How to collect the key** — use `ask_user` with freeform input to ask "Which Jira project should we push issues to?"; (4) **How to create the config** — run `bash src/skills/pio-jira/scripts/setup-config.sh PROJECT_KEY [DEFAULT_TYPE]` via the `bash` tool; (5) **Workflow integration** — after setup, proceed with the original push operation using values from the newly created config. Keep the section concise (~15 lines) and stay within the SKILL.md ≤100 line convention by linking to REFERENCE.md for execution details.

**Acceptance Criteria:**
- A new "Jira Config Setup" heading exists in `src/skills/pio-jira/SKILL.md`
- The section mentions auth verification as a prerequisite (checking `acli jira auth status`)
- The section instructs to use `ask_user` for collecting the project key
- The section references the script at the correct path: `scripts/setup-config.sh` relative to skill directory
- SKILL.md remains ≤100 lines total (or links to REFERENCE.md if approaching the limit)

**Files Affected:**
- `src/skills/pio-jira/SKILL.md` — add "Jira Config Setup" section (~15 lines)

### Step 3: Update REFERENCE.md

**Description:** Add an execution reference section and edge case entries to `src/skills/pio-jira/REFERENCE.md`. The execution block should show the full sequence: (1) check auth with `acli jira auth status`, (2) if unauthenticated, guide user through `acli jira auth login`, (3) use `ask_user` to collect project key (with an example payload), (4) run the setup script via bash. Add edge case rows: "Config already exists" → script overwrites (idempotent); "User not authenticated with acli" → guide through login before proceeding; "Project key collection fails (user cancels)" → abort push, report to user.

**Acceptance Criteria:**
- REFERENCE.md contains an execution section for config setup with the auth check → ask_user → bash script sequence
- An example `ask_user` payload is included showing how to collect the project key
- Edge case table includes rows for: config already exists (idempotent), unauthenticated user, and cancelled ask_user
- Existing REFERENCE.md content is preserved — only additions

**Files Affected:**
- `src/skills/pio-jira/REFERENCE.md` — add execution reference + edge cases for config setup

### Step 4: Integrate Push protocol docs

**Description:** Update the "Push Local Issue → Jira" section in SKILL.md to explicitly reference the config setup flow. Currently step 2 says "Resolve project key from user parameter or `.pio/jira-config.yaml` (if it exists)". Change this to clarify that when the config file is missing, agents should trigger the setup protocol first (auth check → collect key via ask_user → run setup script) before proceeding with the push. This creates a clear chain: Push → config missing? → Setup → Push continues. Update the Push section in REFERENCE.md similarly — add the setup invocation as step 2b between resolving project key and creating the ticket, so the execution flow is explicit.

**Acceptance Criteria:**
- SKILL.md Push protocol step 2 references the Jira Config Setup section when config is missing
- REFERENCE.md Push execution section includes the setup script invocation in the step-by-step sequence
- The documentation chain is clear: missing config → setup protocol → proceed with push
- Existing auth handling instructions in Push remain intact (no duplication)

**Files Affected:**
- `src/skills/pio-jira/SKILL.md` — modify Push protocol to reference config setup flow
- `src/skills/pio-jira/REFERENCE.md` — add setup invocation to Push execution sequence

## Notes

- **SKILL.md line budget:** Currently 76 lines. Adding ~15 lines for the new section brings it close to 100. If it exceeds the limit, move detailed instructions to REFERENCE.md and keep SKILL.md high-level with a link.
- **Auth integration:** The existing "Auth Status Check" protocol already covers checking `acli jira auth status`. The config setup section should reference this rather than duplicating it — instruct agents to run Auth Status Check first, then proceed with setup only if authenticated (or guide login if not).
- **Agent path resolution:** Agents in sub-sessions have `process.cwd()` at project root, so `bash src/skills/pio-jira/scripts/setup-config.sh PROJ` works directly. The SKILL.md instruction should use this relative-from-project-root path format.
- **Shell script bypasses write allowlist:** Running the setup script via `bash` tool creates `.pio/jira-config.yaml` through the shell, not through the `write` or `edit` tools — so it bypasses the pio write allowlist protections in `validation.ts`. This is by design.
