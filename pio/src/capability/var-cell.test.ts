// Hermetic unit suite for the no-store variable substrate (var-cell.ts).
// Pure unit rows: direct declareVar / cell construction over inline zod
// schemas - ZERO SDK, ZERO real fs/tmpdir, ZERO $HOME, ZERO network
// (mirrors the hermetic store rows that construct the class directly;
// status.ts leaf purity makes the captureError import SDK-free). Golden
// lines below are REPLICAS - suites never share fixtures - and the sole
// owner of every moved byte family is the module-private (plus exported
// seam) renderers in ./var-cell.ts. The \u2014 escape is replicated
// identically (never a literal em dash inside a string literal). Name
// assertions over the unexported bookkeeping voices follow the house
// idiom (assert by NAME only; no instanceof).
import { readFileSync } from "node:fs";
import { z } from "zod";
import { VariableRejectionError } from "./errors.ts";
import { captureError } from "./status.ts";
import type { CustomVarSpec, PhaseVarBinding, VarType } from "./var-cell.ts";
import {
  admitVarType,
  declareVar,
  displayVarType,
  emptyBindingNames,
  listWriteGrants,
  projectReadSet,
  VarCell,
} from "./var-cell.ts";

/** Replica of the pinned malformed-base-type line (exact bytes; the
 * ${payload} echo spells String(payload) - arrays comma-join, null echoes
 * "null"). Pure ASCII. */
const varRegistryMalformedLine = (type: string, name: string): string =>
  `var registry: invalid base type '${type}' for variable '${name}'`;

/** Replica of the pinned malformed-spec-label line (a NON-STRING or EMPTY
 * label; one line covers both, echoing nothing). Pure ASCII. */
const varRegistrySpecLabelLine = (name: string): string =>
  `var registry: invalid spec label for variable '${name}': label must be a non-empty string`;

/** Replica of the pinned built-in-shadowing line (the label is a non-empty
 * string and echoes verbatim). Pure ASCII. */
const varRegistrySpecShadowLine = (name: string, label: string): string =>
  `var registry: invalid spec label for variable '${name}': label '${label}' shadows a built-in type name`;

/** Replica of the PINNED unrecognized-schema line (class 3: the schema
 * member failed the library's own type guard; nothing echoed). */
const varRegistrySpecSchemaLine = (name: string): string =>
  `var registry: invalid spec schema for variable '${name}': schema is not a recognizable zod schema`;

/** Default-message prefix of the family (sole owner: the error home). */
const VAR_REJECTION_PREFIX = "Variable rejection: ";

/** Replica of the pinned coercion-reject line (validated write path).
 * Sole owner: the module renderer in ./var-cell.ts. */
const varCoercionRejectLine = (
  name: string,
  type: string,
  spelling: string,
  clause: string,
): string =>
  `variable '${name}' cannot take a value of type '${spelling}' as declared type '${type}' \u2014 ${clause}`;

/** Spec-lane defect-line frame replica (sole owner: the module renderer in
 * ./var-cell.ts) - rows supply the composed problem text so order, join,
 * and path-prefix spelling pin end-to-end. */
const varSpecDefectLine = (name: string, problemText: string): string =>
  `variable '${name}' does not satisfy its declared shape check \u2014 ${problemText}`;

/** Dedicated check-fault line replica (sole owner: the module fault-line
 * renderer in ./var-cell.ts). */
const varSpecFaultLine = (name: string): string =>
  `variable '${name}' cannot be shape-checked \u2014 the declared shape check itself faulted while checking the value`;

// Pinned CLAUSE vocabulary (one constant per emitted clause - every
// clause the shared conversion core can emit is goldened through these).
const CLAUSE_UNDEFINED = "value is undefined";
const CLAUSE_FUNCTION = "value is a function";
const CLAUSE_SYMBOL = "value is a symbol";
const CLAUSE_BIGINT = "value is a bigint";
const CLAUSE_NAN = "number is not finite (NaN)";
const CLAUSE_PLUS_INFINITY = "number is not finite (+Infinity)";
const CLAUSE_MINUS_INFINITY = "number is not finite (-Infinity)";
const CLAUSE_CLASS_INSTANCE = "value is a class instance";
const CLAUSE_REFERENCE_CYCLE = "value contains a reference cycle";
const CLAUSE_BOOLEAN_TOKEN = "token is not a recognized boolean form";
const CLAUSE_SHAPE_ARRAY = "value is an array";
const CLAUSE_SHAPE_OBJECT = "value is an object";
const clauseGeneric = (type: string): string =>
  `value does not coerce to '${type}'`;

/** Replica of the pinned duplicate-binding line (pure ASCII; the exact
 * form is frozen here alongside the module owner). */
const phaseVarDuplicateLine = (name: string): string =>
  `phase binding set: variable '${name}' is bound more than once; a phase binds each variable at most once`;

// MARKED CAST SEAM (test-side only, house pattern): a runtime-foreign base
// type that type erasure admits - drives the malformed-base-type fault rows
// (source never casts; the union erases at runtime so only a foreign caller
// could supply this).
const foreignVarType = "bogus" as VarType;

// MARKED CAST SEAM (test-side only, house pattern à la foreignVarType): a
// runtime-foreign declareVar PAYLOAD that type erasure admits - drives the
// dispatch-edge rows (non-string primitives / arrays / null) and the
// class-1 / class-3 malformed-spec rows (non-string labels, non-zod schema
// members). The source never casts.
const foreignDeclarePayload = (value: unknown): VarType | CustomVarSpec =>
  value as VarType | CustomVarSpec;

/** Fault-capture helper for the unexported bookkeeping voices: asserts
 * the Error shape by NAME only (no instanceof - the voice classes are
 * module-local, so identity checks cannot reach them). */
function captureNamedFault(fn: () => void): { name: string; message: string } {
  try {
    fn();
  } catch (err) {
    if (err instanceof Error) return { name: err.name, message: err.message };
    throw new Error(`expected an Error fault, got ${String(err)}`);
  }
  throw new Error("expected a fault, none thrown");
}

/** Assert a THROWN family member: identity, EXACTLY one violation line
 * (the pinned bytes), the composed default message, and NO cause key. */
