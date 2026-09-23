// Hermetic unit suite for the capability session host (pio-session.ts).
// Every SDK value symbol reachable through the session-construction seam is a
// pure fake: the vi.mock factory references ONLY hoisted bindings and never
// pulls in the original module, so the real @earendil-works/pi-coding-agent
// graph is never evaluated. No filesystem, network, env, or process-stream
// assumptions. Each construction mints a fresh fake session behind a fresh
// fake runtime, so subscription counts and per-instance isolation are
// directly observable. Synthetic events flow through the single documented
// cast seam asEvent — the sole `as` in this file.
//
// Phase-running rows drive the runs themselves through the fake session
// handle's prompt mock: each queued implementation emits synthetic events
// through the captured listener and then resolves, where one resolution
// stands for one fully-settled logical run. The agentEnd fixture mirrors
// the installed dist payload shape ({ type, messages, willRetry }).
import path from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { PhaseBudgetError } from "./errors.ts";
import type { IterationCtx, PhaseResult } from "./pio-session.ts";
import { PioSession, renderPhaseMarker } from "./pio-session.ts";

// Single documented cast seam for synthetic event payloads.
const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

const CWD = "/work/dir";
const SESSIONS_ROOT = "/store/sessions";

type Listener = (event: AgentSessionEvent) => void;

interface FakeSession {
  subscribe: ReturnType<typeof vi.fn>;
  /** One invocation stands for one fully-settled logical run. */
  prompt: ReturnType<typeof vi.fn>;
  sessionId: string;
  dispose: ReturnType<typeof vi.fn>;
}

interface Round {
  session: FakeSession;
  runtime: { session: FakeSession };
  captured: Listener[];
}

const harness = vi.hoisted(() => {
  const managerCwd = "/managed/cwd";
  const agentDir = "/agent/dir";
  const sessionId = "sess-fake-0001";

  const state: { rounds: Round[] } = { rounds: [] };

  const fakeManager = { getCwd: () => managerCwd };
  const fakeServices = { marker: "fake-services" };

  const getAgentDir = vi.fn(() => agentDir);
  const SessionManager = {
    create: vi.fn(() => fakeManager),
  };
  const createAgentSessionServices = vi.fn(async () => fakeServices);
  const createAgentSessionFromServices = vi.fn(async () => ({
    extensionsResult: {},
  }));
  const createAgentSessionRuntime = vi.fn(async () => {
    // Fresh fakes per invocation so isolation rows observe distinct handles.
    const captured: Listener[] = [];
    const subscribe = vi.fn((listener: Listener) => {
      captured.push(listener);
      return () => {};
    });
    const prompt = vi.fn(async () => undefined);
    const session: FakeSession = {
      subscribe,
      prompt,
      sessionId,
      dispose: vi.fn(),
    };
    const round: Round = { session, runtime: { session }, captured };
    state.rounds.push(round);
    return round.runtime;
  });

  const reset = () => {
    state.rounds = [];
    getAgentDir.mockClear();
    SessionManager.create.mockClear();
    createAgentSessionServices.mockClear();
    createAgentSessionFromServices.mockClear();
    createAgentSessionRuntime.mockClear();
  };

  return {
    state,
    getAgentDir,
    SessionManager,
    createAgentSessionServices,
    createAgentSessionFromServices,
    createAgentSessionRuntime,
    reset,
    managerCwd,
    agentDir,
    sessionId,
  };
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: harness.getAgentDir,
  SessionManager: harness.SessionManager,
  createAgentSessionServices: harness.createAgentSessionServices,
  createAgentSessionFromServices: harness.createAgentSessionFromServices,
  createAgentSessionRuntime: harness.createAgentSessionRuntime,
}));

beforeEach(() => {
  harness.reset();
});

function lastRound(): Round {
  const round = harness.state.rounds[harness.state.rounds.length - 1];
  if (!round) throw new Error("expected a construction round");
  return round;
}

/** Build a host plus the construction round backing it. */
async function host(sessionsRoot?: string) {
  const instance = await PioSession.create(CWD, sessionsRoot);
  return { instance, round: lastRound() };
}

/** Drive synthetic events through the listener the host attached. */
function emit(round: Round, ...events: object[]) {
  const listener = round.captured[0];
  if (!listener) throw new Error("expected an attached listener");
  for (const event of events) listener(asEvent(event));
}

