// Hermetic unit suite for the generalized session-construction seam
// (pio/src/session.ts). Every SDK symbol behind createProbeSession is a pure
// fake: the vi.mock factory references ONLY hoisted bindings and never pulls
// in the original module, so the real @earendil-works/pi-coding-agent graph
// is never evaluated. No filesystem, network, env, or process-stream
// assumptions. Each construction mints a fresh fake session behind a fresh
// fake runtime so exactly-once attach and per-instance isolation are directly
// observable. Synthetic event payloads flow through the single documented
// cast seam asEvent — the sole `as` in this file.
import path from "node:path";
import type {
  AgentSessionEvent,
  AgentSessionEventListener,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { CreateProbeSessionOptions } from "./session.ts";
import { createProbeSession } from "./session.ts";

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

const harness = vi.hoisted(() => {
  const managerCwd = "/managed/cwd";
  const agentDir = "/agent/dir";
  const startEvent = "SYNTHETIC-START-EVENT";

  const state: {
    rounds: Round[];
    runtimeArgs: RuntimeOpts[];
    fromServicesArgs: FromServicesOptions[];
  } = {
    rounds: [],
    runtimeArgs: [],
    fromServicesArgs: [],
  };

  const fakeManager: ManagerFake = { getCwd: () => managerCwd };
  const fakeServices = { marker: "fake-services" };

  const getAgentDir = vi.fn(() => agentDir);
  const SessionManager = {
    create: vi.fn(() => fakeManager),
  };
  const createAgentSessionServices = vi.fn(async () => fakeServices);
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

  const reset = () => {
    state.rounds = [];
    state.runtimeArgs = [];
    state.fromServicesArgs = [];
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

describe("createProbeSession — listener attach-once", () => {
  it("passes a listener: exactly one subscribe on the returned session, exact identity, listener observes emitted events", async () => {
    const received: AgentSessionEvent[] = [];
    const listener: AgentSessionEventListener = (e) => {
      received.push(e);
    };
    const runtime = await createProbeSession(CWD, undefined, {
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

    await createProbeSession(CWD, undefined, { sessionListener: l1 });
    const r1 = lastRound();
    expect(r1.session.subscribe).toHaveBeenCalledTimes(1);
    expect(r1.session.subscribe).toHaveBeenCalledWith(l1);

    await createProbeSession(CWD, undefined, { sessionListener: l2 });
    const r2 = lastRound();
    expect(r2.session.subscribe).toHaveBeenCalledTimes(1);
    expect(r2.session.subscribe).toHaveBeenCalledWith(l2);

    // Fresh session per construction — no process-global listener registry.
    expect(r1.session).not.toBe(r2.session);
    expect(r1.runtime).not.toBe(r2.runtime);
  });
});

describe("createProbeSession — no-attach default", () => {
  it("no options at all: subscribe is never called", async () => {
    await createProbeSession(CWD);
    const round = lastRound();
    expect(round.session.subscribe).not.toHaveBeenCalled();
  });

  it("options carrying only customTools: subscribe is never called", async () => {
    const tools: ToolDefinition[] = [];
    await createProbeSession(CWD, undefined, { customTools: tools });
    const round = lastRound();
    expect(round.session.subscribe).not.toHaveBeenCalled();
  });
});

describe("createProbeSession — customTools threading", () => {
  it("provided customTools arrives at from-services options by reference identity", async () => {
    const tools: ToolDefinition[] = [];
    await createProbeSession(CWD, undefined, { customTools: tools });
    // Reference identity (toBe): a copy/clone of the array would fail this.
    expect(lastFromServices().customTools).toBe(tools);
  });

  it("absent options: recorded from-services options carry NO customTools key", async () => {
    await createProbeSession(CWD);
    expect(Object.keys(lastFromServices())).not.toContain("customTools");
  });

  it("customTools-less options (listener only): recorded options carry NO customTools key", async () => {
    const listener: AgentSessionEventListener = () => {};
    const opts: CreateProbeSessionOptions = { sessionListener: listener };
    await createProbeSession(CWD, undefined, opts);
    expect(Object.keys(lastFromServices())).not.toContain("customTools");
  });
});

describe("createProbeSession — mirrored-block forwarding intact", () => {
  it("forwards services, sessionManager, and sessionStartEvent verbatim to from-services", async () => {
    await createProbeSession(CWD, undefined);
    const o = lastFromServices();
    expect(o.services).toBe(harness.fakeServices);
    expect(o.sessionManager).toBe(harness.fakeManager);
    expect(o.sessionStartEvent).toBe(harness.startEvent);
  });
});

describe("createProbeSession — unchanged-path stability", () => {
  it("no sessions root: single-arg SessionManager.create and exact 3-field runtime options", async () => {
    await createProbeSession(CWD);
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
    await createProbeSession(CWD, SESSIONS_ROOT);
    expect(harness.SessionManager.create).toHaveBeenLastCalledWith(
      CWD,
      path.join(SESSIONS_ROOT, "top"),
    );
  });

  it("resolved return value IS the constructed runtime by reference identity", async () => {
    const rt = await createProbeSession(CWD, SESSIONS_ROOT);
    expect(rt).toBe(lastRound().runtime);
  });
});
