# Tests: Jira Utilities Module

This verifies that `runAcli` correctly spawns child processes and handles errors, `readJiraConfig` reads and validates YAML config, and `jiraKeyToSlug` converts Jira keys to issue slugs.

## Unit Tests

### jiraKeyToSlug

Given a Jira key PROJ-123 when jiraKeyToSlug is called then it returns jira-proj-123.
Given a mixed-case key My-Project-456 when jiraKeyToSlug is called then it returns jira-my-project-456.
Given a single-word key with number ABC-1 when jiraKeyToSlug is called then it returns jira-abc-1.

### readJiraConfig

Given a missing config file when readJiraConfig is called then it returns undefined.
Given an empty config file when readJiraConfig is called then it returns undefined.
Given a valid YAML config with projectKey and defaultType when readJiraConfig is called then it returns a typed JiraConfig object.
Given a YAML config with only projectKey when readJiraConfig is called then it returns JiraConfig with defaultType undefined.
Given malformed YAML content when readJiraConfig is called then it returns undefined.
Given a YAML config where projectKey is not a string when readJiraConfig is called then it returns undefined.

### runAcli

Given acli is not found on PATH when runAcli is called then it returns an AcliError mentioning acli installation.
Given acli output contains unauthorized in stderr when runAcli is called then it returns an AcliError referencing acli jira auth login.
Given acli output contains Unauthorized in stdout when runAcli is called then it returns an AcliError referencing acli jira auth login.
Given acli returns valid JSON on success when runAcli is called then it returns an AcliResult with parsed stdout.
Given acli returns non-JSON text on success when runAcli is called then it returns an AcliError with raw stderr.
Given acli exits with non-zero code but produces valid JSON when runAcli is called then it returns an AcliError mentioning the exit code.

## Programmatic Verification

Given the TypeScript project when npm run check is run then it exits with code 0.
Given all three functions when the module is imported then runAcli, readJiraConfig, and jiraKeyToSlug are all exported.