// --- Event fixtures (shapes mirror the installed dist) --------------------

function start(toolCallId: string, toolName: string, args?: unknown) {
  return { type: "tool_execution_start", toolCallId, toolName, args };
}

function update(toolCallId: string, toolName: string, args?: unknown) {
  return {
    type: "tool_execution_update",
    toolCallId,
    toolName,
    args,
    partialResult: { stream: "partial" },
  };
}

// The end event carries NO args field — the path must correlate from the
// matching start event through the toolCallId.
function end(toolCallId: string, toolName: string, isError: boolean) {
  return {
    type: "tool_execution_end",
    toolCallId,
    toolName,
    result: null,
    isError,
  };
}

function agentStart() {
  return { type: "agent_start" };
}

/** Mirrors the installed dist payload: per-attempt messages plus retry flag. */
function agentEnd(messages: unknown[] = [], willRetry: boolean = false) {
  return { type: "agent_end", messages, willRetry };
}

/** One quiet settled run: a run start plus one empty agent_end payload. */
function quietRun(): object[] {
  return [agentStart(), agentEnd([], false)];
}

/** Queue one synthetic settlement per pass over the captured listener. */
function scriptRuns(round: Round, ...passes: object[][]) {
  for (const pass of passes) {
    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, ...pass);
    });
  }
}

function turnEnd(message: object) {
  return { type: "turn_end", message, toolResults: [] };
}

function messageEnd(message: object) {
  return { type: "message_end", message };
}

