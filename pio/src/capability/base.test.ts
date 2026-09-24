// Hermetic unit suite for the capability base (base.ts).
// Every SDK value symbol reachable through the session-construction seam is
// a pure fake: the vi.mock factory references ONLY hoisted bindings and
// never pulls in the original module, so the real
// @earendil-works/pi-coding-agent graph is never evaluated. No filesystem,
// network, env, or process-stream assumptions — wiring rows use value-slot
// contracts exclusively. Each construction mints a fresh fake session
// behind a fresh fake runtime, so prompt arguments and per-instance state
// are directly observable. Synthetic events flow through the single
// documented cast seam asEvent — the sole `as` in this file.
//
// Live-harness rows drive the real phase engine over scripted fake prompts:
// one queued resolution stands for one fully-settled logical run. Fixture
// subclasses are defined inline per scenario with deliberately-fake
// identities — test doubles that register nothing and ship nowhere.

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { CapabilityParams } from "./base.ts";
import { PioCapability } from "./base.ts";
import type { Contract } from "./contract.ts";
import { ContractViolationError, PhaseBudgetError } from "./errors.ts";
import { PioSession } from "./pio-session.ts";
import type { CapabilityResult } from "./status.ts";

// Single documented cast seam for synthetic event payloads.
const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

const CWD = "/work/dir";

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
async function host() {
  const instance = await PioSession.create(CWD);
  return { instance, round: lastRound() };
}

/** Drive synthetic events through the listener the host attached. */
function emit(round: Round, ...events: object[]) {
  const listener = round.captured[0];
  if (!listener) throw new Error("expected an attached listener");
  for (const event of events) listener(asEvent(event));
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

/** Deliberately-fake identity: a test double, not a shipped capability. */
const FIXTURE_CONTRACT: Contract = {
  name: "fixture-cap",
  version: "1.0.0",
  inputs: [],
  outputs: [],
  writes: [],
};

/** Shared failing-shape assertion: ok:false, single-element errors, no outputs key. */
function expectSingleFailure(
  result: CapabilityResult,
  expected: Record<string, unknown>,
): void {
  expect(result.ok).toBe(false);
  expect("outputs" in result).toBe(false);
  expect(result.errors).toHaveLength(1);
  expect(result.errors?.[0]).toEqual(expected);
}

describe("PioCapability — happy path & pre-spawn ordering", () => {
  class IdentityCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    #returned: Record<string, unknown>;
    constructor(returned: Record<string, unknown>) {
      super({});
      this.#returned = returned;
    }
    async call(): Promise<Record<string, unknown>> {
      return this.#returned;
    }
  }

  it("lands the call return in outputs by reference identity with ok:true and no errors key", async () => {
    const outputs = { artifact: "value" };
    const cap = new IdentityCap(outputs);
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(result.outputs).toBe(outputs);
    expect("errors" in result).toBe(false);
  });

  it("a missing value-slot input resolves ok:false with the violation captured and call never invoked", async () => {
    const callSpy = vi.fn(
      async (): Promise<Record<string, unknown>> => ({
        reached: true,
      }),
    );
    class ValidatedCap extends PioCapability {
      readonly contract: Contract = {
        name: "fixture-cap",
        version: "1.0.0",
        inputs: [{ name: "doc" }],
        outputs: [],
        writes: [],
      };
      readonly call = callSpy;
      constructor() {
        super({});
      }
    }
    const cap = new ValidatedCap();
    const result = await cap.run({});
    expect(callSpy).toHaveBeenCalledTimes(0);
    expectSingleFailure(result, {
      type: "ContractViolationError",
      cause: "contract",
      message:
        "Contract violation: input 'doc' expects a non-empty string value",
      violations: ["input 'doc' expects a non-empty string value"],
    });
  });

  it("sees pristine values at validation time even when the body clears the slot mid-flight", async () => {
    class MutatingCap extends PioCapability {
      readonly contract: Contract = {
        name: "fixture-cap",
        version: "1.0.0",
        inputs: [{ name: "doc" }],
        outputs: [],
        writes: [],
      };
      constructor() {
        super({});
      }
      async call(
        inputs: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        // Clears the validated slot AFTER validation must already have run.
        inputs.doc = undefined;
        return { cleared: true };
      }
    }
    const cap = new MutatingCap();
    const result = await cap.run({ doc: "pristine" });
    expect(result.ok).toBe(true);
  });
});