function expectFamilyFault(fn: () => void, line: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  if (!(caught instanceof VariableRejectionError)) {
    throw new Error(`expected a VariableRejectionError, got ${String(caught)}`);
  }
  const err = caught;
  expect(err.name).toBe("VariableRejectionError");
  expect(err.violations).toEqual([line]);
  expect(err.message).toBe(`${VAR_REJECTION_PREFIX}${line}`);
  expect("cause" in err).toBe(false);
}

describe("VarCell \u2014 admission (declareVar)", () => {
  it("mints WELL-FORMED cells: every built-in literal and a custom spec each return a FRESH admitted cell carrying its author-supplied name; same-named mints are DISTINCT objects (no name-index anywhere); nothing mints populated", () => {
    const literals: VarType[] = [
      "boolean",
      "number",
      "string",
      "array",
      "object",
      "null",
    ];
    const first = declareVar("flag", "boolean");
    expect(first).toBeInstanceOf(VarCell);
    expect(first.name).toBe("flag");
    expect(first.isEmpty()).toBe(true);
    expect(first.read()).toBeUndefined();
    // Every call returns a fresh independent object: same-named mints
    // coexist harmlessly.
    expect(declareVar("flag", "boolean")).not.toBe(first);
    const spec = declareVar("decision", {
      label: "decision-shape",
      schema: z.object({ action: z.string() }),
    });
    expect(spec.name).toBe("decision");
    expect(spec.isEmpty()).toBe(true);
    for (const literal of literals) {
      expect(declareVar(`lit-${literal}`, literal).name).toBe(`lit-${literal}`);
    }
  });

  it("a MALFORMED base type (runtime foreignness past type erasure) faults in the developer-facing bookkeeping voice named VarAdmissionError with the exact pinned bytes; nothing mints", () => {
    const fault = captureNamedFault(() => declareVar("n", foreignVarType));
    expect(fault.name).toBe("VarAdmissionError");
    expect(fault.message).toBe(varRegistryMalformedLine("bogus", "n"));
    expect(/\u2014/.test(fault.message)).toBe(false); // pure ASCII
  });

  it("DISPATCH EDGE (non-string primitive, ARRAY, and NULL payloads): every such payload settles the single malformed-base-type line with its payload-interpolation echo, byte-stable for every payload kind; nothing mints across the sweep", () => {
    const cases: Array<[name: string, payload: unknown]> = [
      ["n-prime", 42],
      ["b-prime", true],
      ["a-prime", [1, 2]],
      ["q-null", null],
    ];
    for (const [name, payload] of cases) {
      const fault = captureNamedFault(() =>
        declareVar(name, foreignDeclarePayload(payload)),
      );
      expect(fault.name).toBe("VarAdmissionError");
      // The ${payload} echo is the String(payload) spelling.
      expect(fault.message).toBe(
        varRegistryMalformedLine(String(payload), name),
      );
      expect(/\u2014/.test(fault.message)).toBe(false); // pure ASCII
    }
  });

  it("MALFORMED spec, class 1 (EMPTY or NON-STRING label): faults LOUDLY with the EXACT pinned L1 bytes \u2014 ONE line covering both, echoing NOTHING (the non-string label rides the marked cast seam as runtime foreignness past erasure); nothing mints", () => {
    // Empty-string label (compiles directly; the schema slot is legal).
    const emptyFault = captureNamedFault(() =>
      declareVar("blank", { label: "", schema: z.string() }),
    );
    expect(emptyFault.name).toBe("VarAdmissionError");
    expect(emptyFault.message).toBe(varRegistrySpecLabelLine("blank"));
    expect(/\u2014/.test(emptyFault.message)).toBe(false);
    // NON-STRING label (marked-cast seam à la foreignVarType).
    const nonStringFault = captureNamedFault(() =>
      declareVar(
        "weird",
        foreignDeclarePayload({ label: 42, schema: z.string() }),
      ),
    );
    expect(nonStringFault.name).toBe("VarAdmissionError");
    expect(nonStringFault.message).toBe(varRegistrySpecLabelLine("weird"));
    expect(/\u2014/.test(nonStringFault.message)).toBe(false);
  });

  it("MALFORMED spec, class 2 (label shadowing a built-in literal): one explicit row pins L2 with the PROVEN non-empty string label echoed VERBATIM, plus a compact sweep asserting ALL SIX literal labels fault L2 (fresh names each) \u2014 nothing mints", () => {
    const fault = captureNamedFault(() =>
      declareVar("shadow", { label: "string", schema: z.string() }),
    );
    expect(fault.name).toBe("VarAdmissionError");
    expect(fault.message).toBe(varRegistrySpecShadowLine("shadow", "string"));
    expect(/\u2014/.test(fault.message)).toBe(false);
    const literals: VarType[] = [
      "boolean",
      "number",
      "string",
      "array",
      "object",
      "null",
    ];
    for (const [index, literal] of literals.entries()) {
      const sweepName = `shadow-${index}`;
      const sweepFault = captureNamedFault(() =>
        declareVar(sweepName, { label: literal, schema: z.string() }),
      );
      expect(sweepFault.name).toBe("VarAdmissionError");
      expect(sweepFault.message).toBe(
        varRegistrySpecShadowLine(sweepName, literal),
      );
      expect(/\u2014/.test(sweepFault.message)).toBe(false);
    }
  });

  it("MALFORMED spec, class 3 (NON-ZOD schema member: {} / a plain object): faults LOUDLY with the exact pinned L3 bytes; nothing mints", () => {
    const fault = captureNamedFault(() =>
      declareVar(
        "bad",
        foreignDeclarePayload({ label: "custom-shape", schema: {} }),
      ),
    );
    expect(fault.name).toBe("VarAdmissionError");
    expect(fault.message).toBe(varRegistrySpecSchemaLine("bad"));
    expect(/\u2014/.test(fault.message)).toBe(false); // pure ASCII
  });

  it("FIRST-FAULT single-settle doctrine: a spec carrying MULTIPLE faults settles the FIRST one in triage order (label class 1 precedes the schema class 3; the shadow class 2 precedes the schema class 3) \u2014 collect-all barred, nothing mints", () => {
    const labelFirst = captureNamedFault(() =>
      declareVar("two-1", foreignDeclarePayload({ label: "", schema: {} })),
    );
    expect(labelFirst.name).toBe("VarAdmissionError");
    expect(labelFirst.message).toBe(varRegistrySpecLabelLine("two-1"));
    const shadowFirst = captureNamedFault(() =>
      declareVar(
        "two-2",
        foreignDeclarePayload({ label: "number", schema: {} }),
      ),
    );
    expect(shadowFirst.name).toBe("VarAdmissionError");
    expect(shadowFirst.message).toBe(
      varRegistrySpecShadowLine("two-2", "number"),
    );
  });

  it("the shared admission core RETURNS the DISPLAY name on success (the store-delegation seam's feed): a literal returns ITSELF, a well-formed spec returns ITS LABEL \u2014 a malformed payload never returns", () => {
    expect(admitVarType("l", "string")).toBe("string");
    expect(
      admitVarType("s", { label: "decision-shape", schema: z.string() }),
    ).toBe("decision-shape");
    expect(() => admitVarType("f", foreignVarType)).toThrow();
  });

  it("DISPLAY derivation (resolver-owned, NO stored field): a built-in cell displays its LITERAL, a spec cell displays its LABEL \u2014 delegated to the display resolver, consistent with the admission return", () => {
    const builtin = declareVar("note", "string");
    expect(builtin.displayName).toBe("string");
    expect(displayVarType("string")).toBe("string");
    const spec = declareVar("pair", {
      label: "pair-shape",
      schema: z.string(),
    });
    expect(spec.displayName).toBe("pair-shape");
    expect(displayVarType({ label: "pair-shape", schema: z.string() })).toBe(
      "pair-shape",
    );
  });
});

