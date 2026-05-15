# Accumulated Decisions

Decisions from prior steps that affect future work. Brief entries only — no overexplaining.
Duplicates merged. Plan deviations marked.

## Conventions

- **Optional chaining in tests:** Tests use `result?.validation?.files` instead of non-null assertions (`!`) to satisfy TypeScript strict null checks on optional `CapabilityConfig` properties.
- **Step-dependent config guard:** New step-dependent logic (e.g., file inclusion) should branch on `stepNumber > 1`, matching the existing pattern in `resolveEvolveValidation` and `resolveEvolveWriteAllowlist`.
- **Step-finding checks TASK.md + TEST.md only:** `DECISIONS.md` is not part of step-completeness detection.

## Prompt Conventions

- **Non-numbered sub-steps in evolve-plan prompt:** New instructions inside the evolve-plan prompt use non-numbered headings (e.g., "### Write DECISIONS.md") to avoid matching the `^### Step [0-9]` pattern used by step-count integrity checks. Downstream prompt modifications should follow this same convention if adding sub-steps.
- **DECISIONS.md quality rules:** When the Specification Writer produces `S{NN}/DECISIONS.md`, it applies selective accumulation (forward-looking only), deduplication, plan-deviation flagging, rephrasing for context, and brevity (1–2 sentences per entry).

## Plan Deviations

None so far. If a step departs from PLAN.md (file placement, architecture), record it here.
