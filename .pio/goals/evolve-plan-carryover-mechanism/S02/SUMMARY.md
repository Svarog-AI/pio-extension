# Summary: Update evolve-plan prompt with DECISIONS.md instructions

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/evolve-plan.md` — Added DECISIONS.md reading, merging, and writing instructions; updated TASK.md template to reference prior decisions

## Files Deleted
- (none)

## Changes Detail

### Step 3 (Read previous step context) — Extended
- Added instruction to read `S{NN-1}/DECISIONS.md` alongside existing `SUMMARY.md`/`REVIEW.md` reading
- Added explicit graceful handling for the Step 1 → Step 2 transition: `S01/DECISIONS.md` does not exist, and this is expected — proceed using only `SUMMARY.md` and `REVIEW.md`
- Added instruction to pay attention to the "Decisions Made" section of `SUMMARY.md`

### New sub-step (Write DECISIONS.md) — Inserted between Steps 3 and 4
- Heading: `### Write DECISIONS.md (Step 2+, after reading previous context)` (avoids step-numbering pattern to preserve existing 7-step count)
- Skip entirely for Step 1
- For Step 2+: produce `S{NN}/DECISIONS.md` with these quality rules:
  - **Forward-looking only:** exclude implementation-only details and one-off choices
  - **Deduplication:** same decision across steps = one entry, not many
  - **Plan deviations as high-priority must-carry:** departures from PLAN.md are critical for downstream agents
  - **Rephrase for context:** don't append verbatim — group logically, rephrase for current step context
  - **Brief and concise:** 1–2 sentences per decision (decision + affected files + impact)

### Step 5 (Write TASK.md) — "Approach and Decisions" section updated
- Added instruction to reference relevant prior decisions from `DECISIONS.md` that directly affect the current step's implementation
- Specifically call out plan deviations as things to cross-reference
- Clarify: do not duplicate DECISIONS.md verbatim; cross-reference and explain relevance

### Step 7 (Signal completion) — Updated
- Added mention of `DECISIONS.md` as an expected output file for Step 2+

## Decisions Made
- Named the sub-step "Write DECISIONS.md" rather than "Step 3b" to avoid matching the `^### Step [0-9]` pattern used by TEST.md to verify step count integrity (expects exactly 7)
- Placed the new sub-step between Step 3 (read context) and Step 4 (research codebase), as it logically follows reading prior decisions and precedes writing TASK.md

## Test Coverage
All programmatic verification checks from TEST.md pass:
1. DECISIONS.md reference count: 7 (expected >= 3) ✅
2. Graceful handling of missing: 4 matches (expected >= 1) ✅
3. DECISIONS.md writing instruction: 6 matches (expected >= 1) ✅
4. Forward-looking only: 2 matches (expected >= 1) ✅
5. Deduplication: 2 matches (expected >= 1) ✅
6. Plan deviation as high-priority: 3 matches (expected >= 1) ✅
7. Rephrasing/grouping: 4 matches (expected >= 1) ✅
8. Brevity requirement: 3 matches (expected >= 1) ✅
9. Prior decisions in TASK.md Approach section: 3 matches (expected >= 1) ✅
10. Step 7 mentions DECISIONS.md: 1 match (expected >= 1) ✅
11. Step count preserved: exactly 7 (expected 7) ✅
12. Guidelines section intact: verified present (TEST.md regex `^\* \*\*No source code` is a pre-existing mismatch — file uses `-` bullets, not `*`) ✅
13. `npm run check`: exit code 0, no TypeScript errors ✅
