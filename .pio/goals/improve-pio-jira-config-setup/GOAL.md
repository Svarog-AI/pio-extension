# Improve pio-jira Skill — Jira Config Setup Script

Add a shell script to the pio-jira skill that creates `.pio/jira-config.yaml`, and update the skill documentation to instruct agents to use it. This replaces the current gap where agents had no way to create the config file when missing.

## Current State

**Skill documentation:** `src/skills/pio-jira/SKILL.md` (76 lines) and `src/skills/pio-jira/REFERENCE.md` (185 lines) document five protocols: Auth Status Check, Pull (Jira → Local), Goal from Issue, Push (Local → Jira), and JQL Search.

The Push protocol references `.pio/jira-config.yaml` for project key resolution:
> Resolve project key from user parameter or `.pio/jira-config.yaml` (if it exists)

The config format is:
```yaml
projectKey: "PROJ"      # default project for push operations
defaultType: "Task"     # default Jira issue type
```

**Gap:** No instructions exist for creating this file when missing. The REFERENCE.md edge case table says "ask user for project key" but never persists the answer. Agents in sub-sessions can't use the `write` tool to create files in `.pio/` due to write allowlist protections (see `src/guards/validation.ts`).

**Skill structure:** The skill lives at `src/skills/pio-jira/` with two files: `SKILL.md` and `REFERENCE.md`. Skills can include bundled resources — the `write-a-skill` skill mentions "bundled resources" as a concept, and `pio-git/SKILL.md` references `REFERENCE.md` for progressive disclosure. Adding a script alongside these files follows the same bundling pattern.

## To-Be State

**New script:** `src/skills/pio-jira/setup-config.sh` — a POSIX shell script that:
- Takes `PROJECT_KEY` as the first argument (required) and `DEFAULT_TYPE` as the second (optional, defaults to `"Task"`)
- Creates `.pio/` directory if it doesn't exist (`mkdir -p .pio`)
- Writes `.pio/jira-config.yaml` with the provided values
- Overwrites silently if the file already exists (idempotent)
- Exits with code 0 on success, non-zero on error
- Resolves paths relative to `process.cwd()` so agents invoke it from the project root

**Updated skill:** `src/skills/pio-jira/SKILL.md` — new "Jira Config Setup" section that instructs agents:
1. **When to trigger:** During Push Local Issue → Jira, step 2 — when `.pio/jira-config.yaml` doesn't exist and no project key was provided inline
2. **How to collect the key:** Use `ask_user` to ask "Which Jira project should we push issues to?" with freeform input (project keys are short codes like `PROJ`)
3. **How to create the config:** Run `bash <skill_dir>/setup-config.sh PROJECT_KEY [DEFAULT_TYPE]` via the `bash` tool, where `<skill_dir>` resolves to the skill's directory path
4. **Defaults:** `defaultType` defaults to `"Task"` — omit if using the default
5. **Workflow integration:** After setup, proceed with the original push operation using values from the newly created config

**Updated reference:** `src/skills/pio-jira/REFERENCE.md` — add:
- Execution code block showing the `ask_user` call + bash script invocation sequence
- Edge case row for "Config already exists" → script overwrites (idempotent)
- Example `ask_user` payload for collecting the project key

**Files affected:**
- `src/skills/pio-jira/setup-config.sh` — new file: shell script
- `src/skills/pio-jira/SKILL.md` — add "Jira Config Setup" section (~15 lines)
- `src/skills/pio-jira/REFERENCE.md` — add execution reference + edge cases for config setup

## Open Assumptions

- **Script invocation path:** Agents will need to know the skill directory path. Since skills are discovered at runtime from `src/skills/`, the agent can resolve it relative to the project root: `bash src/skills/pio-jira/setup-config.sh PROJ`. The SKILL.md instruction should reference the script by this relative path (or provide a resolution hint like "locate via skill directory").
- **YAML formatting:** For a 2-field config, manual string construction in bash is sufficient — no need for `yq` or other YAML tools. The script will write a simple YAML document with proper quoting.
- **No TypeScript changes needed:** This approach keeps the change entirely within the skill directory — no new capability in `src/capabilities/`, no registration in `src/index.ts`.
