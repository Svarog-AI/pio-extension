# finalize-goal agent skips PR creation due to conflicting "write only" constraint

## Problem

The finalize-goal agent skipped PR creation (Step 10) and called `pio_mark_complete` immediately after producing the summary. The goal's changes were never pushed or turned into a pull request.

## Root cause

The prompt contains conflicting instructions:

1. **`"Write only to .pio/PROJECT/."** — Read as hard scope boundary: "your work is documentation-only, stay within PROJECT files."
2. **"Do not implement code."** — Reinforces narrow interpretation.
3. **Step 10 PR Creation** — Requires `bash`, `git push`, and `gh pr create` — operations that fall outside `.pio/PROJECT/` writes.
4. **Step 10 graceful failure clause** — `"If PR creation fails or is skipped, proceed with goal finalization"` gave implicit permission to skip without consequence.

The agent interpreted the write constraint as defining the entire scope of work, and treated Step 10 as optional scaffolding rather than a required workflow step. After the summary was written and `pio_mark_complete` validated, the session stopped — no PR was created.

## Prompt location

`src/prompts/finalize-goal.md`

Relevant excerpts:
- `"The output files must be written to .pio/PROJECT/... These are your only allowed write targets."` (Setup section)
- `"Write only to .pio/PROJECT/. No other files may be modified."` (Guidelines section)
- `"If PR creation fails or is skipped, proceed with goal finalization — do not block completion."` (Step 10)

## Resolution options

1. **Explicitly exempt Step 10 from the write constraint:** Add language clarifying that git operations (push, `gh pr create`) are required workflow actions, not file modifications subject to the `.pio/PROJECT/` constraint.
2. **Move PR creation out of the finalize-goal prompt entirely:** Handle it in a post-finalize handler or as part of a separate capability step, so the finalize prompt doesn't juggle documentation + git operations under conflicting constraints.
3. **Strengthen Step 10 language:** Replace the soft-gate ("if skipped, proceed") with explicit required-step language, and clarify that `pio_mark_complete` must not be called until PR creation is attempted (or proven impossible).


## Category

bug

## Context

Observed during skill-prioritization goal finalization. PR was created manually in a follow-up session after the user asked "PR?" — see https://github.com/Svarog-AI/pio-extension/pull/28. Affected files: src/prompts/finalize-goal.md. Related: pio-git skill PR Creation Protocol (src/skills/pio-git/SKILL.md) documents the protocol but the finalize-goal prompt doesn't properly enforce it against the write constraint.