describe("VarCell \u2014 admission/conversion matrix (set)", () => {
  it("'boolean': ADMITS exactly the four sanctioned forms (true, 'true', false, 'false'); every non-sanctioned input (token-like strings '1'/'yes'/'0'/'no', bare 0/1, numbers, null, and other shapes) FAULTS with the exact pinned clause each and leaves the prior value intact", () => {
    const cell = declareVar("b", "boolean");
    const admits: readonly { input: unknown; stored: unknown }[] = [
      { input: true, stored: true },
      { input: "true", stored: true },
      { input: false, stored: false },
      { input: "false", stored: false },
    ];
    for (const row of admits) {
      cell.set(row.input);
      expect(cell.read()).toBe(row.stored);
    }
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: "1", spelling: "string", clause: CLAUSE_BOOLEAN_TOKEN },
      { input: "yes", spelling: "string", clause: CLAUSE_BOOLEAN_TOKEN },
      { input: "0", spelling: "string", clause: CLAUSE_BOOLEAN_TOKEN },
      { input: "no", spelling: "string", clause: CLAUSE_BOOLEAN_TOKEN },
      { input: "maybe", spelling: "string", clause: CLAUSE_BOOLEAN_TOKEN },
      { input: 1, spelling: "number", clause: clauseGeneric("boolean") },
      { input: 0, spelling: "number", clause: clauseGeneric("boolean") },
      { input: null, spelling: "null", clause: clauseGeneric("boolean") },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: Number.NaN, spelling: "number", clause: CLAUSE_NAN },
      {
        input: Number.POSITIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_PLUS_INFINITY,
      },
      {
        input: Number.NEGATIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_MINUS_INFINITY,
      },
      { input: [true], spelling: "object", clause: CLAUSE_SHAPE_ARRAY },
      { input: { b: true }, spelling: "object", clause: CLAUSE_SHAPE_OBJECT },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      { input: () => 1, spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      cell.set(true); // park a known-good value first
      expectFamilyFault(
        () => cell.set(row.input),
        varCoercionRejectLine("b", "boolean", row.spelling, row.clause),
      );
      expect(cell.read()).toBe(true); // rejected write leaves prior value intact
    }
  });

  it("'number': ADMITS finite numbers and the numeric-string corners ('42', ' 42 ', '0x1A', '1e3', '-7'); every non-coercible input ('', null, true, [5], NaN, ±Infinity) FAULTS with the exact pinned clause each", () => {
    const cell = declareVar("n", "number");
    const admits: readonly { input: unknown; stored: number }[] = [
      { input: 42, stored: 42 },
      { input: 0, stored: 0 },
      { input: -0.5, stored: -0.5 },
      { input: "42", stored: 42 },
      { input: " 42 ", stored: 42 },
      { input: "0x1A", stored: 26 },
      { input: "1e3", stored: 1000 },
      { input: "-7", stored: -7 },
    ];
    for (const row of admits) {
      cell.set(row.input);
      expect(cell.read()).toBe(row.stored);
    }
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: "", spelling: "string", clause: clauseGeneric("number") },
      { input: "banana", spelling: "string", clause: clauseGeneric("number") },
      { input: null, spelling: "null", clause: clauseGeneric("number") },
      { input: true, spelling: "boolean", clause: clauseGeneric("number") },
      { input: false, spelling: "boolean", clause: clauseGeneric("number") },
      { input: [5], spelling: "object", clause: CLAUSE_SHAPE_ARRAY },
      { input: { n: 1 }, spelling: "object", clause: CLAUSE_SHAPE_OBJECT },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: Number.NaN, spelling: "number", clause: CLAUSE_NAN },
      {
        input: Number.POSITIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_PLUS_INFINITY,
      },
      {
        input: Number.NEGATIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_MINUS_INFINITY,
      },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      { input: () => 1, spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      cell.set(0);
      expectFamilyFault(
        () => cell.set(row.input),
        varCoercionRejectLine("n", "number", row.spelling, row.clause),
      );
      expect(cell.read()).toBe(0);
    }
  });

  it("'string': ADMITS strings verbatim plus finite-number and boolean String()-form conversions; arrays, objects, and null FAULT with the exact pinned clause each", () => {
    const cell = declareVar("s", "string");
    const admits: readonly { input: unknown; stored: string }[] = [
      { input: "hello", stored: "hello" },
      { input: "", stored: "" },
      { input: 42, stored: "42" },
      { input: -0.5, stored: "-0.5" },
      { input: 0, stored: "0" },
      { input: true, stored: "true" },
      { input: false, stored: "false" },
    ];
    for (const row of admits) {
      cell.set(row.input);
      expect(cell.read()).toBe(row.stored);
    }
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: ["x"], spelling: "object", clause: CLAUSE_SHAPE_ARRAY },
      { input: { s: 1 }, spelling: "object", clause: CLAUSE_SHAPE_OBJECT },
      { input: null, spelling: "null", clause: clauseGeneric("string") },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: Number.NaN, spelling: "number", clause: CLAUSE_NAN },
      {
        input: Number.POSITIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_PLUS_INFINITY,
      },
      {
        input: Number.NEGATIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_MINUS_INFINITY,
      },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      { input: () => "x", spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      cell.set("");
      expectFamilyFault(
        () => cell.set(row.input),
        varCoercionRejectLine("s", "string", row.spelling, row.clause),
      );
      expect(cell.read()).toBe("");
    }
  });

  it("'array': ADMITS arrays subject to the stored-by-reference integrity walk (plain prototypes everywhere, acyclic, no class instances at any depth; scalar leaves need no walk) storing the SAME reference, and rejects every non-array shape with the exact pinned clause", () => {
    const cell = declareVar("a", "array");
    const admits: readonly { input: unknown[]; label: string }[] = [
      { input: [], label: "empty" },
      { input: [1, "two", true, null], label: "mixed scalar leaves" },
      { input: [[{ a: [] }], {}], label: "nested plain structures" },
      { input: [Object.create(null)], label: "null-prototype element" },
    ];
    for (const row of admits) {
      cell.set(row.input);
      expect(cell.read()).toBe(row.input); // SAME reference
    }
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: "a", spelling: "string", clause: clauseGeneric("array") },
      { input: 1, spelling: "number", clause: clauseGeneric("array") },
      { input: { a: [] }, spelling: "object", clause: CLAUSE_SHAPE_OBJECT },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: () => [], spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      cell.set([]);
      expectFamilyFault(
        () => cell.set(row.input),
        varCoercionRejectLine("a", "array", row.spelling, row.clause),
      );
      expect(cell.read()).toEqual([]);
    }
  });

  it("'object': ADMITS plain acyclic objects (recursively) storing the SAME reference and rejects arrays, class instances, cycles, and scalars with the exact pinned clause each", () => {
    const cell = declareVar("o", "object");
    const admits: readonly { input: Record<string, unknown>; label: string }[] =
      [
        { input: {}, label: "empty" },
        { input: { a: 1, b: { c: [2] } }, label: "nested plain" },
        {
          input: Object.assign(Object.create(null), { k: 1 }),
          label: "null prototype top-level",
        },
        {
          input: { inner: Object.create(null) },
          label: "null prototype nested",
        },
      ];
    for (const row of admits) {
      cell.set(row.input);
      expect(cell.read()).toBe(row.input); // SAME reference
    }
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: [], spelling: "object", clause: CLAUSE_SHAPE_ARRAY },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      {
        input: { d: new Date() },
        spelling: "object",
        clause: CLAUSE_CLASS_INSTANCE,
      }, // NESTED instance
      { input: "o", spelling: "string", clause: clauseGeneric("object") },
      { input: 1, spelling: "number", clause: clauseGeneric("object") },
      { input: null, spelling: "null", clause: clauseGeneric("object") },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: () => ({}), spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      cell.set({});
      expectFamilyFault(
        () => cell.set(row.input),
        varCoercionRejectLine("o", "object", row.spelling, row.clause),
      );
      expect(cell.read()).toEqual({});
    }
  });

  it("'null': ADMITS null ONLY (universal null rule) and rejects everything else \u2014 including the string 'null' \u2014 with the exact pinned clause each", () => {
    const cell = declareVar("z", "null");
    cell.set(null);
    expect(cell.read()).toBeNull();
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: 0, spelling: "number", clause: clauseGeneric("null") },
      { input: "null", spelling: "string", clause: clauseGeneric("null") },
      { input: "", spelling: "string", clause: clauseGeneric("null") },
      { input: true, spelling: "boolean", clause: clauseGeneric("null") },
      { input: [null], spelling: "object", clause: CLAUSE_SHAPE_ARRAY },
      { input: { z: null }, spelling: "object", clause: CLAUSE_SHAPE_OBJECT },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: Number.NaN, spelling: "number", clause: CLAUSE_NAN },
      {
        input: Number.POSITIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_PLUS_INFINITY,
      },
      {
        input: Number.NEGATIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_MINUS_INFINITY,
      },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      { input: () => null, spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      expectFamilyFault(
        () => cell.set(row.input),
        varCoercionRejectLine("z", "null", row.spelling, row.clause),
      );
      expect(cell.read()).toBeNull(); // prior value intact
    }
  });
});

