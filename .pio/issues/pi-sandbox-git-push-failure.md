# Cannot push to origin within pi-sandbox sessions

## Problem

When running inside a pi-sandbox session, `git push` to origin fails. The sandbox network policy likely blocks git remote access, or the sandbox environment lacks access to SSH keys / git credentials needed for authentication.

## Impact

- Auto-commit (the `pio-git` skill) commits locally but cannot push changes to the remote repository.
- Agents working in sandboxed sessions cannot sync work back to origin without manual intervention.

## Possible Causes

1. **Network policy:** The `sandbox.json` network rules may not allow git hosting domains (`github.com`, SSH port 22, or HTTPS port 443 for git traffic).
2. **SSH key access:** The sandboxed environment cannot access the user's SSH agent or `~/.ssh/` keys.
3. **Git credential helper:** The sandbox blocks access to credential helpers (e.g., `osxkeychain`, `cache`).

## Investigation Needed

- Check `.pio/sandbox.json` (or `~/.pi/agent/sandbox.json`) network rules — does it allow outbound HTTPS to `github.com`?
- Determine if the git remote uses SSH or HTTPS.
- Test: can `git push` succeed from within a sandboxed pi session with the current config?
- Check error output from `git push` to identify auth vs. network failure.

## Potential Fixes

- Add git hosting domains to `allowedDomains` in the sandbox config.
- If using SSH, consider switching remote URL to HTTPS with a credential helper accessible inside the sandbox (e.g., `git credential-store` or token-based auth).
- Document the required sandbox config for git operations in the `pio-git` skill or project setup docs.

## Category

bug

## Context

Related to the execute-task-auto-commit goal (auto-commit via pio-git skill) and pi-sandbox integration (add-pi-sandbox issue). The auto-commit workflow commits locally but needs push support for a complete CI-friendly flow.
