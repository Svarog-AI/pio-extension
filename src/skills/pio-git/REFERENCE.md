# pio-git — Reference

Detailed edge cases for the protocols in [SKILL.md](SKILL.md). Split from the main skill file per write-a-skill conventions (SKILL.md ≤100 lines).

## Branch Checkout Protocol — Edge Cases

| Edge Case | Handling |
|-----------|----------|
| No git repository | `git rev-parse --show-toplevel` fails → skip all git operations silently |
| Detached HEAD | `git symbolic-ref --short HEAD` fails → warn, skip branching |
| Git not configured | `git config user.name` or `user.email` empty → warn, skip |
| Uncommitted changes | `git checkout -b` fails with overwrite error → warn agent, do not force checkout. Let agent decide (stash, commit, or discard) |
| Shallow clone | `git rev-parse --is-shallow-repository` returns `true` → warn but proceed. Branching works normally |

## PR Creation Protocol — Edge Cases

| Edge Case | Handling |
|-----------|----------|
| `gh` not installed | `command -v gh` fails → skip silently, warn |
| Not authenticated | `gh auth status` fails → skip, warn |
| Network failure | `gh pr create` exits non-zero → skip, warn |
| Branch not pushed | Push first with `git push -u origin <branch>`. Skip on push failure |
| No changes on branch | `git diff --shortstat` empty → skip, warn |
| Existing PR | `gh pr list` finds open PR → report URL, skip creation. If closed/merged (re-finalize): create new one |
| Not a GitHub repo | `gh pr create` fails → skip silently, warn |
| Interrupted workflow (re-finalize) | Check for existing PR first. If found and open, report URL. If closed/merged, create new one |
