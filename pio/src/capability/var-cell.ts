// The no-store variable substrate: value cells minted by declareVar plus
// the phase-binding view core. One cell per declared variable - NO
// container, NO registry, NO name-index retains the population: a
// capability holds the references returned by declareVar and hands cells
// into phases as bindings. Each cell carries its own declaration (name +
// admitted typing), its value-or-unset state, and OWNS its settle policy
// (one settle path per lane).
//
// GRANTS NEVER LIVE ON THE CELL - they ride the binding { cell, write? }:
// READ IS GRANTED BY DEFAULT for every bound variable; write === true is
// the SOLE declared permission. The projection helpers over a binding set
// are pure (no side effects, fresh results, deterministic) and refuse the
// SOLE surviving name conflict loudly: two bindings of the same name in
// one set.
//
// ADMISSION is one shared pre-mint validator (admitVarType) feeding BOTH
// the free minter and the session store's declare() (single source of
// truth for every admission line): the six built-in literals admit
// verbatim; a non-null non-array object enters the spec lane under fixed
// FIRST-FAULT triage (label well-formed, no built-in shadowing, schema
// recognized via the instanceof z.ZodType guard); EVERYTHING ELSE settles
// the ${payload} malformed-base-type line through ONE template site.
// Admission faults ride the module-local pure-ASCII bookkeeping voice
// (VarAdmissionError) - model-invisible, deliberately distinct from the
// model-visible VariableRejectionError the settle faults carry.
//
// BYTE OWNERSHIP: this module is the sole home for the reject-reason
// taxonomy and the shared conversion core (plainness predicate, ancestor-
// cursor integrity walk, type-preserving conversion, scalar-reason
// resolver, type spelling, clause renderer, coercion-reject line), the
// spec-lane mechanics (structural issue slice, collect-all defect frame,
// check-fault line, wire JSON materialization), the three spec-lane
// admission fault lines (their "var registry:" prefix is frozen), and the
// display resolver (literal-self / spec-label mapping). The session host
// reaches these owners through its import clause and redefines none.
//
// Dependency direction runs substrate <- host: this module imports ONLY
// the error home and zod; it reaches nothing from the session host module
// (no back-edge, type-only or otherwise). Zero dynamic imports; zero SDK.

import { z } from "zod";
import { VariableRejectionError } from "./errors.ts";

/** Base types of the variable substrate - the six built-in types, OWNED
 * here (the session host re-exports both vocabularies type-only). The
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
 * LABEL (its displayed name - listing-facing only, never consulted at
 * settle) plus the CHECK ITSELF expressed as a zod schema. The loose
 * ZodType base is the declared schema slot: authors pass CONCRETE schemas
 * (objects, enums, refined/transformed chains, records); the substrate
 * never introspects schema internals. Type-only surface: erased under
 * erasable syntax - the runtime half is the instanceof z.ZodType
 * recognition executed at admission. */
export interface CustomVarSpec {
  readonly label: string;
  readonly schema: z.ZodType;
}

/** Bookkeeping voice for faults raised at variable ADMISSION (cell mint):
 * a malformed typing payload. Developer-facing, pure ASCII, model-
 * invisible - deliberately distinct from the model-visible
 * VariableRejectionError family (different name, different message
 * prefix). Unexported on purpose: the suites assert by name only. */
class VarAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VarAdmissionError";
  }
}

/** Literal-lane validity gate: admits exactly the six built-in literal
 * names (foreign strings, shadowing labels, and runtime foreignness past
 * type erasure all fail it). The plain equality chain keeps the check
 * cast-free. */
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

/** The invalid-spec-label line: settles for a NON-STRING or EMPTY label;
 * echoes nothing (the failing value fails the gate before any echo could
 * happen). Developer-facing pure-ASCII bookkeeping voice. */
function renderVarSpecLabelLine(name: string): string {
  return `var registry: invalid spec label for variable '${name}': label must be a non-empty string`;
}

