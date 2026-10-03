// Hermetic unit suite for the research capability (capabilities/research.ts).
// Harness per the base.test.ts doctrine: the SAME five faked SDK value
// symbols (the fake session GAINS getToolDefinition — defined-by-default
// stub; miss rows override a round's lookup to undefined, the shipped
// total-absence signature), mkdtemp tmpdirs per row with PI_CODING_AGENT_DIR
// pointed at <tmp>/.pi/agent (saved/restored in afterEach), process.chdir
// into <tmp>/work for the project-key derivation (restored in afterEach),
// and a stderr spy for the pinned capability-owned REFUSAL line (no raw
// stdout writer — the report pointer travels through the session stream
// plus the status.json ledger token; there are no product-content stdout
// pins left here).
//
// Doctrine (load-bearing): scripted prompt resolutions emit SYNTHETIC EVENTS
// ONLY — they observe; they write NOTHING to disk. Rows whose assertions
// depend on real report content SEED the tmp tree directly (fixture duty,
// never harness magic). A "report-write settle" pass = agent_start ·
// tool_execution_start {toolName:"write", args:{path}} ·
// tool_execution_end {isError:false} · agent_end [].
//
// Expectations derive fingerprints/keys via the imported public helpers
// (self-consistent idiom — no hardcoded digest or key values). Replicated
// product literals carry a comment naming the SOLE OWNER (research.ts).
// NOTE the em dashes are U+2014 EM DASH characters — escaped so the pinned
// codepoints survive editor and toolkit glyph mangling; never normalize.

import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  deriveStateRootFromAgentDir,
  PioCapability,
} from "../capability/base.ts";
import type { PhaseOptions } from "../capability/pio-session.ts";
import {
  PioSession,
  renderCapabilityMarker,
} from "../capability/pio-session.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";
import ResearchCapability, {
  CapabilityEnvError,
  REPORT_FINGERPRINT_LENGTH,
  RESEARCH_MAX_RUNS,
  reportFingerprint,
  WebToolsMissingError,
} from "./research.ts";

// Single documented cast seam for synthetic event payloads — the sole `as`
// in this file.
const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

type Listener = (event: AgentSessionEvent) => void;

