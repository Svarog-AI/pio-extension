---
totalSteps: 3
---
# Plan: Capability Class Architecture

Architectural evaluation of refactoring the capability system from config-object + callback modules to a class-based design. Produces a decision document with analysis of 6 research questions and a clear recommendation.

## Prerequisites

- Working copy of the pio-extension source code at `/home/aleksj/git/pio-oop/src/`
- No pre-existing ANALYSIS.md in the goal workspace (step outputs are additive)

## Step 1: Catalog current capability patterns

**Description:** Systematically catalog all 14 capability modules to establish a baseline for comparison. For each capability, identify: line counts, boilerplate sections repeated across modules (imports, config declaration, tool definition, command handler, setup function), unique logic (validation helpers, lifecycle callbacks, config callbacks), and shared infrastructure dependencies (`session-capability.ts`, `capability-config.ts`, `types.ts`). Separate session-based capabilities (10) from non-session capabilities (4). Quantify how much of each module is boilerplate vs capability-specific logic.

**Acceptance criteria:**
- [ ] ANALYSIS.md exists in the goal workspace with a "Current Patterns" section
- [ ] Section covers all 14 capabilities: line counts, boilerplate breakdown, and shared dependencies
- [ ] Analysis clearly distinguishes session-based from non-session capabilities
- [ ] Boilerplate vs unique logic quantification is present (line counts or structural comparison)

**Files affected:**
- `.pio/goals/capability-class-architecture/ANALYSIS.md` — new file: "Current Patterns" section

## Step 2: Evaluate Variant A vs Variant B against all research questions

**Description:** Analyze both class-based variants against the six research questions from GOAL.md. For each question, evaluate how well each variant addresses it compared to the current pattern:

1. **Pattern capture:** How does each variant map the config-object + callback pattern? Does either handle non-session capabilities gracefully?
2. **Boilerplate reduction:** Using baseline from Step 1, demonstrate concrete line-count or structural comparison. Does a class eliminate duplication or merely relocate it (e.g., into constructors)?
3. **Testing impact:** Current pure functions (`validateAndFindNextStep`, `isStepReviewable`, `applyReviewDecision`) are trivially testable. Would class instances require mocking `ExtensionAPI` or managing constructor injection? Compare to current `.test.ts` files.
4. **Type safety:** TypeScript already enforces `StaticCapabilityConfig` shape via structural typing. What additional compile-time guarantees would a class hierarchy provide beyond interfaces + callbacks?
5. **Lifecycle hooks:** Current pattern uses 3 optional callbacks in `StaticCapabilityConfig`. Would overriding methods on a base class or configuring hooks on an instance feel more idiomatic for the 4-phase lifecycle (PreValidate → Prepare → PostValidate → PostExecute)?
6. **Non-session capabilities:** Account for `init`, `delete-goal`, `parent`, `next-task`, `list-goals` — do they fit the class hierarchy, need a separate base, or fall outside scope?

Produce rough interface/class sketches for both variants (type stubs only, no implementations) to ground the comparison in concrete shapes.

**Acceptance criteria:**
- [ ] ANALYSIS.md contains an "Variant Analysis" section addressing all 6 research questions
- [ ] Each question has explicit comparison of Variant A, Variant B, and current pattern
- [ ] Both variants include rough TypeScript interface/class sketches (type stubs only)
- [ ] Boilerplate comparison references concrete numbers from Step 1

**Files affected:**
- `.pio/goals/capability-class-architecture/ANALYSIS.md` — append "Variant Analysis" section

## Step 3: Write recommendation and conclusion

**Description:** Synthesize the analysis into a clear recommendation: either commit to Variant A with justification, commit to Variant B with justification, or reject the refactor with documented reasons. The recommendation must reference specific findings from Steps 1 and 2 — not generic opinions. Include: which variant wins (or why neither does), what the current pattern gets right, any identified risks of refactoring, and whether a future goal should address related concerns incrementally. Write the final "Decision" section to ANALYSIS.md.

**Acceptance criteria:**
- [ ] ANALYSIS.md contains a "Decision" section with explicit recommendation (Variant A, Variant B, or Reject)
- [ ] Recommendation references specific findings from earlier sections (cites line counts, testing analysis, etc.)
- [ ] If recommending a class-based approach: includes concrete interface sketch of chosen direction
- [ ] If rejecting: provides clear justification (e.g., "callbacks express variation points adequately", "no polymorphic behavior needed")

**Files affected:**
- `.pio/goals/capability-class-architecture/ANALYSIS.md` — append "Decision" section

## Notes

- This is a research and analysis task — no source code changes to `src/` are expected. The output is purely the ANALYSIS.md document.
- When reading capability files, focus on patterns rather than implementation details. The goal is structural comparison (how many lines of boilerplate vs unique logic), not code review.
- Reference actual file paths and type names from the codebase — do not invent module names or interfaces that don't exist.
- The `ask-user` skill protocol applies if ambiguity arises during analysis (e.g., unclear how to measure "boilerplate reduction"), but aim to resolve questions through evidence from the codebase first.
