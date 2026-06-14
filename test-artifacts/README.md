# Documentation Toolkit

A small, self-contained toolkit for generating project documentation, tracking issues, and validating structured data. The toolkit combines markdown templates with data validation tools to provide a consistent documentation workflow.

All components work together: templates provide the structure for your documentation, while the data tools ensure consistency across issue tracking and status management.

## Directory Structure

```
test-artifacts/
├── templates/
│   ├── project-template.md
│   ├── issue-template.md
│   └── change-log-template.md
├── data/
│   ├── sample-records.csv
│   └── validate-csv.js
└── README.md
```

## Components

### Templates

The `templates/` directory contains three markdown templates using the `[Bracketed Text]` placeholder convention. Copy a template and replace the bracketed placeholders with your actual content.

#### `templates/project-template.md`

A template for project documentation with sections for overview, features, setup instructions, usage examples, project structure, contributing guidelines, and license. Use this as the starting point for any new project's `README.md`.

The "Project Structure" section in this template can document a directory layout similar to the toolkit's own structure — making it easy to describe how your project files are organized.

#### `templates/issue-template.md`

A template for issue tracking with fields for title, description, status checkboxes (`Open`, `In Progress`, `Closed`), priority levels, assignee, labels, and reproduction steps. Use this to create consistent issue reports across your projects.

**Cross-reference:** The issue template's status field (`Open`, `In Progress`, `Closed`) relates conceptually to the CSV status values (`active`, `inactive`, `pending`) enforced by `data/validate-csv.js`. When tracking issues in a spreadsheet format, you can map the issue template's lifecycle states to the CSV status constraints: `Open` → `active`, `In Progress` → `pending`, `Closed` → `inactive`.

#### `templates/change-log-template.md`

A changelog template organized by version with sections for Added, Changed, Fixed, and Removed entries. Each version block follows the same structure, making it easy to append new releases chronologically.

**Cross-reference:** The changelog template tracks changes that can be managed through issues created with `templates/issue-template.md`. When an issue is resolved, the corresponding changelog entry (under `Fixed`, `Added`, or `Changed`) documents the change for end users. The status data in `data/sample-records.csv` can also be used to track which team members are responsible for changes recorded in the changelog.

### Data Tools

The `data/` directory contains a sample dataset and a validation script for ensuring data integrity.

#### `data/sample-records.csv`

A sample dataset with exactly 10 records containing four columns: `id`, `name`, `category`, and `status`. The `status` column is constrained to three valid values: `active`, `inactive`, and `pending`.

**Cross-reference:** These status values (`active`, `inactive`, `pending`) are the enforced constraints in `data/validate-csv.js` and correspond conceptually to the issue template's status field in `templates/issue-template.md`. When using the issue template for tracking, you can maintain a parallel CSV record with the validated status values.

#### `data/validate-csv.js`

A Node.js validation script that checks `sample-records.csv` for:

- All 4 columns present in every row
- No empty values in any field
- Status values constrained to `active`, `inactive`, or `pending`
- Exactly 10 data rows (plus header)

Run the validation script with:

```bash
node test-artifacts/data/validate-csv.js
```

The script prints `PASS` if all checks succeed or `FAIL` with a list of specific errors. It uses only built-in Node.js modules — no external dependencies required.

## Cross-Component Relationships

The toolkit components are designed to work together as an integrated system:

1. **Issue-to-Changelog workflow:** Issues created with `templates/issue-template.md` are resolved and documented in `templates/change-log-template.md`. The issue status field tracks progress, while the changelog records the final outcome.

2. **Status consistency:** The CSV status values (`active`, `inactive`, `pending`) in `data/sample-records.csv` are validated by `data/validate-csv.js` and correspond to the issue template's lifecycle states in `templates/issue-template.md`. This ensures consistent status terminology across documentation and data files.

3. **Project documentation:** The `templates/project-template.md` "Project Structure" section can describe the toolkit's own directory layout, demonstrating how the template documents itself.

## Usage

### Using the Templates

1. Copy a template file to your project directory
2. Replace all `[Bracketed Text]` placeholders with your actual content
3. Remove any sections that don't apply to your use case

For example, to create a project README:

```bash
cp test-artifacts/templates/project-template.md my-project/README.md
```

Then open the file and replace `[Project Name]`, `[Short one-line description...]`, and other bracketed placeholders with real content.

### Validating CSV Data

Run the validation script to verify that `sample-records.csv` meets all constraints:

```bash
node test-artifacts/data/validate-csv.js
```

Expected output on success:

```
PASS: All checks passed. Validated 10 data rows.
```

### Complete Documentation Workflow

1. Start with `templates/project-template.md` to document your project
2. Use `templates/issue-template.md` to track bugs and feature requests
3. Maintain a CSV record of team assignments or issue status in `data/sample-records.csv`
4. Run `data/validate-csv.js` to ensure data integrity
5. Update `templates/change-log-template.md` with each release

This workflow ensures consistent documentation, validated data, and a clear audit trail of changes.
