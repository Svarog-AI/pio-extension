# Plan: Recursive Project Context Discovery

Add a curated description map to `pio-project-context` that surfaces context notes for overlooked but agent-relevant files when they are discovered.

## Prerequisites

None.

## Steps

### Step 1: Add missing `.wolf/*` pattern and define `ATTENTION_HINTS` description map

**Description:** Add `.wolf/*` to the existing `FILE_PATTERNS` array (the only listed file not already covered). Then add a new exported constant `ADDITIONAL_CONTEXT_FILES` — a simple lookup object mapping file patterns to human-readable descriptions explaining why each matters for agents. No discovery logic changes yet.

The map should cover:
- `"AGENTS.md"` → "AI agent project instructions and conventions"
- `"CLAUDE.md"` → "AI agent instructions specific to Claude/Claude Code"
- `"CURSOR.md"` → "AI agent instructions for Cursor IDE"
- `"justfile"` → "Task runner definitions (alternative to Makefile)"
- `"Justfile"` → "Task runner definitions (alternative to Makefile)"
- `".wolf/*"` → "Wolf-specific project configuration"

**Acceptance criteria:**
- [ ] `npm run check` (tsc --noEmit) reports no errors
- [ ] `.wolf/*` appears in `FILE_PATTERNS`
- [ ] `ADDITIONAL_CONTEXT_FILES` is exported and maps the 6 patterns above to their descriptions

**Files affected:**
- `src/capabilities/project-context.ts` — add `.wolf/*` to FILE_PATTERNS, add ADDITIONAL_CONTEXT_FILES constant



### Step 2: Show attention hint descriptions in file listings and initial message

**Description:** Update both the tool execute handler and command handler so that when formatting the discovered files list, any file matching an `ADDITIONAL_CONTEXT_FILES` key is shown with its description (e.g., `- CLAUDE.md — AI agent instructions specific to Claude/Claude Code`). The same enriched listing is used in the `initialMessage` sent to the analysis session.

This also fixes the gating issue: since `.wolf/*` is now in FILE_PATTERNS, and the existing discovery already scans all patterns together, if only additional context files exist the session will launch (no separate gate logic change needed).

**Acceptance criteria:**
- [ ] `npm run check` (tsc --noEmit) reports no errors
- [ ] Tool execute handler formats matching files with descriptions in output text and initialMessage
- [ ] Command handler formats matching files with descriptions in UI notification and initialMessage
- [ ] Conventional non-listed files still appear without descriptions

**Files affected:**
- `src/capabilities/project-context.ts` — update tool execute and command handler to enrich file listings using ATTENTION_HINTS



### Step 3: Update system prompt to explain attention hints

**Description:** Add a note in `src/prompts/project-context.md` (in the Setup section) explaining that some discovered files carry descriptions because they are additional context files an agent might otherwise overlook. Instruct the agent to prioritize these during analysis since they often encode project-specific conventions and tooling guidance.

**Acceptance criteria:**
- [ ] `src/prompts/project-context.md` explains what additional context files are
- [ ] The prompt tells the agent to give described files priority during analysis
- [ ] Existing prompt content is preserved (additive change only)

**Files affected:**
- `src/prompts/project-context.md` — add attention hints note in Setup section



## Notes

- Most listed files (`AGENTS.md`, `CLAUDE.md`, `CURSOR.md`, `justfile`, `Justfile`) are already in FILE_PATTERNS. Only `.wolf/*` is genuinely missing and needs adding.
- No new scanning mechanism or refactored return types — ADDITIONAL_CONTEXT_FILES is purely a description lookup used when formatting output.
- The gating fix happens naturally: `.wolf/*` in FILE_PATTERNS means the existing discovery already covers hint-only scenarios where conventional docs are absent.
- No unit tests exist for this area. Verification is via type checking and code review.
