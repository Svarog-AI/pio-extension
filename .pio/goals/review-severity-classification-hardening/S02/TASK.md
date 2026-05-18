# Task: Invert approval framing in Step 6 to default-reject

Modify Step 6 of `src/prompts/review-task.md` to shift from justify-rejection to justify-approval, forcing the review agent to actively confirm absence of issues rather than assume clean bills of health.

## Context

The code review prompt (`src/prompts/review-task.md`) currently frames Step 6 ("Make the approval decision") with separate "APPROVE if:" and "REJECT if:" sections. In practice, LLM agents tend to start from an APPROVED assumption and look for reasons to reject — missing issues by not actively verifying their absence. Step 1 (completed) already added guardrails to Step 5. This step addresses the approval decision itself by inverting the default: assume REJECTED, require proof of cleanliness to flip to APPROVED.

## What to Build

Rewrite Step 6 of `src/prompts/review-task.md` to implement a default-reject framing. The structure changes from parallel "APPROVE if / REJECT if" conditions to a single sequential verification flow:

1. **Begin with REJECTED assumption.** Explicitly state the review starts as REJECTED and must be actively changed to APPROVED.
2. **Require absence verification checklist for APPROVED.** To change from REJECTED to APPROVED, the model must verify each condition sequentially: "No critical issues found." "No high issues found." "No medium issues found." After all three pass: "Therefore: APPROVED."
3. **Preserve mandatory REJECT conditions.** If any critical or high issues exist, the decision is REJECTED — no discretion. This rule remains unchanged in substance, just reframed within the default-reject flow.
4. **Preserve the `ask_user` requirement for medium-only scenarios.** When medium issues are the highest severity (no critical or high), the model must call `ask_user` to get explicit direction. This rule also remains unchanged but is now expressed within the inverted framing.

### Code Components

This is a prompt-only change. The single file modified is `src/prompts/review-task.md`. Within Step 6, replace the existing "APPROVE if:", "REJECT if:", and "Medium issues require `ask_user`:" sections with the new default-reject flow.

The new Step 6 should read something like (natural language description, not verbatim):

- Opening: "Based on your analysis and the severity rules from Step 5, start by assuming this review is **REJECTED**."
- Approval path: "To change this to **APPROVED**, you must explicitly verify each condition below:" followed by a numbered checklist requiring absence of critical, high, and medium issues. After all pass: "Only after confirming all conditions above, write: **Therefore: APPROVED**."
- Mandatory rejection: "If any **CRITICAL** or **HIGH** issues exist, the decision is **REJECTED**. This is mandatory — no discretion allowed." (preserved from existing text)
- Medium issue path: "When **MEDIUM** issues are the highest severity found (no critical or high), you **must** call `ask_user`..." (preserved from existing text)

### Approach and Decisions

- **Reference prior decisions:** Step 1 established that guardrail text uses authoritative imperatives ("must," "prohibited," "mandatory"). The new Step 6 framing should follow this same tone convention.
- **Modify existing content, not append.** Unlike Step 1 (which only appended new sections to Step 5), this step rewrites the Step 6 approval section. The goal is structural change — inverting the framing — which requires replacing rather than adding.
- **Preserve decision rules, reframe presentation.** The substance of REJECT conditions (critical/high = mandatory reject) and medium issues (`ask_user`) does not change. Only how they are presented changes: from parallel "APPROVE if / REJECT if" to sequential "start REJECTED → verify absence → flip to APPROVED."
- **Follow the exact phrasing pattern from GOAL.md To-Be State:** "Start by assuming the review is REJECTED. To change this to APPROVED, you must explicitly verify each condition:" followed by checklist items and concluding "Therefore: APPROVED."

## Dependencies

- Step 1 must be completed (anti-rationalization guardrails added to Step 5). This step modifies Step 6 only but depends on Step 1 being present so the full Step 5 → Step 6 flow is coherent.

## Files Affected

- `src/prompts/review-task.md` — rewrite Step 6 approval framing while preserving all existing decision rules (mandatory REJECT for critical/high, `ask_user` for medium-only)

## Acceptance Criteria

- [ ] Step 6 begins with a default-reject framing ("start assuming REJECTED" or equivalent authoritative language)
- [ ] Step 6 requires explicit absence verification for each severity level before approving ("No critical issues found," "No high issues found," "No medium issues found")
- [ ] The mandatory REJECT conditions (any critical or high issues) remain preserved — the rule that critical/high = mandatory REJECT is still present and unambiguous
- [ ] The `ask_user` requirement for medium-only scenarios remains preserved — when medium issues are the highest severity, the model must call `ask_user`
- [ ] The conclusion phrase "Therefore: APPROVED" (or equivalent) appears after the absence verification checklist
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- **Tone consistency:** The new Step 6 should match the authoritative tone established by Step 1's guardrails. Avoid softening language ("consider," "suggest") in favor of imperatives ("must," "are required").
- **No contradiction with Step 5 rules:** Ensure the default-reject framing doesn't conflict with the Step 5 severity rules (e.g., the medium `ask_user` path must still work alongside the default-reject flow).
- **Preservation check:** Verify that existing content outside Step 6 is completely unchanged. This is a surgical rewrite of one section, not a full prompt overhaul.
