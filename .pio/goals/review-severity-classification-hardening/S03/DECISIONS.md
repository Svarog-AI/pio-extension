# Accumulated Decisions (through Step 2)

Carried forward for downstream steps. Implementation-only details with no cross-step impact are excluded.

## File Placement

- **New subsections go after `#### Rules` and before `### Step 6`.** Step 1 placed all three guardrail subsections in this slot to preserve the flow: definitions → reference table → rules → guardrails → approval decision. Step 3 integration verification should confirm this ordering is intact.

## Heading Convention

- **Use `####` headings for subsections within Steps.** Step 1 used `#### Before classifying: ...`, `#### Prohibited downgrading language`, and `#### Common mistakes to avoid`. Maintain this convention if future changes add subsections inside numbered steps.

## Tone Convention

- **Guardrails use authoritative imperatives** ("must," "prohibited," "mandatory"). This is intentional — they are hard rules, not suggestions. Any new guardrail text should follow the same tone.

## Approval Decision Framing (Step 2)

- **Default-reject framing in Step 6.** The approval decision starts with a REJECTED assumption and requires explicit absence verification for each severity level (no critical, no high, no medium) before concluding "Therefore: APPROVED." All existing decision rules — mandatory REJECT for critical/high issues and `ask_user` for medium-only scenarios — are preserved in substance.
