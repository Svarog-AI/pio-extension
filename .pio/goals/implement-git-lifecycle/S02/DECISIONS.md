# Accumulated Decisions (Step 2)

Carried forward from Step 1. Only decisions with downstream impact on Steps 2–3 are included.

## Skill Structure

- **Edge cases split to REFERENCE.md** — Both Branch Checkout and PR Creation protocols reference `[REFERENCE.md](REFERENCE.md)` for edge case details. The skill prompts (Steps 2 and 3) should be aware that protocol details are split across SKILL.md and REFERENCE.md, though the prompt itself need not mention this — it simply references the skill by name.
- **SKILL.md is ≤100 lines** — Step 1 tightened SKILL.md to 85 lines using progressive disclosure. Steps 2 and 3 (prompt changes) are unaffected but should keep prompts concise to maintain the same discipline.

## Protocol Placement

- **Section ordering confirmed:** Convention Lookup Rule → Staged Commit Protocol → Branch Checkout Protocol → PR Creation Protocol → Graceful Failure Semantics → Future Extensibility. The create-goal prompt (Step 2) references "Branch Checkout Protocol" and the finalize-goal prompt (Step 3) references "PR Creation Protocol" — both section names now exist in SKILL.md.

## Graceful Failure

- **"Warn and skip" semantics** preserved throughout both protocols. Steps 2 and 3 should ensure the prompt language is consistent with this — the prompt instructs WHAT to do; the skill handles graceful failure internally.
