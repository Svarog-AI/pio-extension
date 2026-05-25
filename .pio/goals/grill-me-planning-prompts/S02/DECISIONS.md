# Decisions (accumulated through Step 1)

## Skill Structure

- The rewritten `grill-me/SKILL.md` uses four usage context sections (Goal definition, Plan creation, Plan revision, Reactive stress-testing), followed by Shared probing techniques and Anti-patterns. Downstream steps should reference these section names when cross-referencing content.
- Context-describing language is used throughout ("when validating assumptions after research...") instead of capability names to keep the skill capability-agnostic. Prompt Skill References will point agents to the relevant context section without hardwiring prompt-to-skill mappings.

## Skill Relationships

- The "Relationship with other skills" section was removed per user feedback — deemed unnecessary overhead. The pio-planning timing-vs-technique distinction was folded into the intro paragraph instead. This means prompts cannot reference a dedicated "relationships" section; any cross-skill context lives in the skill intro.
- The `ask-user` skill is referenced inline in the Shared probing techniques section (not as a separate section). Prompts should not duplicate ask-user mechanics — grill-me delegates tool-level details to it.
