---
skills:
  mandatory:
    - tdd
---

# Task: Update tests for systemPrompt delivery

Update the test assertions in `session-capability.test.ts` to match the new return shape from Step 1. The `before_agent_start` handler now returns `{ systemPrompt: "..." }` (a plain string) instead of `{ message: { customType: "...", content: [...] } }`. Five existing tests assert against the old `result.message` shape and must be updated, plus one new test for base-prompt preservation.

## Context

Step 1 switched `before_agent_start` from custom conversation message delivery to `systemPrompt` delivery. This broke 5 existing tests that assert `result.message?.customType === "pio-capability-instructions"` or read content from `result.message?.content?.[0]?.text`. The handler now returns `{ systemPrompt: _event.systemPrompt + "\n\n" + prompts.join("\n\n") }` — a plain string, not a structured message object. All 31 unaffected tests still pass; the 5 failing tests need assertion updates only.

## What to Build

Update exactly 5 test assertions and add 1 new test in `src/capabilities/session-capability.test.ts`. No source code changes are needed — Step 1 already implemented the production change. This step is purely test remediation.

### Code Components

#### 1. Update: "prompt injection still works alongside model resolution"

**Location:** Inside `describe("model resolution — backwards compatibility")`, near line 937.

**Current assertions (broken):**
```ts
expect(result.message?.customType).toBe("pio-capability-instructions");
```

**New assertions:**
- Assert `result.systemPrompt` is defined and non-empty string.
- Assert `result.systemPrompt` contains `--- YOUR INSTRUCTIONS ---` (the capability prompt section from `create-goal.md`).
- Rename the test title to reflect systemPrompt delivery instead of "prompt injection".

#### 2. Update: "given before_agent_start with mandatory skills when the handler runs then the message contains SKILL LOADING INSTRUCTIONS with injected blocks"

**Location:** Inside `describe("skill injection — before_agent_start integration")`, first test, near line 970.

**Current assertions (broken):**
```ts
expect(result.message?.customType).toBe("pio-capability-instructions");
const text = result.message?.content?.[0]?.text;
expect(text).toContain("--- SKILL LOADING INSTRUCTIONS ---");
expect(text).toContain('<skill name="test-skill"');
```

**New assertions:**
- Assert `result.systemPrompt` is a non-empty string.
- Assert `result.systemPrompt` contains `"--- SKILL LOADING INSTRUCTIONS ---"`.
- Assert `result.systemPrompt` contains `'<skill name="test-skill"'`.
- Remove the `customType` assertion entirely.

#### 3. Update: "given before_agent_start when the handler runs then delivery order is PROJECT OVERVIEW, then SKILL LOADING INSTRUCTIONS, then YOUR INSTRUCTIONS"

**Location:** Inside `describe("skill injection — before_agent_start integration")`, second test, near line 1020.

**Current assertions (broken):**
```ts
const text = result.message?.content?.[0]?.text;
expect(text).toBeDefined();
// Verify order via indexOf on text
```

**New assertions:**
- Replace `result.message?.content?.[0]?.text` with `result.systemPrompt`.
- Assert `result.systemPrompt` is a non-empty string.
- The ordering checks (`indexOf`) remain the same — just operate on `result.systemPrompt` instead of the message text.
- The three markers to check: `"--- PROJECT OVERVIEW ---"`, `"--- SKILL LOADING INSTRUCTIONS ---"`, `"--- YOUR INSTRUCTIONS ---"`.

#### 4. Update: "given the skill registry is populated via systemPromptOptions.skills when before_agent_start runs then the registry is cached"

**Location:** Inside `describe("skill injection — before_agent_start integration")`, third test, near line 1095.

**Current assertions (broken):**
```ts
const text = result.message?.content?.[0]?.text;
expect(text).toContain('<skill name="cached-skill"');
```

**New assertions:**
- Replace `result.message?.content?.[0]?.text` with `result.systemPrompt`.
- Assert `result.systemPrompt` contains `'<skill name="cached-skill"'`.

