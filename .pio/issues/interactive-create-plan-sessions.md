# Make create-plan sessions interactive with the user

# Make create-plan sessions interactive with the user

The current `create-plan` session is a silent worker: it reads GOAL.md, does deep research, and produces PLAN.md. There is no step for engaging the user. Compare this to `create-goal`, which explicitly interviews the user across "2-3 exchange rounds" before writing.

Planning is one of the most value-sensitive phases — poor choices about decomposition, ordering, or scope at this stage compound through every downstream session. The current prompt tells the agent to proceed unilaterally after reading files and guessing intent from GOAL.md.

## Current state

The `create-plan` prompt (`src/prompts/create-plan.md`) has five steps:
1. Read GOAL.md
2. Deep research (read referenced files, understand patterns)
3. Design the steps
4. Write PLAN.md
5. Signal completion with `pio_mark_complete`

There is no step to ask the user questions, present options, or validate assumptions. The only interaction point is if GOAL.md is "too vague" — then it says "tell the user and suggest what needs clarification." But this is reactive, not proactive.

Meanwhile, `create-goal.md` has a well-developed interactive model:
- Step 1: "Start by asking what the goal is about... Ask open-ended but focused questions... Keep to 2-3 exchange rounds"
- Step 3: "Fill gaps with targeted questions" after research

## Proposed approach

### Add an interview/validation step before writing PLAN.md

Insert a new step between research (Step 2) and design (Step 3):

### Step 2.5: Validate assumptions and gather preferences

After deep research, before designing steps, engage the user to resolve uncertainties:

1. **Present findings:** Summarize what you discovered — key files identified, dependencies found, hidden complexity uncovered.
2. **Ask about architecture decisions:** When multiple valid approaches exist (e.g., "refactor module X vs. add new adapter Y"), present options with trade-offs and let the user choose.
3. **Confirm scope alignment:** Does your decomposition match what the user expects? Are there areas they want emphasized or deprioritized?
4. **Check assumptions:** Anything you assumed about patterns, constraints, or priorities — verify it.
5. **Ask about execution preferences:** Should steps be sized small (many tiny changes) or large (fewer sweeping changes)? Any parallelism preferences?

Use `ask_user` when a specific decision needs to be made. Don't over-ask — use the same guardrails as the ask-user skill (max 1-2 per boundary).

### Example interaction flow

```
Agent: "I've read GOAL.md and researched the codebase. Here's what I found:
  - The auth module spans 4 files in src/auth/ with circular deps between session.ts and tokens.ts
  - There are 12 tests covering the current flow in __tests__/auth.test.ts
  - The migration touches both DB schema (Prisma) and runtime code

Two decisions before I write the plan:

1. Should I refactor the circular dependency first (adds a step but makes later steps simpler), 
   or work around it with interface changes?
   
2. Do you want me to include a migration rollback step, or is forward-only acceptable?"

User: "Work around the circular dep for now — we have a separate goal for that. Yes, include rollback."

Agent: "Understood. I'll keep auth refactor out of scope and add rollback to the migration step. Writing PLAN.md now..."
```

### Update the prompt guidelines

Add explicit rules:

- **Be proactive about asking.** Don't wait until GOAL.md is vague — ask when research reveals ambiguity, multiple valid approaches, or hidden risks.
- **Use `ask_user` for decisions.** Present structured options with trade-offs. Follow the ask-user skill protocol (gather evidence first, one question at a time, max 2 attempts per boundary).
- **Summarize before writing.** After all questions are answered, summarize the plan structure (number of steps, high-level titles) and confirm it looks right before committing to PLAN.md.
- **Don't over-interview.** The user already did their homework in GOAL.md — only ask when research genuinely revealed something unclear or when multiple paths exist.

### What NOT to change

- Deep research (Step 2) should remain thorough — it's the right place for code reading
- The PLAN.md structure and quality bar should stay the same
- The "no source code" rule should stay the same
- This is about adding interaction, not changing the output format

## Scope

Primary change: `src/prompts/create-plan.md` (add interview step, update guidelines)

Secondary consideration: Should this pattern also apply to `evolve-plan.md` and `execute-plan.md`? Those are lower-priority — planning is where the most value is lost without user alignment. But the principle could extend to them later.

## Category

improvement

## Context

Relevant files:
- `src/prompts/create-plan.md` — current prompt (no user interaction)
- `src/prompts/create-goal.md` — reference for good interactive behavior ("interview the user, 2-3 exchange rounds")
- `/home/aleksj/.nvm/versions/node/v22.18.0/lib/node_modules/pi-ask-user/skills/ask-user/SKILL.md` — ask_user skill protocol for structured decision gates


## Category

improvement