interface FakeSession {
  subscribe: ReturnType<typeof vi.fn>;
  /** One invocation stands for one fully-settled logical run. */
  prompt: ReturnType<typeof vi.fn>;
  getToolDefinition: ReturnType<typeof vi.fn>;
  /** The no-turn capability-span stamp seam (recording arg-shape). */
  sendCustomMessage: ReturnType<typeof vi.fn>;
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
  const sessionId = "sess-fake-res-01";

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
    // Defined-by-default: every lookup returns a truthy definition object;
    // miss rows override ONE round's lookup to return undefined (the total-
    // absence signature the loud preflight consumes).
    const getToolDefinition = vi.fn((name: string) => ({
      name,
      description: "fake tool definition",
    }));
    // Recording mock for the no-turn custom-message seam.
    const sendCustomMessage = vi.fn(async (): Promise<void> => {});
    const session: FakeSession = {
      subscribe,
      prompt,
      getToolDefinition,
      sendCustomMessage,
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

/** Pinned product-line replicas — the SOLE OWNER of every byte below is
 * capabilities/research.ts EXCEPT the env-defect pair, whose sole owner is
 * capability/base.ts (class CapabilityEnvError, message prefix
 * "capability:"); the copies keep the byte-pins meaningful. Em dashes are
 * U+2014 (escaped). */
const ENV_UNSET_MESSAGE =
  "capability: PI_CODING_AGENT_DIR is unset \u2014 cannot derive the state root";
const envMalformedMessage = (value: string): string =>
  `capability: PI_CODING_AGENT_DIR is malformed ('${value}') \u2014 cannot derive the state root`;
const preflightStderrLine = (names: string): string =>
  `pio research: web tools unavailable (missing: ${names}) \u2014 expected from the isolated agent dir's pi-native-search provisioning`;
const preflightThrownMessage = (names: string): string =>
  `web tools unavailable: missing tool definitions for ${names} (provisioning: isolated agent dir 'pi-native-search' local-source registration)`;
/** The pinned truncation note appended at a cap-ended resolution,
 * after existing report content (<N> = the iteration count at the cap exit). */
const truncationNote = (runs: number): string =>
  `\n## Truncated at run budget\n\nStopped after ${runs} runs: the run budget was hit before the topic ran dry. Sections above cover answered questions only.\n`;
/** The pinned sanity-violation line (module-private composition; the suite
 * replica names this owner). <target> = the project-slot-joined absolute
 * report path. */
const sanityViolationLine = (target: string): string =>
  `output 'report' is missing or empty at ${target} \u2014 the research phase ended without producing the report`;
/** Engine-composed marker line leading every run's text (U+2014 x2, single
 * spaces — the base.test.ts codepoint discipline). */
const PHASE_MARKER = "\u2014\u2014 research \u2014\u2014";

/** Replica of the module-private customType namespace (SOLE OWNER: the
 * PIO_CAPABILITY_CUSTOM_TYPE constant in ../capability/pio-session.ts). */
const CAPABILITY_CUSTOM_TYPE_REPLICA = "pio-capability";
/** Instruction {RESUME} variants (PINNED bytes; sole owner: research.ts). */
const resumeFresh = (topic: string): string =>
  `The report does not exist yet. Create it on your first write, starting with the heading "# Research: ${topic}".`;
const RESUME_EXISTING =
  "The report already exists. Read it FIRST: every existing section is an answered question \u2014 do not duplicate or repeat it; continue from the first question that is still open or unanswered.";
/** One collect-all ceiling violation line per still-missing declared path
 * at the exhausted ceiling (<entry> raw, <resolvedPath> resolved; the em dash
 * is U+2014-escaped). SOLE OWNER: the module-private renderMissingOutputLine
 * in capability/pio-session.ts (embedding its module-private ceiling constant
 * 3); the copy keeps the pin meaningful. */
const ceilingViolationLine = (
  phaseId: string,
  entry: string,
  resolvedPath: string,
): string =>
  `phase '${phaseId}' output '${entry}' missing at ${resolvedPath} \u2014 still absent after 3 expectation re-run(s); the ceiling is exhausted`;
/** One corrective MARKED BLOCK riding the transcript channel strictly after
 * the marker-leading baseline following a gate denial (two LF-joined lines;
 * no trailing newline; the em dashes are U+2014-escaped). SOLE OWNER: the
 * module-private renderExpectationRetryLine in capability/pio-session.ts.
 */
const expectationRetryBlock = (
  iterations: number,
  missingPaths: readonly string[],
): string =>
  `\u2014\u2014 output guard \u2014\u2014\nRequired phase output(s) still missing after ${iterations} run(s): ${missingPaths.join(", ")}. Create each listed file with the write or edit tool before you finish this run.`;

// Default topic for the flow rows (multi-word; Unicode coverage rides the
// payload-shape row).
const TOPIC = "quantum computing basics";

describe("research capability", () => {
  let tmp: string;
  let originalEnv: string | undefined;
  let originalCwd: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    harness.reset();
    originalEnv = process.env.PI_CODING_AGENT_DIR;
    originalCwd = process.cwd();
    stderrSpy = vi.spyOn(process.stderr, "write");
    tmp = await mkdtemp(join(tmpdir(), "pio-research-"));
    // The state-root channel into the bubble: the renderer's unconditional
    // <root>/.pi/agent expression over this row's own tmp tree.
    process.env.PI_CODING_AGENT_DIR = join(tmp, ".pi", "agent");
    await mkdir(join(tmp, "work"), { recursive: true });
    process.chdir(join(tmp, "work"));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalEnv === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = originalEnv;
    }
    stderrSpy.mockRestore();
    await rm(tmp, { recursive: true, force: true });
  });

  function lastRound(): Round {
    const round = harness.state.rounds[harness.state.rounds.length - 1];
    if (!round) throw new Error("expected a construction round");
    return round;
  }

  /** Build a host plus the construction round backing it. */
  async function host() {
    const instance = await PioSession.create(process.cwd());
    return { instance, round: lastRound() };
  }

  /** Drive synthetic events through the listener the host attached. */
  function emit(round: Round, ...events: object[]) {
    const listener = round.captured[0];
    if (!listener) throw new Error("expected an attached listener");
    for (const event of events) listener(asEvent(event));
  }

  /** One quiet settled run: a run start plus one empty agent_end payload. */
  function quietSettle(): object[] {
    return [
      { type: "agent_start" },
      { type: "agent_end", messages: [], willRetry: false },
    ];
  }