/** The built-in-shadowing line: settles when a non-empty string label
 * matches one of the six built-in names; the label echoes verbatim (house
 * echo practice). Developer-facing pure-ASCII bookkeeping voice. */
function renderVarSpecShadowLine(name: string, label: string): string {
  return `var registry: invalid spec label for variable '${name}': label '${label}' shadows a built-in type name`;
}

/** The unrecognized-schema line: settles when the schema member fails the
 * library's own type guard; echoes nothing. Developer-facing pure-ASCII
 * bookkeeping voice. */
function renderVarSpecSchemaLine(name: string): string {
  return `var registry: invalid spec schema for variable '${name}': schema is not a recognizable zod schema`;
}

/** THE single malformed-base-type line: ONE template site for EVERY
 * non-admitted payload - a foreign literal-lane string and every other
 * non-spec payload alike. The ${payload} echo is deliberate, not
 * incidental: arrays comma-join, null echoes "null", symbols echo
 * Symbol(desc), functions echo their source text. Do not "improve" the
 * echo - the bytes are pinned. */
function renderVarMalformedBaseTypeLine(
  name: string,
  payload: unknown,
): string {
  return `var registry: invalid base type '${payload}' for variable '${name}'`;
}

/**
 * THE shared pre-mint admission validator over a variable TYPE - SOLE
 * source of truth for every admission line, feeding BOTH minters (the
 * free declareVar and the session store's declare()). Cast-free FIRST-
 * FAULT triage over the RUNTIME payload: a STRING takes the literal lane
 * (the six built-ins admit; anything else faults); a NON-NULL, NON-ARRAY
 * OBJECT enters the SPEC LANE (label well-formed, no built-in shadowing,
 * schema recognized via the instanceof z.ZodType guard); EVERYTHING ELSE
 * faults. The first fault settles loudly - collect-all barred, nothing
 * mints before the triage settles. Returns the DISPLAY name (literal self
 * / spec label); throws the bookkeeping voice on any fault.
 */
export function admitVarType(name: string, type: unknown): string {
  if (typeof type === "string") {
    if (isBuiltinVarType(type)) return type;
    throw new VarAdmissionError(renderVarMalformedBaseTypeLine(name, type));
  }
  if (typeof type !== "object" || type === null || Array.isArray(type)) {
    throw new VarAdmissionError(renderVarMalformedBaseTypeLine(name, type));
  }
  // SPEC LANE: member reads ride Reflect so the triage stays cast-free
  // (types lie past erasure, so every member is re-adjudicated at runtime
  // - first fault settles, collect-all barred). Nothing mints before the
  // triage settles.
  const label: unknown = Reflect.get(type, "label");
  if (typeof label !== "string" || label === "") {
    throw new VarAdmissionError(renderVarSpecLabelLine(name));
  }
  if (isBuiltinVarType(label)) {
    throw new VarAdmissionError(renderVarSpecShadowLine(name, label));
  }
  const schema: unknown = Reflect.get(type, "schema");
  if (!(schema instanceof z.ZodType)) {
    throw new VarAdmissionError(renderVarSpecSchemaLine(name));
  }
  return label;
}

/** THE display resolver (SOLE byte owner of the literal-self / spec-label
 * mapping): six literals display THEMSELVES; a spec displays its LABEL.
 * Feeds the admission return, the cell's derived display accessor, and
 * the session store's declarations()/declarationDisplay() faces. */
export function displayVarType(type: VarType | CustomVarSpec): string {
  return typeof type === "string" ? type : type.label;
}

/** Closed fault taxonomy of the shared conversion core: one category per
 * rejection shape, detail-free by design - the clause renderer below is
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
    return { converted: value }; // scalar leaf - admitted, walked through
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

/** THE shared conversion core (one voice, one table): the SAME pure
 * function serves BOTH the session store (the validated write funnel and
 * the typed reads) AND the cell's per-lane settle - consistency by
 * construction (what set admits, read converts). Type-preserving: the
 * converted value equals the declared type. Never throws; a fault resolves
 * to the closed category the clause renderers turn into the pinned line. */