function usage(
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
  extra: object = {},
) {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    ...extra,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function assistantMessage(usageFields: object) {
  return {
    role: "assistant",
    content: [{ type: "text", text: "done" }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: usageFields,
    stopReason: "stop",
    timestamp: 1,
  };
}

describe("PioSession — construction & scoping", () => {
  it("subscribes exactly once, staying exactly once across API use", async () => {
    const { instance, round } = await host();
    expect(round.session.subscribe).toHaveBeenCalledTimes(1);

    instance.counters();
    instance.getFilesWrittenDelta();
    const store = instance.vars;
    store.set("a", 1);
    store.get("a");
    store.list();
    instance.counters();
    instance.getFilesWrittenDelta();

    expect(round.session.subscribe).toHaveBeenCalledTimes(1);
  });

  it("distinct instances hold distinct sessions and listeners with no shared observation state", async () => {
    const a = await PioSession.create(CWD);
    const ra = lastRound();
    const b = await PioSession.create(CWD);
    const rb = lastRound();

    expect(ra.session).not.toBe(rb.session);
    expect(ra.runtime).not.toBe(rb.runtime);
    expect(ra.session.subscribe).toHaveBeenCalledTimes(1);
    expect(rb.session.subscribe).toHaveBeenCalledTimes(1);
    expect(ra.captured[0]).not.toBe(rb.captured[0]);

    // A successful write committed through instance A's listener...
    emit(
      ra,
      start("w1", "write", { path: "/only/a.txt" }),
      end("w1", "write", false),
    );

    expect(a.counters().filesWritten).toBe(1);
    // ...leaves instance B's counters and partition untouched.
    expect(b.counters()).toEqual({
      filesWritten: 0,
      askUserCalls: 0,
      toolUses: {},
      tokens: 0,
    });
    expect(b.getFilesWrittenDelta()).toEqual([]);
  });

  it("id mirrors the settled session handle id", async () => {
    const { instance } = await host();
    expect(instance.id).toBe(harness.sessionId);
  });

  it("runtime IS the construction result by reference identity", async () => {
    const { instance } = await host();
    expect(instance.runtime).toBe(lastRound().runtime);
  });

  it("with a sessions root: transcripts routed into the top slot", async () => {
    await PioSession.create(CWD, SESSIONS_ROOT);
    expect(harness.SessionManager.create).toHaveBeenLastCalledWith(
      CWD,
      path.join(SESSIONS_ROOT, "top"),
    );
  });

  it("without a sessions root: single-arg SessionManager.create", async () => {
    await PioSession.create(CWD);
    expect(harness.SessionManager.create).toHaveBeenCalledTimes(1);
    expect(harness.SessionManager.create).toHaveBeenLastCalledWith(CWD);
    expect(harness.SessionManager.create.mock.calls[0]).toHaveLength(1);
  });
});

describe("PioSession — zero state", () => {
  it("counters() before any event carries the exact zero shape; take yields empty", async () => {
    const { instance } = await host();
    const snapshot = instance.counters();
    expect(Object.keys(snapshot).sort()).toEqual([
      "askUserCalls",
      "filesWritten",
      "tokens",
      "toolUses",
    ]);
    expect(snapshot.filesWritten).toBe(0);
    expect(snapshot.askUserCalls).toBe(0);
    expect(snapshot.toolUses).toEqual({});
    expect(snapshot.tokens).toBe(0);
    expect(instance.getFilesWrittenDelta()).toEqual([]);
  });
});

describe("PioSession — toolUses counter", () => {
  const toolUseRows: Array<{
    label: string;
    events: object[];
    expected: Record<string, number>;
  }> = [
    {
      label:
        "counts every started execution per name, mixed and repeated; updates and ends contribute nothing",
      events: [
        start("c1", "read", {}),
        start("c2", "bash", { command: "ls" }),
        start("c3", "edit", { path: "/x.md" }),
        start("c4", "read", {}),
        update("c1", "read", {}),
        end("c1", "read", false),
        end("c2", "bash", true),
      ],
      expected: { read: 2, bash: 1, edit: 1 },
    },
    {
      label: "a failed grep keeps its start count",
      events: [start("f1", "grep", {}), end("f1", "grep", true)],
      expected: { grep: 1 },
    },
  ];
  for (const row of toolUseRows) {
    it(row.label, async () => {
      const { instance, round } = await host();
      emit(round, ...row.events);
      expect(instance.counters().toolUses).toEqual(row.expected);
    });
  }

  it("a failed write keeps its start count while filesWritten stays excluded", async () => {
    const { instance, round } = await host();
    emit(
      round,
      start("w1", "write", { path: "/failed.md" }),
      end("w1", "write", true),
    );
    expect(instance.counters().toolUses).toEqual({ write: 1 });
    expect(instance.counters().filesWritten).toBe(0);
  });
});

describe("PioSession — filesWritten counter", () => {
  it("successful write and edit ends commit into count and delta; a failed edit contributes nothing", async () => {
    const { instance, round } = await host();
    emit(
      round,
      start("w1", "write", { path: "/out/a.md" }),
      end("w1", "write", false),
      start("e1", "edit", { path: "/out/b.md" }),
      end("e1", "edit", true),
    );
    expect(instance.counters().filesWritten).toBe(1);
    expect(instance.getFilesWrittenDelta()).toEqual(["/out/a.md"]);
  });

  it("non-file tools never contribute regardless of success", async () => {
    const { instance, round } = await host();
    emit(
      round,
      start("r1", "read", { path: "/in/a.md" }),
      end("r1", "read", false),
      start("b1", "bash", { command: "echo hi" }),
      end("b1", "bash", false),
      start("g1", "grep", {}),
      end("g1", "grep", false),
    );
    expect(instance.counters().filesWritten).toBe(0);
    expect(instance.getFilesWrittenDelta()).toEqual([]);
    expect(instance.counters().toolUses).toEqual({
      read: 1,
      bash: 1,
      grep: 1,
    });
  });

  it("paths correlate from the matching start because the end carries no args", async () => {
    const { instance, round } = await host();
    emit(
      round,
      start("p1", "write", { path: "/correlated/deep.md" }),
      end("p1", "write", false),
    );
    const delta = instance.getFilesWrittenDelta();
    expect(delta).toHaveLength(1);
    // Byte-for-byte the start's args.path — the only source of the value.
    expect(delta[0]).toBe("/correlated/deep.md");
    expect(instance.counters().filesWritten).toBe(1);
  });

  const defensiveArgRows: Array<{ label: string; args: unknown }> = [
    { label: "missing path key", args: {} },
    { label: "non-string path", args: { path: 42 } },
    { label: "empty-string path", args: { path: "" } },
    { label: "absent args", args: undefined },
  ];
  for (const row of defensiveArgRows) {
    it(`an ignored write start (${row.label}) neither commits nor registers a pending entry`, async () => {
      const { instance, round } = await host();
      emit(round, start("d1", "write", row.args), end("d1", "write", false));
      expect(instance.counters().filesWritten).toBe(0);
      expect(instance.getFilesWrittenDelta()).toEqual([]);
      // The start itself is still observed...
      expect(instance.counters().toolUses).toEqual({ write: 1 });
    });
  }

  it("interleaved parallel edits: one succeeding end and one failing end commit exactly one path", async () => {
    const { instance, round } = await host();
    emit(
      round,
      start("a1", "edit", { path: "/pa.md" }),
      start("b1", "edit", { path: "/pb.md" }),
      end("b1", "edit", true),
      end("a1", "edit", false),
    );
    expect(instance.counters().filesWritten).toBe(1);
    expect(instance.getFilesWrittenDelta()).toEqual(["/pa.md"]);
  });

  it("a stale write start is drained at agent_start and never leaks into a later run", async () => {
    const { instance, round } = await host();
    emit(round, start("s1", "write", { path: "/stale.md" }));
    expect(instance.getFilesWrittenDelta()).toEqual([]);
    emit(round, agentStart());
    expect(instance.getFilesWrittenDelta()).toEqual([]);
    emit(
      round,
      start("s2", "write", { path: "/fresh.md" }),
      end("s2", "write", false),
    );
    expect(instance.getFilesWrittenDelta()).toEqual(["/fresh.md"]);
    expect(instance.counters().filesWritten).toBe(1);
  });

  it("explicit resets separate per-run windows while the cumulative count grows", async () => {
    const { instance, round } = await host();
    emit(
      round,
      agentStart(),
      start("r1a", "write", { path: "/run1/a.md" }),
      end("r1a", "write", false),
      start("r1b", "edit", { path: "/run1/b.md" }),
      end("r1b", "edit", false),
      agentEnd(),
    );
    // Repeated reads within the window are content-stable.
    expect(instance.getFilesWrittenDelta()).toEqual([
      "/run1/a.md",
      "/run1/b.md",
    ]);
    expect(instance.getFilesWrittenDelta()).toEqual([
      "/run1/a.md",
      "/run1/b.md",
    ]);
    expect(instance.counters().filesWritten).toBe(2);

    // The explicit reset closes the first run's window.
    instance.resetFilesWrittenDelta();

    emit(
      round,
      agentStart(),
      start("r2a", "write", { path: "/run2/c.md" }),
      end("r2a", "write", false),
      agentEnd(),
    );
    expect(instance.getFilesWrittenDelta()).toEqual(["/run2/c.md"]);
    expect(instance.getFilesWrittenDelta()).toEqual(["/run2/c.md"]);
    expect(instance.counters().filesWritten).toBe(3);
  });
});

describe("PioSession — askUserCalls counter", () => {
  it("an ask_user start increments askUserCalls AND appears in toolUses.ask_user", async () => {
    const { instance, round } = await host();
    emit(round, start("u1", "ask_user", {}));
    const counters = instance.counters();
    expect(counters.askUserCalls).toBe(1);
    expect(counters.toolUses.ask_user).toBe(1);
  });

  it("near-names do not increment askUserCalls (but keep their start counts)", async () => {
    const { instance, round } = await host();
    emit(round, start("n1", "ask-user", {}), start("n2", "Ask_User", {}));
    const counters = instance.counters();
    expect(counters.askUserCalls).toBe(0);
    expect(counters.toolUses).toEqual({ "ask-user": 1, Ask_User: 1 });
  });
});

describe("PioSession — tokens counter", () => {
  it("accumulates assistant message_end usages across turns to the pinned sum", async () => {
    const { instance, round } = await host();
    // Hand-computed: 10+20+5+3 = 38 · 100+250+400+50 = 800 · 7+8+9+10 = 34 → 872.
    emit(
      round,
      agentStart(),
      messageEnd(assistantMessage(usage(10, 20, 5, 3))),
      messageEnd(assistantMessage(usage(100, 250, 400, 50))),
      messageEnd(assistantMessage(usage(7, 8, 9, 10))),
      agentEnd(),
    );
    expect(instance.counters().tokens).toBe(872);
  });

  it("user, toolResult (with its own populated usage), and custom message_end events contribute nothing", async () => {
    const { instance, round } = await host();
    emit(
      round,
      messageEnd({ role: "user", content: "hi", timestamp: 1 }),
      messageEnd({
        role: "toolResult",
        toolCallId: "t1",
        toolName: "bash",
        content: [],
        isError: false,
        usage: usage(1000, 2000, 3000, 4000),
        timestamp: 1,
      }),
      messageEnd({
        role: "custom",
        customType: "note",
        content: "n",
        display: true,
        timestamp: 1,
      }),
    );
    expect(instance.counters().tokens).toBe(0);
  });

  it("the same assistant message on turn_end and message_end counts once", async () => {
    const { instance, round } = await host();
    const msg = assistantMessage(usage(5, 6, 7, 8)); // Σ 26
    emit(round, turnEnd(msg), messageEnd(msg));
    expect(instance.counters().tokens).toBe(26);
  });

  it("optional cacheWrite1h and reasoning fields do not perturb the totals", async () => {
    const { instance, round } = await host();
    emit(
      round,
      messageEnd(
        assistantMessage(
          usage(1, 2, 3, 4, { cacheWrite1h: 99, reasoning: 77 }),
        ),
      ),
    );
    expect(instance.counters().tokens).toBe(10);
  });
});

describe("PioSession — vars store", () => {
  it("set/get round-trip; absent name is undefined; list preserves insertion order without duplicates", async () => {
    const { instance } = await host();
    const store = instance.vars;
    store.set("a", 1);
    store.set("b", "two");
    store.set("c", [3, 4]);
    expect(store.get("a")).toBe(1);
    expect(store.get("b")).toBe("two");
    expect(store.get("c")).toEqual([3, 4]);
    expect(store.get("missing")).toBeUndefined();
    expect(store.list()).toEqual(["a", "b", "c"]);
    store.set("a", 99);
    expect(store.get("a")).toBe(99);
    expect(store.list()).toEqual(["a", "b", "c"]);
  });

  it("same-reference semantics: mutation through the retained reference is visible through the instance property", async () => {
    const { instance } = await host();
    const store = instance.vars;
    store.set("k", "x");
    expect(instance.vars.get("k")).toBe("x");
  });

  it("cross-instance invisibility: one instance's entries stay out of another's view", async () => {
    const a = await PioSession.create(CWD);
    const b = await PioSession.create(CWD);
    a.vars.set("shared", "mine");
    expect(b.vars.get("shared")).toBeUndefined();
    expect(b.vars.list()).toEqual([]);
    expect(a.vars.get("shared")).toBe("mine");
  });
});

describe("PioSession — phase markers", () => {
  it("renders the exact marker bytes with no trailing newline", () => {
    // Codepoints: U+2014 U+2014 SPACE label SPACE U+2014 U+2014.
    const rendered = renderPhaseMarker("write-goal");
    expect(rendered).toBe("\u2014\u2014 write-goal \u2014\u2014");
    expect(rendered.charCodeAt(0)).toBe(0x2014);
    expect(rendered.charCodeAt(1)).toBe(0x2014);
    expect(rendered.charCodeAt(2)).toBe(0x20);
    expect(rendered.charAt(13)).toBe(" ");
    expect(rendered.length).toBe(16);
    expect(rendered.endsWith("\n")).toBe(false);
  });

  it("stamps the marker as the leading line ahead of the instructions", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    await instance.execute_phase("build", { instructions: "Write the thing" });
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledWith(
      "\u2014\u2014 build \u2014\u2014\nWrite the thing",
    );
  });

  it("sends the bare marker line when instructions are absent", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    await instance.execute_phase("solo");
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledWith(
      "\u2014\u2014 solo \u2014\u2014",
    );
  });

  it("re-stamps the byte-identical marker line at every iteration", async () => {
    const { instance, round } = await host();
    const sent: string[] = [];
    round.session.prompt.mockImplementationOnce(async (text: string) => {
      sent.push(text);
      emit(round, ...quietRun());
    });
    round.session.prompt.mockImplementationOnce(async (text: string) => {
      sent.push(text);
      emit(round, ...quietRun());
    });
    let calls = 0;
    await instance.execute_phase("again", {
      loop: async () => {
        calls += 1;
        return calls === 2 ? "stop" : undefined;
      },
    });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe("\u2014\u2014 again \u2014\u2014");
    expect(sent[1]).toBe(sent[0]);
  });
});

