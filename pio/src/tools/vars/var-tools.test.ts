// Hermetic unit suite for the model-side variable tool trio
// (tools/vars/var-tools.ts). Self-contained island: the vi.mock factory
// references ONLY inline fakes and never pulls in the original module, so
// the real @earendil-works/pi-coding-agent graph is never evaluated - the
// nine value symbols below are the parent host suite's reference list over
// the full construction seam (identity defineTool, inert session-building
// fakes); every row drives the REAL factory output directly over REAL
// SessionExecutionState instances (each carrying REAL attachment worlds of
// minted VarCells) or over the UNDEFINED state (the stateless empty-view
// world), and the composed predicate rows pair the REAL decideVarWrite over
// HAND-BUILT ExecutionSnapshot structural literals WITH CELLS against the
// real bodies. No filesystem, network, env, or process-stream assumptions
// anywhere.
//
// Marked cast seams (the ONLY `as` occurrences in this file, listed here
// per the house seam idiom): INERT_CTX presents an inert execution context
// under the SDK's ExtensionContext for the driven executes (no body ever
// reads it); trio() presents the factory's identity-wrapped definitions
// under the widened structural TrioView (one cast per member) so the rows
// drive execute over the authored surface and consult the structural
// parameter records. The ZERO-CAST discipline is pinned mechanically over
// the MODULE source alone (the sweep below), matching the sibling gate
// suites' suite-exclusion precedent.
//
// Golden discipline: every rendering split (success echo, getVar
// bare-string vs JSON, listVars two-key document) binds the module's real
// output to SUITE-SIDE REPLICA BUILDERS compared by byte equality (the
// module is each line's sole owner; U+2014 arrives escaped on both sides -
// compare unescaped). Permission-family refusals OWNED BY THE GATE PREDICATE
// are asserted EQUAL to the FRESH real-predicate evaluation over the SAME
// state reading (identity-over-goldbytes, zero byte copies); settle faults
// OWNED BY THE SUBSTRATE CELL are asserted EQUAL to the REAL cell-thrown
// VariableRejectionError message for the SAME inputs (identity-over-gold-
// bytes). Failure lanes resolve readable text: the pinned result shape is
// exactly { content: [{ type: "text", text }], details: {} } on EVERY lane.

import { readFileSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { VariableRejectionError } from "../../capability/errors.ts";
import type {
  CapabilitySources,
  PathAnchors,
} from "../../capability/guards/guard-vocabulary.ts";
import { decideVarWrite } from "../../capability/guards/var-gate.ts";
import type { PhaseVarBinding, VarType } from "../../capability/var-cell.ts";
import { declareVar } from "../../capability/var-cell.ts";
import type {
  AnchorChannels,
  ExecutionSnapshot,
} from "../../session-execution-state.ts";
import { SessionExecutionState } from "../../session-execution-state.ts";
import * as varToolsModule from "./var-tools.ts";
import { createVarTools } from "./var-tools.ts";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  SessionManager: { create: () => ({ getCwd: () => "/managed/cwd" }) },
  createAgentSessionServices: async () => ({}),
  createAgentSessionFromServices: async () => ({
    extensionsResult: {},
    session: {},
  }),
  createAgentSessionRuntime: async () => ({}),
  getAgentDir: () => "/agent/dir",
  createBashToolDefinition: () => ({ name: "bash" }),
  defineTool: (tool: unknown) => tool,
  getShellConfig: () => ({ shell: "/bin/bash", args: ["-c"] }),
  createLocalBashOperations: () => ({}),
}));

/** MARKED cast seam #1 (documented in the header): the inert execution
 * context presented under the SDK's ExtensionContext for the driven
 * executes - no body ever reads it. */
const INERT_CTX = {} as unknown as ExtensionContext;

const TOOL_CALL_ID = "tc-vars-1";

/** Widened structural view of one authored trio member: the identity
 * defineTool hands back exactly the built definition, so this view mirrors
 * the authored surface faithfully; parameters stay opaque until a row
 * needs the structural record. */
interface TrioView {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    id: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    details: unknown;
  }>;
}

/** MARKED cast seam #2 (documented in the header): presents the factory
 * output under the widened view (one cast per member). */
function trio(
  state: SessionExecutionState | undefined,
): [TrioView, TrioView, TrioView] {
  const built = createVarTools(state);
  return [
    built[0] as unknown as TrioView,
    built[1] as unknown as TrioView,
    built[2] as unknown as TrioView,
  ];
}

async function run(tool: TrioView, params: unknown) {
  return tool.execute(TOOL_CALL_ID, params, undefined, undefined, INERT_CTX);
}

/** Read the settled line out of the pinned single-text result shape. */
function line(result: {
  content: Array<{ type: string; text: string }>;
}): string {
  if (result.content.length !== 1) {
    throw new Error("expected exactly one content block");
  }
  const block = result.content[0];
  if (block?.type !== "text") {
    throw new Error("expected the single text block");
  }
  return block.text;
}

