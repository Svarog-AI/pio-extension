# pio-git skill should specify to include .pio state when tracked

The `pio-git` skill (`src/skills/pio-git/SKILL.md`) should specify that when `.pio/` state files are tracked in the repository, agents should include them in commits alongside source code changes.

## Problem

When agents commit code changes from a plan step, they stage only the files listed in `SUMMARY.md` or found via `git status`. If `.pio/` is tracked (goals, issues, session queue, PROJECT docs), the `.pio/` files created or modified during the step may be omitted from the commit. This leaves `.pio/` state uncommitted and out of sync with the code.

## Recommendation

Add a rule to the staged commit protocol:

- If `.pio/` is tracked in the repository (not in `.gitignore`), include `.pio/` files that were created or modified during the step in the same commit as the source code changes.
- If `.pio/` is in `.gitignore` or untracked, skip it — only commit source code changes.

## Category

improvement

## Context

File: src/skills/pio-git/SKILL.md — "Staged Commit Protocol" section. Currently stages only files from SUMMARY.md or git status output. No guidance on .pio/ state inclusion.
