# Accumulated Decisions (Step 3)

Carried forward from Step 2. This is the final plan step — no further downstream steps remain.

## Skill Structure

- **Edge cases split to REFERENCE.md** — Both Branch Checkout and PR Creation protocols reference `[REFERENCE.md](REFERENCE.md)` for edge case details. The finalize-goal prompt (Step 3) references the skill by name only; protocol details live in SKILL.md and REFERENCE.md.

## Protocol Placement

- **Section ordering confirmed:** Convention Lookup Rule → Staged Commit Protocol → Branch Checkout Protocol → PR Creation Protocol → Graceful Failure Semantics → Future Extensibility. The finalize-goal prompt references "PR Creation Protocol" — this section name exists in SKILL.md (added in Step 1).

## Graceful Failure

- **"Warn and skip" semantics** preserved throughout both protocols. The finalize-goal prompt language should be consistent — it instructs WHAT to do; the skill handles graceful failure internally.

## Prompt Pattern (from Step 2)

- **Step 2 established the prompt injection pattern:** new step is concise (~4 sentences), references protocol by name, mentions passing goal context, includes graceful failure clause ("proceed if this fails"). Step 3 follows the identical pattern for PR Creation Protocol in finalize-goal.md.
