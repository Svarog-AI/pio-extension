# Inline User Clarification

Resolve user-only questions **inline** in the phase that encounters them, via `ask_user`, rather than routing them to a later clarification phase through a separate channel.

## The shape

In the answering phase, when the current item can only be resolved by the user (it depends on external context not present in the repo), the instructions direct the agent to:

```
call ask_user({ question, displayMode: "inline" })   // ask the user directly
then use the user's answer and proceed
```

## Rules

- **`displayMode: "inline"`** — always pass it inside pio sub-sessions so the question appears with surrounding context visible rather than as an overlay.
- **Ask only on genuine gaps** — a real unknown that would make an output incomplete or misleading. No filler questions ("anything else?").
- **One focused question at a time** — the ask_user tool accepts a single decision; do not batch unrelated questions.

## When to prefer a later clarification phase instead

If user-only items are better collected and asked together (after research completes), mark them with a **terminal `needs-user` status** in the backlog and hand off to a later clarify phase via file read. That keeps no loop alive and defers the questions to a dedicated phase — see the **seeded-discovery-loop** pattern's `[needs-user]` line grammar. Choose inline clarification for immediate resolution, deferred clarification for items that should be batched.