// ---------------------------------------------------------------------------
// Suite-side replicas of the MODULE-OWNED line shapes - SOLE OWNER of every
// byte is ./var-tools.ts (its module-private renderers); these witnesses
// bind the real output to the pinned bytes. U+2014 arrives escaped in the
// module literal identically here - compare unescaped.
// ---------------------------------------------------------------------------

const replicaSuccessLine = (name: string, stored: unknown): string =>
  `variable '${name}' set to ${JSON.stringify(stored)}.`;

const replicaAbsentLine = (name: string): string =>
  `variable '${name}' is undefined.`;

// ---------------------------------------------------------------------------
// Shared hermetic fixtures - plain structural literals. One anchor pair;
// literal absolute posix strings everywhere (the bodies NEVER consult them
// - sentinel variation proves it).
// ---------------------------------------------------------------------------

const SLOT_ROOT = "/state/projects/proj-x";
const WORKSPACE_CWD = "/workspace/proj-x";
const PATHS: PathAnchors = {
  projectSlotRoot: SLOT_ROOT,
  workspaceCwd: WORKSPACE_CWD,
};

const RESEARCH: CapabilitySources = {
  name: "research",
  writes: ["research/*.md"],
  allowProjectWrites: false,
};

const STATE_CHANNELS: AnchorChannels = {
  projectSlotRoot: () => SLOT_ROOT,
  workspaceCwd: () => WORKSPACE_CWD,
};

/** Fresh state with the research span entered (depth-1 world: span present,
 * NO phase attached yet). */
const spannedState = (): SessionExecutionState => {
  const state = new SessionExecutionState(STATE_CHANNELS);
  state.enterCapability(RESEARCH);
  return state;
};

/** Governing-world builder: span plus a phase attaching the GIVEN binding
 * list verbatim (cells pre-minted by the caller - reference integrity is
 * the point of every row below). */
const governingWorld = (
  bindings: readonly PhaseVarBinding[],
): SessionExecutionState => {
  const state = spannedState();
  state.attachPhase("phase-a", [], false, false, [...bindings]);
  return state;
};

/** Granted-binding shorthand: REAL minted cells, WRITE granted. */
const granted = (name: string, type: VarType = "string"): PhaseVarBinding => ({
  cell: declareVar(name, type),
  write: true,
});

/** Hand-built snapshot with the governing phase carrying the GIVEN binding
 * set (default-read projection over it, write grants per entry). */
const governingSnapshot = (
  bindings: readonly PhaseVarBinding[],
): ExecutionSnapshot => ({
  sources: RESEARCH,
  phase: {
    id: "phase-a",
    declared: [],
    allowProjectWrites: false,
    tmpDirAllowed: false,
    vars: bindings,
  },
  paths: PATHS,
});

/** Depth-0 world: no span, no phase - the universal-denial window. */
const depthZeroSnapshot: ExecutionSnapshot = {
  sources: null,
  phase: null,
  paths: PATHS,
};

describe("createVarTools definition shapes", () => {
  it("returns a FRESH array of EXACTLY three definitions in the pinned order setVar -> getVar -> listVars per call, with disjoint instances across calls", () => {
    const state = spannedState();
    const first = createVarTools(state);
    const second = createVarTools(state);
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(first.map((entry) => entry.name)).toEqual([
      "setVar",
      "getVar",
      "listVars",
    ]);
    // Erasure stays PROGRAM-OWNED (cell.reset): the model never erases.
    expect(first.map((entry) => entry.name)).not.toContain("clearVar");
    expect(second).not.toBe(first);
    for (let i = 0; i < 3; i += 1) {
      expect(second[i]).not.toBe(first[i]);
    }
  });

  it("carries the mirrored labels and non-empty model-facing descriptions on every member", () => {
    const [setVar, getVar, listVars] = trio(spannedState());
    expect(setVar.label).toBe("Set Session Variable");
    expect(getVar.label).toBe("Get Session Variable");
    expect(listVars.label).toBe("List Session Variables");
    for (const entry of [setVar, getVar, listVars]) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(typeof entry.execute).toBe("function");
    }
  });

  it("keeps the MINIMAL definition surface (no prompt/rendering/execution-mode fields on any member)", () => {
    const state = spannedState();
    for (const entry of createVarTools(state)) {
      for (const field of [
        "promptSnippet",
        "promptGuidelines",
        "renderShell",
        "prepareArguments",
        "executionMode",
        "constrainedSampling",
        "renderCall",
        "renderResult",
      ]) {
        expect(entry, field).not.toHaveProperty(field);
      }
    }
  });

  it("carries the name-alone parameter surface: setVar properties are EXACTLY ['name', 'value'] with NO type member (six-member value union), getVar carries name alone, listVars carries the empty object", () => {
    const [setVar, getVar, listVars] = trio(spannedState());
    const setProps = (
      setVar.parameters as { properties: Record<string, unknown> }
    ).properties;
    expect(Object.keys(setProps).sort()).toEqual(["name", "value"]);
    expect(setProps).not.toHaveProperty("type");
    const valueUnion = setProps.value as { anyOf: unknown[] };
    expect(valueUnion.anyOf).toHaveLength(6);
    const getProps = (
      getVar.parameters as { properties: Record<string, unknown> }
    ).properties;
    expect(Object.keys(getProps).sort()).toEqual(["name"]);
    const listProps = (
      listVars.parameters as { properties: Record<string, unknown> }
    ).properties;
    expect(Object.keys(listProps)).toHaveLength(0);
  });

  it("pins the setVar description to the settled grants-doctrine bytes verbatim (module-owned golden)", () => {
    const [setVar] = trio(spannedState());
    expect(setVar.description).toBe(
      "Set a variable during the active phase by name alone. The write settles against the active phase's write-grant bindings and the variable's own declaration; a name outside the grants settles a readable refusal mid-turn. Values arrive as JSON and are checked against the declaration before storage; the confirmation echoes the stored value.",
    );
  });
});

