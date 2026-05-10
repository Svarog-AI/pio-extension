# Plan: Interactive create-plan sessions

Insert an interview/validation step into the `create-plan` prompt so the planning agent engages the user after research and before writing PLAN.md, following the interaction model established in `create-goal.md` and the `ask-user` skill protocol.

## Prerequisites

- The `ask-user` skill must be available to pi sessions (already installed at `/home/aleksj/.nvm/versions/node/v22.18.0/lib/node_modules/pi-ask-user/`). No code changes needed — this is a prompt-only change.
- `GOAL.md` for this goal exists and defines the target state clearly.

## Steps

### Step 1: Insert the interview/validation step into create-plan.md

**Description:** Add a new Step 3 ("Validate assumptions and gather preferences") between the existing Step 2 (Deep research) and Step 3 (Design the steps). Renumber all subsequent steps (+1 each: old 3→4, 4→5, 5→6). The new step instructs the planning agent to present research findings, ask about architecture decisions using `ask_user`, confirm scope alignment, verify assumptions, and gather execution preferences before proceeding to design. It must reference how `create-goal.md` handles interaction (2-3 exchange rounds) and the `ask-user` skill protocol (one question at a time, max 2 attempts per boundary). The step should include sub-sections: Present findings, Architecture decisions, Scope alignment, Assumption checks, and Execution preferences.

**Acceptance criteria:**
- [ ] `src/prompts/create-plan.md` contains a new "### Step 3:" section with the interview/validation content
- [ ] All subsequent steps are renumbered correctly (old Step 3 → Step 4, Step 4 → Step 5, Step 5 → Step 6)
- [ ] The new step references the `ask_user` tool and describes when/how to use it (structured options, one-at-a-time)
- [ ] The new step references the `create-goal.md` interaction pattern as a model (2-3 exchange rounds)
- [ ] The new step covers all five sub-topics from GOAL.md: findings, architecture decisions, scope alignment, assumption checks, execution preferences
- [ ] `npm run check` reports no TypeScript errors

**Files affected:**
- `src/prompts/create-plan.md` — insert new Step 3 between existing steps 2 and 3; renumber all following steps

### Step 2: Update Guidelines with interaction rules and example flow

**Description:** Update the "## Guidelines" section of `src/prompts/create-plan.md` to encode explicit interaction rules. Add guidelines for: being proactive about asking (don't wait for GOAL.md vagueness), using `ask_user` for decisions with structured options, summarizing before writing (present plan structure — step count, high-level titles — and confirm before committing), and not over-interviewing (user already documented intent in GOAL.md). Then append an "## Example Interaction Flow" section showing: research summary → 2 decision questions via `ask_user` → user responses → confirmation of plan structure → plan writing. The example should illustrate the tool usage pattern without prescribing exact wording for every scenario.

**Acceptance criteria:**
- [ ] The Guidelines section contains a rule about being proactive (asking when research reveals ambiguity, multiple approaches, or hidden risks)
- [ ] The Guidelines section contains a rule about using `ask_user` with structured options and following the skill protocol
- [ ] The Guidelines section contains a rule about summarizing plan structure (step count, titles) before writing PLAN.md
- [ ] The Guidelines section contains a rule about not over-interviewing (user already documented intent in GOAL.md)
- [ ] An "## Example Interaction Flow" section exists showing: research summary → ask_user calls → user responses → confirmation → plan writing
- [ ] The example references `ask_user` by name and shows the kind of structured options/payload used
- [ ] No existing guideline rules were removed — only new interaction rules added
- [ ] `npm run check` reports no TypeScript errors

**Files affected:**
- `src/prompts/create-plan.md` — append to Guidelines section, add new Example Interaction Flow section

## Notes

- This is a prompt-only change. No code in `src/capabilities/create-plan.ts`, `session-capability.ts`, or any other `.ts` file should be modified. The `ask_user` tool is already available as a pi skill — no runtime wiring needed.
- The PLAN.md output format, validation config (`writeAllowlist: ["PLAN.md"]`), and "no source code" rule all remain unchanged per GOAL.md.
- Extending this pattern to `evolve-plan.md` and `execute-plan.md` is explicitly out of scope (noted as future work in GOAL.md). Do not touch those files.
- The new Step 3 content should be consistent in tone and structure with the existing prompt steps — same heading level, bold labels for sub-sections, imperative instructions.
- The example interaction flow should be realistic but illustrative — it shows the pattern without locking the agent into exact scripts. It should demonstrate the `ask_user` tool being called with `question`, `context`, and `options` parameters as shown in the ask-user skill spec.
