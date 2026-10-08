// Hermetic unit suite for the model-side variable tool trio
// (tools/vars/var-tools.ts). Self-contained island: the vi.mock factory
// references ONLY inline fakes and never pulls in the original module, so
// the real @earendil-works/pi-coding-agent graph is never evaluated - the
// nine value symbols below are the parent host suite's reference list over
// the full construction seam (identity defineTool, inert session-building
// fakes); every row drives the REAL factory output directly over REAL
// SessionVariableStore instances, and the composed predicate rows pair the
// REAL decideVarWrite over HAND-BUILT ExecutionSnapshot structural literals
// with the real bodies. No filesystem, network, env, or process-stream
// assumptions anywhere.
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
// Golden discipline: the claim-mismatch line and every rendering split
// (success echo, getVar bare-string vs JSON, listVars two-key document)
// bind the module's real output to SUITE-SIDE REPLICA BUILDERS compared by
// byte equality (the module is each line's sole owner; U+2014 arrives
// escaped on both sides - compare unescaped). Rejection lines OWNED BY THE
// STORE (undeclared-write / coercion-reject) are asserted EQUAL to the
// REAL store-thrown VariableRejectionError message for the SAME inputs -
// zero byte copies of store-owned bytes (identity-over-goldbytes). Failure
// lanes resolve readable text: the pinned result shape is exactly
// { content: [{ type: "text", text }], details: {} } on EVERY lane.

import { readFileSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { VariableRejectionError } from "../../capability/errors.ts";
import type {
  CapabilitySources,
  PathAnchors,
} from "../../capability/guards/guard-vocabulary.ts";
import { decideVarWrite } from "../../capability/guards/var-gate.ts";
import { SessionVariableStore } from "../../capability/pio-session.ts";
import type { ExecutionSnapshot } from "../../session-execution-state.ts";
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
function trio(store: SessionVariableStore): [TrioView, TrioView, TrioView] {
  const built = createVarTools(store);
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
// byte is ./var-tools.ts (its module-private renderers, composed THROUGH
// the error home's family where applicable); these witnesses bind the real
// output to the pinned bytes. U+2014 arrives escaped in the module literal
// identically here - compare unescaped.
// ---------------------------------------------------------------------------

const replicaMismatchLine = (
  name: string,
  declared: string,
  claimed: string,
): string =>
  `variable '${name}' is declared as type '${declared}' \u2014 claimed type '${claimed}' does not match the declaration`;

/** Family-composed message over one rendered line (the module's exact
 * composition channel - read for its message bytes, never thrown). */
const familyMessage = (lineShape: string): string =>
  new VariableRejectionError([lineShape]).message;

const replicaSuccessLine = (name: string, stored: unknown): string =>
  `variable '${name}' set to ${JSON.stringify(stored)}.`;

const replicaAbsentLine = (name: string): string =>
  `variable '${name}' is undefined.`;

// ---------------------------------------------------------------------------
// Shared hermetic fixtures - plain structural literals. One anchor pair;
// literal absolute posix strings everywhere (the predicate NEVER consults
// them - sentinel variation proves it).
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

/** Hand-built snapshot with the governing phase admitting EXACTLY the
 * given names (declaration order preserved). */
const governingSnapshot = (vars: readonly string[]): ExecutionSnapshot => ({
  sources: RESEARCH,
  phase: {
    id: "phase-a",
    declared: [],
    allowProjectWrites: false,
    tmpDirAllowed: false,
    vars,
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
    const store = new SessionVariableStore();
    const first = createVarTools(store);
    const second = createVarTools(store);
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(first.map((entry) => entry.name)).toEqual([
      "setVar",
      "getVar",
      "listVars",
    ]);
    expect(second).not.toBe(first);
    for (let i = 0; i < 3; i += 1) {
      expect(second[i]).not.toBe(first[i]);
    }
  });

  it("carries the mirrored labels and non-empty model-facing descriptions on every member", () => {
    const [setVar, getVar, listVars] = trio(new SessionVariableStore());
    expect(setVar.label).toBe("Set Session Variable");
    expect(getVar.label).toBe("Get Session Variable");
    expect(listVars.label).toBe("List Session Variables");
    for (const entry of [setVar, getVar, listVars]) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(typeof entry.execute).toBe("function");
    }
  });

  it("keeps the MINIMAL definition surface (no prompt/rendering/execution-mode fields on any member)", () => {
    const store = new SessionVariableStore();
    for (const entry of createVarTools(store)) {
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

  it("mirrors the legacy parameter schemas: setVar carries name/type/value (six-literal claimed-type union; six-member value union), getVar carries name alone, listVars carries the empty object", () => {
    const [setVar, getVar, listVars] = trio(new SessionVariableStore());
    const setProps = (
      setVar.parameters as { properties: Record<string, unknown> }
    ).properties;
    expect(Object.keys(setProps).sort()).toEqual(["name", "type", "value"]);
    const claimedTypes = setProps.type as {
      anyOf: Array<{ const: unknown }>;
    };
    expect(claimedTypes.anyOf.map((member) => member.const).sort()).toEqual([
      "array",
      "boolean",
      "null",
      "number",
      "object",
      "string",
    ]);
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
      const store = new SessionVariableStore();
      store.declare("target", type);
      const [setVar, getVar] = trio(store);
      const result = await run(setVar, { name: "target", type, value });
      expect(line(result)).toBe(`variable 'target' set to ${echoed}.`);
      expect(result.details).toEqual({});
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(line(await run(getVar, { name: "target" }))).toBe(readBack);
    },
  );

  it('numeric-string corner: claimed number with input "42" settles 42 (not "42") and stores the NUMBER', async () => {
    const store = new SessionVariableStore();
    store.declare("count", "number");
    const [setVar] = trio(store);
    const result = await run(setVar, {
      name: "count",
      type: "number",
      value: "42",
    });
    expect(line(result)).toBe("variable 'count' set to 42.");
    expect(store.get("count")).toBe(42);
  });
});

describe("setVar reject corners (identity over the real store throws)", () => {
  it("claim mismatch: a present name whose claimed type differs from the declaration settles the MODULE-OWNED line (replica-builder golden) WITHOUT touching the store", async () => {
    const store = new SessionVariableStore();
    store.declare("flag", "boolean");
    store.set("flag", true);
    const [setVar] = trio(store);
    const result = await run(setVar, {
      name: "flag",
      type: "number",
      value: "1",
    });
    expect(line(result)).toBe(
      familyMessage(replicaMismatchLine("flag", "boolean", "number")),
    );
    // The prior value stays intact - the lane resolved before any write.
    expect(store.get("flag")).toBe(true);
    expect(result.details).toEqual({});
  });

  it("undeclared short-circuit: an absent name skips the claim check and settles the STORE-OWNED undeclared-write fault verbatim (equality over the real store throw; zero byte copies)", async () => {
    const store = new SessionVariableStore();
    store.declare("other", "string");
    let thrown: VariableRejectionError | undefined;
    try {
      store.set("ghost", "x");
    } catch (err) {
      thrown = err as VariableRejectionError;
    }
    if (!thrown) throw new Error("expected the store fault");
    const [setVar] = trio(store);
    const result = await run(setVar, {
      name: "ghost",
      type: "string",
      value: "x",
    });
    expect(line(result)).toBe(thrown.message);
    expect(store.list()).toEqual([]);
  });

  it.each([
    ["a boolean token", "flag", "boolean", "maybe"],
    ["a non-finite number", "ratio", "number", Number.NaN],
  ] as const)(
    "coercion reject (%s): the lane settles the STORE-OWNED coercion line verbatim and leaves the store untouched",
    async (_label, name, declared, value) => {
      const store = new SessionVariableStore();
      store.declare(name, declared);
      let thrown: VariableRejectionError | undefined;
      try {
        store.set(name, value);
      } catch (err) {
        thrown = err as VariableRejectionError;
      }
      if (!thrown) throw new Error("expected the store fault");
      const [setVar] = trio(store);
      const result = await run(setVar, { name, type: declared, value });
      expect(line(result)).toBe(thrown.message);
      expect(store.get(name)).toBeUndefined();
    },
  );

  it("class instance: a declared object receiving a class instance settles the STORE-OWNED class-instance line verbatim (driven directly - the schema's upstream domain is documented, not simulated)", async () => {
    class Fixture {
      marker = 1;
    }
    const store = new SessionVariableStore();
    store.declare("payload", "object");
    const instance = new Fixture();
    let thrown: VariableRejectionError | undefined;
    try {
      store.set("payload", instance);
    } catch (err) {
      thrown = err as VariableRejectionError;
    }
    if (!thrown) throw new Error("expected the store fault");
    const [setVar] = trio(store);
    const result = await run(setVar, {
      name: "payload",
      type: "object",
      value: instance,
    });
    expect(line(result)).toBe(thrown.message);
    expect(store.get("payload")).toBeUndefined();
  });

  it("nested reference cycle: a declared array receiving a self-reference settles the STORE-OWNED cycle line verbatim", async () => {
    const store = new SessionVariableStore();
    store.declare("loop", "array");
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    let thrown: VariableRejectionError | undefined;
    try {
      store.set("loop", cyclic);
    } catch (err) {
      thrown = err as VariableRejectionError;
    }
    if (!thrown) throw new Error("expected the store fault");
    const [setVar] = trio(store);
    const result = await run(setVar, {
      name: "loop",
      type: "array",
      value: cyclic,
    });
    expect(line(result)).toBe(thrown.message);
    expect(store.list()).toEqual([]);
    // Family-voice witness: the lane's settled text IS the family message.
    expect(line(result)).toBe(thrown.message);
    expect(thrown.violations).toHaveLength(1);
  });
});

describe("getVar rendering", () => {
  it("absent name settles the PINNED absent line (strictly the undefined test)", async () => {
    const store = new SessionVariableStore();
    store.declare("present", "string");
    store.set("present", "x");
    const [, getVar] = trio(store);
    const result = await run(getVar, { name: "absent-name" });
    expect(line(result)).toBe(replicaAbsentLine("absent-name"));
    expect(result.details).toEqual({});
  });

  it("stored strings render BARE (no quotes); every other stored value renders compact JSON incl. the stored-null corner", async () => {
    const store = new SessionVariableStore();
    store.declare("s", "string");
    store.declare("n", "number");
    store.declare("b", "boolean");
    store.declare("nn", "null");
    store.declare("arr", "array");
    store.declare("obj", "object");
    store.set("s", "bare text");
    store.set("n", 7);
    store.set("b", false);
    store.set("nn", null);
    store.set("arr", ["x", "y"]);
    store.set("obj", { z: 1 });
    const [, getVar] = trio(store);
    expect(line(await run(getVar, { name: "s" }))).toBe("bare text");
    expect(line(await run(getVar, { name: "n" }))).toBe("7");
    expect(line(await run(getVar, { name: "b" }))).toBe("false");
    expect(line(await run(getVar, { name: "nn" }))).toBe("null");
    expect(line(await run(getVar, { name: "arr" }))).toBe('["x","y"]');
    expect(line(await run(getVar, { name: "obj" }))).toBe('{"z":1}');
  });
});

describe("listVars rendering", () => {
  it("empty store settles the two-key document pretty-printed at two spaces", async () => {
    const store = new SessionVariableStore();
    const [, , listVars] = trio(store);
    const result = await run(listVars, {});
    expect(line(result)).toBe(
      JSON.stringify({ variables: {}, types: {} }, null, 2),
    );
    expect(result.details).toEqual({});
  });

  it("declared-but-unset names appear ONLY under types (absence from variables is the unset signal)", async () => {
    const store = new SessionVariableStore();
    store.declare("flag", "boolean");
    const [, , listVars] = trio(store);
    expect(line(await run(listVars, {}))).toBe(
      JSON.stringify({ variables: {}, types: { flag: "boolean" } }, null, 2),
    );
  });

  it("stored values ride under variables in INSERTION order; types stay in DECLARATION order over the mixed world", async () => {
    const store = new SessionVariableStore();
    store.declare("answer", "number");
    store.declare("extra", "string");
    store.set("answer", 42);
    const [, , listVars] = trio(store);
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
});

describe("composed predicate x body matrix (real guard x real tool bodies)", () => {
  it("admitted: a governing phase declaring the name yields NO verdict, the body reaches the store, and the TS-side read observes the value (model to TS)", async () => {
    const store = new SessionVariableStore();
    store.declare("note", "string");
    const snapshot = governingSnapshot(["note"]);
    const input = { name: "note", type: "string", value: "from model" };
    // The real predicate admits (undefined verdict).
    expect(decideVarWrite(snapshot, "setVar", input)).toBeUndefined();
    const [setVar] = trio(store);
    const result = await run(setVar, input);
    expect(line(result)).toBe(replicaSuccessLine("note", "from model"));
    // TS-side observation over the SAME store instance.
    expect(store.get("note")).toBe("from model");
  });

  it("refused: a name outside the phase listing yields the predicate's refusal (deep-equal to a FRESH real-predicate evaluation), the store stays UNMOVED across the denied window, and the controlled counterfactual direct-execute over the twin store DOES mutate - the pre-execution denial is load-bearing", async () => {
    const store = new SessionVariableStore();
    store.declare("allowed", "string");
    const snapshot = governingSnapshot(["other"]);
    const input = { name: "allowed", type: "string", value: "attempt" };
    const verdict = decideVarWrite(snapshot, "setVar", input);
    if (!verdict) throw new Error("expected the refusal");
    // Identity over the REAL predicate: the fresh evaluation agrees byte
    // for byte on the same state reading.
    expect(verdict).toStrictEqual(decideVarWrite(snapshot, "setVar", input));
    expect(verdict.block).toBe(true);
    // Immobility proof: the consultation window (snapshot consult +
    // verdict) leaves the store byte-stable.
    const before = {
      declarations: store.declarations(),
      listing: store.list(),
      value: store.get("allowed"),
    };
    void decideVarWrite(snapshot, "setVar", input);
    expect(store.declarations()).toEqual(before.declarations);
    expect(store.list()).toEqual(before.listing);
    expect(store.get("allowed")).toBe(before.value);
    // COUNTERFACTUAL: had the verdict admitted, the SAME body over the
    // twin store (identical declaration) DOES mutate - proving the
    // denial sits strictly pre-execution.
    const twin = new SessionVariableStore();
    twin.declare("allowed", "string");
    const [setVar] = trio(twin);
    const counterfactual = await run(setVar, input);
    expect(line(counterfactual)).toBe(replicaSuccessLine("allowed", "attempt"));
    expect(twin.get("allowed")).toBe("attempt");
    expect(store.get("allowed")).toBeUndefined();
  });

  it("depth-0: the universal denial lane shows the same ordering (verdict deep-equal to a fresh real-predicate evaluation; the store is never reached while the counterfactual mutates)", async () => {
    const store = new SessionVariableStore();
    store.declare("anything", "string");
    const input = { name: "anything", type: "string", value: "x" };
    const verdict = decideVarWrite(depthZeroSnapshot, "setVar", input);
    if (!verdict) throw new Error("expected the universal refusal");
    expect(verdict).toStrictEqual(
      decideVarWrite(depthZeroSnapshot, "setVar", input),
    );
    expect(store.list()).toEqual([]);
    expect(store.get("anything")).toBeUndefined();
    const twin = new SessionVariableStore();
    twin.declare("anything", "string");
    const [setVar] = trio(twin);
    const counterfactual = await run(setVar, input);
    expect(line(counterfactual)).toBe(replicaSuccessLine("anything", "x"));
    expect(twin.get("anything")).toBe("x");
  });

  it("TS to model direction: a programmatic declare+set is observed live through the getVar lane (same-reference store)", async () => {
    const store = new SessionVariableStore();
    store.declare("seed", "number");
    store.set("seed", 99);
    const [, getVar] = trio(store);
    expect(line(await run(getVar, { name: "seed" }))).toBe("99");
  });

  it("malformed-lane division: the guard yields NO verdict for a non-string name (self-filter) and for the read-lane and unrelated tool names - malformed shapes are the schema validator's upstream domain, never fed to the bodies", () => {
    const snapshot = governingSnapshot(["note"]);
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
        }
        const end = Math.min(i, source.length);
        payloads.push(source.slice(start, end));
        code += ch + "P" + ch;
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

  it("pinned import partition: value clauses EXACTLY ['@earendil-works/pi-coding-agent', 'typebox', '../../capability/errors.ts'] in source order and type-only clauses EXACTLY ['@earendil-works/pi-coding-agent', '../../capability/pio-session.ts'] - the type-only store edge keeps the runtime graph acyclic", () => {
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
    ]);
    const normalized = MODULE_SOURCE.replace(/\s+/g, " ");
    const typeSpecifiers = [
      ...normalized.matchAll(/import type \{[^}]*\} from "([^"]+)"/g),
    ].map((match) => match[1]);
    expect(typeSpecifiers).toEqual([
      "@earendil-works/pi-coding-agent",
      "../../capability/pio-session.ts",
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

  it("glyph discipline: NO raw U+2014 in any literal payload or in the comment-free code residue of BOTH files - and NO slash survives the elision of the MODULE (the zero-regex-literals pin keeping this scan sound)", () => {
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
