# Task: Dimension 6 — Session hierarchy and navigation

Analyze session tree deepening with subgoals, evaluate pi's `parentSession` tracking for arbitrary depth, assess `/pio-parent` behavior for multi-level nesting, and recommend changes to session naming and user visibility.

## Context

With nested subgoals, the session tree deepens: root → parent goal → parent step → subgoal create-goal → .... The feasibility study must determine whether the existing pi session infrastructure supports this depth without modification, and what changes pio code needs to provide a good user experience for navigating multi-level nesting. This builds on decisions from Dimensions 1–5 about nesting structure, queue keying, state machine transitions, trigger mechanisms, and file protection scope.

## What to Build

Append the "Dimension 6: Session hierarchy and navigation" section to `FEASIBILITY.md`. The analysis covers four parts:

### Part A: Pi parentSession depth support

Analyze whether pi's `parentSession` mechanism supports arbitrary nesting depth. Evidence must come from:
- **`launchCapability()` in `src/capabilities/session-capability.ts`:** How does it pass `parentSession`? Is there a documented or observable depth limit?
- **pi framework docs:** Check `docs/extensions.md` for `ctx.newSession({ parentSession })` — any depth constraints?
- **`src/capabilities/parent.ts`:** How is the parent session retrieved? Does it assume a single level of nesting?
- **Session header format:** `ctx.sessionManager.getHeader()` returns `{ parentSession: "/path/to/parent-session.jsonl" }`. This is a linked-list chain — each session records only its immediate parent.

### Part B: `/pio-parent` multi-level navigation

Analyze how `/pio-parent` behaves with multi-level nesting:
- **Current behavior (from `src/capabilities/parent.ts`):** `findParentPath` reads `header.parentSession`, checks existence, then `ctx.switchSession(parentPath)`. This is a single hop — one invocation moves up exactly one level.
- **Multi-level scenario:** For depth 3 (root → parent goal session → subgoal create-goal → subgoal execute-task), the user needs three `/pio-parent` invocations to reach root. Document this behavior and whether it's acceptable or needs enhancement (e.g., `/pio-parent --all` or visual breadcrumb).
- **No current breadcrumb/chain visibility:** The user cannot see the full nesting chain. Evaluate whether a new command (e.g., `/pio-session-chain`) is needed or if multiple `/pio-parent` invocations are sufficient UX.

### Part C: Session naming with hierarchical context

Analyze `deriveSessionName()` in `src/fs-utils.ts` for subgoal display names:
- **Current behavior:** `deriveSessionName(goalName, capability, stepNumber)` produces `"my-feature execute-task s3"`. For a subgoal named `"nested"`, it would produce `"nested execute-task s1"` — losing all parent context.
- **With qualified name (from Dimension 2):** Using hierarchical key `parent__S03__nested` as `goalName` would produce `"parent__S03__nested execute-task s1"`. Functional but not ideal for display.
- **Recommended improvement:** Format the qualified key for display by replacing `__` with a visual separator (e.g., `/` or `→`). E.g., `"parent/S03/nested execute-task s1"`. This is a formatting concern in `deriveSessionName`, not a structural change.

### Part D: Recommendations and required changes

Summarize findings, identify which changes are new logic vs breaking changes, and provide explicit recommendations for each area (depth support, navigation, naming). Include cross-references to Dimensions 2 (queue keying affects session naming via qualified names) and Dimension 3 (spawning sets up parentSession chain).

## Code Components

### Analysis targets (existing code to read)

- **`src/capabilities/session-capability.ts`:** Lines 49–60 — `launchCapability()` with `ctx.newSession({ parentSession })`. Key finding: no depth limit in the call.
- **`src/capabilities/parent.ts`:** Full file (29 lines) — `/pio-parent` implementation. Single-hop navigation via `header.parentSession`.
- **`src/fs-utils.ts`:** Lines 81–90 — `deriveSessionName()`. Current format: `<goalName> <capability> s{N}`. Needs hierarchical formatting for subgoals.
- **`src/capability-config.ts`:** Line 81 — `sessionName: deriveSessionName(goalName, cap, stepNumber)`. This is where the session name is set. With qualified names from Dimension 2, this will receive hierarchical keys.

### New code to analyze (from pi docs)

- **`/home/aleksj/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`:** `ctx.newSession()` documentation — check for depth limits or constraints.
- **`/home/aleksj/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md`:** Session header format with `parentSession` field.

## Approach and Decisions

- **Follow the pattern of Dimensions 1–5:** Each dimension produces a self-contained analysis section with problem statement, evaluation of options, recommendation, change categorization, and cross-references.
- **Reference DECISIONS.md decisions from prior dimensions:** Dimension 2's hierarchical keys (`parent__S03__nested`) feed directly into session naming. Dimension 3's state machine transitions set up the `parentSession` chain via spawning. These should be cross-referenced in the analysis.
- **Focus on evidence from actual code:** Don't speculate about pi internals — read the actual `parent.ts`, `session-capability.ts`, and pi docs to confirm behavior.
- **Categorize changes precisely:** Distinguish between "no change needed" (pi already supports it), "new logic" (additive pio changes), and "breaking changes" (require migration).

## Dependencies

- **Dimension 1:** Determines nesting structure (`S{NN}/subgoals/<name>/`) which affects how deep the session tree gets.
- **Dimension 2:** Hierarchical queue keys (`parent__S03__nested`) are used as `goalName` in `deriveSessionName()`. This analysis builds on that key format for session naming.
- **Dimension 3:** State machine spawning sets up the parentSession chain. The lifecycle model (parent implicitly pauses) determines navigation flow.
- **Steps 1–5 must be completed** — FEASIBILITY.md must already contain Dimensions 1–5 sections.

## Files Affected

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 6 analysis section

## Acceptance Criteria

- `FEASIBILITY.md` contains a "Dimension 6: Session hierarchy and navigation" section.
- Section confirms whether pi's `parentSession` supports arbitrary depth, with evidence from code or API docs.
- Section analyzes `/pio-parent` behavior for multi-level nesting (single hop vs chain traversal).
- Section evaluates session naming (`deriveSessionName`) for hierarchical display — includes current format, subgoal format with qualified names, and recommended formatting improvement.
- Section recommends any changes to session naming, navigation UX, or user visibility.
- Source file references are present (`session-capability.ts`, `parent.ts`, `fs-utils.ts`, pi docs).
- Changes are categorized as new fields, new logic, or breaking change.

## Risks and Edge Cases

- **No depth limit in pi API:** If pi truly has no depth limit, very deep nesting (10+ levels) could produce confusing session names and long navigation chains. Document but don't over-engineer for extreme cases.
- **`switchSession` stale context:** After `ctx.switchSession()`, the context is stale. Multiple hops might need special handling — but `/pio-parent` is a command (not a capability), so it doesn't use the capability lifecycle. Verify this distinction.
- **User confusion with multiple parents:** Users might not understand why they need to hit `/pio-parent` 3+ times. Evaluate whether UX guidance (notification showing nesting depth) is needed vs. accepting the current simple model.