describe("VarCell \u2014 stored-by-reference integrity walk (deep structure)", () => {
  it("top-level SELF-reference cycles reject under 'object' and 'array' types with the cycle clause (never rendered \u2014 clause grammar dodges the serialization hazard)", () => {
    const objectCell = declareVar("o", "object");
    const arrayCell = declareVar("a", "array");
    const selfObj: Record<string, unknown> = {};
    selfObj.self = selfObj;
    expectFamilyFault(
      () => objectCell.set(selfObj),
      varCoercionRejectLine("o", "object", "object", CLAUSE_REFERENCE_CYCLE),
    );
    const selfArr: unknown[] = [];
    selfArr.push(selfArr);
    expectFamilyFault(
      () => arrayCell.set(selfArr),
      varCoercionRejectLine("a", "array", "object", CLAUSE_REFERENCE_CYCLE),
    );
    // Both cells stay clean: the faulted writes landed nothing.
    expect(objectCell.isEmpty()).toBe(true);
    expect(arrayCell.isEmpty()).toBe(true);
  });

  it("NESTED cycles reject at ANY depth \u2014 including via array ELEMENTS \u2014 with the cycle clause", () => {
    const cell = declareVar("o", "object");
    const inner: unknown[] = [];
    const wrapper: Record<string, unknown> = { inner };
    inner.push(wrapper); // back-edge through an array element
    expectFamilyFault(
      () => cell.set(wrapper),
      varCoercionRejectLine("o", "object", "object", CLAUSE_REFERENCE_CYCLE),
    );
    const deepArray: unknown[] = [];
    const deepInner: Record<string, unknown> = { b: deepArray };
    const deepHolder: Record<string, unknown> = { a: deepInner };
    deepArray.push(deepHolder); // back-edge two levels down
    expectFamilyFault(
      () => cell.set(deepHolder),
      varCoercionRejectLine("o", "object", "object", CLAUSE_REFERENCE_CYCLE),
    );
    expect(cell.isEmpty()).toBe(true); // nothing minted across both faults
  });

  it("class instances reject at ANY depth (element and property alike) with the instance clause; a CUSTOM-PROTOTYPE container is non-plain even when its own keys look fine", () => {
    const arrayCell = declareVar("a", "array");
    const objectCell = declareVar("o", "object");
    expectFamilyFault(
      () => arrayCell.set([new Date()]),
      varCoercionRejectLine("a", "array", "object", CLAUSE_CLASS_INSTANCE),
    );
    expectFamilyFault(
      () => objectCell.set({ stamp: new Date() }),
      varCoercionRejectLine("o", "object", "object", CLAUSE_CLASS_INSTANCE),
    );
    const exoticProto = { custom: true };
    const exoticElement: unknown = Object.create(exoticProto);
    expectFamilyFault(
      () => arrayCell.set([exoticElement]),
      varCoercionRejectLine("a", "array", "object", CLAUSE_CLASS_INSTANCE),
    );
    expect(arrayCell.isEmpty()).toBe(true);
    expect(objectCell.isEmpty()).toBe(true);
  });

  it("SHARED substructures admit (path-based ancestor tracking: sharing is not a cycle) and deep plain nesting round-trips by reference; PLAIN prototypes (Object.prototype AND null prototypes) admit at every level", () => {
    const cell = declareVar("o", "object");
    const sharedLeaf: Record<string, unknown> = { x: 1 };
    const dagRoot: Record<string, unknown> = {
      left: sharedLeaf,
      right: sharedLeaf,
    };
    cell.set(dagRoot);
    expect(cell.read()).toBe(dagRoot);
    const deep: Record<string, unknown> = { l1: { l2: { l3: [{ l4: 4 }] } } };
    cell.set(deep);
    expect(cell.read()).toBe(deep);
    // Null-prototype shapes admit alongside the default Object.prototype
    // (ground truth measured against the plainness predicate's two arms).
    const nullProto: Record<string, unknown> = Object.create(null);
    nullProto.k = 1;
    cell.set(nullProto);
    expect(cell.read()).toBe(nullProto);
  });
});

