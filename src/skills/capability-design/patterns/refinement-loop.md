# Refinement Loop

A do-while pattern for a **produce → judge → refine until acceptable → consume** cycle, where the quality gate must **re-judge every refined draft** before the item is consumed.

Use it whenever an LLM produces an artifact that a second LLM judgment gates, and an unsatisfactory draft should be improved and **re-judged** — not accepted after a single refine pass.

## The shape

```
kind: "loop"  (the refinement loop)
  body: [ validate, branch-if-not-ok ]
  repeatWhile: judgment !== acceptable     ← loop while the judgment is NEGATIVE
  maxIterations: <bounded>
```

Where:

- **`validate`** — a `kind: "variable-definition"` phase declaring an **`llm` judgment boolean** (e.g. `questionAnswered`). The agent judges whether the current draft is acceptable and sets the variable via `setVar`. This is a judgment, not a mechanical disk check.
- **`branch-if-not-ok`** — `kind: "branch:if"` with **`condition: judgment === false`**, `then: [refine]`, and an **empty/absent `else`** (skip → loop-end). The positive judgment takes the absent-else path straight to the loop-end.
- **`refine`** — a standard LLM phase that reads the draft, improves it, and **rewrites the same artifact** (the same file). It does **not** change the judgment variable.
- **`repeatWhile`** — loops while `judgment !== acceptable`; the loop exits **only** on a positive re-judgment.
- A **single consume/pop phase runs AFTER the loop**, never inside the arms.

## Loop polarity rationale

Loop **while the judgment is negative**; terminate on the **positive judgment**. Never pop/consume inside the branch arms.

- The negative judgment (`judgment === false`) is the *continue* signal: it means "still not good enough, refine again and re-judge".
- The positive judgment (`judgment === true`) is the *exit* signal: `repeatWhile` returns falsy and the loop ends, then the single consume step runs.
- Popping inside an arm would consume a draft that was **judged negative** — accepting a refined-but-still-unsatisfactory artifact. That is the bug this pattern exists to prevent.

## Trace

1. **Pass 1:** `validate` judges the draft → `judgment = false`. `branch-if-not-ok` (false → then arm) runs `refine`, which improves the file. Loop-end: `repeatWhile` sees `judgment !== true` → **repeat**.
2. **Pass 2:** `validate` **re-judges the refined draft** → `judgment = true`. `branch-if-not-ok` (true → absent else → skip to loop-end). Loop-end: `repeatWhile` sees `judgment === true` → **exit**.
3. The single consume/pop step runs — and only now, because the re-judged draft passed.

## Rules

- **Bounded `maxIterations`** on the loop block — a pathological refiner that never satisfies the gate idles at the cap (`/continue`-recoverable) rather than looping forever.
- **Total-callback rule:** `repeatWhile` (and any validate callback) must never throw — a throwing loop callback is treated as *not passing* at `agent_end`. Catch internally and return the fail-safe value.
- **Never consume in the arms.** The consume step is a single phase placed after the loop, so it runs exactly once per item, and only after a positive re-judgment.
- **One artifact per pass.** `validate` must re-read/re-judge the current artifact (the refined draft), so the refinement loop targets a stable artifact identity (e.g. a content-addressed file name that `refine` rewrites in place).

## Relation to other patterns

- The **seeded-discovery-loop** uses a refinement loop for each question: `get-next-question` → `answer-question` → `refine-loop` → single `pop-question`.
- Contrast with the **exhaustion-loop** (`loopWhile(askUserCalled)`): that pattern loops on an engine signal (a run asked a question) rather than on a variable judgment, and its "exit" is a silent run — a different polarity family.