describe("PioCapability — escape capture", () => {
  class EscapingCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    #thrower: () => unknown;
    constructor(thrower: () => unknown) {
      super({});
      this.#thrower = thrower;
    }
    async call(): Promise<Record<string, unknown>> {
      throw this.#thrower();
    }
  }

  it("captures a ContractViolationError escaping the body with identity violations", async () => {
    const violations = ["output 'r' is missing", "output 'g' is stale"];
    const thrown = new ContractViolationError(violations);
    const result = await new EscapingCap(() => thrown).run();
    expectSingleFailure(result, {
      type: "ContractViolationError",
      cause: "contract",
      message: "Contract violation: output 'r' is missing; output 'g' is stale",
      violations,
    });
    // The captured array IS the thrown error's own array (reference passthrough).
    expect(result.errors?.[0]?.violations).toBe(violations);
  });

  const uniformEscapeRows: Array<{
    label: string;
    thrower: () => unknown;
    expected: Record<string, unknown>;
    omitCause?: boolean;
  }> = [
    {
      label:
        "a random unknown Error captures as bare identity with no cause key",
      thrower: () => new Error("boom"),
      expected: { type: "Error", message: "boom" },
      omitCause: true,
    },
    {
      label:
        "an author halt carrying the closed cause vocabulary keeps its adopted cause",
      thrower: () => new Error("halted", { cause: "author-halt" }),
      expected: {
        type: "Error",
        cause: "author-halt",
        message: "halted",
      },
    },
    {
      label:
        "a PhaseBudgetError captures with the budget cause and default message",
      thrower: () => new PhaseBudgetError(2),
      expected: {
        type: "PhaseBudgetError",
        cause: "budget",
        message: "Iteration budget exceeded after 2 iterations",
      },
    },
    {
      label:
        "a non-Error thrown value degrades to UnknownError with its rendered form",
      thrower: () => "kaput",
      expected: { type: "UnknownError", message: "kaput" },
    },
  ];
  for (const row of uniformEscapeRows) {
    it(row.label, async () => {
      const result = await new EscapingCap(row.thrower).run();
      expectSingleFailure(result, row.expected);
      if (row.omitCause) {
        expect("cause" in (result.errors?.[0] ?? {})).toBe(false);
      }
    });
  }
});

describe("PioCapability — structural pins", () => {
  class LeafCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      return {};
    }
  }

  it("offers no virtual run slot: the inherited seam resolves to the base by identity", () => {
    expect(Object.hasOwn(LeafCap.prototype, "run")).toBe(false);
    expect(LeafCap.prototype.run).toBe(PioCapability.prototype.run);
  });

  it("retains reserved params on the instance without enforcement", () => {
    const bare = new LeafCap({});
    const reserved = new LeafCap({ tty: false, timeoutMs: 5 });
    expect(bare.tty).toBeUndefined();
    expect(bare.timeoutMs).toBeUndefined();
    expect(reserved.tty).toBe(false);
    expect(reserved.timeoutMs).toBe(5);
  });

  it("rejects with the pinned plain Error while no session is present", async () => {
    const variants: CapabilityParams[] = [{}, { tty: false, timeoutMs: 5 }];
    for (const params of variants) {
      const rejection: unknown = await new LeafCap(params)
        .execute_phase("any")
        .catch((reason: unknown) => reason);
      expect(rejection).toBeInstanceOf(Error);
      expect(rejection).not.toBeInstanceOf(ContractViolationError);
      expect(rejection).not.toBeInstanceOf(PhaseBudgetError);
      if (rejection instanceof Error) {
        expect(rejection.name).toBe("Error");
        expect(rejection.message).toBe(
          "no session available: execute_phase requires in-process placement",
        );
      } else {
        throw new Error("expected an Error rejection");
      }
    }
  });

  it("neither prototype owns an output-validation member at the consumer edge", () => {
    const matching = (target: object): string[] =>
      Object.getOwnPropertyNames(target).filter((name) =>
        /validat|checkOutputs/i.test(name),
      );
    expect(matching(PioCapability.prototype)).toEqual([]);
    expect(matching(PioSession.prototype)).toEqual([]);
  });
});