describe("VarCell \u2014 spec-lane funnel (set, custom-spec declarations)", () => {
  it("a CONFORMING write stores EXACTLY the parse output: the identity lane deep-equals the input (deep equality ONLY \u2014 object parse yields a fresh reference, so no reference-identity claim), the SCALAR passthrough conformance round-trips verbatim, and the TRANSFORM PROOF row stores the transformed output differing in value from the raw input (side-effect-free)", () => {
    const decision = declareVar("decision", {
      label: "decision-shape",
      schema: z.object({ action: z.string(), count: z.number() }),
    });
    const input: Record<string, unknown> = { action: "proceed", count: 2 };
    decision.set(input);
    // Deep equality - under the measured physics the parse output is a
    // FRESH reference; asserting identity would fabricate a failure.
    expect(decision.read()).toEqual({ action: "proceed", count: 2 });
    // Scalar passthrough conformance round-trips verbatim through the
    // safe channel.
    const count = declareVar("count", {
      label: "count-shape",
      schema: z.number(),
    });
    count.set(42);
    expect(count.read()).toBe(42);
    // TRANSFORM PROOF: the stored value is the TRANSFORMED output,
    // differing in value from the raw input (raw input side-effect-
    // free).
    const shout = declareVar("shout", {
      label: "shouting-text",
      schema: z.string().transform((text) => text.toUpperCase()),
    });
    const rawInput = "  hi ";
    shout.set(rawInput);
    expect(shout.read()).toBe("  HI ");
    expect(shout.read()).not.toBe(rawInput);
    expect(rawInput).toBe("  hi ");
  });

  it("a NON-CONFORMING write settles mid-settle with the composed defect line: single-authored findings (bare message on an EMPTY path; dot-prefixed statement on a nested path), the EXACT worked-example bytes over the multi-issue object fixture (collect-all encounter order, '; ' join), the NESTED NUMERIC-PATH statement spelling (array element dot-joined in decimal), authored wording carried VERBATIM in every line, the prior value intact in every fault case, and a faulted FIRST write mints nothing (cell absent, isEmpty true)", () => {
    const decision = declareVar("decision", {
      label: "decision-shape",
      schema: z.object({
        a: z.number({ error: "a must be numeric" }),
        b: z.string({ error: "b must be textual" }),
      }),
    });
    // Pre-set a conforming value: it must survive the faulted overwrite.
    decision.set({ a: 1, b: "two" });
    expect(decision.read()).toEqual({ a: 1, b: "two" });
    // MULTI-ISSUE worked example: EVERY finding rides, encounter order,
    // '; ' joined, dot-prefixed \u2014 the EXACT pinned bytes.
    expectFamilyFault(
      () => decision.set({}),
      varSpecDefectLine(
        "decision",
        "a: a must be numeric; b: b must be textual",
      ),
    );
    expect(decision.read()).toEqual({ a: 1, b: "two" });
    // SINGLE authored finding over a NESTED path: the dot-prefix
    // statement spelling.
    const ratio = declareVar("ratio", {
      label: "ratio-shape",
      schema: z.object({ n: z.number({ error: "n must be numeric" }) }),
    });
    ratio.set({ n: 0.5 });
    expectFamilyFault(
      () => ratio.set({}),
      varSpecDefectLine("ratio", "n: n must be numeric"),
    );
    expect(ratio.read()).toEqual({ n: 0.5 });
    // SINGLE authored finding with an EMPTY path: the bare message rides
    // undecorated.
    const flagCount = declareVar("flag-count", {
      label: "count-shape",
      schema: z.number({ error: "a finite count expected" }),
    });
    flagCount.set(3);
    expectFamilyFault(
      () => flagCount.set("many"),
      varSpecDefectLine("flag-count", "a finite count expected"),
    );
    expect(flagCount.read()).toBe(3);
    // NESTED NUMERIC-PATH finding (the array element): the dot-joined
    // decimal segment spelling.
    const roster = declareVar("roster", {
      label: "roster-shape",
      schema: z.object({
        items: z.array(z.string({ error: "element must be textual" })),
      }),
    });
    roster.set({ items: ["one"] });
    expectFamilyFault(
      () => roster.set({ items: [1] }),
      varSpecDefectLine("roster", "items.0: element must be textual"),
    );
    expect(roster.read()).toEqual({ items: ["one"] });
    // FAULTED FIRST WRITE MINTS NOTHING (fresh cell: the value is ABSENT,
    // isEmpty reports the absence).
    const fresh = declareVar("fresh-decision", {
      label: "decision-shape",
      schema: z.object({ a: z.number({ error: "a must be numeric" }) }),
    });
    expectFamilyFault(
      () => fresh.set({}),
      varSpecDefectLine("fresh-decision", "a: a must be numeric"),
    );
    expect(fresh.read()).toBeUndefined();
    expect(fresh.isEmpty()).toBe(true);
  });

  it("NULL carries NO semantics over a spec lane: a null write settles through the EXACT ordinary-defect path (the check's OWN default-spelled line \u2014 no intercept, no erase command, no special-case branch anywhere) with the prior state \u2014 a stored object OR absence \u2014 reading back intact; contrast in the same block: a built-in 'null'-typed cell still stores null legally (byte-stable lane \u2014 the universal null rule untouched)", () => {
    const decision = declareVar("decision", {
      label: "decision-shape",
      schema: z.object({ a: z.number({ error: "a must be numeric" }) }),
    });
    // Prior state = a stored OBJECT: the null write faults with the
    // check's own defect line and the object reads back intact.
    decision.set({ a: 7 });
    expect(decision.read()).toEqual({ a: 7 });
    expectFamilyFault(
      () => decision.set(null),
      varSpecDefectLine(
        "decision",
        "Invalid input: expected object, received null",
      ),
    );
    expect(decision.read()).toEqual({ a: 7 });
    // Prior state = ABSENCE: a faulted FIRST null write mints nothing.
    const next = declareVar("next", {
      label: "decision-shape",
      schema: z.object({ a: z.number({ error: "a must be numeric" }) }),
    });
    expectFamilyFault(
      () => next.set(null),
      varSpecDefectLine(
        "next",
        "Invalid input: expected object, received null",
      ),
    );
    expect(next.read()).toBeUndefined();
    // Contrast: the built-in 'null' lane is BYTE-STABLE \u2014 null REMAINS
    // the legal value there (the universal null rule untouched).
    const nil = declareVar("nil", "null");
    nil.set(null);
    expect(nil.read()).toBeNull();
  });

  it("a check that THROWS while running degrades CONTAINED to the dedicated fault-category line in the SAME family voice: an Error throw and a NON-ERROR throw (a bare primitive \u2014 plain TS, no marked cast seam) settle IDENTICAL bytes, no crash escapes from author code, no silent admission, the prior value intact, and a fresh-name first write mints nothing", () => {
    const checked = declareVar("checked", {
      label: "checked-text",
      schema: z.string().refine((text) => {
        if (text === "fault") throw new Error("author boom");
        return true;
      }),
    });
    checked.set("baseline");
    expect(checked.read()).toBe("baseline");
    expectFamilyFault(() => checked.set("fault"), varSpecFaultLine("checked"));
    expect(checked.read()).toBe("baseline"); // prior value intact
    // NON-ERROR-THROW: a bare primitive escapes the safe-parse entry point
    // as itself \u2014 the swallow-all catch settles the IDENTICAL fault line,
    // and the fresh-name first write mints NOTHING.
    const prim = declareVar("prim", {
      label: "primitive-checked",
      schema: z.string().refine(() => {
        throw 42;
      }),
    });
    expectFamilyFault(() => prim.set("anything"), varSpecFaultLine("prim"));
    // No silent admission: no value landed on either faulted name.
    expect(prim.read()).toBeUndefined();
    expect(checked.isEmpty()).toBe(false);
  });
});