describe("setVar round-trips over all six declared types", () => {
  it.each([
    // [declared type, input value, success-line echo, getVar read-back]
    ["string", "hello world", `"hello world"`, "hello world"],
    ["number", "42", "42", "42"],
    ["boolean", true, "true", "true"],
    ["array", ["a", "b"], '["a","b"]', '["a","b"]'],
    ["object", { k: "v" }, '{"k":"v"}', '{"k":"v"}'],
    ["null", null, "null", "null"],
  ] as const)(
    "declares %s and sets the value: the success line echoes the CONVERSION RESULT and the getVar lane reads back the SAME stored value",
    async (type, value, echoed, readBack) => {
      const world = governingWorld([granted("target", type)]);
      const [setVar, getVar] = trio(world);
      const result = await run(setVar, { name: "target", value });
      expect(line(result)).toBe(`variable 'target' set to ${echoed}.`);
      expect(result.details).toEqual({});
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(line(await run(getVar, { name: "target" }))).toBe(readBack);
    },
  );

  it('numeric-string corner: claimed number with input "42" settles 42 (not "42") and stores the NUMBER', async () => {
    const cell = declareVar("count", "number");
    const world = governingWorld([{ cell, write: true }]);
    const [setVar] = trio(world);
    const result = await run(setVar, { name: "count", value: "42" });
    expect(line(result)).toBe("variable 'count' set to 42.");
    // TS-side observation over the SAME minted cell (reference reach):
    expect(cell.read()).toBe(42);
  });
});

describe("setVar reject corners (identity over the real cell throws)", () => {
  it("out-of-grant short-circuit: an ungranted name settles the GATE-FAMILY phase-line refusal verbatim (equality over the FRESH real-predicate evaluation; zero byte copies) and reaches NO cell", async () => {
    const otherCell = declareVar("other", "string");
    const ghostCell = declareVar("ghost", "string");
    const world = governingWorld([
      { cell: otherCell, write: true },
      { cell: ghostCell },
    ]);
    const expected = decideVarWrite(world.snapshot(), "setVar", {
      name: "ghost",
    });
    if (!expected) throw new Error("expected the predicate refusal");
    const [setVar] = trio(world);
    const result = await run(setVar, { name: "ghost", value: "x" });
    expect(line(result)).toBe(expected.reason);
    // Neither cell saw the write (the ghost is bound READ-ONLY, the other
    // never addressed):
    expect(otherCell.isEmpty()).toBe(true);
    expect(ghostCell.isEmpty()).toBe(true);
  });

  it("depth-0 window: an unresolvable name settles the GATE-FAMILY universal line verbatim (equality over the FRESH real-predicate evaluation) when NO phase governs", async () => {
    const cell = declareVar("anything", "string");
    const world = governingWorld([{ cell, write: true }]);
    world.detachPhase();
    const expected = decideVarWrite(world.snapshot(), "setVar", {
      name: "anything",
    });
    if (!expected) throw new Error("expected the universal refusal");
    const [setVar] = trio(world);
    const result = await run(setVar, { name: "anything", value: "x" });
    expect(line(result)).toBe(expected.reason);
    expect(cell.isEmpty()).toBe(true);
  });

  it.each([
    ["a boolean token", "flag", "boolean", "maybe"],
    ["a non-finite number", "ratio", "number", Number.NaN],
  ] as const)(
    "coercion reject (%s): the lane settles the CELL-OWNED coercion line verbatim and leaves the cell untouched",
    async (_label, name, type, value) => {
      const cell = declareVar(name, type as VarType);
      let thrown: unknown;
      try {
        cell.set(value);
      } catch (err) {
        thrown = err;
      }
      if (!(thrown instanceof VariableRejectionError))
        throw new Error("expected the cell fault");
      const world = governingWorld([{ cell, write: true }]);
      const [setVar] = trio(world);
      const result = await run(setVar, { name, value });
      expect(line(result)).toBe(thrown.message);
      expect(cell.isEmpty()).toBe(true);
    },
  );

  it("class instance: a declared object receiving a class instance settles the CELL-OWNED class-instance line verbatim (driven directly - the schema's upstream domain is documented, not simulated)", async () => {
    class Fixture {
      marker = 1;
    }
    const cell = declareVar("payload", "object");
    const instance = new Fixture();
    let thrown: unknown;
    try {
      cell.set(instance);
    } catch (err) {
      thrown = err;
    }
    if (!(thrown instanceof VariableRejectionError))
      throw new Error("expected the cell fault");
    const world = governingWorld([{ cell, write: true }]);
    const [setVar] = trio(world);
    const result = await run(setVar, { name: "payload", value: instance });
    expect(line(result)).toBe(thrown.message);
    expect(cell.isEmpty()).toBe(true);
  });

  it("nested reference cycle: a declared array receiving a self-reference settles the CELL-OWNED cycle line verbatim", async () => {
    const cell = declareVar("loop", "array");
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    let thrown: unknown;
    try {
      cell.set(cyclic);
    } catch (err) {
      thrown = err;
    }
    if (!(thrown instanceof VariableRejectionError))
      throw new Error("expected the cell fault");
    const world = governingWorld([{ cell, write: true }]);
    const [setVar] = trio(world);
    const result = await run(setVar, { name: "loop", value: cyclic });
    // Family-voice witness: the lane's settled text IS the family message.
    expect(line(result)).toBe(thrown.message);
    expect(thrown.violations).toHaveLength(1);
    expect(cell.isEmpty()).toBe(true);
  });
});

