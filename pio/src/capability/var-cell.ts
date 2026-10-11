// The no-store variable substrate: value cells minted by declareVar plus
// the phase-binding view core. One cell per declared variable - NO
// container, NO registry, NO name-index retains the population: a
// capability holds the references returned by declareVar and hands cells
// into phases as bindings. Each cell carries its own declaration (name + admitted
// typing), its value-or-unset state, and OWNS its settle policy - the
// legacy funnel's two arms collapsed into the per-cell setter (one settle
// path per lane).
//
// GRANTS NEVER LIVE ON THE CELL - they ride the binding { cell, write? }
// (ruling R1: READ IS GRANTED BY DEFAULT for every bound variable;
// write === true is the SOLE declared permission). The projection helpers
// over a binding set are pure (no side effects, fresh results,
// deterministic) and refuse the SOLE surviving name conflict loudly: two
// bindings of the same name in one set.
//
// ADMISSION is one shared pre-mint validator (admitVarDeclaration) feeding BOTH
// the free minter and the session host's legacy store declare() (single
// source of truth for every admission line): the six built-in literals
// admit verbatim; a non-null non-array object enters the spec lane under
// fixed FIRST-FAULT triage (label well-formed, no built-in shadowing,
// schema recognized via the pinned-major instanceof z.ZodType guard);
// EVERYTHING ELSE settles the historical ${payload} malformed-base-type
// line through ONE template site. Admission faults ride the module-local
// pure-ASCII bookkeeping voice (VarAdmissionError) - model-invisible,
// deliberately distinct from the model-visible VariableRejectionError the
// settle faults carry.
//
// RELOCATED byte owners (sole home for these families; the session host
// reaches them through its import clause and redefines none): the closed
// reject-reason taxonomy and the shared conversion core (plainness
// predicate, ancestor-cursor integrity walk, type-preserving conversion,
// scalar-reason resolver, type spelling, clause renderer, coercion-reject
// line), the spec-lane mechanics (structural issue slice, collect-all
// defect frame, check-fault line, wire JSON materialization), the three
// spec-lane admission fault lines (their "var registry:" prefix carries
// VERBATIM per the byte-carry ruling - string-literal bytes are frozen),
// and the display resolver (literal-self / spec-label mapping).
//
// Dependency direction runs substrate <- host: this module imports ONLY
// the error home and zod; it reaches nothing from the session host module
// (no back-edge, type-only or otherwise). Zero dynamic imports; zero SDK.

import { z } from "zod";
import { VariableRejectionError } from "./errors.ts";

/** Base types of the variable substrate - the six legacy types,
 * CANONICALLY OWNED here (the substrate owns its vocabulary; the session
 * host re-exports both vocabularies type-only for surface stability). The
 * per-phase guard deals in names only; the model tool params validate
 * against these literals at the schema level. */
export type VarType =
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "object"
  | "null";

/** A capability-authored NAMED SHAPE CHECK for a variable: a human-readable
 * LABEL (its DISPLAYED name - how the listing surfaces the shape the
 * variable carries; nothing at settle time consumes it) plus the CHECK
 * ITSELF expressed as a zod schema (owner ruling). The loose ZodType base
 * is the declared schema slot: authors pass CONCRETE schemas (objects,
 * enums, refined/transformed chains, records); the substrate never
 * introspects schema internals. Type-only surface: erased under erasable
 * syntax - the runtime half is the instanceof z.ZodType recognition
 * executed at admission. */
export interface CustomVarSpec {
  readonly label: string;
  readonly schema: z.ZodType;
}

/**
 * Bookkeeping corruption over the variable ADMISSION at cell mint: a
 * malformed declaration payload (the re-declare concept does not exist here -
 * there is no name to conflict with). Developer-facing, PURE ASCII (no em
 * dashes), model-invisible - the separate ASCII fault voice class (à la
 * ExecutionStateError) deliberately DISTINCT from the model-visible
 * VariableRejectionError (name, message prefix, and dash discipline all
 * differ). Unexported on purpose: the suites assert by name only.
 */
class VarAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VarAdmissionError";
  }
}