#### 5. Update: "given before_agent_start with mandatory skills when the handler runs then skill content comes from buildSkillLoadingSection not a static file"

**Location:** Inside `describe("resources_discover — skill loading uses buildSkillLoadingSection")`, near line 1170.

**Current assertions (broken):**
```ts
const text = result.message?.content?.[0]?.text;
expect(text).toContain("--- SKILL LOADING INSTRUCTIONS ---");
expect(text).toContain('<skill name="dynamic-skill"');
expect(text).toContain(skillBody);
```

**New assertions:**
- Replace `result.message?.content?.[0]?.text` with `result.systemPrompt`.
- Assert `result.systemPrompt` contains `"--- SKILL LOADING INSTRUCTIONS ---"`.
- Assert `result.systemPrompt` contains `'<skill name="dynamic-skill"'`.
- Assert `result.systemPrompt` contains the dynamic skill body.

#### 6. Add: "base prompt is preserved as prefix in systemPrompt"

**Location:** New test, add to any relevant describe block (e.g., `describe("skill injection — before_agent_start integration")`).

**What it verifies:** When `_event.systemPrompt` has a non-empty value, the returned `result.systemPrompt` starts with that base prompt. This guards against accidentally overwriting pi's base prompt.

**Setup:** Same pattern as existing tests — `vi.resetModules()`, mock pi API, import `session-capability`, call `setupCapability`, trigger `resources_discover`, then trigger `before_agent_start`. The key difference: pass a non-empty string in `_event.systemPrompt` (e.g., `"This is the base prompt"`).

**Assertions:**
- Assert `result.systemPrompt` starts with the base prompt string (`"This is the base prompt"`).
- Assert the appended content follows after the base prompt (i.e., the separator `\n\n` appears and the pio instructions follow).

### Approach and Decisions

- **No structural changes to test setup:** The existing test helpers (`makeMockPi`, `setupWithMockPi`, `triggerResourcesDiscover`, etc.) work correctly — the handler registrations and mock pi API are fine. Only assertions need updating.
- **String-based assertions:** Since `result.systemPrompt` is a plain string (not a structured object), use `.toContain()` for substring checks and `.startsWith()` for prefix checks instead of property assertions like `?.customType`.
- **Reference DECISIONS.md decision:** Base prompt preservation uses explicit prepend (`_event.systemPrompt + "\n\n" + prompts.join("\n\n")`) because the framework uses last-writer-wins. The new test guards this behavior.

## Skills

No additional skills recommended beyond the mandatory pio and tdd skills. This is a straightforward test update — no git operations or external research needed.

## Dependencies

Step 1 must be completed (it is — `S01/COMPLETED` exists, implementation approved). The production code change (`systemPrompt` return instead of `message`) is already in place.

## Files Affected

- `src/capabilities/session-capability.test.ts` — update 5 test assertions from `result.message` to `result.systemPrompt`, add 1 new base-prompt-preservation test

## Acceptance Criteria

- `npx tsc --noEmit` reports no errors
- `npx vitest run src/capabilities/session-capability.test.ts` passes with no regressions (all 36+ tests pass)
- All previously passing tests still pass with updated assertions
- A new test verifies `_event.systemPrompt` is preserved as a prefix in the returned `systemPrompt`
- Zero occurrences of `result.message?.customType` remain in the test file (grep confirms)

## Risks and Edge Cases

- **Accidentally modifying working tests:** Only touch the 5 failing tests + add 1 new test. Do not modify the 31 passing tests.
- **Test name accuracy:** The existing test titles reference "message" — consider updating titles to reflect systemPrompt delivery for clarity, but this is cosmetic. The critical part is assertion correctness.
- **`_event.systemPrompt` empty string in existing tests:** Most existing tests pass `systemPrompt: ""`. This means the base prompt prefix is empty — the returned `systemPrompt` will be `"\n\n" + prompts.join("\n\n")`. The new test must use a non-empty base prompt to exercise the preservation path.
