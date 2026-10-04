// Hermetic unit suite for the generalized session-construction seam
// (pio/src/session.ts). Every SDK symbol behind createPioSession is a pure
// fake: the vi.mock factory references ONLY hoisted bindings and never pulls
// in the original module, so the real @earendil-works/pi-coding-agent graph
// is never evaluated. No filesystem, network, env, or process-stream
// assumptions. Each construction mints a fresh fake session behind a fresh
// fake runtime so exactly-once attach and per-instance isolation are directly
// observable. Synthetic payloads reach the seams through two channels:
// session listener events via the single documented cast seam asEvent, and
// tool-call events via the widened structural fake typing below (plain
// literals, cast-free). asEvent remains the sole `as` in this file.
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  AgentSessionEvent,
  AgentSessionEventListener,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type {
  CreatePioSessionOptions,
  GuardHandler,
  GuardInstallOptions,
} from "./session.ts";
import { createPioSession, EXECUTION_STATE_STAMP } from "./session.ts";

// Single documented cast seam for synthetic event payloads.
const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

const CWD = "/work/dir";
const SESSIONS_ROOT = "/store/sessions";

type ManagerFake = { getCwd: () => string };

interface RuntimeOpts {
  cwd: string;
  agentDir: string;
  sessionManager: ManagerFake;
}

interface FactoryInput {
  cwd: string;
  agentDir: string;
  sessionManager: ManagerFake;
  sessionStartEvent: unknown;
}

interface FromServicesOptions {
  services: unknown;
  sessionManager: ManagerFake;
  sessionStartEvent: unknown;
  customTools?: unknown;
}

interface Round {
  session: { subscribe: ReturnType<typeof vi.fn> };
  runtime: object;
}

/** Widened structural fake of the SDK tool_call event: deliberately wider
 * than the discriminated union so plain literal payloads typecheck with zero
 * casts (this keeps asEvent the sole cast seam in this file). */
interface FakeToolCallEvent {
  type: "tool_call";
  toolCallId: string;
  toolName: string;
  input: unknown;
}

type Verdict = { block: true; reason: string };
type RecordedHandler = (
  event: FakeToolCallEvent,
) => Verdict | undefined | Promise<Verdict | undefined>;

interface FakeRegistration {
  event: string;
  handler: RecordedHandler;
}

interface FakePi {
  registrations: FakeRegistration[];
  on: (event: string, handler: RecordedHandler) => void;
}

/** Structural fake of the services options shape (erased harness typing is
 * sanctioned): deliberately wider/narrower than the SDK type. */
interface ServicesOpts {
  cwd: string;
  agentDir?: string;
  resourceLoaderOptions?: {
    extensionFactories?: ReadonlyArray<(pi: FakePi) => void | Promise<void>>;
  };
}

