// Hermetic unit suite for the capability session host (pio-session.ts).
// Every SDK value symbol reachable through the session-construction seam is a
// pure fake: the vi.mock factory references ONLY hoisted bindings and never
// pulls in the original module, so the real @earendil-works/pi-coding-agent
// graph is never evaluated. No filesystem, network, env, or process-stream
// assumptions. Each construction mints a fresh fake session behind a fresh
// fake runtime, so subscription counts and per-instance isolation are
// directly observable. Synthetic events flow through the single documented
// cast seam asEvent — the sole `as` in this file.
import path from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { PioSession } from "./pio-session.ts";

// Single documented cast seam for synthetic event payloads.
const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

const CWD = "/work/dir";
const SESSIONS_ROOT = "/store/sessions";

type Listener = (event: AgentSessionEvent) => void;

interface FakeSession {
  subscribe: ReturnType<typeof vi.fn>;
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
    const session: FakeSession = {
      subscribe,
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

function agentEnd() {
  return { type: "agent_end", messages: [], willRetry: false };
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
    instance.takeFilesWrittenDelta();
    const store = instance.vars;
    store.set("a", 1);
    store.get("a");
    store.list();
    instance.counters();
    instance.takeFilesWrittenDelta();

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
    expect(b.takeFilesWrittenDelta()).toEqual([]);
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
    expect(instance.takeFilesWrittenDelta()).toEqual([]);
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
    expect(instance.takeFilesWrittenDelta()).toEqual(["/out/a.md"]);
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
    expect(instance.takeFilesWrittenDelta()).toEqual([]);
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
    const delta = instance.takeFilesWrittenDelta();
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
      expect(instance.takeFilesWrittenDelta()).toEqual([]);
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
    expect(instance.takeFilesWrittenDelta()).toEqual(["/pa.md"]);
  });

  it("a stale write start is drained at agent_start and never leaks into a later run", async () => {
    const { instance, round } = await host();
    emit(round, start("s1", "write", { path: "/stale.md" }));
    expect(instance.takeFilesWrittenDelta()).toEqual([]);
    emit(round, agentStart());
    expect(instance.takeFilesWrittenDelta()).toEqual([]);
    emit(
      round,
      start("s2", "write", { path: "/fresh.md" }),
      end("s2", "write", false),
    );
    expect(instance.takeFilesWrittenDelta()).toEqual(["/fresh.md"]);
    expect(instance.counters().filesWritten).toBe(1);
  });

  it("per-run deltas reset between runs while the cumulative count stays stable", async () => {
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
    expect(instance.takeFilesWrittenDelta()).toEqual([
      "/run1/a.md",
      "/run1/b.md",
    ]);
    expect(instance.counters().filesWritten).toBe(2);

    emit(
      round,
      agentStart(),
      start("r2a", "write", { path: "/run2/c.md" }),
      end("r2a", "write", false),
      agentEnd(),
    );
    expect(instance.takeFilesWrittenDelta()).toEqual(["/run2/c.md"]);
    expect(instance.counters().filesWritten).toBe(3);

    expect(instance.takeFilesWrittenDelta()).toEqual([]);
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
