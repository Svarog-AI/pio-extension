# pio_mark_complete skips auto-enqueue when no validation rules are configured — should pass by default instead

## Problem

In `src/capabilities/validation.ts`, when `pio_mark_complete` runs in a session that has no validation rules configured (`!rules || !dir`), it returns early with "No validation rules configured for this session." and **never reaches the auto-enqueue logic** that chains the workflow forward.

This means: if a capability doesn't declare validation requirements (e.g., capabilities launched via `pio-next-task` that don't set `config.validation`), calling `pio_mark_complete` does nothing useful — no file check AND no task enqueuing.

## Current code (validation.ts, line ~96)

```ts
if (!rules || !dir) {
  return { content: [{ type: "text", text: "No validation rules configured for this session." }], details: {} };
}

const result = validateOutputs(rules, dir);

if (result.passed) {
  // ... auto-enqueue next task ...
}
```

The auto-enqueue lives inside `if (result.passed)`, which is unreachable when the early return fires.

## Expected behavior

If there are no validation rules, validation should **pass by default** and the auto-enqueue should still execute. The message "No validation rules configured" is misleading — it sounds like an error, but the correct semantics are: "nothing to check → pass → proceed."

The early return was likely intended for non-capability sessions (no pio-config entry at all). But even then, the capability name and workingDir may still be present on the config — enough info to auto-enqueue the next task.

## Suggested fix

Move the auto-enqueue logic outside the validation block, or treat missing rules as an automatic pass:

```ts
// If no rules, treat as passed (nothing to validate)
const result = (rules && dir) ? validateOutputs(rules, dir) : { passed: true, missing: [] };

if (!result.passed) {
  return { content: [{ type: "text", text: `Validation failed. Missing files:\n- ${result.missing.join("\n- ")}\n\nProduce these files and call pio_mark_complete again.` }], details: {} };
}

// Auto-enqueue next task — always runs on pass
const capability = config.capability;
// ... enqueue logic ...

return { content: [{ type: "text", text: `Validation passed.${rules ? ' All expected outputs have been produced.' : ''}${notification}` }], details: {} };
```

Or minimally: remove the early return and let `validateOutputs` short-circuit when rules are undefined.

## Impact

- Any session without validation config cannot auto-advance to the next capability step
- Breaks the automated workflow chain for capabilities launched via `pio-next-task` (which don't set validation)
- Agent must manually invoke the next tool instead of relying on mark_complete + pio-next-task

## Category

bug

## Context

File: src/capabilities/validation.ts, lines ~93-100. The guard `if (!rules || !dir)` returns early before the auto-enqueue block at lines ~105-120 which uses CAPABILITY_TRANSITIONS[capability] to enqueue the next task.