/** Relocated malformed-base-type guard (formerly the registry's
 * isDeclaredType, renamed for the registry's dissolution): reachable only
 * via runtime foreignness past type erasure; the plain six-literal
 * equality chain keeps the check cast-free. */
function isBuiltinVarType(type: string): boolean {
  return (
    type === "boolean" ||
    type === "number" ||
    type === "string" ||
    type === "array" ||
    type === "object" ||
    type === "null"
  );
}

/** ONE malformed-spec LABEL line (class 1 - a NON-STRING or EMPTY label;
 * ONE line covering both, echoing NOTHING: the offending value fails the
 * gate before any echo could happen). Developer-facing pure-ASCII
 * bookkeeping voice. */
function renderVarSpecLabelLine(name: string): string {
  return `var registry: invalid spec label for variable '${name}': label must be a non-empty string`;
}

/** ONE built-in-SHADOWING line (class 2 - the label proved a NON-EMPTY
 * STRING through class 1 and therefore echoes VERBATIM: house echo
 * practice à la the legacy foreign-type echo). Developer-facing pure-ASCII
 * bookkeeping voice. */
function renderVarSpecShadowLine(name: string, label: string): string {
  return `var registry: invalid spec label for variable '${name}': label '${label}' shadows a built-in type name`;
}

/** ONE unrecognized-SCHEMA line (class 3 - the schema member failed the
 * library's own type guard for the pinned major; nothing echoed).
 * Developer-facing pure-ASCII bookkeeping voice. */
function renderVarSpecSchemaLine(name: string): string {
  return `var registry: invalid spec schema for variable '${name}': schema is not a recognizable zod schema`;
}

/** THE single malformed-base-type line (PURE ASCII bookkeeping voice): ONE
 * template site for EVERY non-admitted non-spec payload - a foreign
 * literal-lane string and every other non-spec payload alike ride the
 * HISTORICAL ${payload} interpolation (arrays comma-join, null echoes
 * "null", symbols echo Symbol(desc), functions echo their source text).
 * Never "improve" the echo - the bytes are frozen. */
function renderVarMalformedBaseTypeLine(
  name: string,
  payload: unknown,
): string {
  return `var registry: invalid base type '${payload}' for variable '${name}'`;
}

/**
 * THE shared pre-mint admission validator over a variable DECLARATION
 * (SOLE source of truth for every admission line): cast-free FIRST-FAULT
 * triage over the RUNTIME payload, exactly the delivered dispatch. A
 * STRING payload takes the literal lane (the six literals admit; a foreign
 * string settles the malformed-base-type line); a NON-NULL, NON-ARRAY
 * OBJECT enters the SPEC LANE under the FIXED FIRST-FAULT triage (label
 * well-formed, no built-in shadowing, schema recognized via the
 * pinned-major instanceof z.ZodType guard - the first fault settles
 * loudly, collect-all barred, nothing mints); EVERYTHING ELSE (numbers,
 * booleans, null, symbols, functions, bigints, AND arrays) settles the
 * legacy line with its historical ${payload} spelling through the single
 * template site above. FEEDS BOTH minters: declareVar (delegated through
 * the cell constructor) and the session host's legacy store declare().
 * Returns the DISPLAY name (literal self / spec label); throws the
 * bookkeeping voice on any fault.
 */
export function admitVarDeclaration(name: string, payload: unknown): string {
  if (typeof payload === "string") {
    if (isBuiltinVarType(payload)) return payload;
    throw new VarAdmissionError(renderVarMalformedBaseTypeLine(name, payload));
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new VarAdmissionError(renderVarMalformedBaseTypeLine(name, payload));
  }
  // SPEC LANE: member reads over the unknown boundary ride Reflect so the
  // triage stays cast-free (the interface types lie past erasure, so every
  // member is re-adjudicated at runtime - the first fault settles, collect-
  // all is barred; the voice is single-line single-fault). Nothing mints
  // before the triage settles.
  const label: unknown = Reflect.get(payload, "label");
  if (typeof label !== "string" || label === "") {
    throw new VarAdmissionError(renderVarSpecLabelLine(name));
  }
  if (isBuiltinVarType(label)) {
    throw new VarAdmissionError(renderVarSpecShadowLine(name, label));
  }
  const schema: unknown = Reflect.get(payload, "schema");
  if (!(schema instanceof z.ZodType)) {
    throw new VarAdmissionError(renderVarSpecSchemaLine(name));
  }
  return label;
}

