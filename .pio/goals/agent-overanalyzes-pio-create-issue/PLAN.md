# Plan: Prevent over-analysis when creating issues with pio_create_issue

Update the `pio_create_issue` tool description to include explicit behavioral guidance so agents treat issue creation as a quick capture rather than a deep investigation.

## Prerequisites

None.

## Steps

### Step 1: Update the pio_create_issue tool description

**Description:** Replace the one-sentence `description` field of `createIssueTool` in `src/capabilities/create-issue.ts` with a multi-paragraph description that communicates four key behaviors: (1) issue creation is a quick capture, not an investigation — skip code tracing and root-cause analysis; (2) provide minimum viable content — title + short description + file references if immediately obvious; (3) deep analysis belongs in the later goal/planning workflow (`goal-from-issue` → Goal Definition Assistant); (4) if more than 1-2 reads are needed to understand the issue, create it with what's known and let the goal workflow handle the rest. Retain the existing sentence ("Use this tool directly — no bash commands or manual file creation needed.") to preserve the operational instruction.

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no errors
- [ ] The `description` field of `createIssueTool` in `src/capabilities/create-issue.ts` contains behavioral guidance covering all four points from GOAL.md (quick capture, minimum viable content, deep analysis happens later, keep it brief)
- [ ] The description still retains the operational instruction to use the tool directly without bash/manual file creation
- [ ] No other files were modified (change is isolated to `src/capabilities/create-issue.ts`)

**Files affected:**
- `src/capabilities/create-issue.ts` — update the `description` string in `createIssueTool`

## Notes

None.