describe("setVar spec-lane settlements (real cell x real tool bodies)", () => {
  it("conforming transform-bearing spec write: the success line and the getVar read-back spell the PARSE OUTPUT (never the raw input) and the cell deep-equals it", async () => {
    const cell = declareVar("slug", {
      label: "Slug Display",
      schema: z.string().transform((raw) => raw.trim().toUpperCase()),
    });
    const world = governingWorld([{ cell, write: true }]);
    const [setVar, getVar] = trio(world);
    const result = await run(setVar, {
      name: "slug",
      value: "  gnostic drift ",
    });
    expect(line(result)).toBe(replicaSuccessLine("slug", "GNOSTIC DRIFT"));
    expect(result.details).toEqual({});
    expect(line(await run(getVar, { name: "slug" }))).toBe("GNOSTIC DRIFT");
    // Deep equality proves the stored value IS the transformed output.
    expect(cell.read()).toEqual("GNOSTIC DRIFT");
  });

  it("conforming object spec write: the success line spells the compact object JSON and the cell deep-equals the fresh parse output", async () => {
    const cell = declareVar("payload", {
      label: "Payload Shape",
      schema: z.object({ k: z.string() }),
    });
    const world = governingWorld([{ cell, write: true }]);
    const [setVar] = trio(world);
    const input = { k: "v" };
    const result = await run(setVar, { name: "payload", value: input });
    expect(line(result)).toBe(replicaSuccessLine("payload", { k: "v" }));
    expect(result.details).toEqual({});
    // Fresh-reference physics: assert deep equality, never identity.
    expect(cell.read()).toEqual(input);
  });

  it("non-conforming spec write mid-turn: the settled text equals the REAL cell throw for the same inputs (identity-over-goldbytes) and the prior value stays intact", async () => {
    const makeRatioCell = () =>
      declareVar("ratio", { label: "Ratio Display", schema: z.number() });
    const cell = makeRatioCell();
    // Parker: a conforming value already stored behind the refusal.
    cell.set(1);
    const twin = makeRatioCell();
    let thrown: unknown;
    try {
      twin.set("maybe");
    } catch (err) {
      thrown = err;
    }
    if (!(thrown instanceof VariableRejectionError))
      throw new Error("expected the cell fault");
    const world = governingWorld([{ cell, write: true }]);
    const [setVar, getVar] = trio(world);
    const result = await run(setVar, { name: "ratio", value: "maybe" });
    expect(line(result)).toBe(thrown.message);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.details).toEqual({});
    // Prior value INTACT across the settled refusal (both read lanes).
    expect(cell.read()).toBe(1);
    expect(line(await run(getVar, { name: "ratio" }))).toBe("1");
  });
});

