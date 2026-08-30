# Seeded Discovery Loop

**The standard research-loop pattern** — the canonical shape for *any* research/refinement capability (project analysis, dependency research, anything whose job is to discover unknowns and then answer them).

## The shape

```
kind: "code"   default-questions — seed the queue + scratch area
kind: "loop"   research-loop (outer, do-while)
  body: [ answer-questions (inner loop), generate-questions, merge-questions ]
  repeatWhile: queue non-empty (any open question remains)
  maxIterations: <pass cap>
kind: "code"   merge-notes — final consolidation AFTER the loop
```

### 1. Seed — `kind: "code"` phase

- Seeds a store **array variable** (e.g. `questions`) with a **default open-question set** — an explicit coverage floor that cannot be skipped.
- Sets up the **session-scoped scratch area**. Scratch paths are **session-scoped** (`/tmp/<capability>/<sessionId>/...`), exposed to LLM phases via store variables (`questions_path`, `answers_dir`, `notes_path`, `answer_path`) + `${var}` interpolation. **Session scoping is mandatory**: concurrent sessions of the same capability must not share a backlog.
- No agent turn — runs inline.

### 2. Inner loop — `kind: "loop"` block that drains the queue one question per pass

Body (do-while, bounded pass cap):

- **reset-vars** — `variable-definition` phase with `static` variables that reset per-pass state (`questionAnswered` → `false`, `nextQuestion` → empty) at the start of every pass, so no stale value leaks from the prior iteration.
- **get-next-question** — `kind: "code"` phase that **peeks** the front of `questions` into `nextQuestion` and derives this question's dedicated answer file `answer_path` from the question text (a **content-addressed** name — a pure function of the question text, e.g. `answers/q-<hash8>.md` — so no counter needs to be kept aligned and `refine` rewrites the same file). Does **not** pop.
- **answer-question** — LLM phase that researches and **writes the answer to its dedicated `${answer_path}` file**, with a mechanical **non-empty-existence `loopWhile`** (`!answerFileWritten` — file exists and is non-empty; total, never throws; `maxIterations: 2`). Because each question owns its file, a plain existence check is unambiguous — no shared-file size-baseline or substring detection needed.
- **refine-loop** — a **refinement-loop** (see `refinement-loop.md`): `[validate-answer, branch-if-not-ok]`, `repeatWhile: questionAnswered !== true`, bounded `maxIterations`. `validate-answer` is an `llm` boolean judgment; `branch-if-not-ok` (`questionAnswered === false`) has `then: [refine-answer]` and an **absent else**; `refine-answer` rewrites the same `${answer_path}`. The refined draft is **re-judged** until satisfactory.
- **pop-question** — `kind: "code"` phase that shifts the front of the queue. A **single** pop, placed **after** the refine-loop — never inside the branch arms. The question is consumed only once its answer passes re-validation.

The inner loop's `repeatWhile`: queue non-empty — it drains the queue, exiting when empty (or at the pass cap).

### 3. Generate — LLM `variable-definition` phase

Reflects on what was answered (read the per-question answer files under the `answers_dir`) and sets `new_questions` (`llm` array); before concluding it **verifies complete architecture coverage** — every component/area of the architecture (per the accumulated findings) is covered by an answered question, with genuinely new questions generated to close any gaps, and only then stopping. A following `kind: "code"` **merge-questions** phase folds them into the queue. Write each seeded question to be **self-guiding** about where to look rather than attaching a separate lookup table or checklist (instructions re-serve on every entry).

### 4. Outer loop — do-while `kind: "loop"`

Around `[inner loop, generate-questions, merge-questions]`; `repeatWhile`: queue non-empty (repeat only while discovery produced new questions).

### 5. Merge-notes — `kind: "code"` phase (top-level, after the loop)

Runs **once after the outer loop drains the queue** (not inside it): concatenates every per-question answer file (`q-*.md`) in **mtime order** (approximating answer order) into the single notes file, preserving its header. **Best-effort and total** — unreadable/missing files are skipped, never throws. This is the final consolidation into the durable notes source the output-writing phases consult; during the loop, generate-questions reads the per-question answer files directly.

### 6. Cleanup — trailing `kind: "code"` phase

After the output-writing phases: removes the session-scoped scratch directory once the writes are done. Best-effort and total (never throws — /tmp is OS-reclaimed anyway).

## Line-grammar convention (when a disk-file backlog is used)

Where questions live in a file rather than a queue variable, the canonical line grammar is:

```
# research questions
[open] <question text>
[answered] <question text> — evidence: <repo-relative path[, ...]>
[needs-user] <question text> — note: <what is needed from the user>
```

One question per line; status in brackets at line start; `#`-prefixed and blank lines ignored. A line is **terminal** iff it is `[answered]` with all cited evidence paths existing (checked via `existsSync` under the project root) or `[needs-user]`. A parsing callback returning `{ open, terminalOk, malformed }` must be **total** (unreadable file ⇒ fail-safe malformed shape).

## Why disk state for research output

The queue's open/answered state is *control flow* driven by per-pass LLM judgment and lives naturally in session variables; the **accumulated content** (the Q&A notes) is *monotonic across runs* — `filesWritten`/`askUserCalled` reset per run in `setupTurn`, so durable research output belongs in a file, not in per-run engine signals. Claims are validated **against disk** (cited evidence files exist) instead of self-reported.

## Rules

- **Terminal-state discipline:** every open question must reach a terminal state (answered-with-existing-evidence or needs-user) in the answer phase, or the phase idles at its cap on user-only questions.
- **`needs-user` is terminal** — it keeps no loop alive (would guarantee an idle at the cap) and hands off to a later clarify phase via file read.
- **Total-callback rule:** parsing/repeat callbacks never throw — catch internally, return the fail-safe value (for `loopWhile`: `true` = keep looping on unreadable input).
- **Enumerate once.** A structural answer (e.g. the directory tree) is produced once via a single shell command in run 1 and carried in conversation context for replays — do not re-enumerate per pass.

## Rejected variants

- **Self-reported coverage-status manifests** — claims dressed as mechanical checks.
- **Per-pass mechanical tree re-enumeration** — token waste.
- **Single-phase answer+generate conflation** — one run can't distinguish "done discovering" from "hasn't generated yet".
- **Consuming a draft inside a branch arm** — accepts a refined-but-still-unsatisfactory answer without re-validation (see `refinement-loop.md`).
