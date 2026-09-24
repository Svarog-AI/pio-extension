// Built-in capability loader: the in-artifact registration table plus the
// resolution pipeline behind it.
//
// The table maps capability names to LAZY FACTORIES — zero-argument thunks
// issuing a literal dynamic import of the capability module — so nothing
// registered evaluates until its exact name resolves. Registration is a
// static edit of the literal below; there is no mutation API. The table
// ships empty.
//
// Resolution is UI-neutral and never rejects: every outcome, including
// every fault class, RESOLVES as a discriminated result — a success
// descriptor or one of the single-owned refusal LINES returned (never
// written) so the consuming entry can print it. Integrity: a loaded class
// passes only when its prototype chain reaches the bundled base BY
// REFERENCE at any depth (strict descent) — an identically-shaped impostor
// from a second runtime copy is refused, and the base itself is not a
// capability.

import { type CapabilityParams, PioCapability } from "./base.ts";
import { type Contract, checkContract } from "./contract.ts";

/**
 * Capability constructor: a subclass of the bundled base accepting the
 * placement bag. The construct signature is deliberately NON-abstract —
 * the consuming side (throwaway introspection here, entry wiring there)
 * constructs loaded classes; authors extend the ABSTRACT base and supply
 * `call()`, which conformance keeps mandatory.
 */
export type CapabilityConstructor = new (
  params: CapabilityParams,
) => PioCapability;

/** Loaded capability module shape: the class is the DEFAULT export. */
export interface CapabilityModule {
  readonly default: CapabilityConstructor;
}

/** Lazy factory: resolves one registered capability module (literal dynamic import). */
export type CapabilityFactory = () => Promise<CapabilityModule>;

/** name → factory. Hardcoded, static, in-artifact. SHIPS EMPTY. */
export type CapabilityTable = Readonly<Record<string, CapabilityFactory>>;
export const CAPABILITY_TABLE: CapabilityTable = {};

export interface ResolvedCapability {
  /** The loaded class's OWN declared contract (introspected off a throwaway instance). */
  readonly contract: Contract;
  /** The loaded class — ready to instantiate by the consuming entry. */
  readonly ctor: CapabilityConstructor;
}

export type CapabilityResolution =
  | { readonly ok: true; readonly capability: ResolvedCapability }
  | { readonly ok: false; readonly refusal: string };

/** Single owner of the miss refusal line (absence of a registered entry). */
export function capabilityRefusalLine(name: string): string {
  return `pio: capability '${name}' is not implemented yet`;
}

/**
 * Resolve one registered capability by exact, case-sensitive name.
 *
 * Pipeline order is fixed and later stages never run after an earlier
 * refusal: look up the name on the provided table (defaulting to the
 * shipped in-artifact table); on a hit, fire ONLY that entry's factory;
 * require the loaded default export to descend strictly from the bundled
 * base (reference-equal prototype-chain walk); read the class's own
 * declared contract off a throwaway instance; run the load-time contract
 * check. Every outcome — including every fault class — RESOLVES as a
 * discriminated result; nothing rejects and nothing is written to a
 * stream.
 */
export async function resolveCapability(
  name: string,
  table?: CapabilityTable,
): Promise<CapabilityResolution> {
  const registry = table ?? CAPABILITY_TABLE;
  if (!Object.hasOwn(registry, name)) {
    return { ok: false, refusal: capabilityRefusalLine(name) };
  }
  const factory = registry[name];
  let loaded: CapabilityModule;
  try {
    loaded = await factory();
  } catch (cause) {
    return { ok: false, refusal: loadFaultLine(name, faultDetail(cause)) };
  }
  // Runtime shapes are asserted regardless of the declared type: a
  // mis-shaped module value must degrade to a load-fault line, not crash.
  if (typeof loaded !== "object" || loaded === null) {
    return {
      ok: false,
      refusal: loadFaultLine(name, "module resolved to a non-object"),
    };
  }
  const ctor = loaded.default;
  if (typeof ctor !== "function") {
    return {
      ok: false,
      refusal: loadFaultLine(name, "module has no class default export"),
    };
  }
  if (!isBundledSubclass(ctor)) {
    return { ok: false, refusal: identityRefusalLine(name) };
  }
  // Throwaway construction: the authored surface declares `contract` as an
  // instance field, so construction is the only runtime route to the
  // class's own declared value.
  let instance: PioCapability;
  try {
    instance = new ctor({});
  } catch (cause) {
    return { ok: false, refusal: loadFaultLine(name, faultDetail(cause)) };
  }
  const verdict = checkContract(instance.contract);
  if (!verdict.ok) {
    return { ok: false, refusal: contractRefusalLine(name, verdict.problems) };
  }
  return { ok: true, capability: { contract: instance.contract, ctor } };
}

/** Single owner of the integrity refusal line (listed entry, wrong chain). */
function identityRefusalLine(name: string): string {
  return `pio: capability '${name}' refused: not a subclass of the bundled capability base`;
}

/** Single owner of the well-formedness refusal line (load-time contract check). */
function contractRefusalLine(name: string, problems: string[]): string {
  return `pio: capability '${name}' refused: ${problems.join("; ")}`;
}

/** Single owner of the load-fault refusal line (module/environment fault). */
function loadFaultLine(name: string, detail: string): string {
  return `pio: capability '${name}' failed to load: ${oneLine(detail)}`;
}

/** Render an unknown thrown value into a diagnostic detail. */
function faultDetail(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Collapse a fault detail to ONE physical line; empty input degrades to a
 * fixed placeholder (product lines are exactly one line each). */
function oneLine(detail: string): string {
  const collapsed = detail.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : "(no detail)";
}

/**
 * Strict-descent identity check: walk the prototype links ABOVE the
 * constructor's own prototype and compare each link BY REFERENCE to the
 * bundled base's prototype. An identically-shaped impostor whose chain
 * links are different objects (second-runtime-copy corruption) refuses; an
 * anchor found at any depth passes; an entry whose chain starts below the
 * anchor (the bundled base itself or shallower) refuses.
 */
function isBundledSubclass(ctor: CapabilityConstructor): boolean {
  let link: object | null =
    ctor.prototype === undefined ? null : Object.getPrototypeOf(ctor.prototype);
  while (link !== null && link !== PioCapability.prototype) {
    link = Object.getPrototypeOf(link);
  }
  return link === PioCapability.prototype;
}