describe("getVar rendering", () => {
  it("unset name settles the PINNED absent line (strictly the undefined test)", async () => {
    const present = declareVar("present", "string");
    present.set("x");
    const world = governingWorld([
      { cell: present },
      { cell: declareVar("absent-name", "string") },
    ]);
    const [, getVar] = trio(world);
    const result = await run(getVar, { name: "absent-name" });
    expect(line(result)).toBe(replicaAbsentLine("absent-name"));
    expect(result.details).toEqual({});
  });

  it("OUT-OF-VIEW name (bound by no active phase) reports the SAME absent line - uniform absence reporting", async () => {
    const secret = declareVar("secret", "string");
    secret.set("hidden");
    const world = governingWorld([granted("visible")]);
    const [, getVar] = trio(world);
    const result = await run(getVar, { name: "secret" });
    expect(line(result)).toBe(replicaAbsentLine("secret"));
    expect(secret.read()).toBe("hidden");
  });

  it("stored strings render BARE (no quotes); every other stored value renders compact JSON incl. the stored-null corner", async () => {
    const s = declareVar("s", "string");
    const n = declareVar("n", "number");
    const b = declareVar("b", "boolean");
    const nn = declareVar("nn", "null");
    const arr = declareVar("arr", "array");
    const obj = declareVar("obj", "object");
    s.set("bare text");
    n.set(7);
    b.set(false);
    nn.set(null);
    arr.set(["x", "y"]);
    obj.set({ z: 1 });
    const world = governingWorld([
      { cell: s },
      { cell: n },
      { cell: b },
      { cell: nn },
      { cell: arr },
      { cell: obj },
    ]);
    const [, getVar] = trio(world);
    expect(line(await run(getVar, { name: "s" }))).toBe("bare text");
    expect(line(await run(getVar, { name: "n" }))).toBe("7");
    expect(line(await run(getVar, { name: "b" }))).toBe("false");
    expect(line(await run(getVar, { name: "nn" }))).toBe("null");
    expect(line(await run(getVar, { name: "arr" }))).toBe('["x","y"]');
    expect(line(await run(getVar, { name: "obj" }))).toBe('{"z":1}');
  });
});

describe("listVars rendering", () => {
  it("empty window settles the two-key document pretty-printed at two spaces", async () => {
    const world = spannedState();
    const [, , listVars] = trio(world);
    const result = await run(listVars, {});
    expect(line(result)).toBe(
      JSON.stringify({ variables: {}, types: {} }, null, 2),
    );
    expect(result.details).toEqual({});
  });

  it("bound-but-unset names appear ONLY under types (absence from variables is the unset signal)", async () => {
    const world = governingWorld([granted("flag", "boolean")]);
    const [, , listVars] = trio(world);
    expect(line(await run(listVars, {}))).toBe(
      JSON.stringify({ variables: {}, types: { flag: "boolean" } }, null, 2),
    );
  });

  it("settled values ride under variables in BINDING order; types stay in BINDING order over the mixed world", async () => {
    const answer = declareVar("answer", "number");
    answer.set(42);
    const world = governingWorld([
      { cell: answer },
      { cell: declareVar("extra", "string") },
    ]);
    const [, , listVars] = trio(world);
    expect(line(await run(listVars, {}))).toBe(
      JSON.stringify(
        {
          variables: { answer: 42 },
          types: { answer: "number", extra: "string" },
        },
        null,
        2,
      ),
    );
  });

  it("spec declarations display UNDER THEIR LABELS in types in BINDING order: the unset spec rides ONLY under types and the set spec's stored parse output rides under variables", async () => {
    const answer = declareVar("answer", "number");
    answer.set(42);
    const topic = declareVar("topic", {
      label: "Research Topic",
      schema: z.string(),
    });
    topic.set("gnosticism in belgrade");
    const world = governingWorld([
      { cell: answer },
      { cell: topic },
      {
        cell: declareVar("draft", {
          label: "Draft Findings",
          schema: z.array(z.string()),
        }),
      },
    ]);
    const [, , listVars] = trio(world);
    expect(line(await run(listVars, {}))).toBe(
      JSON.stringify(
        {
          variables: { answer: 42, topic: "gnosticism in belgrade" },
          types: {
            answer: "number",
            topic: "Research Topic",
            draft: "Draft Findings",
          },
        },
        null,
        2,
      ),
    );
  });
});

describe("stateless world - the undefined-state degradation (empty view)", () => {
  it("every read settles the absent line and every write settles the UNIVERSAL-line refusal with NO state to consult (silence-is-not-fault, mirroring the disclosure's depth-0 form)", async () => {
    const [setVar, getVar, listVars] = trio(undefined);
    // Write: identity over the FRESH real-predicate evaluation at depth 0.
    const expected = decideVarWrite(depthZeroSnapshot, "setVar", {
      name: "nothing",
    });
    if (!expected) throw new Error("expected the universal refusal");
    expect(line(await run(setVar, { name: "nothing", value: "x" }))).toBe(
      expected.reason,
    );
    // Reads: uniform silence.
    expect(line(await run(getVar, { name: "nothing" }))).toBe(
      replicaAbsentLine("nothing"),
    );
    expect(line(await run(listVars, {}))).toBe(
      JSON.stringify({ variables: {}, types: {} }, null, 2),
    );
  });
});

