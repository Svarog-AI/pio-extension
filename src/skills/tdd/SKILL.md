---
name: tdd
description: Test-driven development with red-green-refactor loop. Use when user wants to build features or fix bugs using TDD, mentions "red-green-refactor", wants integration tests, or asks for test-first development.
---

# Test-Driven Development

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs. They describe _what_ the system does, not _how_ it does it. A good test reads like a specification - "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means (like querying a database directly instead of using the interface). The warning sign: your test breaks when you refactor, but behavior hasn't changed. If you rename an internal function and tests fail, those tests were testing implementation, not behavior.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Anti-Pattern: Testing Implementation Details

**Do not test things that are not behavior.** Before writing a test, ask: "if I changed this but the system still did the right thing, should the test fail?" If the answer is no, don't test it.

### Things you should NOT test

**String literal content.** Descriptions, labels, error message text, tool metadata — these are documentation, not behavior. Changing a description from "writes tests first" to "applies iterative TDD" doesn't change what the code *does*. No test needed. Verify via the existing test suite (no regressions) and manual review.

**Configuration values that don't affect observable outcomes.** A tool's `description` field, a command's `label`, a prompt's `title` — these are metadata consumed by UIs or agents, not logic your code exercises. If the only effect is a string shown somewhere, the test is checking the shape of a string, not a capability.

**Internal data structure shape.** Don't assert that an object has `{ a: 1, b: 2 }` when the function only needs `{ a: 1 }` to work. Test the *outcome* of using the data, not the data itself. If the function returns a result, test the result. If it mutates state, test the state change. Don't test intermediate shapes.

**Function signatures and parameter counts.** Don't write `expect(fn.length).toBe(3)`. If the function works correctly with the right inputs, the signature is correct by construction (TypeScript will catch mismatches).

**File contents read as raw strings.** Don't read a source file and assert it contains a substring. This is testing the source code, not the system's behavior. If a prompt file needs to contain certain text, that's a documentation concern — verify by reading the file, not by testing it.

### The decision tree

```
Does this change have observable behavior?
├── Yes (function output, state mutation, file creation, error throwing)
│   └── Write a test that exercises the public interface
└── No (description string, comment, label, prompt text, metadata)
    └── No test needed. Verify: existing suite passes + manual review
```

### Example: bad vs good

**Bad** — testing a description string:
```typescript
it("description mentions iterative workflow", () => {
  expect(tool.description).toContain("iterative TDD");
});
// If someone rephrases the description but keeps the meaning, the test breaks.
// The tool's behavior hasn't changed.
```

**Good** — testing what the tool *does*:
```typescript
it("enqueues a task with the correct capability and params", () => {
  const result = await tool.execute(/* ... */);
  // Assert the actual outcome: what was enqueued, what was returned
});
```

## Anti-Pattern: Horizontal Slices

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing" - treating RED as "write all tests" and GREEN as "write all code."

This produces **crap tests**:

- Tests written in bulk test _imagined_ behavior, not _actual_ behavior
- You end up testing the _shape_ of things (data structures, function signatures) rather than user-facing behavior
- Tests become insensitive to real changes - they pass when behavior breaks, fail when behavior is fine
- You outrun your headlights, committing to test structure before understanding the implementation

**Correct approach**: Vertical slices via tracer bullets. One test → one implementation → repeat. Each test responds to what you learned from the previous cycle. Because you just wrote the code, you know exactly what behavior matters and how to verify it.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED→GREEN: test1→impl1
  RED→GREEN: test2→impl2
  RED→GREEN: test3→impl3
  ...
```

## Workflow

### 1. Planning

When exploring the codebase, use the project's domain glossary so that test names and interface vocabulary match the project's language, and respect ADRs in the area you're touching.

Before writing any code:

- [ ] Confirm with user what interface changes are needed
- [ ] Confirm with user which behaviors to test (prioritize)
- [ ] Identify opportunities for [deep modules](deep-modules.md) (small interface, deep implementation)
- [ ] Design interfaces for [testability](interface-design.md)
- [ ] List the behaviors to test (not implementation steps)
- [ ] Get user approval on the plan

Ask: "What should the public interface look like? Which behaviors are most important to test?"

**You can't test everything.** Confirm with the user exactly which behaviors matter most. Focus testing effort on critical paths and complex logic, not every possible edge case.

### 2. Tracer Bullet

Write ONE test that confirms ONE thing about the system:

```
RED:   Write test for first behavior → test fails
GREEN: Write minimal code to pass → test passes
```

This is your tracer bullet - proves the path works end-to-end.

### 3. Incremental Loop

For each remaining behavior:

```
RED:   Write next test → fails
GREEN: Minimal code to pass → passes
```

Rules:

- One test at a time
- Only enough code to pass current test
- Don't anticipate future tests
- Keep tests focused on observable behavior

### 4. Refactor

After all tests pass, look for [refactor candidates](refactoring.md):

- [ ] Extract duplication
- [ ] Deepen modules (move complexity behind simple interfaces)
- [ ] Apply SOLID principles where natural
- [ ] Consider what new code reveals about existing code
- [ ] Run tests after each refactor step

**Never refactor while RED.** Get to GREEN first.

## Checklist Per Cycle

```
[ ] Test describes behavior, not implementation
[ ] Test uses public interface only
[ ] Test would survive internal refactor
[ ] Code is minimal for this test
[ ] No speculative features added
```
