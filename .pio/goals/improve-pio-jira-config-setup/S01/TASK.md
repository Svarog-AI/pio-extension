---
skills:
  mandatory:
    - test-driven-development
  recommended:
    - name: write-a-skill
      condition: when deciding script placement within the skill directory structure
---

# Task: Create setup-config.sh

Write a POSIX shell script that creates `.pio/jira-config.yaml` with the provided Jira project key and default issue type.

## Context

Agents using the pio-jira skill need to push local issues to Jira via `acli`. The Push protocol requires a project key, which it reads from `.pio/jira-config.yaml`. Currently no mechanism exists to create this file — agents in sub-sessions can't use the `write` tool for files in `.pio/` due to write allowlist protections. A shell script run via the `bash` tool bypasses these restrictions and provides a deterministic, idempotent way to set up the config.

## What to Build

A POSIX-compliant shell script at `src/skills/pio-jira/scripts/setup-config.sh` that:

- Accepts `PROJECT_KEY` as `$1` (required) and `DEFAULT_TYPE` as `$2` (optional, defaults to `"Task"`)
- Creates `.pio/` directory if it doesn't exist (`mkdir -p .pio`)
- Writes `.pio/jira-config.yaml` with properly formatted YAML:
  ```yaml
  projectKey: "PROJ"
  defaultType: "Task"
  ```
- Overwrites silently if the file already exists (idempotent)
- Exits with code 0 on success, non-zero on error
- Has a POSIX shebang (`#!/bin/sh`) and is executable (`chmod +x`)

### Code Components

#### Argument validation
- If `$1` (PROJECT_KEY) is empty or unset, print an error message to stderr and exit with code 1
- Error message should be clear: something like "Usage: setup-config.sh PROJECT_KEY [DEFAULT_TYPE]"
- If `$2` (DEFAULT_TYPE) is empty, default to `"Task"`

#### Directory creation
- Run `mkdir -p .pio` to ensure the target directory exists
- This is relative to `process.cwd()` — agents invoke from project root per convention

#### YAML file writing
- Write exactly two lines to `.pio/jira-config.yaml`:
  ```
  projectKey: "<PROJECT_KEY>"
  defaultType: "<DEFAULT_TYPE>"
  ```
- Values must be double-quoted in the YAML output
- Use a heredoc or `printf`/`echo` — no external dependencies (no `yq`, no `python`)
- The file should end with a trailing newline (standard POSIX convention)

#### Error handling
- If `mkdir` fails, print error to stderr and exit non-zero
- If writing the file fails, print error to stderr and exit non-zero
- On success, print a confirmation message to stdout (e.g., "Created .pio/jira-config.yaml with projectKey=PROJ")

### Approach and Decisions

- **POSIX compliance:** Use `#!/bin/sh` shebang. Avoid bash-isms like arrays or `[[ ]]`. Use `[ ]` test syntax.
- **String construction:** Use `printf` for writing YAML lines — it handles special characters more predictably than `echo` across POSIX shells.
- **Path:** Follow the skill structure convention from `write-a-skill`: utility scripts go in a `scripts/` subdirectory of the skill. This matches the PLAN.md path: `src/skills/pio-jira/scripts/setup-config.sh`.

## Skills

- **test-driven-development** (mandatory): Write tests first that verify the script behavior (argument validation, YAML output format, idempotency, exit codes), then implement the script to pass all tests.
- **write-a-skill** (recommended): Consult for skill directory structure conventions — it documents that utility scripts belong in a `scripts/` subdirectory of the skill. This justifies the `src/skills/pio-jira/scripts/` placement.

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/skills/pio-jira/scripts/setup-config.sh` — new file: POSIX shell script for Jira config creation
- `src/skills/pio-jira/scripts/` — new directory (created as part of this step)

## Acceptance Criteria

- File exists at `src/skills/pio-jira/scripts/setup-config.sh`
- Script has a POSIX shebang (`#!/bin/sh`) and is executable (`chmod +x`, file mode includes execute bit)
- Running `bash src/skills/pio-jira/scripts/setup-config.sh PROJ` from project root creates `.pio/jira-config.yaml` containing exactly:
  ```yaml
  projectKey: "PROJ"
  defaultType: "Task"
  ```
- Running with a second argument (`bash ... PROJ Story`) sets `defaultType: "Story"` in the output file
- Running without arguments exits with a non-zero exit code and prints usage to stderr
- Running the script twice with the same arguments produces identical output (idempotent overwrite — verify by running twice and comparing file contents or checksums)
- The output YAML values are double-quoted (e.g., `"PROJ"` not `PROJ`)
- `npm run check` reports no errors (TypeScript type check passes, unaffected by shell scripts but must not regress)

## Risks and Edge Cases

- **Special characters in PROJECT_KEY:** Project keys like `MY-PROJ` contain hyphens. Ensure the script handles these without word splitting issues (use proper quoting: `"$1"`).
- **Existing `.pio/jira-config.yaml`:** The script must overwrite silently — no confirmation prompt. This is idempotent by design.
- **No trailing whitespace or extra blank lines:** The YAML output should be clean — exactly two lines plus a trailing newline. Extra whitespace could cause parsing issues downstream in `js-yaml`.
- **Script invocation path:** Agents will invoke as `bash src/skills/pio-jira/scripts/setup-config.sh PROJ` from the project root. The script writes to `.pio/` relative to CWD — verify this works when invoked via `bash <path>`.
