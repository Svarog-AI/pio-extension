# Summary: Invert approval framing in Step 6 to default-reject

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/review-task.md` — Rewrote Step 6 ("Make the approval decision") to use a default-reject framing. Changed from parallel "APPROVE if / REJECT if" sections to a sequential flow: start assuming REJECTED → verify absence of critical/high/medium issues → conclude "Therefore: APPROVED".

## Files Deleted
- (none)

## Decisions Made
- **Preserved all existing decision rules in substance.** The mandatory REJECT for critical/high issues and the `ask_user` requirement for medium-only scenarios remain unchanged — only the presentation framing was inverted.
- **Used numbered checklist for absence verification.** The three verification conditions (No critical, No high, No medium) are presented as a numbered list to force sequential reasoning rather than a single combined check.
- **Maintained authoritative tone.** Used "must," "mandatory," and "no discretion allowed" to match the guardrail conventions established in Step 1.
- **Kept "When in doubt, use `ask_user`"** as the closing guidance, unchanged from the original.

## Test Coverage
- All verification checks from TEST.md pass:
  1. Content preservation: Step 1 additions (table lookup, downgrading ban, common mistakes) all present with count=1
  2. Default-reject framing: "start by assuming this review is **REJECTED**" present at line 149
  3. Explicit absence verification: "No critical issues found" (line 151), "No high issues found" (line 152), "No medium issues found" (line 153)
  4. Mandatory REJECT conditions: "Mandatory REJECT" with critical/high preservation confirmed at line 157
  5. `ask_user` for medium-only: Present at line 162 with MEDIUM context
  6. "Therefore: APPROVED" conclusion: Present at line 155
  7. Type checking: `npm run check` (tsc --noEmit) passes with exit code 0
  8. Full test suite: `npm test` passes — 327 tests across 14 files, no regressions