/** THE display resolver (SOLE byte owner of the literal-self / spec-label
 * mapping): six literals display THEMSELVES; a spec displays its LABEL.
 * Feeds the cell's derived display accessor, the admission return, and the
 * legacy store's declarations()/declarationDisplay() faces (delegated
 * inward) - zero casts on either face. */
export function displayVarDeclaration(
  declaration: VarType | CustomVarSpec,
): string {
  return typeof declaration === "string" ? declaration : declaration.label;
}

/** Closed fault taxonomy of the shared conversion core: one category per
 * rejection shape, detail-free by design \u2014 the clause renderer below is
 * the SOLE byte owner mapping category to the pinned line, and the
 * offending value is NEVER echoed (a cyclic input would blow up any
 * serialization; the clause grammar dodges the hazard by construction). */
type VarRejectReason =
  | "value-undefined"
  | "value-function"
  | "value-symbol"
  | "value-bigint"
  | "number-nan"
  | "number-plus-infinity"
  | "number-minus-infinity"
  | "class-instance"
  | "reference-cycle"
  | "boolean-token"
  | "shape-array"
  | "shape-object"
  | "does-not-coerce";

/** Shared conversion outcome: success carries the CONVERSION RESULT
 * (never the raw input); a fault carries the closed category. */
type VarConversion =
  | { readonly converted: unknown }
  | { readonly rejected: VarRejectReason };

/** Plainness predicate of the stored-by-reference integrity: admits
 * exactly the Object.prototype-or-null prototype shapes (JSON-plain;
 * class instances, wrappers, and exotic prototypes reject). */
function isPlainVarObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// The ancestor path lives in a module-level Set scoped to ONE walk: walks
// never nest across calls (single-threaded, synchronous descent, and every
// walk fully unwinds via its finally before any other runs), so the cursor
// keeps the walker argument-free while staying strictly per-walk.
const varWalkAncestors: Set<object> = new Set();

/** Recursive stored-by-reference integrity walk: PLAIN prototypes
 * everywhere (arrays included as containers), ACYCLIC by ANCESTOR-PATH
 * tracking (shared substructures admit; back-edges reject), no class
 * instances at ANY depth. Scalar leaves need no walk. Pure over the input
 * (mutates nothing; the ancestor cursor is internal bookkeeping that
 * always unwinds). */
function walkVarIntegrity(value: unknown): VarConversion {
  if (typeof value !== "object" || value === null) {
    return { converted: value }; // scalar leaf \u2014 admitted, walked through
  }
  if (!Array.isArray(value) && !isPlainVarObject(value)) {
    return { rejected: "class-instance" };
  }
  if (varWalkAncestors.has(value)) {
    return { rejected: "reference-cycle" };
  }
  varWalkAncestors.add(value);
  try {
    const children: unknown[] = Array.isArray(value)
      ? [...value]
      : Object.keys(value).map((key) => value[key]);
    for (const child of children) {
      const result = walkVarIntegrity(child);
      if ("rejected" in result) return result;
    }
    return { converted: value };
  } finally {
    varWalkAncestors.delete(value);
  }
}

/** THE shared admission/conversion core (one voice, one table): the SAME
 * pure function serves BOTH the session host's legacy store (the validated
 * write funnel and the typed reads) AND the cell's per-lane settle \u2014
 * consistency by construction (what set admits, read converts).
 * Type-preserving: the converted value equals the declared type. Never
 * throws; a fault resolves to the closed category the clause renderers
 * turn into the pinned line. */
