# Accumulated Decisions

## Prompt-Skill Separation

- The revise-plan prompt references the `pio-planning` skill for priority hierarchy rules without enumerating detailed exception cases inline. This keeps the prompt lean and delegates the *how* to the skill. Step 2 must implement the detailed rules (three exception cases, scope-vs-how distinction) in `src/skills/pio-planning/SKILL.md`.
