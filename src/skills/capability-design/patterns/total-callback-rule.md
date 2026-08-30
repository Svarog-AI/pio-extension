# Total-Callback Rule

**Load-bearing.** A throwing loop callback (`loopWhile`, `terminateWhen`, `repeatWhile`, branch `condition`) is treated as **not passing** at `agent_end`. Callbacks must **catch internally** and return the fail-safe value.

## What the engine does

At `agent_end`, the loop engine evaluates the phase's termination/continuation callbacks. If a callback **throws**, the engine treats the condition as *not met* — it does not propagate the error as a pass. This is a silent failure mode, not an error screen.

## The fail-safe polarity

- For `loopWhile` (OR-logic, replay when true): a throwing callback → treated as not passing → **false** → the phase **advances**.
- For `terminateWhen` (AND-logic, advance when true): a throwing callback → treated as not passing → **false** → the phase does **not** advance (it would keep looping / idle at the cap).
- For `repeatWhile` (do-while block, repeat when truthy): a throwing callback → treated as not passing → **falsy** → the loop **exits**.

Because the fail-safe differs by field, the rule is stated as: **catch internally and return the value that keeps the system safe on unreadable/missing input.**

## Practical guidance

- A parsing callback (file read, evidence existence, queue read) must never throw on missing/unreadable input — return the fail-safe shape:
  - `loopWhile`: `true` (keep looping on unreadable input — retry until the artifact lands).
  - `terminateWhen`: `false` (do not advance on unreadable input).
- Wrap filesystem access in `try/catch` returning the conservative default, or read through a **total helper** shared by every callback so the fail-safe logic lives in one place.

## Why it matters

- For a **durability** loop (`loopWhile: !fileWritten`): a throwing callback would *advance* with the artifact still missing — silently skipping the write gate.
- For a **format-validity** loop (`loopWhile: malformed`): a throwing parser would *accept* a malformed LLM-authored file instead of mechanically rejecting it.
- For a **refinement-loop** `repeatWhile` (judgment !== acceptable): a throwing callback would exit the loop and consume a draft that was never judged.

## Consequence

Every callback built on file parsing must be **total** — this is a structural requirement, not a style preference.