export function convertVarValue(value: unknown, type: VarType): VarConversion {
  switch (type) {
    case "boolean": {
      // Only the sanctioned forms convert: native booleans verbatim plus
      // the two exact textual tokens ("true"/"false"); everything else
      // faults (non-token strings like "1"/"yes"/"0"/"no" and bare 0/1).
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
      // finite-parse (so "42", " 42 ", "0x1A", "1e3" convert); everything
      // else faults ("", null, true, [5], NaN, ±Infinity).
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
      // form; everything else faults (arrays/objects/null, and non-finite
      // numbers take the finiteness clause).
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
 * structural walk - the walk runs only for array/object demands. The one
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
 * null spelled explicitly (JS typeof null misleads with "object"). */
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

/** ONE coercion-reject line (every validated write path: store arm and
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
 * Module-private: it rides inside the exported filtering map and defect
 * renderer. */
interface VarShapeIssue {
  readonly message: string;
  readonly path: readonly (string | number)[];
}

/** THE symbol-segment filtering map: cast-free narrowing to the structural
 * SLICE - symbol path segments filter out by type-predicate (plain array
 * ops); zod-shaped paths otherwise untouched. Pure: fresh array per call,
 * no side effects. */
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

/** THE spec-lane defect line (sole byte owner): collect-all over the
 * check's findings in issue-array order, '; '-joined statements with
 * non-empty paths dot-prefixed (numeric segments in decimal). */
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

/** THE dedicated check-fault line (sole byte owner): settlement for a
 * declared shape check that threw while running - every thrown kind, the
 * payload referenced nowhere. */
export function renderVarSpecFaultLine(name: string): string {
  return `variable '${name}' cannot be shape-checked \u2014 the declared shape check itself faulted while checking the value`;
}

/** THE wire JSON MATERIALIZATION: string payloads attempt a JSON.parse and
 * ride the DECODED document or scalar on success (model writes arrive as
 * text - decoded documents and scalars settle natively); NON-DOCUMENT text
 * settles the ORIGINAL STRING as-is (decode-or-raw stability); non-strings
 * pass VERBATIM. Never throws (parse failure degrades to the raw string).
 * Pure: no side effects. */
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
 * + admitted typing) and its value-or-unset state, and OWNS its settle
 * policy (one settle path per lane). Fences: NO grants live on the cell
 * (they ride the phase binding), NO cross-cell linkage (there is no
 * name-index anywhere in this module), NO display-name storage (the
 * display derives through the resolver).
 */
export class VarCell {
  /** Author-supplied at mint: a LABEL carried by the object, NOT a
   * registry key - addresses tool params, names every failure line, keys
   * the intra-phase duplicate refusal. */
  readonly name: string;
  /** THE single TYPE slot: EXACTLY ONE present (a built-in literal or a
   * custom spec), admission-validated before construction. The disjoint
   * string/object shapes make the invariant structural; discriminate by
   * typeof === "string". */
  readonly #type: VarType | CustomVarSpec;
  /** Presence FLAG - the SOLE presence authority (never value identity):
   * a spec schema may lawfully parse to undefined, leaving a SET cell
   * whose read reports undefined; ONLY isEmpty() sees through that corner. */
  #hasValue: boolean;
  #value: unknown;

  /** PUBLIC self-validating constructor: the shared pre-mint admission
   * runs BEFORE ANY state is stored, so every construction path is
   * admitted identically (declareVar delegates here - one validation pass,
   * no bypass hazard). A fault mints NOTHING: the throw strictly precedes
   * every assignment. */
  constructor(name: string, type: VarType | CustomVarSpec) {
    admitVarType(name, type);
    this.name = name;
    this.#type = type;
    this.#hasValue = false;
    this.#value = undefined;
  }

  /** DERIVED display name (NO stored field): the built-in literal displays
   * ITSELF, a spec displays its LABEL - delegated to the display resolver.
   * Renders the listing's "types" member and any line needing a human-
   * facing name. */
  get displayName(): string {
    return displayVarType(this.#type);
  }

  /** THE single validated settle entry for EVERY origin (capability code
   * and the model's setVar alike). The literal lane runs the shared
   * conversion: a rejected write THROWS the family carrying the pinned
   * coercion-reject line. The spec lane skips base conversion,
   * materializes ANY STRING payload against a JSON read BEFORE the shape
   * check, then parses the MATERIALIZED CANDIDATE through the schema's
   * safeParse behind the wrap-catch (a FAULTING check degrades to the
   * contained dedicated fault line; a parse failure composes the
   * collect-all defect frame). A conforming write stores the SETTLED
   * value (conversion result / parse output - NEVER raw input); failures
   * leave the previous value and presence state INTACT (store-on-success). */
  set(raw: unknown): void {
    const type = this.#type;
    if (typeof type === "string") {
      // LITERAL LANE: the shared table converts; the CONVERSION RESULT is
      // what stores.
      const result = convertVarValue(raw, type);
      if ("rejected" in result) {
        throw new VariableRejectionError([
          renderVarCoercionRejectLine(this.name, type, raw, result.rejected),
        ]);
      }
      this.#value = result.converted;
      this.#hasValue = true;
      return;
    }
    // SPEC LANE: admission already settled the shape above; trust it.
    const candidate = materializeWireJson(raw);
    let parsed: z.ZodSafeParseResult<unknown>;
    // Wrapping ONLY the parse call: author schema code can throw even on
    // merely-failing values, and every thrown kind settles the fault line.
    try {
      parsed = type.schema.safeParse(candidate);
    } catch {
      throw new VariableRejectionError([renderVarSpecFaultLine(this.name)]);
    }
    if (!parsed.success) {
      // Narrow the findings to the structural slice (symbol segments
      // dropped).
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
   * throws. There is no strict typed-read channel in this surface -
   * programmatic consumers read() and narrow or convert manually. */
  read(): unknown {
    return this.#hasValue ? this.#value : undefined;
  }

  /** Existence consult over the presence FLAG (never value identity).
   * Feeds the settlement-gate emptiness face and any view listing needing
   * presence. */
  isEmpty(): boolean {
    return !this.#hasValue;
  }

  /** Sole program-owned erasure: drops the value, the cell SURVIVES,
   * idempotent over absence. The declaration is untouched - post-reset
   * writes re-enter the same settle path from scratch. */
  reset(): void {
    this.#hasValue = false;
    this.#value = undefined;
  }
}

/** THE authoring entry (free function - cells involve no session state):
 * mints and RETURNS a fresh cell through the shared pre-mint validator
 * (delegated to the self-validating constructor - one validation pass).
 * Every call returns a fresh independent object: same-named cells coexist
 * harmlessly (no name-index anywhere in this module). */
export function declareVar(
  name: string,
  type: VarType | CustomVarSpec,
): VarCell {
  return new VarCell(name, type);
}

/** THE grant model: READ IS GRANTED BY DEFAULT for every bound variable;
 * `write: true` confers the write permission, absent means denied. Grants
 * NEVER live on the cell - they ride the binding inside the execution-
 * state phase frame.
 *
 * The SOLE surviving name conflict is two bindings of the SAME name in
 * one binding set: every projection helper runs the shared first-check
 * over its input FIRST and refuses it loudly before producing anything.
 */
export interface PhaseVarBinding {
  readonly cell: VarCell;
  readonly write?: boolean;
}

/** Bookkeeping voice for the duplicate-binding refusal: developer-facing
 * pure ASCII (no em dashes), model-invisible, deliberately distinct from
 * the model-visible VariableRejectionError. Unexported on purpose: the
 * suite asserts by NAME only. */
class PhaseVarDuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhaseVarDuplicateError";
  }
}

/** Shared first check over every projection helper: two bindings of the
 * SAME name in one set settle the FIRST duplicate in binding order LOUDLY
 * (single-fault) BEFORE anything projects. The pinned line names the
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
 * isEmpty(), in binding order (feeds the settlement-gate emptiness face).
 * Flag consult, never value identity. Pure. */
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
