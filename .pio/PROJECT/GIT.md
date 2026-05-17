# Git Conventions

## Commit Message Format

**Format:** Appears to follow **Conventional Commits** (`type(scope): description`). Confidence: *appears to follow* — observed consistently in recent history but not strictly enforced by CI, hooks, or documentation.

### Observed types (from `git log --oneline -50`):

| Type | Usage | Example |
|------|-------|---------|
| `feat` | New features, capability additions | `feat: add DECISIONS.md carryover mechanism to evolve-plan prompt` |
| `refactor` | Code restructuring without behavior changes | `refactor: migrate capability validation to use GoalState (Step 3, v2)` |
| `fix` | Bug fixes | `fix: steer turn guard` |
| `chore` | Maintenance, housekeeping, pio state updates | `chore: update pio runtime state after goal completion` |
| `test` | Test-related changes | `test: collocate complex test files (S01)` |
| `docs` | Documentation changes | `docs: document review marker cleanup issue` |

### Scope usage:

Optional scope in parentheses, typically the affected module or feature area:
- `feat(project-context): update prompt and skill references for 7-file structure`
- `chore(pio): commit all .pio state`

### Merge commits:

Feature branches are merged via **merge pull requests** (not squash merges). Pattern: `Merge pull request #N from Svarog-AI/branch-name`. At least 6 merge PRs observed in recent history.

Individual commits on feature branches contain descriptive messages referencing plan steps: `feat: implement per-capability model config (Steps 1-3)`, `refactor: decouple validation.ts from session-capability (Step 4)`.

### Tag/versioning scheme:

**No tags detected.** `git tag -l` returns empty. The package version is `0.1.0` in `package.json` but no release tags exist. No semantic versioning, calendar versioning, or release candidates observed.

### Branch naming patterns:

- **Main branch:** `main`
- **Feature branches:** `feat/<feature-name>` (e.g., `feat/carryover-decisions`, `feat/state-elevation`)
- **Other branches:** `<topic-name>` (e.g., `custom-models`, `project-context-revised`)
- **Refactor branches:** `refactor/<description>` (e.g., `refactor/package-organizaton`, `refactor/tests-collocation`)

Branches follow a descriptive naming pattern without ticket/issue number embedding. Feature branches are pushed to origin and merged via PRs.

### Signing practices:

No GPG-signed commits or DCO sign-off lines (`Signed-off-by:`) observed in recent history. No commit signing enforcement detected.
