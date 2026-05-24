# Summary: Update execute-plan prompt with auto-commit instruction

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/execute-plan.md` — inserted new Step 6 "Commit changes" between "Final verification" and "Signal completion", renumbered "Signal completion" to Step 7

## Files Deleted
- (none)

## Decisions Made
- Followed the delegation pattern from Step 2's execute-task.md update: reference `pio-git` skill in the prompt, let the skill fill in protocol details
- Single commit instruction at the end covering all steps (not per-step), consistent with execute-plan's all-in-one-session workflow
- Prompt delegates to the skill without explaining skill internals (e.g., no mention of `git status --porcelain` or SUMMARY.md fallback) — the loaded skill provides those details at runtime

## Test Coverage
- This is a prompt-only change with no TypeScript code modifications
- All 5 acceptance criteria verified via programmatic checks (grep):
  1. New commit step exists between "Final verification" and "Signal completion" — verified
  2. Instruction references loading the `pio-git` skill — verified
  3. Instruction instructs writing a short one-liner commit message — verified
  4. Instruction includes graceful failure semantics — verified
  5. Step numbering is sequential (1–7, no gaps) — verified
- Full test suite (686 tests) passes with no regressions
- TypeScript compilation (`npx tsc --noEmit`) passes with no errors