describe("PioCapability — prompt framing passes through untouched", () => {
  // Codepoints in the goldens below: U+2014 (em dash) twice flanking each
  // label with single spaces, U+000A (line feed) between lines.
  const PHASE_A_MARKER = "\u2014\u2014 phase-a \u2014\u2014";
  const PHASE_B_MARKER = "\u2014\u2014 phase-b \u2014\u2014";
  const CAP_MARKER = "\u2014\u2014 fixture-cap \u2014\u2014";

  class TwoPhaseCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("phase-a", { instructions: "do A" });
      const b = await this.execute_phase("phase-b", { instructions: "do B" });
      return { phaseResults: [a, b] };
    }
  }

  it("leaves the composed phase prompts free of any capability marker line", async () => {
    const { instance, round } = await host();
    const cap = new TwoPhaseCap({ session: instance });
    scriptRuns(round, quietRun(), quietRun());
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    // The wrapper forwards the option bag verbatim: only the engine-composed
    // phase marker plus the authored instructions reach the prompt channel.
    expect(round.session.prompt).toHaveBeenNthCalledWith(
      1,
      `${PHASE_A_MARKER}\ndo A`,
    );
    expect(round.session.prompt).toHaveBeenNthCalledWith(
      2,
      `${PHASE_B_MARKER}\ndo B`,
    );
  });

  class MinTwoCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("phase-a", {
        instructions: "do A",
        min: 2,
      });
      return { phaseResults: [a] };
    }
  }

  it("re-sends the byte-identical phase framing on every floor-driven iteration without added lines", async () => {
    const { instance, round } = await host();
    const cap = new MinTwoCap({ session: instance });
    scriptRuns(round, quietRun(), quietRun());
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    const framed = `${PHASE_A_MARKER}\ndo A`;
    expect(round.session.prompt).toHaveBeenNthCalledWith(1, framed);
    expect(round.session.prompt).toHaveBeenNthCalledWith(2, framed);
  });

  class BarePhaseCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("phase-a");
      return { phaseResults: [a] };
    }
  }

  it("ends the bare first-phase prompt at its marker line with no trailing newline and no capability line", async () => {
    const { instance, round } = await host();
    const cap = new BarePhaseCap({ session: instance });
    scriptRuns(round, quietRun());
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledWith(PHASE_A_MARKER);
    const sent = round.session.prompt.mock.calls[0][0];
    expect(sent.endsWith("\n")).toBe(false);
    expect(sent.includes(CAP_MARKER)).toBe(false);
  });
});

describe("PioCapability — engine integration through the base", () => {
  class BreachCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("breach", {
        min: 3,
        max: 2,
        shouldStopLoop: async () => false,
      });
      return { unreachable: a.iterations };
    }
  }

  it("lets an uncaptured budget breach escape the body into the failing result", async () => {
    const { instance, round } = await host();
    const cap = new BreachCap({ session: instance });
    scriptRuns(round, quietRun(), quietRun());
    const result = await cap.run();
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expectSingleFailure(result, {
      type: "PhaseBudgetError",
      cause: "budget",
      message: "Iteration budget exceeded after 2 iterations",
    });
  });

  class CaughtBreachCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      let caughtIterations: number | undefined;
      try {
        await this.execute_phase("breach", {
          min: 3,
          max: 2,
          shouldStopLoop: async () => false,
        });
      } catch (err) {
        // Authors may catch the breach narrowly around individual calls.
        if (err instanceof PhaseBudgetError) {
          caughtIterations = err.iterations;
        } else {
          throw err;
        }
      }
      return { caughtIterations };
    }
  }

  it("completes ok when the body catches the breach narrowly", async () => {
    const { instance, round } = await host();
    const cap = new CaughtBreachCap({ session: instance });
    scriptRuns(round, quietRun(), quietRun());
    const result = await cap.run();
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ caughtIterations: 2 });
  });

  class HookCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("hooked", {
        shouldStopLoop: async () => true,
      });
      return { settled: { done: a.done, iterations: a.iterations } };
    }
  }

  it("forwards the closed option bag intact past the wrapper", async () => {
    const { instance, round } = await host();
    const cap = new HookCap({ session: instance });
    scriptRuns(round, quietRun());
    const result = await cap.run();
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    // The wrapper forwards options verbatim: the bare marker line stands alone.
    expect(round.session.prompt).toHaveBeenCalledWith(
      "\u2014\u2014 hooked \u2014\u2014",
    );
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({
      settled: { done: true, iterations: 1 },
    });
  });
});