export function convertVarValue(value: unknown, type: VarType): VarConversion {
  switch (type) {
    case "boolean": {
      // Type-preserving admission: the four sanctioned forms ONLY (native
      // booleans verbatim, the two exact textual tokens). Retires the
      // legacy silent-false fallback AND the "1"/"yes"/"0"/"no" tokens and
      // bare 0/1.
      if (typeof value === "boolean") return { converted: value };
      if (value === "true") return { converted: true };
      if (value === "false") return { converted: false };
      return {
        rejected:
          typeof value === "string" ? "boolean-token" : varScalarReason(value),
      };
    }
    case "number": {
      // Finite numbers verbatim; numeric strings trimmed-nonempty and
      // finite-parse (so "42", " 42 ", "0x1A", "1e3" convert). Retires
      // ""→0, null→0, true→1, [5]→5, NaN, ±Infinity.
      if (typeof value === "number" && Number.isFinite(value)) {
        return { converted: value };
      }
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return { converted: parsed };
      }
      return { rejected: varScalarReason(value) };
    }
    case "string": {
      // Strings verbatim; finite numbers and booleans take the String()
      // form. Retires the String() catch-all (arrays/objects/null reject;
      // non-finite numbers take the finiteness clause).
      if (typeof value === "string") return { converted: value };
      if (typeof value === "number" && Number.isFinite(value)) {
        return { converted: String(value) };
      }
      if (typeof value === "boolean") return { converted: String(value) };
      return { rejected: varScalarReason(value) };
    }
    case "array": {
      if (!Array.isArray(value)) return { rejected: varScalarReason(value) };
      return walkVarIntegrity(value);
    }
    case "object": {
      if (!isPlainVarObject(value)) {
        return { rejected: varScalarReason(value) };
      }
      return walkVarIntegrity(value);
    }
    case "null": {
      // Universal null rule: null converts ONLY to type "null"; present-
      // but null read/stored against any other type is a conversion fault.
      if (value === null) return { converted: null };
      return { rejected: varScalarReason(value) };
    }
  }
}

/** Fault-category resolver for an UNCOERCIBLE top-level value: first-match
 * over the closed taxonomy. Container shape mismatches (array/object vs a
 * different demanded type) resolve to the shape clauses BEFORE any
 * structural walk \u2014 the walk runs only for array/object demands. The one
 * type-context exception (string INTO boolean takes the token clause) is
 * applied at the boolean demand site, where the type is known. */
function varScalarReason(value: unknown): VarRejectReason {
  if (value === undefined) return "value-undefined";
  if (typeof value === "function") return "value-function";
  if (typeof value === "symbol") return "value-symbol";
  if (typeof value === "bigint") return "value-bigint";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number-nan";
    if (value === Number.POSITIVE_INFINITY) return "number-plus-infinity";
    if (value === Number.NEGATIVE_INFINITY) return "number-minus-infinity";
    return "does-not-coerce";
  }
  if (value === null) return "does-not-coerce";
  if (Array.isArray(value)) return "shape-array";
  if (typeof value === "object") {
    return isPlainVarObject(value) ? "shape-object" : "class-instance";
  }
  // Remaining scalars (booleans and anything unexpected past erasure):
  // the generic clause.
  return "does-not-coerce";
}

/** TYPE SPELLING of a value for the pinned lines: typeof spelling with
 * null spelled explicitly (JS typeof null misleads with "object"). The
 * session host's retained typed-read fault renderer reaches this owner
 * through its import clause. */
export function varTypeSpelling(value: unknown): string {
  if (value === null) return "null";
  return typeof value;
}

/** THE CLAUSE half of a coercion-reject line, keyed on the closed fault
 * taxonomy (SOLE byte owner alongside the line renderers below); the type
 * appears verbatim only in the does-not-coerce clause. */
function varRejectClause(reason: VarRejectReason, type: VarType): string {
  switch (reason) {
    case "value-undefined":
      return "value is undefined";
    case "value-function":
      return "value is a function";
    case "value-symbol":
      return "value is a symbol";
    case "value-bigint":
      return "value is a bigint";
    case "number-nan":
      return "number is not finite (NaN)";
    case "number-plus-infinity":
      return "number is not finite (+Infinity)";
    case "number-minus-infinity":
      return "number is not finite (-Infinity)";
    case "class-instance":
      return "value is a class instance";
    case "reference-cycle":
      return "value contains a reference cycle";
    case "boolean-token":
      return "token is not a recognized boolean form";
    case "shape-array":
      return "value is an array";
    case "shape-object":
      return "value is an object";
    default:
      return `value does not coerce to '${type}'`;
  }
}

