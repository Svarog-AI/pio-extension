# Accumulated Decisions

Decisions from prior steps that affect future work. Brief entries only — no overexplaining.
Duplicates merged. Plan deviations marked.

## Conventions

- **Optional chaining in tests:** Tests use `result?.validation?.files` instead of non-null assertions (`!`) to satisfy TypeScript strict null checks on optional `CapabilityConfig` properties.
- **Step-dependent config guard:** New step-dependent logic (e.g., file inclusion) should branch on `stepNumber > 1`, matching the existing pattern in `resolveEvolveValidation` and `resolveEvolveWriteAllowlist`.
- **Step-finding checks TASK.md + TEST.md only:** `DECISIONS.md` is not part of step-completeness detection.

## Plan Deviations

None so far. If a step departs from PLAN.md (file placement, architecture), record it here.