describe("composed predicate x body matrix (real guard x real tool bodies)", () => {
  it("admitted: a governing phase granting the name yields NO verdict, the body reaches the granted CELL, and the TS-side read observes the value (model to TS)", async () => {
    const cell = declareVar("note", "string");
    const world = governingWorld([{ cell, write: true }]);
    const snapshot = governingSnapshot([{ cell, write: true }]);
    const input = { name: "note", value: "from model" };
    // The real predicate admits (undefined verdict).
    expect(decideVarWrite(snapshot, "setVar", input)).toBeUndefined();
    const [setVar] = trio(world);
    const result = await run(setVar, input);
    expect(line(result)).toBe(replicaSuccessLine("note", "from model"));
    // TS-side observation over the SAME minted cell instance.
    expect(cell.read()).toBe("from model");
  });

  it("refused: a name outside the phase grants yields the predicate's refusal (deep-equal to a FRESH real-predicate evaluation), the minted cell stays UNMOVED across the denied window, and the controlled counterfactual direct-execute over a GRANTING twin world DOES mutate - the pre-execution denial is load-bearing", async () => {
    const allowedCell = declareVar("allowed", "string");
    const world = governingWorld([
      { cell: declareVar("other", "string"), write: true },
      { cell: allowedCell },
    ]);
    const snapshot = world.snapshot();
    const input = { name: "allowed", value: "attempt" };
    const verdict = decideVarWrite(snapshot, "setVar", input);
    if (!verdict) throw new Error("expected the refusal");
    // Identity over the REAL predicate: the fresh evaluation agrees byte
    // for byte on the same state reading.
    expect(verdict).toStrictEqual(decideVarWrite(snapshot, "setVar", input));
    expect(verdict.block).toBe(true);
    // Immobility proof: the consultation window (snapshot consult +
    // verdict) leaves the cell byte-stable.
    const before = {
      isEmpty: allowedCell.isEmpty(),
      value: allowedCell.read(),
    };
    void decideVarWrite(snapshot, "setVar", input);
    expect(allowedCell.isEmpty()).toBe(before.isEmpty);
    expect(allowedCell.read()).toBe(before.value);
    // COUNTERFACTUAL: had the verdict admitted, the SAME body over the
    // twin world (identical cell, GRANTED binding) DOES mutate - proving
    // the denial sits strictly pre-execution.
    const twinCell = declareVar("allowed", "string");
    const twinWorld = governingWorld([{ cell: twinCell, write: true }]);
    const [setVar] = trio(twinWorld);
    const counterfactual = await run(setVar, input);
    expect(line(counterfactual)).toBe(replicaSuccessLine("allowed", "attempt"));
    expect(twinCell.read()).toBe("attempt");
    expect(allowedCell.isEmpty()).toBe(true);
  });

  it("depth-0: the universal denial lane shows the same ordering (verdict deep-equal to a fresh real-predicate evaluation; no cell is reached while the counterfactual mutates)", async () => {
    const cell = declareVar("anything", "string");
    const world = governingWorld([{ cell, write: true }]);
    world.detachPhase();
    const input = { name: "anything", value: "x" };
    const verdict = decideVarWrite(world.snapshot(), "setVar", input);
    if (!verdict) throw new Error("expected the universal refusal");
    expect(verdict).toStrictEqual(
      decideVarWrite(world.snapshot(), "setVar", input),
    );
    expect(cell.isEmpty()).toBe(true);
    // COUNTERFACTUAL: a fresh granting world mutates on the same input.
    const twinCell = declareVar("anything", "string");
    const twinWorld = governingWorld([{ cell: twinCell, write: true }]);
    const [setVar] = trio(twinWorld);
    const counterfactual = await run(setVar, input);
    expect(line(counterfactual)).toBe(replicaSuccessLine("anything", "x"));
    expect(twinCell.read()).toBe("x");
    expect(cell.isEmpty()).toBe(true);
  });

  it("TS to model direction: a programmatic cell.set between phases is observed live through the getVar lane (same-reference cell)", async () => {
    const cell = declareVar("seed", "number");
    const world = governingWorld([{ cell }]);
    // Programmatic definition BETWEEN runs (the view carries no set lane -
    // the cell's own settle is the funnel entry):
    cell.set(99);
    const [, getVar] = trio(world);
    expect(line(await run(getVar, { name: "seed" }))).toBe("99");
  });

  it("malformed-lane division: the guard yields NO verdict for a non-string name (self-filter) and for the read-lane and unrelated tool names - malformed shapes are the schema validator's upstream domain, never fed to the bodies", () => {
    const snapshot = governingSnapshot(grantedSnapshotBindings());
    // Non-string name: extraction fails -> silent allow (shape policing is
    // the tool layer's domain; the schema rejects such payloads upstream).
    expect(decideVarWrite(snapshot, "setVar", { name: 42 })).toBeUndefined();
    expect(decideVarWrite(snapshot, "setVar", { value: "x" })).toBeUndefined();
    // Read-lane names self-filter with no verdict regardless of shape.
    expect(
      decideVarWrite(snapshot, "getVar", { name: "note" }),
    ).toBeUndefined();
    expect(decideVarWrite(snapshot, "listVars", {})).toBeUndefined();
    // Unrelated tool names pass through.
    expect(decideVarWrite(snapshot, "bash", { command: "ls" })).toBeUndefined();
  });
});

