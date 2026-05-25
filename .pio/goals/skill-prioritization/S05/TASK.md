# Task: Remove skill references from prompt files

Remove all existing `## Skill References`, `## Skill Loading Instructions`, and inline skill-loading mentions from the 9 capability prompt files. These are now redundant — skill loading is handled centrally by code via `CapabilityConfig.skills` and dynamic injection in `session-capability.ts`.

## Context

Skill-to-capability mapping has been centralized into `CapabilityConfig.skills` (Steps 1–4). The `buildSkillLoadingSection()` function in `session-capability.ts` now dynamically injects mandatory skill content and lists recommended skills at session startup. The old approach of hardcoding skill references inside prompt files is redundant — every skill instruction the prompts currently contain will be delivered via the new centralized mechanism instead.

## What to Build

Audit all 9 prompt files under `src/prompts/` for skill references and remove them. After this step, no prompt file should contain explicit skill-loading instructions or skill-name references that duplicate what `session-capability.ts` already delivers.

### Code Components

This step involves no new code components — only editing existing markdown prompt files to remove redundant text blocks.

### Approach and Decisions

- **Surgical removals:** Remove only the skill-reference text blocks. Do not modify any other content, formatting, or structure in these files.
- **No orphaned blank lines:** After removal, ensure paragraph transitions remain natural — don't leave double blank lines where a section was removed.
- **Follow prior decisions:** Steps 1–4 established that `skills` config is now on all 9 capabilities and injection logic is in place. The prompt files are the last piece to clean up.

## Skills

No additional skills recommended beyond the mandatory pio skill.

## Dependencies

- Step 3 (Implement skill injection in session-capability.ts) — ensures dynamic skill injection exists so removal of prompt-based references doesn't break functionality
- Step 4 (Wire capability skill configs) — ensures all 9 capabilities have `skills` declared so centralized injection covers every case the old prompt sections covered

## Files Affected

- `src/prompts/create-goal.md` — remove `## Skill References` section at end of file
- `src/prompts/create-plan.md` — remove `## Skill References` section at end of file
- `src/prompts/revise-plan.md` — remove `## Skill References` section at end of file
- `src/prompts/finalize-goal.md` — remove `## Skill Loading Instructions` block (between Setup and Process sections, delimited by `---`)
- `src/prompts/project-context.md` — remove `## Skill Loading Instructions` block (between Setup and Phase 1, delimited by `---`)
- `src/prompts/execute-task.md` — remove four inline skill mentions (TDD intro paragraph, TASK.md skills paragraph, Step 5 TDD mention, Step 9 pio-git step in both success/failure branches)
- `src/prompts/execute-plan.md` — remove Step 6 ("Commit changes" with pio-git), re-number Step 7 to Step 6
- `src/prompts/evolve-plan.md` — no changes needed (already has no skill references, but must be audited to confirm)
- `src/prompts/review-task.md` — no changes needed (already has no skill references, but must be audited to confirm)

## Acceptance Criteria

- [ ] All 9 prompt files have been audited for skill references
- [ ] `## Skill References` sections removed from create-goal.md, create-plan.md, revise-plan.md
- [ ] `## Skill Loading Instructions` blocks removed from finalize-goal.md, project-context.md
- [ ] Inline skill mentions cleaned up in execute-task.md (4 removals described below)
- [ ] Step 6 ("Commit changes" with pio-git) removed from execute-plan.md, remaining steps re-numbered
- [ ] No orphaned paragraphs, broken references, or double blank lines remain after removal
- [ ] `npx tsc --noEmit` reports no errors (prompt files are `.md` but TypeScript may reference them via imports)
- [ ] Existing test suite passes with no regressions (`npm test`)

### Detailed removals per file

**create-goal.md:**
- Remove the entire `## Skill References` section at the end of the file (after `## Guidelines`). This section starts with "This prompt references the following skills for detailed methodology:" and lists pio-planning and grill-me.

**create-plan.md:**
- Remove the entire `## Skill References` section at the end of the file (after `## Guidelines`). This section starts with "This prompt references the following skills for detailed methodology:" and lists pio-planning and grill-me with bullet descriptions.

**revise-plan.md:**
- Remove the entire `## Skill References` section at the end of the file (after `## Guidelines`). This section starts with "This prompt references the following skills for detailed methodology:" and lists pio-planning and grill-me with bullet descriptions.

**finalize-goal.md:**
- Remove the `## Skill Loading Instructions` block located between Setup and Process sections, delimited by `---` horizontal rules on both sides. The block instructs loading pio-project-knowledge skill. Remove the entire block including its delimiter lines but preserve surrounding content continuity.

**project-context.md:**
- Remove the `## Skill Loading Instructions` block located between Setup and Phase 1, delimited by `---` horizontal rules on both sides. The block instructs loading pio-project-knowledge skill. Remove the entire block including its delimiter lines but preserve surrounding content continuity.

**execute-task.md (4 removals):**
1. **Intro paragraph about test-driven-development:** After the first introductory paragraph ("Your work is complete when all tests pass..."), there's a paragraph starting "When writing tests and implementing features, follow the guidance from the `test-driven-development` skill." Remove this entire paragraph.
2. **TASK.md skills paragraph:** The next paragraph starts "When `TASK.md` includes a `## Skills` section, treat it as a primary signal..." — remove this entire paragraph. After removal, the `## Setup` heading should follow directly after the first intro paragraph.
3. **Step 5 TDD mention:** In Step 5 ("Write tests first"), item 3 starts "Apply TDD methodology: Follow the `test-driven-development` skill for test structure guidance..." — change to remove the skill reference. Rewrite as: "Apply TDD methodology: RED → GREEN → REFACTOR cycle, Arrange-Act-Assert pattern, DAMP over DRY, one assertion per concept." (keep the behavioral guidance, remove the skill name reference)
4. **Step 9 pio-git step (both branches):** In Step 9's success branch, item "2b" reads "**Commit changes using the `pio-git` skill**..." — remove this item and re-number (the current item 3 becomes item 2b). Same removal in the failure branch. After removal: on success, items are 1 (COMPLETED), 2a (SUMMARY.md), 2b (pio_mark_complete). On failure, items are 1 (BLOCKED), 2a (SUMMARY.md), 2b (pio_mark_complete).

**execute-plan.md:**
- Remove Step 6 entirely: "### Step 6: Commit changes\n\nLoad the `pio-git` skill and commit the changes..." 
- Re-number Step 7 to Step 6 ("Signal completion")
- Update any cross-references if present

## Risks and Edge Cases

- **Content continuity:** Removing sections delimited by `---` (finalize-goal.md, project-context.md) may leave orphaned horizontal rules. Ensure surrounding paragraphs flow naturally without double separators.
- **execute-task.md re-numbering:** The success/failure branches in Step 9 have numbered sub-items (1, 2a, 2b, 3). After removing the "2b" pio-git item from both branches, ensure re-numbering is consistent: items become 1, 2a, 2b.
- **execute-plan.md step references:** If any later step or guideline text references "Step 6" or "Step 7", verify these still make sense after re-numbering.
- **evolve-plan.md and review-task.md must be audited even though no changes expected:** The acceptance criteria require all 9 files to be audited. Document in SUMMARY.md that these two files were checked and confirmed to have zero skill references.
- **`_skill-loading.md` is NOT modified:** Per plan notes, this file is retained on disk as documentation of the old format. Do not delete or modify it.
