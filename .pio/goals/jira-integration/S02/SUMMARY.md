# Summary: jira-to-issue Capability

## Status
COMPLETED

## Files Created
- `src/capabilities/jira-to-issue.ts` — new capability module: `fetchJiraIssue()`, `jiraToIssueTool`, `handleJiraToIssue`, `setupJiraToIssue()`
- `src/capabilities/jira-to-issue.test.ts` — 18 unit tests covering fetchJiraIssue, tool, command handler, and setup registration

## Files Modified
- `src/capabilities/create-issue.ts` — exported the `createIssue` function (was private) so it can be reused by jira-to-issue
- `src/index.ts` — imported and called `setupJiraToIssue(pi)` to register the tool and command

## Files Deleted
- (none)

## Decisions Made
- **Slug collision check before API call:** `fetchJiraIssue` checks `fs.existsSync` on the derived slug path before calling `runAcli()`, avoiding unnecessary network calls when the issue already exists locally.
- **Graceful field fallbacks:** When `summary` is missing from the acli JSON response, the Jira key itself is used as the title. When `description` is missing, an empty string is used.
- **Delegation to createIssue:** File creation is delegated to the exported `createIssue()` function from `create-issue.ts`, ensuring consistent issue format (title, description, optional category/context sections).

## User-Requested Changes
- (none)

## Test Coverage
- 18 unit tests in `src/capabilities/jira-to-issue.test.ts`:
  - `fetchJiraIssue`: correct acli args, file creation, content format, summary fallback, description fallback, slug collision warning, AcliError propagation, auth error propagation, complex key handling, multi-line description preservation
  - `jiraToIssueTool`: tool name, execute delegates to fetchJiraIssue
  - `handleJiraToIssue`: usage notification on empty args, calls fetchJiraIssue and notifies result
  - `setupJiraToIssue`: registers both tool and command
  - Module exports: `createIssue` exported from create-issue.ts, `setupJiraToIssue` exported from jira-to-issue.ts
- All 769 tests pass (full suite), `npm run check` reports no errors
