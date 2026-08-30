# Exhaustion Loop

For interview / clarify / Q&A phases where **silence is a legitimate end state** — the agent asks questions until there is nothing left to ask, and a run that asks nothing means it is done.

## The shape

```
loopWhile: [ { callback: (state) => state.askUserCalled } ]
maxIterations: <bounded>
loopMessage: <steering>
```

The `askUserCalled` flag is **per-run** — it resets at the start of every agent run (`setupTurn`). So:

- A run that **called `ask_user`** sets the flag → `loopWhile(askUserCalled)` is true → the phase **replays** (there may be more un-exhausted questions).
- A run that **asked nothing** leaves the flag false → `loopWhile` is false → the phase **advances**. Silence terminates the loop.

"a run that contained questions may have more un-exhausted, so keep running; the first silent run terminates."

## Polarity — do NOT use `terminateWhen(askUserCalled)`

`terminateWhen(askUserCalled)` is the **inverted** polarity: a phase would advance only on a run that *did* ask. For an exhaustion loop:

- A no-gap run (nothing to ask) never calls `ask_user` → the flag stays false → `terminateWhen` never passes → the phase replays to `maxIterations` and then **idle-pauses** (the engine does not force-advance at the cap, and the flag resets per run, so it can never advance).

## Mandatory-gate exception

Reserve `terminateWhen(askUserCalled)` for **mandatory gates** where *every* run must ask — e.g. manual testing / review checkpoints where asking is the required behavior, not an optional exhaustible activity.

## Rules

- **`loopMessage`** should steer: start from what is still open, do not re-ask answered items, ask remaining genuine gaps one by one, and end without asking when none remain.
- No `terminateWhen`, no `minIterations` — a single silent run advances.
- Total-callback rule: the callback reads `state.askUserCalled` (a boolean field) — it never throws.