describe("PioSession — execute_phase budgets", () => {
  it("runs exactly once by default and resolves done", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("default-phase");
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("floor forces further runs past an early stop", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun(), quietRun());
    let hookCalls = 0;
    const result = await instance.execute_phase("floored", {
      min: 3,
      loop: async () => {
        hookCalls += 1;
        return "stop";
      },
    });
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(3);
    expect(round.session.prompt).toHaveBeenCalledTimes(3);
    expect(hookCalls).toBe(3);
  });

  it("rejects with PhaseBudgetError at the ceiling when continuation is demanded", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    let hookCalls = 0;
    try {
      await instance.execute_phase("ceiling", {
        max: 2,
        loop: async () => {
          hookCalls += 1;
        },
      });
      throw new Error("expected a rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(PhaseBudgetError);
      expect(err).toBeInstanceOf(Error);
      if (err instanceof PhaseBudgetError) {
        expect(err.iterations).toBe(2);
        expect(err.name).toBe("PhaseBudgetError");
        expect(err.message).toBe(
          "Iteration budget exceeded after 2 iterations",
        );
      } else {
        throw err;
      }
    }
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expect(hookCalls).toBe(2);
  });

  it("settles cleanly before the ceiling", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("early", {
      max: 5,
      loop: async () => "stop",
    });
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(1);
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
  });

  it("counts the settling run between floor and ceiling", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    let calls = 0;
    const result = await instance.execute_phase("between", {
      min: 1,
      max: 4,
      loop: async () => {
        calls += 1;
        return calls === 1 ? undefined : "stop";
      },
    });
    expect(result.iterations).toBe(2);
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
  });

  it("fails loudly at the ceiling when the floor exceeds it", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    try {
      await instance.execute_phase("contradiction", { min: 2, max: 1 });
      throw new Error("expected a rejection");
    } catch (err) {
      if (err instanceof PhaseBudgetError) {
        expect(err.iterations).toBe(1);
      } else {
        throw err;
      }
    }
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
  });

  it("propagates a rejecting hook unwrapped", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const sentinel = new Error("hook-failed");
    await expect(
      instance.execute_phase("bad-hook", {
        loop: async () => {
          throw sentinel;
        },
      }),
    ).rejects.toBe(sentinel);
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
  });

  it("propagates a rejecting prompt unwrapped", async () => {
    const { instance, round } = await host();
    const sentinel = new Error("prompt-failed");
    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, ...quietRun());
      throw sentinel;
    });
    await expect(instance.execute_phase("bad-prompt")).rejects.toBe(sentinel);
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
  });
});

