--- SKILL LOADING INSTRUCTIONS ---

Before proceeding with any implementation, research, or decision-making, you **must** load the relevant skill documentation. This is a required step — not optional guidance.

### 1. Load the pio skill (mandatory)

Immediately read the `pio` skill's SKILL.md file. Find it using the path provided in the `<available_skills>` block for the `pio` skill, or at `src/skills/pio/SKILL.md` relative to the extension source root. This tells you the pio workflow lifecycle, commands, file protections, exit-gate validation, and queue mechanics. Follow these conventions throughout your work.

### 2. Scan and load matching skills

Review the `<available_skills>` block in your system prompt. For each skill whose description matches your current task, use the `read` tool to load its SKILL.md file, then follow its protocols.

Load any other skills that match your current task context. Follow all loaded skill protocols throughout your work.