/** ONE coercion-reject line (validated write path \u2014 legacy store arm and
 * cell alike): names the VARIABLE, the incoming type spelling, the
 * DECLARED TYPE, and the category clause. The value is never echoed; LF
 * discipline per the other renderers (lines stand alone; the family
 * constructor joins them). */
export function renderVarCoercionRejectLine(
  name: string,
  type: VarType,
  value: unknown,
  reason: VarRejectReason,
): string {
  return `variable '${name}' cannot take a value of type '${varTypeSpelling(value)}' as declared type '${type}' \u2014 ${varRejectClause(reason, type)}`;
}

/** Structural issue slice (type-only, erased under erasable syntax)
 * carrying exactly the two members the defect-line grammar consumes.
 * Module-private on purpose: it rides inside the exported filtering map
 * and defect renderer. */
interface VarShapeIssue {
  readonly message: string;
  readonly path: readonly (string | number)[];
}

/** THE symbol-segment filtering map (relocated from the session host's
 * inline slicing): cast-free narrowing to the structural SLICE \u2014 symbol
 * path segments filter out by type-predicate (plain array ops); raw
 * findings arrive with their zod-shaped paths otherwise untouched. Pure:
 * fresh array per call, no side effects. */
export function sliceVarShapeIssues(
  issues: readonly {
    readonly message: string;
    readonly path: readonly (string | number | symbol)[];
  }[],
): readonly VarShapeIssue[] {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.filter(
      (segment): segment is string | number => typeof segment !== "symbol",
    ),
  }));
}

/** Sole byte owner of the spec-lane defect line: the store-owned frame over the check's findings carried verbatim, collect-all in issue-array order, '; '-joined statements with non-empty paths dot-prefixed (numeric segments in decimal). */
export function renderVarSpecDefectLine(
  name: string,
  issues: readonly VarShapeIssue[],
): string {
  const statements: string[] = issues.map((issue) =>
    issue.path.length === 0
      ? issue.message
      : `${issue.path.join(".")}: ${issue.message}`,
  );
  return `variable '${name}' does not satisfy its declared shape check \u2014 ${statements.join("; ")}`;
}

/** Sole byte owner of the dedicated check-fault line: settlement for a declared shape check that threw while running (every thrown kind, the payload referenced nowhere), deliberately outside the closed six-type taxonomy. */
export function renderVarSpecFaultLine(name: string): string {
  return `variable '${name}' cannot be shape-checked \u2014 the declared shape check itself faulted while checking the value`;
}

/** THE wire JSON MATERIALIZATION (extracted from the session host's inline
 * try/catch into a named pure helper): string payloads attempt a
 * JSON.parse and ride the DECODED document or scalar on success (wire
 * doctrine: model writes arrive as text \u2014 decoded documents and scalars
 * settle natively); NON-DOCUMENT text settles the ORIGINAL STRING as-is
 * (decode-or-raw stability guard); non-strings pass VERBATIM. Never
 * throws (parse failure degrades to the raw string). Pure: no side
 * effects. */