describe("PioSession — hook context", () => {
  it("interleaves hook calls strictly between prompt resolutions with parity", async () => {
    const { instance, round } = await host();
    const log: string[] = [];
    let pass = 0;
    round.session.prompt.mockImplementationOnce(async () => {
      pass += 1;
      emit(round, ...quietRun());
      log.push(`p${pass}`);
    });
    round.session.prompt.mockImplementationOnce(async () => {
      pass += 1;
      emit(round, ...quietRun());
      log.push(`p${pass}`);
    });
    let hookCall = 0;
    await instance.execute_phase("interleave", {
      loop: async () => {
        hookCall += 1;
        log.push(`h${hookCall}`);
        return hookCall === 2 ? "stop" : undefined;
      },
    });
    expect(log).toEqual(["p1", "h1", "p2", "h2"]);
    expect(round.session.prompt).toHaveBeenCalledTimes(hookCall);
  });

  it("shows cumulative counters beside the per-run window take", async () => {
    const { instance, round } = await host();
    // Hand-computed usage sums: run 1 Σ10 (4+3+2+1), run 2 Σ7 (3+2+1+1).
    scriptRuns(
      round,
      [
        agentStart(),
        start("r1a", "write", { path: "/r1/a.md" }),
        end("r1a", "write", false),
        start("r1b", "edit", { path: "/r1/b.md" }),
        end("r1b", "edit", false),
        messageEnd(assistantMessage(usage(4, 3, 2, 1))),
        agentEnd([], false),
      ],
      [
        agentStart(),
        start("r2a", "write", { path: "/r2/c.md" }),
        end("r2a", "write", false),
        messageEnd(assistantMessage(usage(3, 2, 1, 1))),
        agentEnd([], false),
      ],
    );
    const seen: Array<{
      countersFilesWritten: number;
      filesWritten: string[];
      tokens: number;
    }> = [];
    let n = 0;
    await instance.execute_phase("divergence", {
      loop: async (ctx) => {
        n += 1;
        seen.push({
          countersFilesWritten: ctx.counters.filesWritten,
          filesWritten: [...ctx.filesWritten],
          tokens: ctx.counters.tokens,
        });
        return n === 2 ? "stop" : undefined;
      },
    });
    expect(seen).toEqual([
      {
        countersFilesWritten: 2,
        filesWritten: ["/r1/a.md", "/r1/b.md"],
        tokens: 10,
      },
      {
        countersFilesWritten: 3,
        filesWritten: ["/r2/c.md"],
        tokens: 17,
      },
    ]);
  });

  it("hands the hook the variable store by reference identity", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    let n = 0;
    await instance.execute_phase("vars-id", {
      loop: async (ctx) => {
        n += 1;
        expect(ctx.vars).toBe(instance.vars);
        return n === 2 ? "stop" : undefined;
      },
    });
    expect(n).toBe(2);
  });

  it("materializes a fresh counter snapshot per invocation with exactly the three keys", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    const contexts: IterationCtx[] = [];
    let n = 0;
    await instance.execute_phase("ctx-shape", {
      loop: async (ctx) => {
        n += 1;
        contexts.push(ctx);
        return n === 2 ? "stop" : undefined;
      },
    });
    expect(contexts[0].counters).not.toBe(contexts[1].counters);
    expect(Object.keys(contexts[0]).sort()).toEqual([
      "counters",
      "filesWritten",
      "vars",
    ]);
    expect(Object.keys(contexts[1]).sort()).toEqual([
      "counters",
      "filesWritten",
      "vars",
    ]);
  });
});