/** Binding-set convenience for the malformed-lane rows: one granted cell.
 * (Declared here; hoisting serves its use site above.) */
function grantedSnapshotBindings(): readonly PhaseVarBinding[] {
  return [{ cell: declareVar("note", "string"), write: true }];
}

// ---------------------------------------------------------------------------
// Mechanical island sweep - pinned import partition, export surface, escape
// discipline, and cast-free residue over the module source plus this suite.
// Scanner copied verbatim from the sibling gate suites' house pattern
// (each suite carries its own local partitioner - no shared utility yet).
// ---------------------------------------------------------------------------

describe("mechanical island sweep - module source and suite source", () => {
  const MODULE_SOURCE = readFileSync(
    new URL("./var-tools.ts", import.meta.url),
    "utf8",
  );
  const SUITE_SOURCE = readFileSync(
    new URL("./var-tools.test.ts", import.meta.url),
    "utf8",
  );

  /** Single-pass, STATE-AWARE scan over the raw source: elides comments
   * (line and block), consumes every string/template literal to its
   * matching close quote HONORING BACKSLASH ESCAPES (recording each raw
   * interior in `payloads`, blanking it in the returned `code` with the
   * quote characters kept around a `P` placeholder), and recognizes REGEX
   * LITERALS - a `/` opens one only after an expression-start character
   * (a division `/` never does), consumed through the closing `/` with
   * `[...]` class and backslash-escape fidelity. Raw glyphs in prose
   * comments are house precedent - comments elide here; literals are
   * recorded, not elided. */
  const REGEX_STARTERS = "{[(,=;:!?&|+-*%~^<>";
  function partitionSource(source: string): {
    code: string;
    payloads: string[];
  } {
    const payloads: string[] = [];
    let code = "";
    let prevSig: string | undefined; // last significant code char (regex hint)
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      const next = source[i + 1];
      if (ch === "/" && next === "/") {
        const end = source.indexOf("\n", i);
        i = end === -1 ? source.length : end; // keep the newline itself
        continue;
      }
      if (ch === "/" && next === "*") {
        const end = source.indexOf("*/", i + 2);
        i = end === -1 ? source.length : end + 2;
        continue;
      }
      if (
        ch === "/" &&
        (prevSig === undefined || REGEX_STARTERS.includes(prevSig))
      ) {
        // Regex literal: consume to the unescaped close slash outside [..]
        const regexStart = i;
        let inClass = false;
        i += 1;
        while (i < source.length) {
          const rc = source[i];
          if (rc === "\\") {
            i += 2;
            continue;
          }
          if (rc === "[") inClass = true;
          else if (rc === "]") inClass = false;
          else if (rc === "/" && !inClass) {
            i += 1;
            break;
          }
          i += 1;
        }
        code += source.slice(regexStart, i);
        prevSig = "/";
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") {
        const start = i + 1;
        i += 1;
        while (i < source.length && source[i] !== ch) {
          i += source[i] === "\\" ? 2 : 1;
          if (i >= source.length) break;
        }
        const end = Math.min(i, source.length);
        payloads.push(source.slice(start, end));
        code += `P`;
        prevSig = ch;
        i = end + 1;
        continue;
      }
      code += ch;
      prevSig = /\s/.test(ch) ? prevSig : ch;
      i += 1;
    }
    return { code, payloads };
  }

  // Assembled at runtime so this guard does not self-match its own text.
  const SDK_SPECIFIER = ["@earendil-works", "pi-coding-agent"].join("/");
  const DYN_IMPORT_NEEDLE = ["im", "port("].join("");
  const CAST_TOKEN = ["a", "s"].join("");
  const RAW_GLYPH = String.fromCharCode(0x2014);

  it("pinned import partition: value clauses EXACTLY ['@earendil-works/pi-coding-agent', 'typebox', '../../capability/errors.ts', '../../capability/var-cell.ts'] in source order and type-only clauses EXACTLY ['@earendil-works/pi-coding-agent', '../../capability/var-cell.ts', '../../session-execution-state.ts'] - the wrapped gate-renderers clause is EXEMPT (multi-line) and the state edge is type-only, keeping the runtime graph acyclic", () => {
    expect(MODULE_SOURCE.includes("node:")).toBe(false);
    const valueClauses = [
      ...MODULE_SOURCE.matchAll(
        /^\s*import\s+(?!type\b)[^\n;]*?from\s+["']([^"']+)["']/gm,
      ),
    ].map((match) => match[1]);
    expect(valueClauses).toEqual([
      "@earendil-works/pi-coding-agent",
      "typebox",
      "../../capability/errors.ts",
      "../../capability/var-cell.ts",
    ]);
    // The wrapped gate-renderers clause is the ONE multi-line value
    // importer (exempt from the single-line regex above by construction):
    expect(
      MODULE_SOURCE.includes('} from "../../capability/guards/var-gate.ts";'),
    ).toBe(true);
    const normalized = MODULE_SOURCE.replace(/\s+/g, " ");
    const typeSpecifiers = [
      ...normalized.matchAll(/import type \{[^}]*\} from "([^"]+)"/g),
    ].map((match) => match[1]);
    expect(typeSpecifiers).toEqual([
      "@earendil-works/pi-coding-agent",
      "../../capability/var-cell.ts",
      "../../session-execution-state.ts",
    ]);
  });

  it("the SDK root sits in EXACTLY TWO clauses (one value, one type) and defineTool is the SOLE SDK value symbol while ToolDefinition is the sole SDK type symbol", () => {
    expect(MODULE_SOURCE.split(SDK_SPECIFIER).length - 1).toBe(2);
    const normalized = MODULE_SOURCE.replace(/\s+/g, " ");
    const sdkValueClause = normalized.match(
      new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${SDK_SPECIFIER}"`),
    );
    expect(sdkValueClause?.[1]?.trim()).toBe("defineTool");
    const sdkTypeClause = normalized.match(
      new RegExp(`import type \\{([^}]*)\\} from "${SDK_SPECIFIER}"`),
    );
    expect(sdkTypeClause?.[1].trim()).toBe("ToolDefinition");
  });

  it("runtime export surface is EXACTLY ['createVarTools'] - interfaces erase under erasable syntax", () => {
    expect(Object.keys(varToolsModule).sort()).toEqual(["createVarTools"]);
  });

  it("zero dynamic import() occurrences in the module (channel-free by construction)", () => {
    expect(MODULE_SOURCE.includes(DYN_IMPORT_NEEDLE)).toBe(false);
  });

  it("glyph discipline: NO raw U+2014 in any literal payload or in the comment-free code residue of the MODULE (and NO slash survives the elision of the MODULE - the zero-regex-literals pin keeping this scan sound); the SUITE payloads stay escape-clean", () => {
    const moduleScan = partitionSource(MODULE_SOURCE);
    for (const payload of moduleScan.payloads) {
      expect(payload.includes(RAW_GLYPH)).toBe(false);
    }
    expect(moduleScan.code.includes(RAW_GLYPH)).toBe(false);
    // Soundness pin: elision leaves no slash behind -> no regex literals
    // ever misread as divisions or vice versa.
    expect(moduleScan.code.includes("/")).toBe(false);
    // Suite-side: payloads stay escape-clean (the raw glyph lives in
    // compared VALUES at runtime, assembled from the escaped literals).
    const suiteScan = partitionSource(SUITE_SOURCE);
    for (const payload of suiteScan.payloads) {
      expect(payload.includes(RAW_GLYPH)).toBe(false);
    }
  });

  it("zero `as` casts and zero explicit `any` over the comment/literal-stripped residue of the MODULE (suite excluded: its documented marked seams legitimately carry the token)", () => {
    const { code } = partitionSource(MODULE_SOURCE);
    expect(code.match(new RegExp(`\\b${CAST_TOKEN}\\b`, "g"))).toBeNull();
    expect(code.match(/\bany\b/g)).toBeNull();
  });

  it("dev-process-marker scan over the FINAL module + suite: zero step-attribution / planning-meta tokens (needles assembled from fragments so the scan cannot match itself)", () => {
    const markers: string[] = [
      "\\bstep\\s+\\d",
      "\\bS" + "0\\d\\b",
      "\\bD#\\d",
      "\\u00a7",
      "(?:TASK|PLAN)" + "\\.md",
      `\\b${["ske", "leton"].join("")}\\b`,
      "\\b20\\d{2}-\\d{2}-\\d{2}\\b",
    ];
    for (const source of [MODULE_SOURCE, SUITE_SOURCE]) {
      for (const pattern of markers) {
        expect(
          source.match(new RegExp(pattern, "gi")),
          `marker slipped through: ${pattern}`,
        ).toBeNull();
      }
    }
  });
});