  /** A settle that COMMITS the given absolute path to the observer plane
   * (and ONLY the observer plane — nothing lands on disk; seeding the real
   * file is fixture duty outside this helper). */
  function writeSettle(absolutePath: string, toolCallId: string): object[] {
    return [
      { type: "agent_start" },
      {
        type: "tool_execution_start",
        toolCallId,
        toolName: "write",
        args: { path: absolutePath },
      },
      { type: "tool_execution_end", toolCallId, isError: false },
      { type: "agent_end", messages: [], willRetry: false },
    ];
  }

  /** Queue one synthetic settlement per pass over the captured listener. */
  function scriptRuns(round: Round, ...passes: object[][]) {
    for (const pass of passes) {
      round.session.prompt.mockImplementationOnce(async () => {
        emit(round, ...pass);
      });
    }
  }

  /** Seed the real report file in the tmp tree (fixture duty). */
  async function seedReport(absolutePath: string, content: string) {
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  /** Self-consistent report-placement derivation via the public helpers
   * (never hardcoded digests or keys). */
  function reportPlacement(topic: string) {
    const stateRoot = deriveStateRootFromAgentDir(
      process.env.PI_CODING_AGENT_DIR,
    );
    const projectKey = deriveProjectKey(process.cwd());
    const projectSlot = join(stateRoot, "projects", projectKey);
    const fingerprint = reportFingerprint(topic);
    const relativeForm = `research/${fingerprint}.md`;
    return {
      stateRoot,
      projectKey,
      projectSlot,
      absolutePath: join(projectSlot, "research", `${fingerprint}.md`),
      relativeForm,
    };
  }

  function stderrText(): string {
    return stderrSpy.mock.calls
      .map((call: readonly unknown[]) => String(call[0]))
      .join("");
  }

  // ---------------------------------------------------------------------
  // Pure helpers: topic fingerprint
  // ---------------------------------------------------------------------

  describe("reportFingerprint (pure)", () => {
    it("is deterministic: identical topic yields the identical 12-hex fingerprint", () => {
      const a = reportFingerprint("quantum computing basics");
      const b = reportFingerprint("quantum computing basics");
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{12}$/);
    });

    it("trims surface whitespace as the SOLE normalization: padded topic equals unpadded", () => {
      expect(reportFingerprint(" foo bar ")).toBe(reportFingerprint("foo bar"));
    });

    it("stays case- and internal-spacing-sensitive: distinct text yields distinct fingerprints", () => {
      expect(reportFingerprint("Foo")).not.toBe(reportFingerprint("foo"));
      expect(reportFingerprint("foo bar")).not.toBe(
        reportFingerprint("foo  bar"),
      );
    });

    it("diverges for long topics sharing a long prefix (anti-truncation regression)", () => {
      const shared = "x".repeat(60);
      const topicA = shared + "tail-A".padEnd(20, "1");
      const topicB = shared + "tail-B".padEnd(20, "2");
      expect(topicA).toHaveLength(80);
      expect(topicB).toHaveLength(80);
      expect(reportFingerprint(topicA)).not.toBe(reportFingerprint(topicB));
    });

    it("yields a well-formed 12-hex digest even for hazard-only topics", () => {
      expect(reportFingerprint("???")).toMatch(/^[0-9a-f]{12}$/);
      expect(REPORT_FINGERPRINT_LENGTH).toBe(12);
    });
  });

  // ---------------------------------------------------------------------
  // Loop shape over scripted settles (write-delta stopping rule)
  // ---------------------------------------------------------------------

