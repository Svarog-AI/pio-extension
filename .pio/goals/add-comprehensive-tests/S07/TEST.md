# Tests: Add GitHub Actions CI workflow

## Programmatic Verification

This step produces a YAML configuration file — not executable source code. Verification relies on syntax validation and structural checks rather than unit or integration tests.

### YAML Syntax Validation

- **What:** The workflow file is valid YAML
- **How:** Run `node -e "import('js-yaml').then(m => m.default.load(require('fs').readFileSync('.github/workflows/ci.yml', 'utf8')))"` or use `npx yamllint .github/workflows/ci.yml 2>/dev/null || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('Valid YAML')"` if a YAML parser is available. As a fallback, inspect indentation manually — all levels must use consistent 2-space indentation with no tabs.
- **Expected result:** No parse errors; command exits with code 0

### Required Structure: Triggers

- **What:** Workflow triggers on `push` to `main` and `pull_request` to `main`
- **How:** `grep -A2 'push:' .github/workflows/ci.yml | grep -q 'main'` AND `grep -A2 'pull_request:' .github/workflows/ci.yml | grep -q 'main'`
- **Expected result:** Both greps return exit code 0 (branch filters present for both triggers)

### Required Structure: Node.js Setup

- **What:** Workflow uses a recent Node.js version (20.x or 22.x)
- **How:** `grep -q 'node-version.*:"\? *\(20\|22\)' .github/workflows/ci.yml`
- **Expected result:** Grep returns exit code 0 (version string contains "20" or "22")

### Required Structure: Checkout Step

- **What:** Workflow includes an `actions/checkout` step
- **How:** `grep -q 'actions/checkout@' .github/workflows/ci.yml`
- **Expected result:** Grep returns exit code 0 (uses v4 or later)

### Required Structure: npm install Step

- **What:** Workflow runs `npm install`
- **How:** `grep -q 'npm install' .github/workflows/ci.yml`
- **Expected result:** Grep returns exit code 0

### Required Structure: Type Checking Step

- **What:** Workflow runs `npm run check`
- **How:** `grep -q 'npm run check' .github/workflows/ci.yml`
- **Expected result:** Grep returns exit code 0

### Required Structure: Test Step

- **What:** Workflow runs `npm test`
- **How:** `grep -q 'npm test' .github/workflows/ci.yml`
- **Expected result:** Grep returns exit code 0

### Required Structure: Runner Image

- **What:** Workflow specifies a runner (e.g., `ubuntu-latest`)
- **How:** `grep -q 'runs-on:' .github/workflows/ci.yml`
- **Expected result:** Grep returns exit code 0

## Manual Verification

### GitHub Actions Execution

- **What:** The workflow actually runs on GitHub when pushed to a repository
- **How:** After committing and pushing `.github/workflows/ci.yml` to `main`, navigate to the repository's Actions tab in GitHub. Verify a new "CI" workflow run appears, shows 5 steps (checkout, setup-node, npm install, npm run check, npm test), and all green-checkmark as passed.
- **Expected result:** All jobs complete with status "success"; no failed or cancelled steps

## Test Order

1. **YAML syntax validation** — confirms the file is parseable before checking structure
2. **Required structure checks** (triggers, Node version, checkout, npm install, type check, test, runner) — verify all mandatory elements are present
3. **Manual verification** (GitHub Actions execution) — confirms the workflow runs correctly in the actual CI environment; requires pushing to a live repository