describe("PioSession — run messages", () => {
  it("concatenates settled-end payloads across runs in event order", async () => {
    const { instance, round } = await host();
    const m1 = { id: "m1" };
    const m2 = { id: "m2" };
    const m3 = { id: "m3" };
    scriptRuns(
      round,
      [agentStart(), agentEnd([m1, m2], false)],
      [agentStart(), agentEnd([m3], false)],
    );
    let n = 0;
    const result = await instance.execute_phase("concat", {
      loop: async () => {
        n += 1;
        return n === 2 ? "stop" : undefined;
      },
    });
    expect(result.messages).toEqual([m1, m2, m3]);
    expect(result.iterations).toBe(2);
  });

  it("counts one retry-bearing span as a single run with both payloads", async () => {
    const { instance, round } = await host();
    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, agentStart());
      emit(round, agentEnd(["a"], true));
      emit(round, agentEnd(["b"], false));
    });
    const result = await instance.execute_phase("retry-span");
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(result.iterations).toBe(1);
    expect(result.messages).toEqual(["a", "b"]);
  });

  it("yields an empty message list for an empty run", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("empty-run");
    expect(result.messages).toEqual([]);
  });
});

describe("PioSession — read/reset contract", () => {
  it("keeps the window content-stable across repeated reads within a pass", async () => {
    const { instance, round } = await host();
    scriptRuns(round, [
      agentStart(),
      start("w1", "write", { path: "/r1/a.md" }),
      end("w1", "write", false),
      start("w2", "edit", { path: "/r1/b.md" }),
      end("w2", "edit", false),
      agentEnd([], false),
    ]);
    const reads: string[][] = [];
    await instance.execute_phase("stable-window", {
      loop: async (ctx) => {
        reads.push([...ctx.filesWritten]);
        reads.push([...instance.getFilesWrittenDelta()]);
        reads.push([...instance.getFilesWrittenDelta()]);
        return "stop";
      },
    });
    expect(reads).toEqual([
      ["/r1/a.md", "/r1/b.md"],
      ["/r1/a.md", "/r1/b.md"],
      ["/r1/a.md", "/r1/b.md"],
    ]);
  });

  it("advances the baseline on reset while the cumulative count survives", async () => {
    const { instance, round } = await host();
    emit(
      round,
      agentStart(),
      start("w1", "write", { path: "/r1/a.md" }),
      end("w1", "write", false),
      start("w2", "edit", { path: "/r1/b.md" }),
      end("w2", "edit", false),
      agentEnd([], false),
    );
    expect(instance.getFilesWrittenDelta()).toEqual(["/r1/a.md", "/r1/b.md"]);
    expect(instance.counters().filesWritten).toBe(2);
    instance.resetFilesWrittenDelta();
    expect(instance.getFilesWrittenDelta()).toEqual([]);
    expect(instance.counters().filesWritten).toBe(2);
  });

  it("accumulates payloads across passes and closes the window at closeout", async () => {
    const { instance, round } = await host();
    const m1 = { id: "m1" };
    const m2 = { id: "m2" };
    const m3 = { id: "m3" };
    scriptRuns(
      round,
      [agentStart(), agentEnd([m1], false)],
      [agentStart(), agentEnd([m2], false)],
      [agentStart(), agentEnd([m3], false)],
    );
    const observed: unknown[][] = [];
    const result = await instance.execute_phase("accumulate", {
      loop: async () => {
        const firstRead = instance.getRunMessages();
        const secondRead = instance.getRunMessages();
        expect(firstRead).toEqual(secondRead);
        observed.push([...firstRead]);
        return observed.length === 3 ? "stop" : undefined;
      },
    });
    expect(observed).toEqual([[m1], [m1, m2], [m1, m2, m3]]);
    expect(result.messages).toEqual([m1, m2, m3]);
    expect(instance.getRunMessages()).toEqual([]);
  });
});

