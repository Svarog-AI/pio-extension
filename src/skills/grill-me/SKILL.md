---
name: grill-me
description: Probe user intent and validate assumptions during goal definition, planning, and plan revision. Provides deep probing technique for resolving ambiguity, confirming scope, and stress-testing decisions. Use when research reveals feasibility doubts, when multiple valid approaches exist, when scope needs clarification, or when the user explicitly says "grill me" for reactive stress-testing.
---

# Grill Me — Deep Probing Technique

Use this skill when you need to probe effectively to resolve ambiguity, validate assumptions, or stress-test decisions with the user.

## Relationship with other skills

- **pio-planning (User Interaction Protocol):** Defines *when* to engage the user — timing guidelines, max attempts per boundary, summarizing before writing, not over-interviewing. Follow pio-planning to decide if probing is warranted.
- **ask-user:** Defines *how* to call the `ask_user` tool — decision gate handshake, anti-overasking guardrails, payload quality. Follow ask-user for tool mechanics (gather context, present 2-5 choices, max 2 attempts per boundary).
- **grill-me (this skill):** Defines *how to probe effectively* once you've decided to engage — question design, recommendation strategy, stopping conditions per context.

## Usage contexts

### Goal definition — probing scope

When clarifying what the user wants to build. The goal is directional, not exhaustive.

- Ask focused questions about the problem, affected areas, and constraints.
- Recommend answers when possible but leave room for the user to redirect.
- Stay light — probe 2-3 exchange rounds per section, then move on.
- If the user's description is already clear, skip probing and proceed.

### Plan creation — validating assumptions

After research reveals feasibility doubts, hidden complexity, or multiple valid approaches.

- Anchor each question in specific research discoveries — cite files read, patterns found, or conflicts uncovered.
- Present findings concisely before asking: "Research shows X in `file.ts`, but Y in `other.ts`. Which direction?"
- Ask one decision at a time. Recommend an answer based on project conventions or the simpler path.
- Resolve each gap before committing to the plan. Unresolved ambiguity produces a vague plan.

### Plan revision — confirming pivots

The revision trigger revealed something broke — mid-flight course correction with urgency.

- Present what changed first: summarize the revision trigger reason and how remaining work differs from the archived plan.
- Validate the new direction aligns with user intent — especially around scope changes, architectural pivots, or invalidated decisions.
- Negotiate scope: if remaining work fundamentally changed in character, confirm whether to proceed, split into subgoals, or adjust approach.
- Confirm which completed work to preserve before designing new steps.

### Reactive stress-testing — "grill me"

The user explicitly wants their plan or design stress-tested.

- Walk down each decision tree branch relentlessly. Ask one at a time.
- For each question, provide your recommended answer before asking.
- If a question can be answered by exploring the codebase, explore the codebase instead of asking.
- Continue until all branches are resolved or the user signals to stop.

## Shared probing techniques

Apply these rules across all contexts:

- **One question at a time.** Never bundle multiple decisions into one `ask_user` call.
- **Recommend answers.** Always include your recommendation — the user should confirm or redirect, not brainstorm from scratch.
- **Gather context before asking.** Read relevant files, check existing patterns, understand constraints. Never ask the user to decide blind.
- **Stop when confirmed.** Once the user gives a clear answer, commit the decision and move on. Don't re-ask or second-guess.
- **Handle ambiguity gracefully.** If the user says "your call" or is unclear after 2 attempts, proceed with the most reversible default and state assumptions explicitly.
- **Use structured options.** Prefer `ask_user` with 2-5 clear choices over open-ended questions. Include trade-off descriptions when non-obvious.

## Anti-patterns

- Asking abstract questions without anchoring in research findings or code
- Bundling multiple decisions into one question
- Probing when the user's intent is already clear from existing documentation
- Looping on the same question without new evidence or a narrower frame
- Over-interviewing during goal definition (goal is directional, not a spec)
- Skipping the "present what changed" step during plan revision
