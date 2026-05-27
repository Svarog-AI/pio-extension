---
skills:
  mandatory:
    - write-a-skill
  recommended:
    - name: ask-user
      condition: when drafting the ask_user payload for collecting Jira site URL and project key
---

# Task: Update SKILL.md — Add Jira Config Setup Section

Add a "Jira Config Setup" section to `src/skills/pio-jira/SKILL.md` that instructs agents how to create the Jira config file when it's missing.

## Context

The Push protocol requires `.pio/jira-config.yaml` for project key resolution, but no instructions exist for creating this file. Step 1 created `scripts/setup-config.sh` (a shell script that writes the config via `bash`, bypassing write allowlist protections). This step adds the documentation to SKILL.md so agents know when and how to invoke the setup flow. Current SKILL.md is 76 lines with a ~100 line budget — keep additions tight.

## What to Build

A new section in SKILL.md titled "Jira Config Setup" that provides agent-facing instructions. The section must be concise (~24 lines max to stay within the ≤100 line budget) and link to REFERENCE.md for execution details (exact command strings, example payloads).

### Section Content Requirements

The "Jira Config Setup" section must cover:

1. **When to trigger:** During Push Local Issue → Jira — when `.pio/jira-config.yaml` doesn't exist and no project key was provided inline.
2. **Auth prerequisite:** Run the existing "Auth Status Check" protocol first (`acli jira auth status`). If not authenticated, guide user through `acli jira auth login`. Only proceed with setup after auth is confirmed (or after successful login).
3. **Collecting values via `ask_user`:** Two values need to be collected from the user:
   - **Jira site URL:** Ask "Which Jira site should we use? (e.g., https://mycompany.atlassian.net)" — freeform input
   - **Project key:** Ask "Which Jira project should we push issues to?" — freeform input (project keys are short codes like `PROJ`)
4. **Creating the config:** Run `bash src/skills/pio-jira/scripts/setup-config.sh SITE_URL PROJECT_KEY [DEFAULT_TYPE]` via the `bash` tool. The script resolves relative to project root (`process.cwd()`). `DEFAULT_TYPE` is optional, defaults to `"Task"`.
5. **Workflow integration:** After setup completes (script exits 0), proceed with the original push operation using values from the newly created config.

### Approach and Decisions

- **Reference existing auth protocol:** The "Auth Status Check" section already exists in SKILL.md. Reference it by name — "run the Auth Status Check protocol first" — rather than duplicating instructions.
- **Mention `site` argument:** Step 1 added a user-requested `site` field. The documentation MUST reflect the actual script signature: `setup-config.sh SITE PROJECT_KEY [DEFAULT_TYPE]`. This is a plan deviation — the original plan only had `PROJECT_KEY [DEFAULT_TYPE]`.
- **Use relative-from-root path:** Agents in sub-sessions have `process.cwd()` at project root, so the path should be `bash src/skills/pio-jira/scripts/setup-config.sh ...` (not a shell variable or skill_dir resolution).
- **Two ask_user calls for setup:** The section should instruct agents to collect site URL first, then project key. Use two separate `ask_user` calls — don't bundle them into one question.
- **Link to REFERENCE.md for details:** Keep SKILL.md high-level. Execution details (exact bash commands, example payloads) belong in REFERENCE.md (Step 3). Include a pointer: "See REFERENCE.md for execution details."
- **Section placement:** Add the new section after "Auth Status Check" and before "Pull Jira → Local Issue". This maintains logical flow: Auth → Config Setup → Pull → Goal from Issue → Push → Search → Error Handling.
- **`--parent` mention is NOT required here:** Epic linking via `--parent` is a Push-time concern, not a setup concern. Step 4 will handle this in the Push protocol section.

## Skills

- **ask-user** (recommended): The new section instructs agents to use `ask_user` for collecting site URL and project key. Consult this skill for best practices on crafting the question payload — freeform input, structured options when applicable, display mode considerations.
- **write-a-skill** (recommended): Verify SKILL.md structure conventions — line budget constraints (~100 lines), section ordering, progressive disclosure (high-level in SKILL.md, details in REFERENCE.md).

## Dependencies

- Step 1 must be completed: `scripts/setup-config.sh` must exist at the documented path before SKILL.md can reference it.

## Files Affected

- `src/skills/pio-jira/SKILL.md` — add "Jira Config Setup" section (~24 lines max)

## Acceptance Criteria

- A new "Jira Config Setup" heading (e.g., `## Jira Config Setup`) exists in SKILL.md
- The section appears after "Auth Status Check" and before "Pull Jira → Local Issue" (logical placement in the document flow)
- The section explicitly mentions verifying auth as a prerequisite, referencing the existing "Auth Status Check" protocol
- The section instructs agents to use `ask_user` for collecting both the site URL and project key
- The section references the correct script path: `src/skills/pio-jira/scripts/setup-config.sh` (with `scripts/` subdirectory)
- The section documents the correct script arguments: `SITE PROJECT_KEY [DEFAULT_TYPE]` (three-field signature, reflecting the user-requested `site` addition from Step 1)
- SKILL.md total line count is ≤ 100 lines after the addition (currently 76 lines + new content must not exceed 100)
- Existing sections are preserved verbatim — only additions, no modifications to existing content
- The section includes a pointer/link to REFERENCE.md for execution details

## Risks and Edge Cases

- **Line budget:** SKILL.md is at 76/100 lines. Adding ~24 lines hits the limit exactly. If drafting exceeds this, trim descriptions and move more detail to REFERENCE.md (Step 3). The section should be high-level with a reference link, not a full tutorial.
- **Argument mismatch:** Ensure the documented arguments match the actual script signature from Step 1 (`SITE PROJECT_KEY [DEFAULT_TYPE]`). An incorrect signature would cause agent errors at runtime.
- **Placement matters:** Inserting a new section mid-file requires finding the exact insertion point between "Auth Status Check" and "Pull Jira → Local Issue". The edit must preserve surrounding content precisely.
- **Config format reference:** If the section shows a config YAML example, it must include all three fields (`site`, `projectKey`, `defaultType`) to match the actual script output.
