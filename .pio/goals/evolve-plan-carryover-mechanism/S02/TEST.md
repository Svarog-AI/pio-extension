# Tests: Update evolve-plan prompt with DECISIONS.md instructions

This step modifies only a markdown prompt file (`src/prompts/evolve-plan.md`). There is no new TypeScript code to unit-test. Verification relies on programmatic content checks and manual review.

## Programmatic Verification

### DECISIONS.md reading instruction exists in Step 3 area

- **What:** The prompt instructs the Specification Writer to read `S{NN-1}/DECISIONS.md` alongside `SUMMARY.md`
- **How:** `grep -c 'DECISIONS.md' src/prompts/evolve-plan.md`
- **Expected result:** Output is at least 3 (references in reading instructions, writing instructions, and signal-completion section)

### Graceful handling of missing DECISIONS.md for Step 1 → Step 2

- **What:** The prompt explicitly handles the case where `DECISIONS.md` doesn't exist (Step 1 produces none)
- **How:** `grep -ci 'missing\|does not exist\|if it exists\|graceful' src/prompts/evolve-plan.md | grep -v 'stepNumber'` and manually verify the DECISIONS.md section mentions handling absence
- **Expected result:** At least one match referencing graceful handling of a missing `DECISIONS.md` file

### DECISIONS.md writing instruction exists

- **What:** The prompt instructs the writer to produce `S{NN}/DECISIONS.md` for steps > 1
- **How:** `grep -c 'produce.*DECISIONS.md\|write.*DECISIONS.md\|DECISIONS.md.*for step\|DECISIONS.md.*step.*>' src/prompts/evolve-plan.md` (case-insensitive)
- **Expected result:** At least 1 match — instructions to create/write DECISIONS.md

### Selective accumulation instruction exists (forward-looking only)

- **What:** The prompt instructs the writer to include only forward-looking decisions, excluding implementation-only details and local one-off choices
- **How:** `grep -ci 'forward.*look\|future step\|impact.*downstream\|implementation.*only\|one.?off' src/prompts/evolve-plan.md`
- **Expected result:** At least 1 match — the prompt restricts what goes into DECISIONS.md

### Deduplication instruction exists

- **What:** The prompt instructs the writer to deduplicate decisions (same decision = one entry, not many)
- **How:** `grep -ci 'deduplicat\|dupl\|repeate\|same.*decision\|one.*entry' src/prompts/evolve-plan.md`
- **Expected result:** At least 1 match — the prompt explicitly forbids repeating the same decision

### Plan deviation as high-priority requirement exists

- **What:** The prompt identifies plan deviations (departures from PLAN.md) as high-priority must-carry decisions
- **How:** `grep -ci 'plan.*deviat\|depart.*plan\|diverge.*plan\|plan.*change\|must.*carry\|high.*priorit' src/prompts/evolve-plan.md`
- **Expected result:** At least 1 match — plan deviations are flagged as critical

### Rephrasing and grouping instruction exists

- **What:** The prompt instructs the writer to rephrase for context and group related decisions logically (not just append verbatim)
- **How:** `grep -ci 'rephrase\|group.*decision\|logically\|verbat' src/prompts/evolve-plan.md`
- **Expected result:** At least 1 match — the prompt requires quality over blind appending

### DECISIONS.md brevity requirement exists

- **What:** The prompt requires each decision to be brief, concise, and on-point — no overexplaining
- **How:** `grep -ci 'brief\|concise\|on.?point\|overexplai' src/prompts/evolve-plan.md`
- **Expected result:** At least 1 match — the prompt enforces a brief writing style for decisions

### Prior decisions referenced in TASK.md's Approach and Decisions section

- **What:** The prompt instructs the writer to incorporate relevant prior decisions into TASK.md's "Approach and Decisions" section
- **How:** `grep -A2 'Approach and Decisions' src/prompts/evolve-plan.md | grep -ci 'decision\|DECISIONS'`
- **Expected result:** At least 1 match — the Approach and Decisions template text references DECISIONS.md or prior decisions

### Step 7 mentions DECISIONS.md as expected output for step > 1

- **What:** The signal-completion step (Step 7) mentions `DECISIONS.md` as an expected output
- **How:** `grep -A5 'Signal completion\|Step 7' src/prompts/evolve-plan.md | grep -c 'DECISIONS.md'`
- **Expected result:** At least 1 match

### Existing prompt structure preserved — Step count unchanged

- **What:** All original process steps (Step 1 through Step 7) and the Guidelines section remain present
- **How:** `grep -c '^### Step [0-9]' src/prompts/evolve-plan.md`
- **Expected result:** Exactly 7 matches (the existing 7 process steps — new DECISIONS.md content can be a sub-step, not replacing existing numbering)

### Existing prompt structure preserved — Guidelines section intact

- **What:** The Guidelines section and its key entries are unchanged
- **How:** `grep -c '^\* \*\*No source code' src/prompts/evolve-plan.md`
- **Expected result:** At least 1 match (the "No source code" guideline exists)

### TypeScript type checking passes

- **What:** No TypeScript errors after changes (prompt is markdown, but verify no side effects)
- **How:** `npm run check`
- **Expected result:** Exit code 0, no output about type errors

## Manual Verification

### Complete prompt review

- **What:** Verify all existing evolve-plan.md instructions are preserved and DECISIONS.md additions are clear and correctly placed
- **How:** Read the updated `src/prompts/evolve-plan.md` in full. Confirm:
  1. Step 3 now mentions reading `DECISIONS.md` alongside `SUMMARY.md` and `REVIEW.md`
  2. A new sub-step exists for writing `DECISIONS.md` (placed logically, between reading context and researching codebase)
  3. The "Approach and Decisions" section of the TASK.md template references prior decisions
  4. Step 7 mentions `DECISIONS.md` as an expected output for step > 1
  5. All original text (Steps 1–7, Guidelines, templates) is preserved unchanged

### DECISIONS.md skip condition for Step 1

- **What:** Verify the prompt clearly states that Step 1 does NOT produce a `DECISIONS.md`
- **How:** Search for explicit "step 1" or "N == 1" language near DECISIONS.md writing instructions. Confirm it says to skip/omit for Step 1.

### Decision quality rules are clear and enforceable

- **What:** Verify the prompt explicitly enforces: (a) forward-looking only, (b) deduplication, (c) plan deviations as high priority
- **How:** Read the DECISIONS.md writing sub-step in full. Confirm:
  1. The prompt restricts DECISIONS.md to decisions that may impact future steps (not all design details)
  2. The prompt explicitly requires deduplication — same decision across multiple steps = one entry
  3. The prompt identifies plan deviations (departures from PLAN.md) as must-carry, high-priority decisions
  4. The prompt instructs to group related decisions logically and rephrase for context

## Test Order

Execute in this priority: programmatic content checks → TypeScript type check (`npm run check`) → manual prompt review.