describe("VarCell \u2014 spec-lane text materialization (wire doctrine)", () => {
  it("JSON-document text MATERIALIZES BEFORE the declared shape check: the quoted document stores the DECODED parse output deep-equal to the IDENTICAL native drive of the same document (twin equivalence over the real settle path - the product-regression pin for the model's quoted-JSON wire form)", () => {
    const makeDecision = (): VarCell =>
      declareVar("decision", {
        label: "decision-shape",
        schema: z.object({ action: z.string(), count: z.number() }),
      });
    // NATIVE DRIVE (oracle): the decision stored as a plain object.
    const native = makeDecision();
    native.set({ action: "proceed", count: 2 });
    expect(native.read()).toEqual({ action: "proceed", count: 2 });
    // TEXT DRIVE: the model packages the same document as quoted JSON
    // (the advertised string-leading union makes this the wire form).
    const document = JSON.stringify({ action: "proceed", count: 2 });
    const textDriven = makeDecision();
    textDriven.set(document);
    // Deep equality ONLY (fresh parse-output reference - an identity
    // claim would fabricate a failure), twin-equivalent to the native
    // drive by construction.
    expect(textDriven.read()).toEqual({ action: "proceed", count: 2 });
    expect(textDriven.read()).toEqual(native.read());
  });

  it('JSON-scalar text materializes per the DECLARED CHECK: "42" stores 42 over z.number() and "true" stores true over z.boolean() - decoded scalars settle natively exactly as their native twins do', () => {
    const count = declareVar("count", {
      label: "count-shape",
      schema: z.number(),
    });
    count.set("42");
    expect(count.read()).toBe(42);
    const flag = declareVar("flag", {
      label: "flag-shape",
      schema: z.boolean(),
    });
    flag.set("true");
    expect(flag.read()).toBe(true);
    // Native-twin parity: the identical native drive settles identically
    // (deep equality over the scalar read-back).
    const twin = declareVar("count-twin", {
      label: "count-shape",
      schema: z.number(),
    });
    twin.set(42);
    expect(count.read()).toEqual(twin.read());
  });

  it('NON-DOCUMENT text rides the schema AS-IS (decode-or-raw stability guard): a transform spec stores the transformed RAW text verbatim ("  hi " -> "  HI ") and junk text over an object spec settles the family-voice defect line MINTING NOTHING - the settled raw-text fault bytes stay byte-frozen', () => {
    const shout = declareVar("shout", {
      label: "shouting-text",
      schema: z.string().transform((text) => text.toUpperCase()),
    });
    shout.set("  hi ");
    expect(shout.read()).toBe("  HI ");
    // Family-voice fault over an object spec: no decode possible, no
    // mint - the composed-defect bytes hold unedited.
    const pair = declareVar("pair", {
      label: "pair-shape",
      schema: z.object({ k: z.string() }),
    });
    expectFamilyFault(
      () => pair.set("just some words"),
      varSpecDefectLine(
        "pair",
        "Invalid input: expected object, received string",
      ),
    );
    expect(pair.read()).toBeUndefined();
    expect(shout.isEmpty()).toBe(false);
  });
});

