# Tests: jira-to-issue Capability

This verifies that `fetchJiraIssue` correctly fetches Jira tickets via `runAcli`, creates local issue files with proper slugs, handles slug collisions, and delegates to `createIssue`. It also verifies tool/command registration and error propagation from `runAcli`.

## Unit Tests

Given a valid Jira key when fetchJiraIssue calls runAcli with correct args then it passes ["jira", "workitem", "view", key, "--json"].
Given a valid Jira response with summary and description when fetchJiraIssue succeeds then it creates .pio/issues/jira-proj-123.md.
Given a valid Jira response when fetchJiraIssue succeeds then file content follows the format "# {summary}\n\n{description}".
Given a Jira response missing the summary field when fetchJiraIssue succeeds then it falls back to the key parameter as title.
Given a Jira response missing the description field when fetchJiraIssue succeeds then it uses an empty string for description.
Given an existing issue file with the same slug when fetchJiraIssue is called then it returns a warning without calling runAcli.
Given runAcli returns an AcliError when fetchJiraIssue is called then it returns the error message from runAcli.
Given runAcli returns ENOENT (acli not installed) when fetchJiraIssue is called then it returns the acli installation error.
Given runAcli returns unauthorized when fetchJiraIssue is called then it returns the authentication error.
Given jiraToIssueTool is defined when its parameters schema is inspected then it requires a key parameter of type string.
Given jiraToIssueTool execute is called with valid params then it calls fetchJiraIssue with ctx.cwd and params.key.
Given handleJiraToIssue receives no args when invoked then it shows a usage notification.
Given handleJiraToIssue receives a valid key when invoked then it calls fetchJiraIssue and notifies the result.
Given setupJiraToIssue is called with a mock ExtensionAPI then it registers both a tool and a command.
Given createIssue is imported from create-issue.ts then it is exported as a function.
Given a Jira key MY-PROJ-456 when fetchJiraIssue creates an issue then the slug is jira-my-proj-456.
Given a Jira response with multi-line description when fetchJiraIssue creates the file then newlines are preserved in the content.

## Programmatic Verification

Given the TypeScript project when npm run check is run then it exits with code 0.
Given src/capabilities/jira-to-issue.ts exists when the file is read then it exports setupJiraToIssue.
Given src/index.ts is read then it contains setupJiraToIssue.
