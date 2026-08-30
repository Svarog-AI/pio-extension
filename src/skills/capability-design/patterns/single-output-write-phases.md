# Single-Output Write Phases

One phase per contract output, each gated to exactly that output, with a mechanical disk-existence completeness check.

## The shape

```
{
  id: "write-<name>",
  title: "Write <path>",
  write: ["<name>"],                 // exactly this one contract output
  maxIterations: 2,
  loopWhile: [
    { callback: (state) => !state.capState?.outputExists("<name>") },
  ],
  instructions: `Write <path>. Structure it per <reference skill>. ...`,
}
```

## Rules

- **One phase per contract output** — the anti-pattern is one phase writing many large files in a single turn. Split it so each output gets its own phase, its own `write: [name]` gate, and its own mechanical completeness check.
- **`write: [name]` gates** the phase to exactly its own declared contract output (resolved to a path via `CapState`). Restricted-by-default: an absent or empty `write[]` blocks all contract-output writes from the phase.
- **Total disk-existence `loopWhile`** — `outputExists(name)` returns true when the file is on disk. Missing/empty → `true` (keep looping); fail-safe on any error; bounded by `maxIterations`.
- **No `allowProjectWrites`** on write phases — the named `write: [name]` gate expresses the exact file set; a blanket project-writes flag is broader than the phase owns.

## Notes

- Declare the 7 (or N) outputs as **optional contract outputs** (`requiredWhen: () => false`, `projectRelative: true`) in `config.ts` so the exit lifecycle has parity with other capabilities (nothing hard-required) while the per-phase gate stays a precise named list.
- Write-phase `instructions` carry only that file's own structure spec (per the reference skill) — each write phase is self-contained.