describe("VarCell \u2014 containment shape (bare identity)", () => {
  it("a cell.set family fault reduces through captureError to the BARE IDENTITY literal {type, message}: NO cause key, NO violations key, joined message bytes pinned", () => {
    const cell = declareVar("a", "boolean");
    let caught: unknown;
    try {
      cell.set("maybe");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VariableRejectionError);
    const line = varCoercionRejectLine(
      "a",
      "boolean",
      "string",
      CLAUSE_BOOLEAN_TOKEN,
    );
    const captured = captureError(caught);
    expect(captured).toEqual({
      type: "VariableRejectionError",
      message: `${VAR_REJECTION_PREFIX}${line}`,
    });
    // Exact key set: no adoption hook exists to ride.
    expect(Object.keys(captured).sort()).toEqual(["message", "type"]);
  });

  it("a declareVar admission fault captures by NAME only under the VarAdmissionError bookkeeping voice with pure ASCII bytes", () => {
    const fault = captureNamedFault(() => declareVar("n", foreignVarType));
    expect(fault.name).toBe("VarAdmissionError");
    expect(fault.message).toBe(varRegistryMalformedLine("bogus", "n"));
    expect(/\u2014/.test(fault.message)).toBe(false); // pure ASCII
  });
});

describe("VarCell \u2014 reset (program-owned erasure)", () => {
  it("is IDEMPOTENT and leaves the DECLARATION INTACT: reset on a set cell drops the value (measured ABSENCE ground truth post-reset: read undefined AND isEmpty true), reset again is a clean no-op, and a set after reset succeeds through the SAME cell (both lanes re-admit; the check stays alive)", () => {
    const num = declareVar("n", "number");
    num.set(5);
    expect(num.read()).toBe(5);
    num.reset();
    // Measured ABSENCE ground truth post-reset (flag consult, never value
    // identity).
    expect(num.read()).toBeUndefined();
    expect(num.isEmpty()).toBe(true);
    // Idempotent over absence: a second reset is a clean no-op.
    num.reset();
    expect(num.read()).toBeUndefined();
    expect(num.isEmpty()).toBe(true);
    // Declaration SURVIVES: a set after reset succeeds through the same
    // cell (the built-in lane re-admits).
    num.set(7);
    expect(num.read()).toBe(7);
    expect(num.isEmpty()).toBe(false);
    // Spec lane: the check is ALIVE post-reset - conforming admits again
    // AND non-conforming faults again through the SAME composed line (with
    // the just-stored value surviving the fault).
    const decision = declareVar("decision", {
      label: "decision-shape",
      schema: z.object({ a: z.number({ error: "a must be numeric" }) }),
    });
    decision.set({ a: 1 });
    decision.reset();
    decision.set({ a: 2 });
    expect(decision.read()).toEqual({ a: 2 });
    expectFamilyFault(
      () => decision.set({}),
      varSpecDefectLine("decision", "a: a must be numeric"),
    );
    expect(decision.read()).toEqual({ a: 2 });
  });
});

describe("VarCell \u2014 absence signal", () => {
  it("a FRESH cell reports absence through BOTH channels: isEmpty() true and read() undefined, STABLE across repeated reads (never throws, mutates nothing); the STRICT TYPED-READ CHANNEL DOES NOT EXIST on the cell (no get member \u2014 the safe read is the sole read face)", () => {
    const cell = declareVar("ghost", "string");
    expect(cell.isEmpty()).toBe(true);
    expect(cell.read()).toBeUndefined();
    // Stability across repeated consults (idempotent observation).
    expect(cell.isEmpty()).toBe(true);
    expect(cell.read()).toBeUndefined();
    expect(cell.read()).toBeUndefined();
    // No get() accessor exists on the surface (only read()).
    expect("get" in cell).toBe(false);
  });
});

describe("VarCell \u2014 previous-value-intact across a failing set", () => {
  it("BUILT-IN lane: a good write then a REJECTED write leaves the original readable and the presence FLAG untouched (isEmpty false)", () => {
    const cell = declareVar("b", "boolean");
    cell.set(true);
    expectFamilyFault(
      () => cell.set("maybe"),
      varCoercionRejectLine("b", "boolean", "string", CLAUSE_BOOLEAN_TOKEN),
    );
    expect(cell.read()).toBe(true); // original intact
    expect(cell.isEmpty()).toBe(false);
  });

  it("SPEC lane: a conforming parse then a FAILING parse leaves the prior PARSE OUTPUT intact (settled value survives; presence flag untouched)", () => {
    const cell = declareVar("shout", {
      label: "shouting-text",
      schema: z.string().transform((text) => text.toUpperCase()),
    });
    cell.set("hello");
    expect(cell.read()).toBe("HELLO"); // parse OUTPUT (transformed) stored
    expectFamilyFault(
      () => cell.set(42),
      varSpecDefectLine(
        "shout",
        "Invalid input: expected string, received number",
      ),
    );
    expect(cell.read()).toBe("HELLO"); // prior parse output intact
    expect(cell.isEmpty()).toBe(false);
  });
});

