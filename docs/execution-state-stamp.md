# Execution state & session handles — memory note

Personal reference for how the per-session execution state stays discoverable across
session-handle replacements (which is what lets row-2 composed frames share ONE ledger).
All claims cite shipped sources on `feat/per-session-write-gate` — re-verify anchors before
relying on this note after refactors.

## The one-paragraph version

`PioSession.create` mints **one** `SessionExecutionState` per runtime and hands it into
`createPioSession` inside the `guardInstall` bag. Inside that seam, a **stored
session-factory callback** (`createRuntime`) passes our code into the platform's own
handle-mint step; the SDK stores the callback and **re-runs it whenever it creates or
replaces a session** (initial mint, `/new`, `/resume`, /fork, import, and hop
`switchSession` — dist-verified at the pinned 0.85.1). Our callback does two things at
each birth: installs the guard interceptor factory, and stamps the fresh handle with a
symbol-keyed property carrying the state object ("re-stamp, don't re-mint"). So every
handle ever minted by that runtime points at the SAME heap object, and any host built
later over a settled runtime finds it via one cast-free read in
`PioSession.fromRuntime`. Nothing transfers between sessions: content lives in the state
object, handles are disposable viewports onto it.

## Topology

```
AgentSessionRuntime (lives the whole run)
 ├─ .session ─────► CURRENT AgentSession handle   (one at a time; disposed + re-minted on swap)
 ├─ stored callback createRuntime                 (platform-held; WE supplied it as ctor arg)
 │    └─ captured: guardInstall { executionState: S, handlers }      ◄── durable reference
 │
S = SessionExecutionState                            (ONE heap object; span stack ACCUMULATES here)
      ▲              ▲                    ▲
   closure        H1→H2→H3 .stamp     wrappers' #executionState fields
```

- One runtime ⇒ many AgentSession instances over time; exactly ONE current at any instant.
- The stamp is an **own data property on each handle instance** (not on the prototype),
  non-enumerable, symbol-keyed — invisible to generic iteration, unforgeable by name.

## Key sites (shipped anchors)

| What | Where |
|---|---|
| Stamp key: `unique symbol EXECUTION_STATE_STAMP` | `pio/src/session.ts` L51 |
| SOLE write site: `Object.defineProperty(created.session, STAMP, { value, enumerable:false, configurable:true })` | `pio/src/session.ts` L116 — INSIDE the `createRuntime` callback (L85–126) |
| Callback handed to the platform: `createAgentSessionRuntime(createRuntime, …)` | `pio/src/session.ts` L128 — we never call the callback again; no second call site exists by design |
| State minting (unconditional): `new SessionExecutionState(…)` + `guardInstall: { executionState, handlers: [writeToolCallHandler] }` | `pio/src/capability/pio-session.ts`, `static create` |
| Reader (discovery, cast-free): `Reflect.get(handle, STAMP)` → `unknown` → `instanceof SessionExecutionState ? found : undefined` | `pio/src/capability/pio-session.ts`, `static fromRuntime` |
| Row-2 adoption uses the reader: `PioSession.fromRuntime(topFrame.runtime)` right after the hop's switch lands | `pio/src/capability/terminal-takeover.ts`, `#buildChildFrame` |
| The state itself: LIFO span layers + scalar phase slot + owned path channels, loud bookkeeping faults, fresh-per-call `snapshot()` | `pio/src/session-execution-state.ts` |
| Predicate (judges snapshots, owns zero lifecycle): `decideWrite(snapshot, tool, input)` | `pio/src/capability/guards/write-gate.ts` |

## Why "reliably" (the part that took the longest to click)

We cannot hook handle replacement — swaps happen deep in platform machinery. Passing the
factory callback INTO the runtime's constructor is the only sanctioned channel where the
platform says "run YOUR code at each session birth." Reliability = piggybacking the
platform's mandatory step: decoration fires on 100% of births by construction, with no
listener, no tracking, no drift. Identity ("same") falls out of the callback capturing the
state once and copying that REFERENCE into every newborn.

## The parent→child "handover" is exactly two lines

1. WRITE — at child-handle mint, executed BY THE PLATFORM'S re-run of our callback: the
   `defineProperty` above. By the time the new handle becomes current, its tag is already set.
2. READ — at adoption, executed by us: `fromRuntime`'s `Reflect.get` + `instanceof`
   narrowing stores the discovered reference into the wrapper's private field.

No inheritance, no copy, no blank child state. What IS fresh per child: the `PioSession`
wrapper (own observer/counters, own vars store, own subscription) — FRESH wrapper, SHARED ledger.

## Consequences worth remembering

- **Content survives swaps because it lives in S, not in handles.** Disposing a handle kills
  a pointer, never data; `rebind` deliberately leaves the state intact (span-survival
  ruling). Retained readings like `[parent, callee, parent]` across a hop + switch-back hold
  even though both original handles are dead and a third mint is current.
- **Liveness ≠ enforcement.** Stamps + wrapper fields are ordinary GC references (liveness
  anchors); enforcement lives ONLY in the handler closures the same callback installs.
  Remove the handlers ⇒ the ledger keeps recording coherently, nothing refuses (mount
  profile becomes the sole physical bound). Remove everything ⇒ the state still lives while
  its owner references do.
- **Roles**: state = PIP (supplies plain facts) · predicate = PDP (judges per call) ·
  interceptor closure = PEP (enforces per call). A denial never mutates permission state —
  no-refusal-cycle holds structurally.
- **Three worlds**: (a) our entry chain — ledger always present (create installs
  unconditionally); (b) bare `createPioSession` with no options — no tag, byte-identical
  legacy behavior (additive doctrine; absence is an honest negative, not a sentinel);
  (c) foreign runtimes — untaggable forever ⇒ documented no-op boundary
  (`CAPABILITY-AUTHORING.md` §12.9), mount profile backstop.
- **Row-2 bracket** (Step 12): the hop body in `base.ts` enters the CALLEE's sources onto
  the adopted host's shared stack strictly post-adoption/pre-call and pops at settlement on
  both paths (try/finally) — so the innermost-span algebra judges the callee's phases
  against the callee's own contract patterns, with the parent span suspended behind it.
  Stamp ABSENCE stands (identity channel ≠ governance channel).

## Open note (not debt in the engine — vocabulary debt)

Recorder and enforcer ride one option bag named after the enforcer (`guardInstall`).
Today functionally fine: recorder-only access works via `{ executionState, handlers: [] }`,
and our own sessions are unconditionally covered either way. If a NAMED non-guard consumer
appears, split the option surface (discovery channel independent of handler install) as its
own scoped step — the fix is small and local; the §12.9 absent-boundary semantics and
additive byte-identity must be preserved by whatever shape lands.
