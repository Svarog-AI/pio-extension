---
skills:
  mandatory:
    - pio-git
---

# Task: Integrate Push protocol docs

Wire the config setup flow into the existing Push documentation so agents following the Push section discover and use the setup script when `.pio/jira-config.yaml` is missing.

## Context

Steps 1–3 added `setup-config.sh`, a "Jira Config Setup" section to SKILL.md, and execution reference to REFERENCE.md. However, the Push protocol sections in both files still describe the old behavior: "ask user for project key" without persisting the answer or invoking the setup script. An agent reading only the Push section falls into the original gap. Step 4 closes this loop.

## What to Build

Update the Push protocol in SKILL.md and REFERENCE.md so that when `.pio/jira-config.yaml` is missing, agents are instructed to run the config setup flow before proceeding with the push.

### Code Components

This is a documentation-only change — two markdown files modified:

1. **SKILL.md Push section** — Modify step 2 ("Resolve project key from user parameter or `.pio/jira-config.yaml` (if it exists)") to add a cross-reference to the Jira Config Setup section when the config is missing. The flow should read: config exists → use it; config missing → trigger setup protocol (reference "see Jira Config Setup above") → proceed with push using values from new config. Also update the config file example block from 2 fields (`projectKey`, `defaultType`) to 3 fields (`site`, `projectKey`, `defaultType`) to match the actual YAML output from Step 1.

2. **REFERENCE.md Push execution section** — Update step 2 ("Resolve project key") in the step-by-step bash block to include a setup invocation sub-step (2b) between resolving project key and creating the ticket. The sequence: check config → if missing, run `bash src/skills/pio-jira/scripts/setup-config.sh` (with ask_user calls for site + project key) → proceed with push. Use the three-field config signature throughout.

### Approach and Decisions

- **Fix stale config example:** DECISIONS.md documents that the `site` field was added as a plan deviation. The Push section in SKILL.md still shows a 2-field config example (`projectKey`, `defaultType`). Update it to 3 fields matching the actual script output: `site`, `projectKey`, `defaultType`.
- **Cross-reference, don't duplicate:** SKILL.md should reference the Jira Config Setup section rather than repeating the full setup procedure. The Setup section already exists (Step 2) — Push just needs to say "when missing, see Jira Config Setup".
- **REFERENCE.md gets the concrete chain:** REFERENCE.md shows the actual bash sequence. Add the setup script invocation inline between config check and ticket creation. This is the execution reference — agents follow it verbatim.
- **Keep auth handling intact:** The Push section doesn't need to add auth checks — that's covered by Auth Status Check and referenced by Jira Config Setup. Don't duplicate auth instructions in Push.
- **No `--parent` changes required here:** DECISIONS.md from Step 2 notes `--parent` should be covered during Push integration, but this goal is specifically about config setup. Adding `--parent` to Push would be out of scope for this goal unless explicitly requested. Skip it — the current Push docs don't mention `--parent` and adding it now would broaden scope beyond the stated goal (config setup).

## Skills

- **pio-git:** Required for committing documentation changes per pio conventions after implementation.

No additional skills recommended beyond the mandatory pio and pio-git skills.

## Dependencies

- Step 1 (create-setup-script): The script must exist at `src/skills/pio-jira/scripts/setup-config.sh` with the correct signature `SITE PROJECT_KEY [DEFAULT_TYPE]`.
- Step 2 (update-skill-documentation): The "Jira Config Setup" section must exist in SKILL.md for cross-referencing.
- Step 3 (update-reference-documentation): The execution reference and edge case table for config setup must exist in REFERENCE.md.

## Files Affected

- `src/skills/pio-jira/SKILL.md` — modify Push protocol section: update step 2 to reference Jira Config Setup, fix config example from 2 fields to 3 fields
- `src/skills/pio-jira/REFERENCE.md` — modify Push execution section: add setup invocation (step 2b) between config resolution and ticket creation

## Acceptance Criteria

- SKILL.md Push protocol step 2 references the Jira Config Setup section when `.pio/jira-config.yaml` is missing
- SKILL.md config file example block shows all 3 fields: `site`, `projectKey`, `defaultType` (was previously only 2)
- REFERENCE.md Push execution step-by-step includes the setup script invocation (`bash src/skills/pio-jira/scripts/setup-config.sh`) when config is missing
- The documentation chain is clear and unambiguous: missing config → setup protocol → proceed with push
- Existing auth handling instructions in Push remain intact (no duplication from Auth Status Check section)
- All existing SKILL.md content outside the Push section is preserved (Auth, Config Setup, Pull, Goal from Issue, Search, Error Handling sections unchanged)
- All existing REFERENCE.md content outside the Push execution section is preserved
- SKILL.md remains ≤100 lines total (the 2-field → 3-field example change is a replacement, not an addition; cross-reference should be concise)
- `npx tsc --noEmit` passes with no errors
- All existing tests pass with no regressions

## Risks and Edge Cases

- **Line budget:** SKILL.md is currently ~90 lines (after Step 2 additions). The Push section changes are primarily replacements (config example update) plus a short cross-reference sentence. Should stay within ≤100 lines. Monitor carefully — if adding the reference pushes it over, keep the cross-reference minimal ("see Jira Config Setup above").
- **Existing content preservation:** REFERENCE.md is large (~258 lines). Use precise edits to modify only the Push execution step 2 — don't accidentally overwrite surrounding sections (Auth, JQL Search, edge case tables).
- **Consistency with existing docs:** Verify question text and script paths match exactly what SKILL.md and REFERENCE.md already contain from Steps 2–3. Don't introduce new phrasing for site/project collection — reuse the established `ask_user` payloads from the Config Setup Execution section.