describe("VarCell \u2014 declareVar return identity", () => {
  it("two SAME-NAMED mints are DISTINCT objects (!==) with INDEPENDENT values: setting one leaves the other ABSENT (coexist harmlessly \u2014 no name-index anywhere)", () => {
    const a = declareVar("shared", "string");
    const b = declareVar("shared", "string");
    expect(a).not.toBe(b);
    a.set("mine");
    expect(a.read()).toBe("mine");
    expect(a.isEmpty()).toBe(false);
    expect(b.read()).toBeUndefined();
    expect(b.isEmpty()).toBe(true); // independent value worlds
  });
});

describe("PhaseVarBinding \u2014 projections over a binding set", () => {
  it("READ SET projection: projectReadSet returns EVERY entry name -> cell, INSERTION IN BINDING ORDER, with CELL IDENTITY preserved (default-read grant); pure - fresh map per call, deterministic", () => {
    const a = declareVar("alpha", "string");
    const b = declareVar("beta", "number");
    const bindings: readonly PhaseVarBinding[] = [
      { cell: a },
      { cell: b, write: true },
    ];
    const readSet = projectReadSet(bindings);
    expect([...readSet.keys()]).toEqual(["alpha", "beta"]);
    expect(readSet.get("alpha")).toBe(a); // identity preserved
    expect(readSet.get("beta")).toBe(b);
    // Pure: fresh result per call, deterministic order.
    const again = projectReadSet(bindings);
    expect(again).not.toBe(readSet);
    expect([...again.keys()]).toEqual(["alpha", "beta"]);
  });

  it("WRITE GRANT listing: listWriteGrants lists ONLY entries with write === true, in binding order; absent flag confers NO permission (default-denied) and write: false explicitly denies", () => {
    const a = declareVar("alpha", "string");
    const b = declareVar("beta", "number");
    const c = declareVar("gamma", "boolean");
    const d = declareVar("delta", "array");
    const grants = listWriteGrants([
      { cell: a }, // default: denied
      { cell: b, write: true },
      { cell: c, write: false },
      { cell: d, write: true },
    ]);
    expect(grants).toEqual(["beta", "delta"]);
  });

  it("EMPTINESS consult: emptyBindingNames reports names whose cell is isEmpty(), in binding order, reflecting PER-CELL state (a present value drops its name off; a FALSY-BUT-PRESENT value stays present - flag authority, never value truthiness)", () => {
    const a = declareVar("alpha", "string");
    const b = declareVar("beta", "number");
    const c = declareVar("gamma", "boolean");
    const bindings: readonly PhaseVarBinding[] = [
      { cell: a },
      { cell: b },
      { cell: c },
    ];
    expect(emptyBindingNames(bindings)).toEqual(["alpha", "beta", "gamma"]);
    b.set(7);
    expect(emptyBindingNames(bindings)).toEqual(["alpha", "gamma"]);
    a.set("one");
    c.set(false); // present-and-falsy: the flag decides
    expect(emptyBindingNames(bindings)).toEqual([]);
  });

  it("DUPLICATE refusal: two bindings of the SAME name in one set throw the module-local error (asserted by NAME only) from EVERY projection helper with the PINNED LINE BYTES in PURE ASCII (no U+2014), settling the FIRST duplicate in binding order before anything projects", () => {
    const a = declareVar("dup", "string");
    const a2 = declareVar("dup", "number"); // same NAME, distinct cells
    const other = declareVar("other", "boolean");
    const bad: readonly PhaseVarBinding[] = [
      { cell: other },
      { cell: a },
      { cell: a2, write: true },
      { cell: declareVar("dupe-late", "string") },
      { cell: declareVar("dupe-late", "string") },
    ];
    for (const helper of [
      () => projectReadSet(bad),
      () => listWriteGrants(bad),
      () => emptyBindingNames(bad),
    ]) {
      const fault = captureNamedFault(helper);
      expect(fault.name).toBe("PhaseVarDuplicateError");
      expect(fault.message).toBe(phaseVarDuplicateLine("dup"));
      expect(/\u2014/.test(fault.message)).toBe(false); // pure ASCII
    }
    // FIRST conflict settles: 'dup' (earlier in binding order) faults
    // before the later 'dupe-late' pair can be reached. A well-formed set
    // (unique names) settles cleanly through every helper.
    const good: readonly PhaseVarBinding[] = [{ cell: a }, { cell: other }];
    expect(projectReadSet(good).has("dup")).toBe(true);
    expect(listWriteGrants(good)).toEqual([]);
    // Both cells absent so far: every bound name consults empty.
    expect(emptyBindingNames(good)).toEqual(["dup", "other"]);
    a.set("now-present");
    expect(emptyBindingNames(good)).toEqual(["other"]);
  });
});

// ---------------------------------------------------------------------
// Source guards (substrate edge discipline over var-cell.ts): mechanical
// byte pins mirroring the house source-guard idiom; needles are plain
// identifiers (no fragment assembly needed - nothing here is a
// pruned-vocabulary sentinel).
// ---------------------------------------------------------------------

describe("source guards (substrate edge discipline over var-cell.ts)", () => {
  const src = readFileSync(new URL("./var-cell.ts", import.meta.url), "utf8");
  const hostSrc = readFileSync(
    new URL("./pio-session.ts", import.meta.url),
    "utf8",
  );

  it("zero occurrences of the SDK specifier and zero dynamic import( occurrences in the module bytes (hermetic leaf: error home + zod only)", () => {
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
    expect(src.match(/import\(/g)?.length ?? 0).toBe(0);
  });

  it("single-owner spot checks: the conversion owners are defined EXACTLY ONCE each, both in var-cell.ts, and REDEFINED NOWHERE in the session host (which reaches them through its import clause)", () => {
    // Needles assembled from fragments so this scan cannot match itself
    // (house idiom): the joined bytes name the sole owner functions.
    const ownerNeedles: Array<[string, string]> = [
      ["function convert", "VarValue"],
      ["function renderVarCoercion", "RejectLine"],
    ];
    for (const [head, tail] of ownerNeedles) {
      const needle = head + tail;
      const substrateHits = src.split(needle).length - 1;
      const hostHits = hostSrc.split(needle).length - 1;
      expect(substrateHits, `${needle} in var-cell.ts`).toBe(1);
      expect(hostHits, `${needle} in pio-session.ts`).toBe(0);
    }
  });
});
