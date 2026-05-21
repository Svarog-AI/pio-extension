# Tests: Write recommendation and conclusion

This is a research and analysis task — no source code changes. Verification relies on programmatic checks against the ANALYSIS.md document to ensure the Decision section is complete, evidence-based, and well-structured.

## Programmatic Verification

### Structural checks

- **What:** Decision section exists as a top-level or second-level heading
- **How:** `grep -c '## Decision' .pio/goals/capability-class-architecture/ANALYSIS.md`
- **Expected result:** Count ≥ 1

- **What:** The Decision section appears after the Summary Table (i.e., at the end of the file)
- **How:** `grep -n 'Summary Table\|## Decision' .pio/goals/capability-class-architecture/ANALYSIS.md` — verify Decision line number > Summary Table line number
- **Expected result:** Decision heading appears after Summary Table

### Recommendation specificity checks

- **What:** Contains an explicit recommendation statement (one of three options)
- **How:** `grep -cE '(Recommend Variant A|Recommend Variant B|Reject the refactor|rejecting the refactor|recommendation is to reject)' .pio/goals/capability-class-architecture/ANALYSIS.md`
- **Expected result:** Count ≥ 1

### Evidence citation checks

- **What:** References specific line counts from Step 1 (quantitative evidence)
- **How:** `grep -cE '(2,185|2,330|37%|boilerplate|lines)' .pio/goals/capability-class-architecture/ANALYSIS.md` (checking the Decision section specifically for numeric references)
- **Expected result:** Count ≥ 3 in the Decision section

- **What:** References testing analysis findings
- **How:** `grep -cE '(testing|mocking|pure function|test)' .pio/goals/capability-class-architecture/ANALYSIS.md` (in Decision section)
- **Expected result:** Count ≥ 2

- **What:** References real file names from the codebase
- **How:** `grep -cE '(review-task\.ts|session-capability\.ts|capability-config\.ts)' .pio/goals/capability-class-architecture/ANALYSIS.md` (in Decision section)
- **Expected result:** Count ≥ 2

- **What:** References real TypeScript types from the codebase
- **How:** `grep -cE '(StaticCapabilityConfig|ConfigCallback|PostValidateCallback|PrepareSessionCallback)' .pio/goals/capability-class-architecture/ANALYSIS.md` (in Decision section)
- **Expected result:** Count ≥ 2

### Justification depth checks

- **What:** Discusses what the current pattern gets right (acknowledges strengths)
- **How:** `grep -cE '(current pattern|existing pattern|config.*object|callback.*pattern)' .pio/goals/capability-class-architecture/ANALYSIS.md` (in Decision section, looking for positive framing)
- **Expected result:** Count ≥ 2

- **What:** Identifies specific risks of refactoring
- **How:** `grep -cE '(risk|bind.*this|construction.*order|\.bind\(this\)|runtime error|overhead)' .pio/goals/capability-class-architecture/ANALYSIS.md` (in Decision section)
- **Expected result:** Count ≥ 2

### Rejection-specific checks (if recommending Reject)

- **What:** Provides clear rejection justification with canonical phrases
- **How:** `grep -cE '(callbacks express variation|no polymorphic behavior|module-per-capability|simpler to test|configuration is sufficient)' .pio/goals/capability-class-architecture/ANALYSIS.md`
- **Expected result:** Count ≥ 2 (only if recommendation is Reject)

### Class-based recommendation checks (if recommending Variant A or B)

- **What:** Includes a concrete TypeScript interface/class sketch
- **How:** `grep -cE '(interface |class |extends )' .pio/goals/capability-class-architecture/ANALYSIS.md` (in Decision section)
- **Expected result:** Count ≥ 3 (only if recommending a class-based variant)

## Manual Verification

- **What:** The Decision section reads as a self-contained synthesis — not just a re-listing of which question favors which approach, but an explanation of *why* the conclusion follows from the evidence
- **How:** Read the Decision section end-to-end. Check that it can be understood without re-reading the full Variant Analysis. Verify the recommendation flows logically from cited findings.

- **What:** The recommendation aligns with the evidence in the Summary Table — no contradictory claims
- **How:** Cross-reference the Decision section against the Summary Table winners. If 7/8 questions favor the current pattern, the Decision should reflect this weight of evidence.

- **What:** Future work recommendations (if any) are orthogonal to the class-vs-config debate and could be pursued as independent goals
- **How:** Check that any future work mentioned (e.g., declarative transition registry) doesn't require the class refactor as a prerequisite.

## Test Order

1. Structural checks (section exists, correct position)
2. Recommendation specificity (explicit statement present)
3. Evidence citation checks (numbers, files, types referenced)
4. Justification depth checks (strengths acknowledged, risks identified)
5. Conditional checks (rejection justification OR class sketch — depending on recommendation)
6. Manual verification (readability, consistency, future work independence)