export function materializeWireJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * THE value cell - the unit of the no-store variable substrate: one minted
 * cell per declared variable. Each cell carries its own declaration (name
 * + admitted typing), its value-or-unset state, and OWNS its settle policy
 * (the legacy funnel's two arms collapsed into the per-lane setter).
 * Design
 * fences: NO grants live on the cell (they ride the phase binding), NO
 * cross-cell linkage (there is no name-index anywhere in this module), NO
 * display-name storage (the display derives through the resolver).
 */
export class VarCell {
  /** Author-supplied at mint: a LABEL carried by the object, NOT a
   * registry key - addresses tool params, names every failure line, keys
   * the intra-phase duplicate refusal. */
  readonly name: string;
  /** THE single DECLARATION slot: EXACTLY ONE admitted typing present
   * (a built-in literal or a custom spec), admission-validated PRE-MINT.
   * The disjoint string/object shapes make the invariant structural;
   * discriminate by typeof === "string". */
  readonly #declaration: VarType | CustomVarSpec;
  /** Presence FLAG - the SOLE presence authority (never value identity):
   * a spec schema may lawfully parse to undefined, leaving a SET cell
   * whose read reports undefined; ONLY isEmpty() sees through that corner. */
  #hasValue: boolean;
  #value: unknown;

  /** PUBLIC self-validating constructor: the SAME shared pre-mint
   * admission runs BEFORE ANY state is stored, so every construction path
   * is admitted identically (declareVar delegates here - one validation
   * pass, no bypass hazard). A fault mints NOTHING: the throw strictly
   * precedes every assignment. */
  constructor(name: string, declaration: VarType | CustomVarSpec) {
    admitVarDeclaration(name, declaration);
    this.name = name;
    this.#declaration = declaration;
    this.#hasValue = false;
    this.#value = undefined;
  }

  /** DERIVED display name (NO stored field): the built-in literal displays
   * ITSELF, a spec displays its LABEL - delegated to the relocated display
   * resolver. Renders the view-scoped listing's "types" member (a downstream consumer)
   * and any line needing a human-facing name. */
  get displayName(): string {
    return displayVarDeclaration(this.#declaration);
  }

  /** THE single validated settle entry for EVERY origin (capability code
   * and the model's setVar alike) \u2014 the legacy funnel's two arms collapsed
   * into the per-lane policy: the literal lane runs the pure shared
   * conversion into the pinned reject-clause family (a rejected write
   * THROWS the family carrying the pinned coercion-reject line); the spec
   * lane skips base conversion entirely, materializes ANY STRING payload
   * against a JSON read BEFORE the shape check, then parses the
   * MATERIALIZED CANDIDATE through the schema's safeParse behind the
   * wrap-catch (a FAULTING check degrades to the contained dedicated fault
   * line; a parse failure composes the collect-all defect frame). A
   * conforming write stores the SETTLED value (conversion result / parse
   * output \u2014 NEVER raw input); failures leave the previous value and
   * presence state INTACT (store-on-success). Null flows through the
   * ordinary parse path like any other incoming value. */
  set(raw: unknown): void {
    const declaration = this.#declaration;
    if (typeof declaration === "string") {
      // LEGACY LITERAL LANE: the shared table converts and the CONVERSION
      // RESULT is what stores.
      const result = convertVarValue(raw, declaration);
      if ("rejected" in result) {
        throw new VariableRejectionError([
          renderVarCoercionRejectLine(
            this.name,
            declaration,
            raw,
            result.rejected,
          ),
        ]);
      }
      this.#value = result.converted;
      this.#hasValue = true;
      return;
    }
    // SPEC LANE: the admission settled the members, the settle trusts them
    // (bottom-type discipline: the guard narrowed the declaration to the spec).
    const candidate = materializeWireJson(raw);
    let parsed: z.ZodSafeParseResult<unknown>;
    // Wrapping ONLY the parse call: author schema code can throw even on
    // merely-failing values, and every thrown kind settles the fault line.
    try {
      parsed = declaration.schema.safeParse(candidate);
    } catch {
      throw new VariableRejectionError([renderVarSpecFaultLine(this.name)]);
    }
    if (!parsed.success) {
      // Cast-free narrowing to the structural slice delegates inward to
      // the relocated filtering map.
      throw new VariableRejectionError([
        renderVarSpecDefectLine(
          this.name,
          sliceVarShapeIssues(parsed.error.issues),
        ),
      ]);
    }
    this.#value = parsed.data;
    this.#hasValue = true;
  }

  /** SAFE channel: the stored value, or undefined when absent. NEVER
   * throws. The strict typed-read channel DOES NOT EXIST in this surface
   * (retired outright) - programmatic consumers read() and narrow or
   * convert manually. */
  read(): unknown {
    return this.#hasValue ? this.#value : undefined;
  }

  /** Existence consult over the presence FLAG (never value identity):
   * consumed downstream by the settlement gate and adhoc's
   * silent-round handling. */
  isEmpty(): boolean {
    return !this.#hasValue;
  }

  /** Sole program-owned erasure: drops the value, the cell SURVIVES,
   * idempotent over absence (calling on an unset cell is a clean no-op).
   * The declaration is untouched - post-reset writes
   * re-enter the same settle path from scratch. */
  reset(): void {
    this.#hasValue = false;
    this.#value = undefined;
  }
}

/** THE authoring entry (free function - cells involve no session state):
 * mints and RETURNS a fresh cell admitted through the SAME shared pre-mint
 * validator (delegated to the self-validating constructor - one validation
 * pass). The re-declare CONCEPT does not exist: every call returns a fresh
 * independent object and same-named cells coexist harmlessly (no name-index
 * anywhere in this module). */
export function declareVar(
  name: string,
  declaration: VarType | CustomVarSpec,
): VarCell {
  return new VarCell(name, declaration);
}

/** THE owner-locked grant model (ruling R1): READ IS GRANTED BY DEFAULT
 * for every bound variable; `write: true` confers the model's set
 * permission, absent means denied. THIS single listing is the carrier -
 * grants NEVER live on the cell, they ride the binding inside the
 * execution-state phase frame.
 *
 * The SOLE surviving name conflict is two bindings of the SAME name in one
 * binding set: every projection helper below runs the shared first-check
 * over its input FIRST and refuses it loudly before producing anything
 * (the engine wiring of this refusal to the phase-start attach point
 * lands in the later host-side work; this module ships the refusal +
 * its tested trigger).
 */
export interface PhaseVarBinding {
  readonly cell: VarCell;
  readonly write?: boolean;
}

/** Developer-facing PURE-ASCII bookkeeping voice for the duplicate-binding
 * refusal (no em dashes). Model-invisible, deliberately distinct from the
 * model-visible VariableRejectionError. Unexported on purpose: the suite
 * asserts by NAME only (house idiom). */
class PhaseVarDuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhaseVarDuplicateError";
  }
}