const harness = vi.hoisted(() => {
  const managerCwd = "/managed/cwd";
  const agentDir = "/agent/dir";
  const startEvent = "SYNTHETIC-START-EVENT";

  const state: {
    rounds: Round[];
    runtimeArgs: RuntimeOpts[];
    fromServicesArgs: FromServicesOptions[];
    servicesArgs: ServicesOpts[];
    fakePis: FakePi[];
    storedFactories: ((input: FactoryInput) => Promise<unknown>)[];
  } = {
    rounds: [],
    runtimeArgs: [],
    fromServicesArgs: [],
    servicesArgs: [],
    fakePis: [],
    storedFactories: [],
  };

  const fakeManager: ManagerFake = { getCwd: () => managerCwd };
  const fakeServices = { marker: "fake-services" };

  const getAgentDir = vi.fn(() => agentDir);
  const SessionManager = {
    create: vi.fn(() => fakeManager),
  };
  const createAgentSessionServices = vi.fn(async (options: ServicesOpts) => {
    state.servicesArgs.push(options);
    // Drive each captured inline factory with a fresh fake extension api so
    // per-round registrations are observable from the suites.
    for (const factory of options.resourceLoaderOptions?.extensionFactories ??
      []) {
      const registrations: FakeRegistration[] = [];
      const pi: FakePi = {
        registrations,
        on: (event, handler) => {
          registrations.push({ event, handler });
        },
      };
      state.fakePis.push(pi);
      await factory(pi);
    }
    return fakeServices;
  });
  const createAgentSessionFromServices = vi.fn(
    async (options: FromServicesOptions) => {
      state.fromServicesArgs.push(options);
      const round = state.rounds[state.rounds.length - 1];
      return {
        session: round ? round.session : undefined,
        extensionsResult: {},
      };
    },
  );
  const createAgentSessionRuntime = vi.fn(
    async (
      factory: (input: FactoryInput) => Promise<unknown>,
      runtimeOpts: RuntimeOpts,
    ) => {
      state.runtimeArgs.push(runtimeOpts);
      state.storedFactories.push(factory);
      const subscribe = vi.fn();
      const session: Round["session"] = { subscribe };
      const runtime: Round["runtime"] = { session };
      state.rounds.push({ session, runtime });
      // Drive the stored factory with test-controlled inputs so the mirrored
      // closure's forwarding is observable from the from-services seam.
      await factory({
        cwd: "/factory/cwd",
        agentDir: "/factory/agentDir",
        sessionManager: fakeManager,
        sessionStartEvent: startEvent,
      });
      return runtime;
    },
  );

  /** Scripted closure re-run: mint a fresh fake session handle, push a new
   * round, drive the last-stored factory with the standard synthetic inputs
   * (same values the initial construction uses). Mirrors the production
   * /new re-run flow over the stored factory. */
  const rerunStoredFactory = async (): Promise<Round> => {
    const factory = state.storedFactories[state.storedFactories.length - 1];
    if (!factory) throw new Error("expected a stored runtime factory");
    const subscribe = vi.fn();
    const session: Round["session"] = { subscribe };
    const runtime: Round["runtime"] = { session };
    state.rounds.push({ session, runtime });
    await factory({
      cwd: "/factory/cwd",
      agentDir: "/factory/agentDir",
      sessionManager: fakeManager,
      sessionStartEvent: startEvent,
    });
    return { session, runtime };
  };

  const reset = () => {
    state.rounds = [];
    state.runtimeArgs = [];
    state.fromServicesArgs = [];
    state.servicesArgs = [];
    state.fakePis = [];
    state.storedFactories = [];
    getAgentDir.mockClear();
    SessionManager.create.mockClear();
    createAgentSessionServices.mockClear();
    createAgentSessionFromServices.mockClear();
    createAgentSessionRuntime.mockClear();
  };

  return {
    state,
    fakeManager,
    fakeServices,
    getAgentDir,
    SessionManager,
    createAgentSessionServices,
    createAgentSessionFromServices,
    createAgentSessionRuntime,
    rerunStoredFactory,
    reset,
    managerCwd,
    agentDir,
    startEvent,
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

function lastRound() {
  const round = harness.state.rounds[harness.state.rounds.length - 1];
  if (!round) throw new Error("expected a construction round");
  return round;
}

function lastFromServices() {
  const o =
    harness.state.fromServicesArgs[harness.state.fromServicesArgs.length - 1];
  if (!o) throw new Error("expected recorded from-services options");
  return o;
}

function lastRuntimeArgs() {
  const o = harness.state.runtimeArgs[harness.state.runtimeArgs.length - 1];
  if (!o) throw new Error("expected recorded runtime options");
  return o;
}

function lastServicesArgs() {
  const o = harness.state.servicesArgs[harness.state.servicesArgs.length - 1];
  if (!o) throw new Error("expected recorded services options");
  return o;
}

function lastFakePi() {
  const pi = harness.state.fakePis[harness.state.fakePis.length - 1];
  if (!pi) throw new Error("expected a driven fake extension api");
  return pi;
}

/** Read the stamp value off a handle by descriptor (cast-free discovery).
 * Mirrors the raw descriptor-read channel later discovery code uses. */
function stampValue(handle: object): unknown {
  return Object.getOwnPropertyDescriptor(handle, EXECUTION_STATE_STAMP)?.value;
}

describe("createPioSession — listener attach-once", () => {
  it("passes a listener: exactly one subscribe on the returned session, exact identity, listener observes emitted events", async () => {
    const received: AgentSessionEvent[] = [];
    const listener: AgentSessionEventListener = (e) => {
      received.push(e);
    };
    const runtime = await createPioSession(CWD, undefined, {
      sessionListener: listener,
    });
    const round = lastRound();
    expect(runtime).toBe(round.runtime);
    expect(round.session.subscribe).toHaveBeenCalledTimes(1);
    expect(round.session.subscribe).toHaveBeenCalledWith(listener);

    // Emit synthetic events through the attached listener and assert receipt.
    const attached = round.session.subscribe.mock.calls[0][0];
    const e1 = asEvent({ type: "agent_start" });
    const e2 = asEvent({ type: "queue_update", steering: ["s"], followUp: [] });
    attached(e1);
    attached(e2);
    expect(received).toHaveLength(2);
    expect(received[0]).toBe(e1);
    expect(received[1]).toBe(e2);
  });

  it("two consecutive constructions with distinct listeners attach distinctly (no shared state)", async () => {
    const l1: AgentSessionEventListener = () => {};
    const l2: AgentSessionEventListener = () => {};

    await createPioSession(CWD, undefined, { sessionListener: l1 });
    const r1 = lastRound();
    expect(r1.session.subscribe).toHaveBeenCalledTimes(1);
    expect(r1.session.subscribe).toHaveBeenCalledWith(l1);

    await createPioSession(CWD, undefined, { sessionListener: l2 });
    const r2 = lastRound();
    expect(r2.session.subscribe).toHaveBeenCalledTimes(1);
    expect(r2.session.subscribe).toHaveBeenCalledWith(l2);

    // Fresh session per construction — no process-global listener registry.
    expect(r1.session).not.toBe(r2.session);
    expect(r1.runtime).not.toBe(r2.runtime);
  });
});

describe("createPioSession — no-attach default", () => {
  it("no options at all: subscribe is never called", async () => {
    await createPioSession(CWD);
    const round = lastRound();
    expect(round.session.subscribe).not.toHaveBeenCalled();
  });

  it("options carrying only customTools: subscribe is never called", async () => {
    const tools: ToolDefinition[] = [];
    await createPioSession(CWD, undefined, { customTools: tools });
    const round = lastRound();
    expect(round.session.subscribe).not.toHaveBeenCalled();
  });
});

describe("createPioSession — customTools threading", () => {
  it("provided customTools arrives at from-services options by reference identity", async () => {
    const tools: ToolDefinition[] = [];
    await createPioSession(CWD, undefined, { customTools: tools });
    // Reference identity (toBe): a copy/clone of the array would fail this.
    expect(lastFromServices().customTools).toBe(tools);
  });

  it("absent options: recorded from-services options carry NO customTools key", async () => {
    await createPioSession(CWD);
    expect(Object.keys(lastFromServices())).not.toContain("customTools");
  });

  it("customTools-less options (listener only): recorded options carry NO customTools key", async () => {
    const listener: AgentSessionEventListener = () => {};
    const opts: CreatePioSessionOptions = { sessionListener: listener };
    await createPioSession(CWD, undefined, opts);
    expect(Object.keys(lastFromServices())).not.toContain("customTools");
  });
});

describe("createPioSession — mirrored-block forwarding intact", () => {
  it("forwards services, sessionManager, and sessionStartEvent verbatim to from-services", async () => {
    await createPioSession(CWD, undefined);
    const o = lastFromServices();
    expect(o.services).toBe(harness.fakeServices);
    expect(o.sessionManager).toBe(harness.fakeManager);
    expect(o.sessionStartEvent).toBe(harness.startEvent);
  });
});

describe("createPioSession — unchanged-path stability", () => {
  it("no sessions root: single-arg SessionManager.create and exact 3-field runtime options", async () => {
    await createPioSession(CWD);
    expect(harness.SessionManager.create).toHaveBeenCalledTimes(1);
    expect(harness.SessionManager.create).toHaveBeenLastCalledWith(CWD);
    expect(harness.SessionManager.create.mock.calls[0]).toHaveLength(1);

    const ro = lastRuntimeArgs();
    expect(Object.keys(ro).sort()).toEqual([
      "agentDir",
      "cwd",
      "sessionManager",
    ]);
    expect(ro.cwd).toBe(harness.managerCwd);
    expect(ro.agentDir).toBe(harness.agentDir);
    expect(ro.sessionManager).toBe(harness.fakeManager);
  });

  it("with a sessions root: SessionManager.create called with (cwd, join(root, 'top'))", async () => {
    await createPioSession(CWD, SESSIONS_ROOT);
    expect(harness.SessionManager.create).toHaveBeenLastCalledWith(
      CWD,
      path.join(SESSIONS_ROOT, "top"),
    );
  });

  it("resolved return value IS the constructed runtime by reference identity", async () => {
    const rt = await createPioSession(CWD, SESSIONS_ROOT);
    expect(rt).toBe(lastRound().runtime);
  });
});

describe("createPioSession — threaded guard install + runner semantics", () => {
  it("present guardInstall: services args carry resourceLoaderOptions with EXACTLY ONE bare factory entry and nothing else threaded", async () => {
    const install: GuardInstallOptions = { executionState: {}, handlers: [] };
    await createPioSession(CWD, undefined, { guardInstall: install });
    const args = lastServicesArgs();
    const rol = args.resourceLoaderOptions;
    expect(Object.keys(args).sort()).toEqual([
      "agentDir",
      "cwd",
      "resourceLoaderOptions",
    ]);
    expect(rol).toBeDefined();
    expect(Object.keys(rol ?? {}).sort()).toEqual(["extensionFactories"]);
    const factories = rol?.extensionFactories;
    expect(factories).toHaveLength(1);
    expect(typeof factories?.[0]).toBe("function");
  });

  it("driving the captured single factory registers EXACTLY ONE subscription, on tool_call and nothing else", async () => {
    await createPioSession(CWD, undefined, {
      guardInstall: { executionState: {}, handlers: [] },
    });
    const pi = lastFakePi();
    expect(pi.registrations).toHaveLength(1);
    expect(pi.registrations.map((r) => r.event)).toEqual(["tool_call"]);
  });

  it("first-refusal-wins ordering: a refused event settles on the first verdict BY IDENTITY and later handlers are never consulted", async () => {
    const first: Verdict = { block: true, reason: "first-refusal" };
    const h1 = vi.fn((_n: string, _i: unknown): Verdict | undefined => first);
    const h2 = vi.fn((_n: string, _i: unknown): Verdict | undefined => ({
      block: true,
      reason: "second-refusal",
    }));
    await createPioSession(CWD, undefined, {
      guardInstall: { executionState: {}, handlers: [h1, h2] },
    });
    const handler = lastFakePi().registrations[0].handler;
    const ev: FakeToolCallEvent = {
      type: "tool_call",
      toolCallId: "c-1",
      toolName: "write",
      input: { path: "/a.md" },
    };
    expect(await handler(ev)).toBe(first);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).not.toHaveBeenCalled();
  });

  it("first-allows, second-refuses: consultation continues in order and the second verdict resolves the event", async () => {
    const second: Verdict = { block: true, reason: "second-refusal" };
    const h1 = vi.fn((_n: string, _i: unknown): Verdict | undefined => {
      return undefined;
    });
    const h2 = vi.fn((_n: string, _i: unknown): Verdict | undefined => second);
    await createPioSession(CWD, undefined, {
      guardInstall: { executionState: {}, handlers: [h1, h2] },
    });
    const handler = lastFakePi().registrations[0].handler;
    const ev: FakeToolCallEvent = {
      type: "tool_call",
      toolCallId: "c-2",
      toolName: "edit",
      input: { path: "/b.md" },
    };
    expect(await handler(ev)).toBe(second);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it("round-trip: the resolved result IS the handler's verdict object by identity — no wrapper, keys untouched, terminate never set", async () => {
    const verdict: Verdict = { block: true, reason: "rt" };
    const h = vi.fn((_n: string, _i: unknown): Verdict | undefined => verdict);
    await createPioSession(CWD, undefined, {
      guardInstall: { executionState: {}, handlers: [h] },
    });
    const handler = lastFakePi().registrations[0].handler;
    const ev: FakeToolCallEvent = {
      type: "tool_call",
      toolCallId: "c-3",
      toolName: "write",
      input: { path: "/c.md" },
    };
    const result = await handler(ev);
    expect(result).toBe(verdict);
    expect(Object.keys(result ?? {}).sort()).toEqual(["block", "reason"]);
  });

  it("non-writer tool calls reach the handlers verbatim (toolName/input intact) and a refusal on them is honored identically", async () => {
    const verdict: Verdict = { block: true, reason: "bash-blocked" };
    const bashInput = { command: "ls -la" };
    const h = vi.fn((_n: string, _i: unknown): Verdict | undefined => verdict);
    await createPioSession(CWD, undefined, {
      guardInstall: { executionState: {}, handlers: [h] },
    });
    const handler = lastFakePi().registrations[0].handler;
    const ev: FakeToolCallEvent = {
      type: "tool_call",
      toolCallId: "b-1",
      toolName: "bash",
      input: bashInput,
    };
    expect(await handler(ev)).toBe(verdict);
    expect(h).toHaveBeenCalledWith("bash", bashInput);
    // Reference identity of the forwarded input: verbatim reference, not a copy.
    expect(h.mock.calls[0][1]).toBe(bashInput);
  });

  it("no-refusal fall-through: consultation ending WITHOUT any refusal resolves undefined — both the empty-handler-list and single-allowing-handler shapes", async () => {
    // Shape (i): an empty handler list leaves the runner loop no return value.
    await createPioSession(CWD, undefined, {
      guardInstall: { executionState: {}, handlers: [] },
    });
    const evEmpty: FakeToolCallEvent = {
      type: "tool_call",
      toolCallId: "u-1",
      toolName: "write",
      input: { path: "/u1.md" },
    };
    const firstHandler = lastFakePi().registrations[0].handler;
    expect(await firstHandler(evEmpty)).toBeUndefined();

    // Shape (ii): a single allowing handler returns undefined.
    const allowing = vi.fn(
      (_n: string, _i: unknown): Verdict | undefined => undefined,
    );
    await createPioSession(CWD, undefined, {
      guardInstall: { executionState: {}, handlers: [allowing] },
    });
    const evAllow: FakeToolCallEvent = {
      type: "tool_call",
      toolCallId: "u-2",
      toolName: "write",
      input: { path: "/u2.md" },
    };
    const secondHandler = lastFakePi().registrations[0].handler;
    expect(await secondHandler(evAllow)).toBeUndefined();
    expect(allowing).toHaveBeenCalledTimes(1);
  });

  it("fault-free interception: a THROWING handler escapes the runner verbatim (same instance, no containment layer swallows it)", async () => {
    const fault = new Error("handler fault");
    const h: GuardHandler = () => {
      throw fault;
    };
    await createPioSession(CWD, undefined, {
      guardInstall: { executionState: {}, handlers: [h] },
    });
    const handler = lastFakePi().registrations[0].handler;
    const ev: FakeToolCallEvent = {
      type: "tool_call",
      toolCallId: "c-4",
      toolName: "write",
      input: { path: "/d.md" },
    };
    let escaped: unknown;
    try {
      handler(ev);
    } catch (err) {
      escaped = err;
    }
    expect(escaped).toBe(fault);
  });
});

describe("createPioSession — per-construction guard-install isolation", () => {
  it("two sequential constructions stamp DISTINCT caller objects by identity and capture DISTINCT factory-element closures (no process-global registry)", async () => {
    const s1 = { sentinel: "S1" };
    const s2 = { sentinel: "S2" };
    const r1 = await createPioSession(CWD, undefined, {
      guardInstall: { executionState: s1, handlers: [] },
    });
    const firstArgs = harness.state.servicesArgs[0];
    const f1 = firstArgs?.resourceLoaderOptions?.extensionFactories?.[0];
    const r2 = await createPioSession(CWD, undefined, {
      guardInstall: { executionState: s2, handlers: [] },
    });
    const secondArgs = harness.state.servicesArgs[1];
    const f2 = secondArgs?.resourceLoaderOptions?.extensionFactories?.[0];

    expect(stampValue(r1.session)).toBe(s1);
    expect(stampValue(r2.session)).toBe(s2);
    expect(f1).toBeDefined();
    expect(f2).toBeDefined();
    expect(f1).not.toBe(f2);
  });
});

describe("createPioSession — additive doctrine (absent guardInstall leaves no threading trace)", () => {
  it("no options at all: recorded services args carry NO resourceLoaderOptions key", async () => {
    await createPioSession(CWD);
    expect(Object.keys(lastServicesArgs())).not.toContain(
      "resourceLoaderOptions",
    );
  });

  it("listener-only options: recorded services args carry NO resourceLoaderOptions key", async () => {
    await createPioSession(CWD, undefined, {
      sessionListener: () => {},
    });
    expect(Object.keys(lastServicesArgs())).not.toContain(
      "resourceLoaderOptions",
    );
  });

  it("customTools-only options: recorded services args carry NO resourceLoaderOptions key", async () => {
    await createPioSession(CWD, undefined, { customTools: [] });
    expect(Object.keys(lastServicesArgs())).not.toContain(
      "resourceLoaderOptions",
    );
  });

  it("absent guardInstall: created handle carries NO stamp descriptor and no own symbol property of this seam's making", async () => {
    await createPioSession(CWD);
    const handle = lastRound().session;
    expect(
      Object.getOwnPropertyDescriptor(handle, EXECUTION_STATE_STAMP),
    ).toBeUndefined();
    expect(Object.getOwnPropertySymbols(handle)).toHaveLength(0);
  });
});

describe("createPioSession — symbol stamp + scripted closure re-run", () => {
  it("initial creation: stamp descriptor exists on the created handle — value by identity, non-enumerable, configurable (re-stampability pin)", async () => {
    const stateObj = { sentinel: "S" };
    const runtime = await createPioSession(CWD, undefined, {
      guardInstall: { executionState: stateObj, handlers: [] },
    });
    const d = Object.getOwnPropertyDescriptor(
      runtime.session,
      EXECUTION_STATE_STAMP,
    );
    expect(d).toBeDefined();
    expect(d?.value).toBe(stateObj);
    expect(d?.enumerable).toBe(false);
    expect(d?.configurable).toBe(true);
  });

  it("scripted closure re-run: a FRESH handle results, re-stamped with the SAME captured object (both handles stamp identically), and the single-factory shape threads again over a fresh registration", async () => {
    const stateObj = { sentinel: "S" };
    const r1 = await createPioSession(CWD, undefined, {
      guardInstall: { executionState: stateObj, handlers: [] },
    });
    const round2 = await harness.rerunStoredFactory();
    expect(round2.session).not.toBe(r1.session);
    // Re-stamp, don't re-mint: both handles carry the same captured object.
    expect(stampValue(round2.session)).toBe(stateObj);
    expect(stampValue(r1.session)).toBe(stateObj);
    const d2 = Object.getOwnPropertyDescriptor(
      round2.session,
      EXECUTION_STATE_STAMP,
    );
    expect(d2?.configurable).toBe(true);
    // The re-run re-threads the same single-factory shape into a fresh fake
    // extension api with a fresh tool_call registration.
    const pis = harness.state.fakePis;
    expect(pis).toHaveLength(2);
    expect(pis[1]).not.toBe(pis[0]);
    const reArgs = lastServicesArgs();
    expect(Object.keys(reArgs).sort()).toEqual([
      "agentDir",
      "cwd",
      "resourceLoaderOptions",
    ]);
    expect(Object.keys(reArgs.resourceLoaderOptions ?? {}).sort()).toEqual([
      "extensionFactories",
    ]);
    expect(
      (reArgs.resourceLoaderOptions?.extensionFactories ?? []).length,
    ).toBe(1);
    expect(lastFakePi().registrations.map((r) => r.event)).toEqual([
      "tool_call",
    ]);
  });
});

describe("mechanical source guards — session.ts leaf seam", () => {
  const SESSION_SOURCE = readFileSync(
    new URL("./session.ts", import.meta.url),
    "utf8",
  );
  const SDK_SPECIFIER = ["@earendil-works", "pi-coding-agent"].join("/");

  /** Compact comment/literal-aware scan (house precedent: prose comments
   * elide and are exempt; literal payloads are recorded, not elided).
   * Soundness rests on the pinned zero-slash residue rule below — session.ts
   * ships no regex literals, so no expression-start heuristic is needed. */
  function partitionForScan(source: string): {
    residue: string;
    payloads: string[];
  } {
    const payloads: string[] = [];
    let residue = "";
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      const next = source[i + 1];
      if (ch === "/" && next === "/") {
        const end = source.indexOf("\n", i);
        i = end === -1 ? source.length : end;
        continue;
      }
      if (ch === "/" && next === "*") {
        const end = source.indexOf("*/", i + 2);
        i = end === -1 ? source.length : end + 2;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") {
        const start = i + 1;
        i += 1;
        while (i < source.length && source[i] !== ch) {
          i += source[i] === "\\" ? 2 : 1;
        }
        const end = Math.min(i, source.length);
        payloads.push(source.slice(start, end));
        residue += ch + "P" + ch;
        i = end + 1;
        continue;
      }
      residue += ch;
      i += 1;
    }
    return { residue, payloads };
  }

  const CAST_TOKEN = ["a", "s"].join("");
  const RAW_GLYPH = String.fromCharCode(0x2014);

  it("LEAF POSITION: the import-clause set is UNCHANGED — exactly three clauses over two unique specifiers, no capability or state specifier (statement-wise)", () => {
    const clauseCount = (SESSION_SOURCE.match(/^import\b/gm) ?? []).length;
    expect(clauseCount).toBe(3);
    const specifiers = [...SESSION_SOURCE.matchAll(/\bfrom\s+"([^"]+)"/g)]
      .map((match) => match[1])
      .sort();
    expect(specifiers).toEqual([SDK_SPECIFIER, SDK_SPECIFIER, "node:path"]);
    expect(new Set(specifiers).size).toBe(2);
    expect(specifiers.some((s) => s.includes("./capability"))).toBe(false);
    expect(specifiers.some((s) => s.includes("session-execution-state"))).toBe(
      false,
    );
  });

  it("EXPORT SURFACE GROWTH: declarative exports are EXACTLY the baseline two names plus the three pinned seam names", () => {
    const declared = [
      ...SESSION_SOURCE.matchAll(
        /^export\s+(?:async\s+)?(?:type|interface|class|function|const|enum)\s+([A-Za-z_$][\w$]*)/gm,
      ),
    ].map((match) => match[1]);
    expect(declared.sort()).toEqual([
      "CreatePioSessionOptions",
      "EXECUTION_STATE_STAMP",
      "GuardHandler",
      "GuardInstallOptions",
      "createPioSession",
    ]);
  });

  it("scoped purity residue: ZERO `as` casts and ZERO explicit `any` over the comment/literal-stripped residue of session.ts (whole-file superset of the touched regions) — and NO slash survives the elision (the soundness pin keeping this scan valid)", () => {
    const { residue } = partitionForScan(SESSION_SOURCE);
    expect(residue.match(new RegExp(`\\b${CAST_TOKEN}\\b`, "g"))).toBeNull();
    expect(residue.match(/\bany\b/g)).toBeNull();
    expect(residue.includes("/")).toBe(false);
  });

  it("glyph discipline: NO raw U+2014 in any string/template literal payload of session.ts (compact comment-eliding scan; prose comments exempt; needle assembled at runtime)", () => {
    const { payloads } = partitionForScan(SESSION_SOURCE);
    for (const payload of payloads) {
      expect(payload.includes(RAW_GLYPH)).toBe(false);
    }
  });

  it("dev-process-marker scan over the FINAL session.ts bytes: zero step-attribution / planning-meta tokens", () => {
    const markers: string[] = [
      "\\bstep\\s+\\d",
      "\\bS0\\d\\b",
      "\\bD#\\d",
      "\\u00a7",
      "(?:TASK|PLAN)\\.md",
      "\\bmigrat\\w*",
      "\\brelocat\\w*",
      "\\bretir\\w*",
      "\\brenam\\w*",
      "\\bskeleton\\b",
      "\\b20\\d{2}-\\d{2}-\\d{2}\\b",
    ];
    for (const pattern of markers) {
      expect(
        SESSION_SOURCE.match(new RegExp(pattern, "gi")),
        `marker slipped through: ${pattern}`,
      ).toBeNull();
    }
  });
});
