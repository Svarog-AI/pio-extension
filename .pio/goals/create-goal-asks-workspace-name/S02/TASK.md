# Task: Update create-goal prompt to remove "ask for workspace name" instructions

Rewrite `src/prompts/create-goal.md` so the Goal Definition Assistant uses the goal name from the session context without asking the user to confirm it.

## Context

Currently, the Setup section says "Your first user message will tell you the goal workspace directory path" and Step 1 instructs: "The goal name (derived from the directory) may give a hint, but do not assume — always confirm with the user." Combined with the initial message format from Step 1 (`"Goal workspace created: <name>\n\nWrite GOAL.md in this workspace."`), this causes redundant friction: the assistant asks about something already known.

## What to Build

Modify `src/prompts/create-goal.md` to change two sections:

### Setup Section Changes

- Update the Setup section to state that the **goal name is provided by the session** (via the initial user message) and should be used directly without asking.
- Clarify that the first user message may contain a directory path, the goal name, or additional context (e.g., from `goal-from-issue`). The assistant should extract the goal name from whatever is provided and proceed.
- Retain the instruction to remember the workspace directory path for writing `GOAL.md`.

### Step 1 ("Understand the goal") Changes

- Remove the sentence: "The goal name (derived from the directory) may give a hint, but do not assume — always confirm with the user."
- Replace it with language that instructs the assistant to derive the goal name from the initial message and proceed immediately to understanding the goal's purpose, scope, and requirements.
- Keep all other Step 1 content: asking about the problem/opportunity, project area, and existing documents/specifications.

### What Must NOT Change

- The overall prompt structure (Setup → Process steps → Guidelines) remains intact.
- Steps 2–5 are untouched — they do not reference workspace name confirmation.
- The `GOAL.md` template format in Step 4 is unchanged.
- General guidelines at the bottom are preserved as-is.

## Code Components

This task involves editing a single markdown file (`src/prompts/create-goal.md`). No new functions, types, or modules are created. The changes are purely textual/instructional within the prompt template.

### Approach and Decisions

- **Reference DECISIONS.md:** Step 1 updated `defaultInitialMessage` to produce `"Goal workspace created: <name>\n\nWrite GOAL.md in this workspace."`. The Setup section should acknowledge this format without hardcoding it — the initial message content may vary (e.g., `goal-from-issue` sends custom messages).
- **Follow existing prompt conventions:** The prompt uses markdown headings, bold emphasis for key instructions, and clear imperative language. Match this style.
- **Be explicit about "do not ask":** To prevent regression, the Setup section should contain a direct instruction like "Do not ask the user to confirm the workspace/goal name."

## Dependencies

- **Step 1 must be completed.** Step 1 changed `defaultInitialMessage` to include the goal name as a fact. The prompt changes in this step reference that new message format for alignment. See `DECISIONS.md` for details.

## Files Affected

- `src/prompts/create-goal.md` — modified: rewrite Setup section and Step 1 to remove "always confirm" language; clarify that goal name is provided by the session
- `src/capabilities/create-goal.test.ts` — potentially modified: add tests verifying the prompt no longer contains "always confirm" or similar asking instructions (see TEST.md)

## Acceptance Criteria

- [ ] `src/prompts/create-goal.md` no longer contains language instructing the assistant to "always confirm" or ask the user about the workspace/goal name
- [ ] The Setup section explicitly states that the goal name is provided by the session and should be used directly without asking
- [ ] Step 1 focuses on understanding the goal's purpose, scope, and requirements — not confirming the name
- [ ] Step 1 still contains the questions about: what problem/opportunity, what project area, existing documents/specifications
- [ ] Steps 2–5 and the Guidelines section remain structurally intact (no unintended changes)
- [ ] The `GOAL.md` template in Step 4 is unchanged
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Over-correction risk:** Removing "always confirm" language could be interpreted as "never ask any clarifying questions." Be precise — the prompt should only skip confirming the *goal name*, not other questions about scope, requirements, etc.
- **goal-from-issue integration:** When `goal-from-issue` invokes create-goal with a custom `initialMessage`, that message may contain issue content rather than just a goal name. The Setup section must handle this: "the initial message provides context — use it directly."
- **TUI command path:** `/pio-create-goal <name>` uses the same prompt file. Ensure the changes work for both tool (`pio_create_goal`) and command paths.
- **Prompt tests:** If tests are added to `create-goal.test.ts` that read the prompt file and check for forbidden phrases, ensure they test for specific patterns (e.g., "always confirm") rather than brittle full-string matches.