  describe("loop shape", () => {
    it("continues on a report-write settle and stops on the next quiet settle: EXACTLY two prompts, ok:true payload with the SETTLED absolute-placement outputs (the base's settle seam absolutized the call-level frozen relative form), undamaged report (the deliverable statement itself travels through the SESSION STREAM — outcome-model settlement, no raw terminal write)", async () => {
      const seed =
        "# Research: quantum computing basics\n\n## First question\nanswered\n";
      const placement = reportPlacement(TOPIC);
      await seedReport(placement.absolutePath, seed);
      const { instance, round } = await host();
      scriptRuns(
        round,
        writeSettle(placement.absolutePath, "w1"),
        quietSettle(),
      );
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(round.session.prompt).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
      // The settled RESULT carries the ABSOLUTE placement (base-settled at
      // the run seam); call() itself still returns the frozen relative form.
      expect(result.outputs).toEqual({ report: placement.absolutePath });
      expect(stderrText()).toBe("");
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(placement.absolutePath, "utf8")).toBe(seed);
    });

    it("dry-up (zero writes committed) settles on the GATE, not the stop rule: the floor run breaks fileless, min: 1 already consumed after run 1, so the three further runs are GATE-DRIVEN corrective re-entries ending in the SAME ceiling-line capture (EXACTLY 4 prompts; notes ride calls[1..3] at 1/2/3 run(s); stderr empty)", async () => {
      const placement = reportPlacement(TOPIC);
      const { instance, round } = await host();
      const passes: object[][] = [];
      for (let i = 1; i <= 4; i++) {
        passes.push(quietSettle());
      }
      scriptRuns(round, ...passes);
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(round.session.prompt).toHaveBeenCalledTimes(4);
      expect(result.ok).toBe(false);
      // The floor-trajectory twin of the cap-without-file capture: same
      // ceiling byte, different run counts.
      const line = ceilingViolationLine(
        "research",
        placement.absolutePath,
        placement.absolutePath,
      );
      expect(result.errors?.[0]).toStrictEqual({
        type: "ContractViolationError",
        cause: "contract",
        message: `Contract violation: ${line}`,
        violations: [line],
      });
      for (let n = 1; n <= 3; n++) {
        const sent: unknown = round.session.prompt.mock.calls[n]?.[0];
        const text = typeof sent === "string" ? sent : "";
        expect(
          text.endsWith(expectationRetryBlock(n, [placement.absolutePath])),
        ).toBe(true);
      }
      expect(stderrText()).toBe("");
    });

    it("a forced long loop RESOLVES at the cap and settles OK: TEN write-settles drive the bounded exit (EXACTLY RESEARCH_MAX_RUNS prompts, NO errors key), the pinned truncation note appended, partial report INTACT", async () => {
      const seed = "seeded sections\n";
      const placement = reportPlacement(TOPIC);
      await seedReport(placement.absolutePath, seed);
      const { instance, round } = await host();
      const passes: object[][] = [];
      for (let i = 1; i <= RESEARCH_MAX_RUNS; i++) {
        passes.push(writeSettle(placement.absolutePath, `w${i}`));
      }
      scriptRuns(round, ...passes);
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(round.session.prompt).toHaveBeenCalledTimes(RESEARCH_MAX_RUNS);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      // The bounded exit settles: NO errors key at all.
      expect(result.errors).toBeUndefined();
      expect(result.outputs).toEqual({ report: placement.absolutePath });
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(placement.absolutePath, "utf8")).toBe(
        seed + truncationNote(RESEARCH_MAX_RUNS),
      );
      expect(stderrText()).toBe("");
    });

