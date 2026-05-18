# Accumulated Decisions (through Step 1)

Carried forward for downstream steps. Implementation-only details with no cross-step impact are excluded.

## File Placement

- **New subsections go after `#### Rules` and before `### Step 6`.** Step 1 placed all three guardrail subsections in this slot to preserve the flow: definitions → reference table → rules → guardrails → approval decision. Any future Step 5 additions should follow this placement convention. (Step 2 does not modify Step 5 directly, but Step 3 integration verification will inspect the ordering.)

## Heading Convention

- **Use `####` headings for subsections within Steps.** Step 1 used `#### Before classifying: ...`, `#### Prohibited downgrading language`, and `#### Common mistakes to avoid` to match existing Step 5 structure. Maintain this convention if future changes add subsections inside numbered steps.

## Tone Convention

- **Guardrails use authoritative imperatives** ("must," "prohibited," "mandatory"). This is intentional — they are hard rules, not suggestions. Any new guardrail text should follow the same tone.