/** Shared module-private FIRST CHECK over every projection helper: two
 * bindings of the SAME name in one binding set settle the FIRST duplicate
 * in binding order LOUDLY (single-fault voice, matching the admission
 * triage doctrine) BEFORE anything projects. The pinned line names the
 * duplicated variable. */
function assertNoDuplicateBindings(bindings: readonly PhaseVarBinding[]): void {
  const seen: Set<string> = new Set();
  for (const binding of bindings) {
    const name = binding.cell.name;
    if (seen.has(name)) {
      throw new PhaseVarDuplicateError(
        `phase binding set: variable '${name}' is bound more than once; a phase binds each variable at most once`,
      );
    }
    seen.add(name);
  }
}

/** THE read-set projection: EVERY entry, name -> cell, INSERTION IN
 * BINDING ORDER (default-read grant). Pure: no side effects, fresh result,
 * deterministic. */
export function projectReadSet(
  bindings: readonly PhaseVarBinding[],
): Map<string, VarCell> {
  assertNoDuplicateBindings(bindings);
  const readSet = new Map<string, VarCell>();
  for (const binding of bindings) {
    readSet.set(binding.cell.name, binding.cell);
  }
  return readSet;
}

/** THE write-grant name listing: only entries with `write === true`, in
 * binding order (absent or false confers nothing). Pure. */
export function listWriteGrants(
  bindings: readonly PhaseVarBinding[],
): string[] {
  assertNoDuplicateBindings(bindings);
  const grants: string[] = [];
  for (const binding of bindings) {
    if (binding.write === true) {
      grants.push(binding.cell.name);
    }
  }
  return grants;
}

/** THE per-cell emptiness consult over the set: names whose cell is
 * isEmpty(), in binding order (feeds the settlement-gate variable face
 * downstream). Flag consult, never value identity. Pure. */
export function emptyBindingNames(
  bindings: readonly PhaseVarBinding[],
): string[] {
  assertNoDuplicateBindings(bindings);
  const empties: string[] = [];
  for (const binding of bindings) {
    if (binding.cell.isEmpty()) {
      empties.push(binding.cell.name);
    }
  }
  return empties;
}
