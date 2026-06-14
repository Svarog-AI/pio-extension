# Usage Guide

This guide walks through end-to-end workflows using the documentation toolkit components together. For component descriptions and cross-references, see [README.md](README.md).

---

## Workflow 1: Project Documentation Lifecycle

Use this workflow to bootstrap project documentation from template to published changelog.

### Step 1: Copy the project template

Start by copying the project template into your project directory:

```bash
cp test-artifacts/templates/project-template.md my-project/README.md
```

### Step 2: Fill in the placeholders

Open `my-project/README.md` and replace all `[Bracketed Text]` placeholders with real content:

**Before (template):**
```markdown
# [Project Name]

[Short one-line description of the project.]

## Features

- [Feature 1: brief description]
- [Feature 2: brief description]
```

**After (filled in):**
```markdown
# My Awesome Project

A CLI tool for managing documentation workflows.

## Features

- Template-based documentation generation
- Automated changelog updates
```

Continue replacing every `[Bracketed Text]` marker — including `[repository-url]`, `[branch-name]`, `[install-command]`, and `[License type, e.g., MIT]` — until no bracketed placeholders remain.

### Step 3: Set up the changelog

Copy the changelog template to track your release history:

```bash
cp test-artifacts/templates/change-log-template.md my-project/CHANGELOG.md
```

Fill in the first version block:

**Before (template):**
```markdown
## [Version Number] — [Release Date]

### Added

- [New feature or capability]
```

**After (filled in):**
```markdown
## 1.0.0 — 2026-06-14

### Added

- Initial project structure with documentation templates
- Automated changelog generation
```

### Step 4: Update the changelog with each release

After every release, add a new version block at the top of `CHANGELOG.md` above the previous entries. Move old versions down and fill in `[Version Number]`, `[Release Date]`, and the category entries (`Added`, `Changed`, `Fixed`, `Removed`).

---

## Workflow 2: Issue Tracking with Data Validation

Use this workflow to create consistent issue reports and validate status data in a CSV spreadsheet.

### Step 1: Create an issue from the template

Copy the issue template and fill in the details:

```bash
cp test-artifacts/templates/issue-template.md issues/ISSUE-001.md
```

Replace the `[Bracketed Text]` placeholders:

**Before (template):**
```markdown
# [Issue Title]

## Description

[Describe the issue or feature request in detail...]

## Assignee

[Name or @username of the person responsible for this issue.]
```

**After (filled in):**
```markdown
# Fix CSV validation for edge cases

## Description

The validator does not handle trailing whitespace in status values.
Expected: strip whitespace before checking constraints.

## Assignee

@alice-johnson
```

Check the appropriate status box: `Open`, `In Progress`, or `Closed`.

### Step 2: Track issue data in a CSV file

Maintain a CSV file to track issues and their status. Use the same column structure as `data/sample-records.csv`:

```csv
id,name,category,status
1,Fix CSV validation,bug,active
2,Add export feature,feature,pending
3,Update documentation,documentation,inactive
```

### Step 3: Map issue template status to CSV status values

The issue template uses checkboxes (`Open`, `In Progress`, `Closed`) while the CSV enforces a different set of status values (`active`, `inactive`, `pending`). Use this mapping to keep both representations consistent:

| Issue Template Status | CSV Status Value |
|-----------------------|------------------|
| Open                  | active           |
| In Progress           | pending          |
| Closed                | inactive         |

When you move an issue from `Open` to `In Progress` in the template, update the corresponding CSV row from `active` to `pending`.

### Step 4: Validate the CSV data

Run the validation script to ensure all records conform to the constraints:

```bash
node test-artifacts/data/validate-csv.js
```

Expected output on success:

```
PASS: All checks passed. Validated 10 data rows.
```

If the script reports errors — for example, an invalid status value like `"new"` or `"closed"` — fix the offending rows and re-run until all checks pass.

---

## Tips

- **Keep templates as source of truth:** Never edit the original files in `templates/`. Always copy first, then modify the copy.
- **Validate after every CSV edit:** Run `node test-artifacts/data/validate-csv.js` after modifying any CSV file to catch errors early.
- **Use consistent status terminology:** When referencing status across templates and CSV files, use the mapping table in Workflow 2, Step 3 to avoid mismatches.
