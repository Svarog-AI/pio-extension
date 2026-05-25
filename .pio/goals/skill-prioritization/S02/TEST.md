# Tests: Skills propagation through config resolution

This verifies that `resolveCapabilityConfig()` copies the `skills` field from each capability's static config into the returned runtime `CapabilityConfig`.

## Unit Tests

Given a static config with a skills field when resolveCapabilityConfig resolves it then the returned config includes the skills field.
Given a static config without a skills field when resolveCapabilityConfig resolves it then the returned config has skills as undefined.
Given a static config with mandatory skills when resolveCapabilityConfig resolves it then mandatory skill names are preserved in the returned config.
Given a static config with recommended skills when resolveCapabilityConfig resolves it then recommended skill entries are preserved in the returned config.

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the test suite when npm test is run then all tests pass with no regressions.