describe("PioSession — failure-exit isolation", () => {
  it("closes the message window at a budget breach so the next phase starts clean", async () => {
    const { instance, round } = await host();
    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, agentStart(), agentEnd(["a1", "a2"], false));
    });
    await expect(
      instance.execute_phase("dead", {
        max: 1,
        loop: async () => undefined,
      }),
    ).rejects.toThrow(PhaseBudgetError);

    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, agentStart(), agentEnd(["b1"], false));
    });
    const second = await instance.execute_phase("next");
    expect(second.messages).toEqual(["b1"]);
  });

  it("closes the delta window at a rejected prompt so the next phase sees an empty window", async () => {
    const { instance, round } = await host();
    const sentinel = new Error("phase-a-died");
    round.session.prompt.mockImplementationOnce(async () => {
      emit(
        round,
        agentStart(),
        start("d1", "write", { path: "/dead/a.md" }),
        end("d1", "write", false),
      );
      throw sentinel;
    });
    await expect(instance.execute_phase("dead-write")).rejects.toBe(sentinel);

    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, ...quietRun());
    });
    let first: IterationCtx | undefined;
    await instance.execute_phase("after", {
      loop: async (ctx) => {
        first = ctx;
        return "stop";
      },
    });
    expect(first?.filesWritten).toEqual([]);
    expect(first?.counters.filesWritten).toBe(1);
  });
});

describe("PioSession — phase result shape", () => {
  it("returns exactly the six settled keys with the final snapshot values", async () => {
    const { instance, round } = await host();
    // Hand-computed: usage Σ10 (1+2+3+4), one committed write.
    scriptRuns(round, [
      agentStart(),
      start("s1", "write", { path: "/s/x.md" }),
      end("s1", "write", false),
      messageEnd(assistantMessage(usage(1, 2, 3, 4))),
      agentEnd([], false),
    ]);
    const result: PhaseResult = await instance.execute_phase("structure", {
      loop: async () => "stop",
    });
    expect(Object.keys(result).sort()).toEqual([
      "counters",
      "done",
      "iterations",
      "messages",
      "tokens",
      "varsDelta",
    ]);
    expect(result.done).toBe(true);
    expect(result.varsDelta).toEqual({});
    expect(result.tokens).toBe(result.counters.tokens);
    expect(result.counters).toEqual({
      filesWritten: 1,
      askUserCalls: 0,
      toolUses: { write: 1 },
      tokens: 10,
    });
    expect(result.counters).toEqual(instance.counters());
  });

  it("exposes no output-validation surface yet", async () => {
    const { instance } = await host();
    expect("validateOutputs" in instance).toBe(false);
  });
});