    it("a phase ending AT the cap takes the note however the last run broke: writes on runs 1..max-1 plus a quiet final run end the loop AT the ceiling (EXACTLY RESEARCH_MAX_RUNS prompts, ok:true, NO errors key) and the seeded report gains the pinned note", async () => {
      const seed = "seeded sections\n";
      const placement = reportPlacement(TOPIC);
      await seedReport(placement.absolutePath, seed);
      const { instance, round } = await host();
      const passes: object[][] = [];
      for (let i = 1; i < RESEARCH_MAX_RUNS; i++) {
        passes.push(writeSettle(placement.absolutePath, `w${i}`));
      }
      passes.push(quietSettle());
      scriptRuns(round, ...passes);
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(round.session.prompt).toHaveBeenCalledTimes(RESEARCH_MAX_RUNS);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.errors).toBeUndefined();
      expect(result.outputs).toEqual({ report: placement.absolutePath });
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(placement.absolutePath, "utf8")).toBe(
        seed + truncationNote(RESEARCH_MAX_RUNS),
      );
      expect(stderrText()).toBe("");
    });
  });

  // ---------------------------------------------------------------------
  // Settlement-gate interplay over the armed write declaration
  // ---------------------------------------------------------------------

  describe("settlement-gate interplay over the armed write declaration", () => {
    it("phase options carry the write bag declaring the ALREADY-DERIVED absolute report path: the spied execute_phase capture deep-equals [absolutePath] beside the corroborated budget/stopping-rule shape (min/max pins, instructions defined, shouldStopLoop a function; instruction bytes belong to the framing rows)", async () => {
      const seed = "# seeded\n";
      const placement = reportPlacement(TOPIC);
      await seedReport(placement.absolutePath, seed);
      const { instance, round } = await host();
      // Delegating passthrough spy: mirrors the argument while the REAL
      // implementation still runs (observation seam, zero behavioral change);
      // the row-local instance keeps the spy self-contained.
      const original = instance.execute_phase.bind(instance);
      let observed: PhaseOptions | undefined;
      vi.spyOn(instance, "execute_phase").mockImplementation(
        (id: string, opts?: PhaseOptions) => {
          observed = opts;
          return original(id, opts);
        },
      );
      scriptRuns(
        round,
        writeSettle(placement.absolutePath, "w1"),
        quietSettle(),
      );
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(round.session.prompt).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
      expect(observed).toBeDefined();
      if (observed === undefined) throw new Error("unreachable");
      expect(observed.write).toEqual([placement.absolutePath]);
      expect(observed.min).toBe(1);
      expect(observed.max).toBe(RESEARCH_MAX_RUNS);
      expect(typeof observed.instructions).toBe("string");
      expect(typeof observed.shouldStopLoop).toBe("function");
    });

    it("bounded cap WITHOUT the report flips to the typed ceiling failure: TEN synthetic write-settles break AT the cap, the three gate-driven corrective re-runs ride the transcript ('after 10/11/12 run(s)'), and the settlement ends in the collect-all ContractViolationError with the pinned ceiling line (prompt invoked EXACTLY 13 times; disk ENOENT post-hoc; the ceiling throw escapes call() BEFORE any appendFile)", async () => {
      const placement = reportPlacement(TOPIC);
      const { instance, round } = await host();
      const passes: object[][] = [];
      for (let i = 1; i <= RESEARCH_MAX_RUNS; i++) {
        passes.push(writeSettle(placement.absolutePath, `w${i}`));
      }
      for (let i = 1; i <= 3; i++) {
        passes.push(quietSettle());
      }
      scriptRuns(round, ...passes);
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(round.session.prompt).toHaveBeenCalledTimes(RESEARCH_MAX_RUNS + 3);
      expect(result.ok).toBe(false);
      // Entry and resolved path coincide here (the absolute entry resolves
      // to itself).
      const line = ceilingViolationLine(
        "research",
        placement.absolutePath,
        placement.absolutePath,
      );
      expect(result.errors?.[0]).toStrictEqual({
        type: "ContractViolationError",
        cause: "contract",
        message: `Contract violation: ${line}`,
        violations: [line],
      });
      // TRANSCRIPT CHANNEL: runs 11..13 (calls[10..12]) each carry a FRESH
      // corrective marked block strictly after the marker-leading baseline
      // (containment pins inside the replica: the flanked delimiter line, the
      // settled-run count at the denial point, the full checked path).
      for (let n = 10; n <= 12; n++) {
        const sent: unknown = round.session.prompt.mock.calls[n]?.[0];
        const text = typeof sent === "string" ? sent : "";
        expect(text.startsWith(PHASE_MARKER)).toBe(true);
        expect(
          text.endsWith(expectationRetryBlock(n, [placement.absolutePath])),
        ).toBe(true);
      }
      expect(stderrText()).toBe("");
      // Disk truth post-hoc: the report is ABSENT (the note-append is
      // unreachable on this trajectory).
      const { stat: statCheck } = await import("node:fs/promises");
      await expect(statCheck(placement.absolutePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("STRICTLY BETTER THAN TODAY (which immediate-threw the sanity violation after ONE prompt): the floor run ends fileless, the 'after 1 run(s)' corrective block rides the second prompt, and the model's run-2 write settles OK (EXACTLY 3 prompts, NO errors key, disk content SEED-EXACT; no truncation note)", async () => {
      const seed =
        "# Research: quantum computing basics\n\n## First question\nanswered\n";
      const placement = reportPlacement(TOPIC);
      const { instance, round } = await host();
      // Run 1: the floor run settles quietly, fileless.
      round.session.prompt.mockImplementationOnce(async () => {
        emit(round, ...quietSettle());
      });
      // Run 2: the MODEL commits the report during this pass; the real file
      // lands BEFORE the synthetic settle emits (seeding supplies the disk
      // truth the settlement gate later consults).
      round.session.prompt.mockImplementationOnce(async () => {
        await seedReport(placement.absolutePath, seed);
        emit(round, ...writeSettle(placement.absolutePath, "w1"));
      });
      // Run 3: quiet; the gate passes over the seeded disk truth.
      round.session.prompt.mockImplementationOnce(async () => {
        emit(round, ...quietSettle());
      });
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(round.session.prompt).toHaveBeenCalledTimes(3);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.errors).toBeUndefined();
      expect(result.outputs).toEqual({ report: placement.absolutePath });
      // The output-guard block rides RUN 2's prompt (calls[1]).
      const sent: unknown = round.session.prompt.mock.calls[1]?.[0];
      const text = typeof sent === "string" ? sent : "";
      expect(text.startsWith(PHASE_MARKER)).toBe(true);
      expect(
        text.endsWith(expectationRetryBlock(1, [placement.absolutePath])),
      ).toBe(true);
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(placement.absolutePath, "utf8")).toBe(seed);
      expect(stderrText()).toBe("");
    });

    it("recovered via retry PAST the cap silences the exact-equality truncation guard: the cap-ended settle FAILS the gate, the model's run-11 write recovers the file, and the phase settles with the disk content SEED-EXACT; NO note suffix (EXACTLY RESEARCH_MAX_RUNS + 1 prompts, ok:true, NO errors key)", async () => {
      const seed =
        "# Research: quantum computing basics\n\n## First question\nanswered\n";
      const placement = reportPlacement(TOPIC);
      const { instance, round } = await host();
      const passes: object[][] = [];
      for (let i = 1; i <= RESEARCH_MAX_RUNS; i++) {
        passes.push(writeSettle(placement.absolutePath, `w${i}`));
      }
      scriptRuns(round, ...passes);
      // Run 11 (the gate-driven corrective re-entry): the MODEL commits the
      // report; seeded BEFORE the synthetic settle emits.
      round.session.prompt.mockImplementationOnce(async () => {
        await seedReport(placement.absolutePath, seed);
        emit(round, ...writeSettle(placement.absolutePath, "w11"));
      });
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(round.session.prompt).toHaveBeenCalledTimes(RESEARCH_MAX_RUNS + 1);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.errors).toBeUndefined();
      expect(result.outputs).toEqual({ report: placement.absolutePath });
      // Run 11's prompt (calls[10]) carries the cap-denial block:
      // 'after 10 run(s)'.
      const sent: unknown = round.session.prompt.mock.calls[10]?.[0];
      const text = typeof sent === "string" ? sent : "";
      expect(text.startsWith(PHASE_MARKER)).toBe(true);
      expect(
        text.endsWith(
          expectationRetryBlock(RESEARCH_MAX_RUNS, [placement.absolutePath]),
        ),
      ).toBe(true);
      // Byte-for-byte seed: the note claims only cap-EXACT settles that
      // passed the gate; iterations 11 exceeds the cap, so the guard stays
      // silent and appends nothing.
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(placement.absolutePath, "utf8")).toBe(seed);
      expect(stderrText()).toBe("");
    });

    it("pins the FULL contract literal (params-free new ResearchCapability({}); the params bag's session field is optional): every field byte-frozen durably, the version byte moved to 0.2.0 for the write-bag migration", () => {
      // Pinned contract literal; the SOLE OWNER is the contract field on
      // ResearchCapability in capabilities/research.ts; the copy keeps the
      // pin meaningful (durable-shape corroboration: every field except the
      // version byte byte-frozen).
      const cap = new ResearchCapability({});
      expect(cap.contract).toStrictEqual({
        name: "research",
        version: "0.2.0",
        inputs: [{ name: "topic" }],
        outputs: [{ name: "report", paramKey: "report" }],
        writes: ["research/*.md"],
        allowProjectWrites: true,
      });
    });
  });

  // ---------------------------------------------------------------------
  // Post-phase sanity (no silent empty-success)
  // ---------------------------------------------------------------------

  describe("post-phase sanity", () => {
    it("a 0-byte report (model committed a write to an EMPTY file) yields the pinned typed contract violation: SAME line bytes as the missing-report outcome, EXACTLY two prompts", async () => {
      const placement = reportPlacement(TOPIC);
      await seedReport(placement.absolutePath, "");
      const { instance, round } = await host();
      scriptRuns(
        round,
        writeSettle(placement.absolutePath, "w1"),
        quietSettle(),
      );
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(round.session.prompt).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(false);
      expect(result.errors?.[0]).toStrictEqual({
        type: "ContractViolationError",
        cause: "contract",
        message: `Contract violation: ${sanityViolationLine(
          placement.absolutePath,
        )}`,
        violations: [sanityViolationLine(placement.absolutePath)],
      });
      expect(stderrText()).toBe("");
    });
  });

  // ---------------------------------------------------------------------
  // Payload shape + instruction framing
  // ---------------------------------------------------------------------

  describe("payload shape + instruction framing", () => {
    it("settled outputs deep-equal { report: <absolute placement of the frozen 'research/' + fingerprint(topic) + '.md' token> } for a multi-word + unicode topic (self-consistent derivation via the imported helper)", async () => {
      const unicodeTopic = "how do LLMs über generalise?";
      const placement = reportPlacement(unicodeTopic);
      await seedReport(placement.absolutePath, "# seeded\n");
      const { instance, round } = await host();
      scriptRuns(
        round,
        writeSettle(placement.absolutePath, "w1"),
        quietSettle(),
      );
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: unicodeTopic });
      expect(result.ok).toBe(true);
      // Settled to the ABSOLUTE placement by the base's seam (call()-level
      // return stays the frozen slot-relative token).
      expect(result.outputs).toEqual({ report: placement.absolutePath });
    });

    it("fresh row: the first prompt begins with the phase marker and carries the ABSOLUTE path pointer + the FRESH resume line, NOT the existing one", async () => {
      const placement = reportPlacement(TOPIC);
      const { instance, round } = await host();
      scriptRuns(round, quietSettle());
      const cap = new ResearchCapability({ session: instance });
      await cap.run({ topic: TOPIC });
      const sent: unknown = round.session.prompt.mock.calls[0]?.[0];
      const text = typeof sent === "string" ? sent : "";
      expect(text.startsWith(PHASE_MARKER)).toBe(true);
      expect(text).toContain(
        `Report file (absolute path): ${placement.absolutePath}`,
      );
      expect(text).toContain(resumeFresh(TOPIC));
      expect(text).not.toContain(RESUME_EXISTING);
    });

    it("spans its own header: the run() stamps `capability: research` on the provided session EXACTLY ONCE, strictly BEFORE the research phase's first prompt", async () => {
      const { instance, round } = await host();
      scriptRuns(round, quietSettle());
      const cap = new ResearchCapability({ session: instance });
      await cap.run({ topic: TOPIC });
      expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
      expect(round.session.sendCustomMessage).toHaveBeenCalledWith({
        customType: CAPABILITY_CUSTOM_TYPE_REPLICA,
        content: renderCapabilityMarker("research"),
        display: true,
        details: undefined,
      });
      // Log-order pin: the settled stamp precedes the phase's first prompt.
      expect(
        round.session.sendCustomMessage.mock.invocationCallOrder[0],
      ).toBeLessThan(round.session.prompt.mock.invocationCallOrder[0]);
    });

    it("pre-seeded row: the first prompt carries the EXISTING resume line, not the fresh one (substring-containment pins over the pinned template text)", async () => {
      const placement = reportPlacement(TOPIC);
      await seedReport(placement.absolutePath, "# seeded report\n");
      const { instance, round } = await host();
      scriptRuns(
        round,
        writeSettle(placement.absolutePath, "w1"),
        quietSettle(),
      );
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(result.ok).toBe(true);
      const sent: unknown = round.session.prompt.mock.calls[0]?.[0];
      const text = typeof sent === "string" ? sent : "";
      expect(text.startsWith(PHASE_MARKER)).toBe(true);
      expect(text).toContain(
        `Report file (absolute path): ${placement.absolutePath}`,
      );
      expect(text).toContain(RESUME_EXISTING);
      expect(text).not.toContain(resumeFresh(TOPIC));
    });
  });

  // ---------------------------------------------------------------------
  // State-root inversion through the capability (integration)
  // ---------------------------------------------------------------------

  describe("state-root inversion (integration)", () => {
    it("PI_CODING_AGENT_DIR deleted from env escapes pre-everything: the pinned typed UNSET capture, ZERO prompts, NO stderr line (the typed capture IS the surfacing)", async () => {
      const { instance, round } = await host();
      delete process.env.PI_CODING_AGENT_DIR;
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0]).toStrictEqual({
        type: "CapabilityEnvError",
        message: ENV_UNSET_MESSAGE,
      });
      expect(round.session.prompt).toHaveBeenCalledTimes(0);
      expect(stderrText()).toBe("");
    });

    it("a MALFORMED PI_CODING_AGENT_DIR likewise: the pinned typed MALFORMED capture naming the trimmed value, ZERO prompts, NO stderr line", async () => {
      const { instance, round } = await host();
      process.env.PI_CODING_AGENT_DIR = "rel/.pi/agent";
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0]).toStrictEqual({
        type: "CapabilityEnvError",
        message: envMalformedMessage("rel/.pi/agent"),
      });
      expect(round.session.prompt).toHaveBeenCalledTimes(0);
      expect(stderrText()).toBe("");
    });
  });

  // ---------------------------------------------------------------------
  // Pre-spawn ordering
  // ---------------------------------------------------------------------

  describe("pre-spawn ordering", () => {
    it("run({}) trips validateInputs BEFORE the preflight: the pinned contract violation, ZERO prompts, and the preflight line did NOT fire even though both tools miss", async () => {
      const { instance, round } = await host();
      round.session.getToolDefinition.mockReturnValue(undefined);
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({});
      expect(result.ok).toBe(false);
      expect(result.errors?.[0]).toStrictEqual({
        type: "ContractViolationError",
        cause: "contract",
        message:
          "Contract violation: input 'topic' expects a non-empty string value",
        violations: ["input 'topic' expects a non-empty string value"],
      });
      expect(round.session.prompt).toHaveBeenCalledTimes(0);
      expect(stderrText()).toBe("");
    });
  });

  // ---------------------------------------------------------------------
  // Loud preflight (D1)
  // ---------------------------------------------------------------------

  describe("loud preflight", () => {
    it("refuses with ONE pinned stderr line, the typed thrown capture, and ZERO prompts when BOTH lookups miss (the total-absence signature)", async () => {
      const { instance, round } = await host();
      round.session.getToolDefinition.mockReturnValue(undefined);
      const placement = reportPlacement(TOPIC);
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0]).toStrictEqual({
        type: "WebToolsMissingError",
        message: preflightThrownMessage("web_search, web_fetch"),
      });
      expect(round.session.prompt).toHaveBeenCalledTimes(0);
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stderrText()).toBe(
        `${preflightStderrLine("web_search, web_fetch")}\n`,
      );
      // No report touched on disk (nothing seeded, nothing written).
      const { stat: statCheck } = await import("node:fs/promises");
      await expect(statCheck(placement.absolutePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("names EXACTLY the missing tool when only web_search misses (check order, ', '-joined)", async () => {
      const { instance, round } = await host();
      round.session.getToolDefinition.mockImplementation((name: string) =>
        name === "web_fetch" ? { name, description: "ok" } : undefined,
      );
      const cap = new ResearchCapability({ session: instance });
      const result = await cap.run({ topic: TOPIC });
      expect(result.ok).toBe(false);
      expect(result.errors?.[0]).toStrictEqual({
        type: "WebToolsMissingError",
        message: preflightThrownMessage("web_search"),
      });
      expect(round.session.prompt).toHaveBeenCalledTimes(0);
      expect(stderrText()).toBe(`${preflightStderrLine("web_search")}\n`);
    });
  });

  // ---------------------------------------------------------------------
  // Module surface and mechanical guards
  // ---------------------------------------------------------------------

  describe("module surface and mechanical guards", () => {
    it("defaults to a concrete bundled subclass with the pinned tunable constants", () => {
      expect(Object.getPrototypeOf(ResearchCapability.prototype)).toBe(
        PioCapability.prototype,
      );
      expect(RESEARCH_MAX_RUNS).toBe(10);
      expect(REPORT_FINGERPRINT_LENGTH).toBe(12);
      expect(new WebToolsMissingError("x").name).toBe("WebToolsMissingError");
      expect(new CapabilityEnvError("x").name).toBe("CapabilityEnvError");
    });

    it("exposes EXACTLY the five named exports beside the default export (deriveStateRootFromAgentDir + its pinned pair's body live in capability/base.ts; CapabilityEnvError stays importable here via the consolidation re-export)", async () => {
      const mod = await import("./research.ts");
      expect(Object.keys(mod).sort()).toEqual([
        "CapabilityEnvError",
        "REPORT_FINGERPRINT_LENGTH",
        "RESEARCH_MAX_RUNS",
        "WebToolsMissingError",
        "default",
        "reportFingerprint",
      ]);
      expect(mod.default).toBe(ResearchCapability);
    });

    it("contains ZERO occurrences of the SDK specifier in its source (static value graph reaches no SDK module)", () => {
      const src = readFileSync(
        new URL("./research.ts", import.meta.url),
        "utf8",
      );
      expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
    });
  });
});
