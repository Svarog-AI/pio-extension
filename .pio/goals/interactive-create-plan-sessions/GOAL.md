# Make create-plan sessions interactive with the user

Add an interview/validation step to `create-plan` sessions so the planning agent engages the user after research and before writing PLAN.md. This closes a gap where the most value-sensitive phase of the pio workflow proceeds unilaterally — the agent reads GOAL.md, guesses intent, and produces a plan without confirming architecture decisions, scope alignment, or execution preferences with the user.

## Current State

The `create-plan` prompt (`src/prompts/create-plan.md`) follows a linear five-step process with no user interaction:

1. **Read GOAL.md** — internalize current and target state
2. **Deep research** — read referenced files, trace dependencies, understand patterns
3. **Design the steps** — decompose gap into numbered implementation steps
4. **Write PLAN.md** — produce the plan file with acceptance criteria
5. **Signal completion** — call `pio_mark_complete`

The only interaction point is reactive: if GOAL.md is "too vague to plan against," the agent tells the user what needs clarification. There is no proactive step to present findings, ask about trade-offs, confirm scope, or gather preferences.

By contrast, `create-goal.md` (`src/prompts/create-goal.md`) has a well-developed interactive model:
- **Step 1** explicitly interviews the user across "2-3 exchange rounds" with focused questions
- **Step 3** fills gaps with targeted follow-ups after light research
- The guidelines encourage proactive engagement and discourage over-asking

The `ask_user` tool is available via the pi-ask-user skill (`/home/aleksj/.nvm/versions/node/v22.18.0/lib/node_modules/pi-ask-user/skills/ask-user/SKILL.md`) with a protocol for structured decision gates: gather evidence first, present one question at a time, max 2 attempts per boundary. The `create-plan` session does not currently reference or use this skill.

The capability implementation (`src/capabilities/create-plan.ts`) launches sessions via `launchCapability()` with the config in `CAPABILITY_CONFIG`, which sets `GOAL.md` as read-only and `PLAN.md` as the write target. No changes to the capability code are required — this is purely a prompt change.

## To-Be State

After this goal is completed, `create-plan` sessions will insert an interview/validation step between deep research (Step 2) and step design (current Step 3). The new process will be:

1. **Read GOAL.md** — unchanged
2. **Deep research** — unchanged (thorough code reading stays here)
3. **(NEW) Validate assumptions and gather preferences** — the agent engages the user with:
   - *Present findings:* Summarize key files identified, dependencies found, hidden complexity uncovered during research
   - *Architecture decisions:* When multiple valid approaches exist, present options with trade-offs via `ask_user` (e.g., "refactor module X vs. add new adapter Y")
   - *Scope alignment:* Confirm the decomposition matches user expectations; identify areas to emphasize or deprioritize
   - *Assumption checks:* Verify anything assumed about patterns, constraints, or priorities
   - *Execution preferences:* Ask about step sizing (many small vs. few large), parallelism preferences
4. **Design the steps** — now informed by user input from Step 3
5. **Write PLAN.md** — same structure and quality bar as today
6. **Signal completion** — unchanged

The prompt guidelines will be updated to encode explicit interaction rules:
- **Be proactive about asking:** Don't wait for GOAL.md vagueness — ask when research reveals ambiguity, multiple valid approaches, or hidden risks
- **Use `ask_user` for decisions:** Present structured options with trade-offs; follow the ask-user skill protocol (one question at a time, max 2 attempts per boundary)
- **Summarize before writing:** After all questions are answered, present the plan structure (step count, high-level titles) and confirm before committing to PLAN.md
- **Don't over-interview:** The user already documented intent in GOAL.md — only ask when research genuinely revealed something unclear or when multiple paths exist

An example interaction flow will be included in the prompt showing: research summary → 2 decision questions → user responses → confirmation → plan writing.

**Primary change:** `src/prompts/create-plan.md` — insert new step, update guidelines section with interaction rules and example dialogue.

**Out of scope (noted as future work):** Extending this pattern to `evolve-plan.md` and `execute-plan.md`. Those sessions could benefit from similar interaction but planning is the highest-value target.

No changes to `src/capabilities/create-plan.ts`, the PLAN.md output format, the "no source code" rule, or the validation configuration are needed.
