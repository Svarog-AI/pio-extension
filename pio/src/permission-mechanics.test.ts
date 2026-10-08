// Hermetic unit suite for the shared effective-set construction
// (permission-mechanics.ts). Self-contained island: own path fixtures typed
// locally, own compact comment/literal-eliding scanner for the source-guard
// rows, NO cross-suite imports, zero SDK imports - the sole sanctioned reads
// are the repo sources (house idiom). ONE sanctioned cross-MODULE value
// dependency: the builder <-> predicate agreement row imports decideWrite
// (the gate) + renderPhaseDenial (the byte leaf) purely as integration edges
// proving literal consumption - the SUBJECT of that row is the builder. All
// path fixtures are FIXED LITERAL strings over disjoint roots (literal
// absolute POSIX paths; path.resolve is identity on them). Behavioral rows
// use plain-value comparisons only - no regex literals.

import { readFileSync } from "node:fs";
import type {
  CapabilitySources,
  PathAnchors,
  PhasePermission,
} from "./capability/guards/guard-vocabulary.ts";
import { decideWrite } from "./capability/guards/write-gate.ts";
import { renderPhaseDenial } from "./denial-vocabulary.ts";
import * as permissionMechanicsModule from "./permission-mechanics.ts";
import { materializeEffectiveSet } from "./permission-mechanics.ts";
import type { ExecutionSnapshot } from "./session-execution-state.ts";

// ---------------------------------------------------------------------------
// Own hermetic fixtures - plain structural literals. One anchor pair;
// literal absolute posix paths everywhere (resolve() is identity on them).
// ---------------------------------------------------------------------------

const SLOT_ROOT = "/state/projects/proj-x";
const WORKSPACE_CWD = "/workspace/proj-x";
const PATHS: PathAnchors = {
  projectSlotRoot: SLOT_ROOT,
  workspaceCwd: WORKSPACE_CWD,
};

/** The standing research-shaped sources (the default source shape unless a
 * row states otherwise). */
const RESEARCH: CapabilitySources = {
  name: "research",
  writes: ["research/*.md"],
  allowProjectWrites: false,
};

/** Narrow a refusal (row-invariant guard; allowed writes expect undefined). */
function asRefusal(verdict: { block: true; reason: string } | undefined): {
  block: true;
  reason: string;
} {
  if (verdict === undefined) throw new Error("expected a refusal, got allowed");
  return verdict;
}

describe("builder semantics over plain values (own fixtures)", () => {
  it("builder <-> predicate agreement over ONE governing snapshot (mixed declared incl. one uncovered entry, backed scope flag, tmp flag ON): the builder's output is LITERALLY what decideWrite constructs and renders with", () => {
    const KEPT_A = `${SLOT_ROOT}/research/a.md`;
    const DROPPED = `${SLOT_ROOT}/else/nope.txt`;
    const BACKED: CapabilitySources = {
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    };
    const PHASE: PhasePermission = {
      id: "agree",
      declared: [KEPT_A, DROPPED],
      allowProjectWrites: true,
      tmpDirAllowed: true,
    };
    const eff = materializeEffectiveSet(PHASE, BACKED, PATHS);
    expect(eff.survivors).toEqual([KEPT_A]);
    expect(eff.projectWritesActive).toBe(true);
    expect(eff.scratchActive).toBe(true);
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: PHASE,
      paths: PATHS,
    };
    const stray = asRefusal(
      decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/c.md` }),
    );
    expect(stray.reason).toBe(
      renderPhaseDenial(
        PHASE.id,
        eff.survivors,
        eff.projectWritesActive ? WORKSPACE_CWD : null,
        eff.scratchActive,
      ),
    );
  });

  it("builder edge (a): null sources coalesce onto the empty base INSIDE the construction - empty survivors, inert propositions", () => {
    const PHASE: PhasePermission = {
      id: "null-src",
      declared: [`${SLOT_ROOT}/research/x.md`],
      allowProjectWrites: true,
      tmpDirAllowed: false,
    };
    const eff = materializeEffectiveSet(PHASE, null, PATHS);
    expect(eff.survivors).toEqual([]);
    expect(eff.projectWritesActive).toBe(false);
    expect(eff.scratchActive).toBe(false);
  });

  it("builder edge (b): fully-uncovered declared set yields EMPTY survivors (nothing survives the contract coverage filter)", () => {
    const APW: CapabilitySources = {
      name: "cap-apw",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    };
    const PHASE: PhasePermission = {
      id: "uncov",
      declared: [`/elsewhere/file.md`],
      allowProjectWrites: true,
      tmpDirAllowed: true,
    };
    expect(materializeEffectiveSet(PHASE, APW, PATHS).survivors).toEqual([]);
  });

  it("builder edge (c): duplicates dedupe to the FIRST occurrence, declaration order preserved", () => {
    const DUP = `${SLOT_ROOT}/research/dup.md`;
    const UNCOVERED = `${SLOT_ROOT}/else/nope.txt`;
    const PHASE: PhasePermission = {
      id: "dedupe",
      declared: [UNCOVERED, DUP, UNCOVERED, DUP],
      allowProjectWrites: false,
      tmpDirAllowed: false,
    };
    expect(materializeEffectiveSet(PHASE, RESEARCH, PATHS).survivors).toEqual([
      DUP,
    ]);
  });

  it("builder edge (d): unbacked scope flag yields projectWritesActive FALSE at decision time (the contract flag stays off)", () => {
    const KEPT = `${SLOT_ROOT}/research/kept.md`;
    const PHASE: PhasePermission = {
      id: "unbacked",
      declared: [KEPT],
      allowProjectWrites: true,
      tmpDirAllowed: false,
    };
    const eff = materializeEffectiveSet(PHASE, RESEARCH, PATHS);
    expect(eff.projectWritesActive).toBe(false);
    expect(eff.survivors).toEqual([KEPT]);
  });

  it("builder edge (e): repeated calls return STRUCTURALLY-EQUAL fresh records (distinct array instances - fresh record + fresh array per call)", () => {
    const KEPT = `${SLOT_ROOT}/research/kept.md`;
    const PHASE: PhasePermission = {
      id: "fresh",
      declared: [KEPT],
      allowProjectWrites: false,
      tmpDirAllowed: true,
    };
    const first = materializeEffectiveSet(PHASE, RESEARCH, PATHS);
    const second = materializeEffectiveSet(PHASE, RESEARCH, PATHS);
    expect(second).toEqual(first);
    expect(second.survivors).not.toBe(first.survivors);
  });
});

describe("runtime namespace surface", () => {
  it("permission-mechanics's runtime namespace is EXACTLY {materializeEffectiveSet} - the EffectiveSet type erases", () => {
    expect(Object.keys(permissionMechanicsModule).sort()).toEqual([
      "materializeEffectiveSet",
    ]);
  });
});

// ---------------------------------------------------------------------------
// MECHANICAL SOURCE GUARDS - self-source reads (house idiom:
// readFileSync(new URL(file, import.meta.url))) over the module under test;
// the ONE cross-directory companion read (the gate) serves the wholesale-
// migration absence assertion only. Needles assembled at runtime from
// fragments (self-match prevention).
// ---------------------------------------------------------------------------

describe("mechanical source guards - permission-mechanics.ts", () => {
  const MODULE_SOURCE = readFileSync(
    new URL("./permission-mechanics.ts", import.meta.url),
    "utf8",
  );
  const GATE_SOURCE = readFileSync(
    new URL("./capability/guards/write-gate.ts", import.meta.url),
    "utf8",
  );

  /** Compact comment/literal-aware scan (house precedent: the state suite's
   * partitionForScan) - prose comments are elided into `residue` and exempt;
   * every string/template literal is consumed to its close quote HONORING
   * BACKSLASH ESCAPES, its RAW interior recorded in `payloads` (escapes
   * intact) and blanked in the residue. Soundness rests on the pinned
   * ZERO-SLASH-IN-RESIDUE rule below - no expression-start heuristic is
   * needed for a file that carries no regex literals. */
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
        residue += `${ch}P${ch}`;
        i = end + 1;
        continue;
      }
      residue += ch;
      i += 1;
    }
    return { residue, payloads };
  }

  const SDK_SPECIFIER = ["@earendil-works", "pi-coding-agent"].join("/");
  const CAST_TOKEN = ["a", "s"].join("");
  const RAW_GLYPH = String.fromCharCode(0x2014);
  const CLAUSE_TEXT = "Scratch files under /tmp/ stay open.";

  /** Dev-process-marker needles (fragments assembled at runtime - self-
   * match-proof): step attribution, planning-doc references, section signs,
   * and date tokens must never leak into a production module. */
  const DEV_PROCESS_MARKERS: string[] = [
    "\\bstep" + "\\s+\\d",
    "\\bS0" + "\\d\\b",
    "\\bD#" + "\\d",
    "\\u00a7",
    "(?:TASK|PLAN)\\." + "md",
    "\\bskeleton" + "\\b",
    "\\b20" + "\\d{2}-\\d{2}-\\d{2}\\b",
  ];

  it("the single coverage rule is defined ONCE and called EXACTLY ONCE in THIS module (one definition + one call site) and the identifier is NOWHERE in the gate (the consult migrated wholesale)", () => {
    const moduleOccurrences =
      partitionForScan(MODULE_SOURCE).residue.match(/\badmittedBy\b/g);
    expect(moduleOccurrences?.length ?? 0).toBe(2);
    const gateOccurrences =
      partitionForScan(GATE_SOURCE).residue.match(/\badmittedBy\b/g);
    expect(gateOccurrences).toBeNull();
  });

  it("glyph discipline over ITS OWN source: NO raw U+2014 in any literal payload or in the comment-free code residue - and NO slash survives the elision (the zero-regex-literals pin that keeps this scan sound)", () => {
    const { residue, payloads } = partitionForScan(MODULE_SOURCE);
    for (const payload of payloads) {
      expect(payload.includes(RAW_GLYPH)).toBe(false);
    }
    expect(residue.includes(RAW_GLYPH)).toBe(false);
    expect(residue.includes("/")).toBe(false);
  });

  it("zero `as` assertion casts over the comment/literal-stripped residue of THIS module - the zero-cast convention enforced mechanically on its own source", () => {
    const { residue } = partitionForScan(MODULE_SOURCE);
    expect(residue.match(new RegExp(`\\b${CAST_TOKEN}\\b`, "g"))).toBeNull();
  });

  it("zero occurrences of the SDK specifier in the module source", () => {
    expect(MODULE_SOURCE.includes(SDK_SPECIFIER)).toBe(false);
  });

  it("clause death: the retired /tmp/ parity clause text is ABSENT from the module source (every refusal line is either the phase line or the universal byte - nothing else exists)", () => {
    expect(MODULE_SOURCE).not.toContain(CLAUSE_TEXT);
  });

  it("charter: same leaf charter PLUS value-import partition EXACTLY [./sandbox/string-match-helpers.ts], type-only imports EXACTLY [./capability/guards/guard-vocabulary.ts] with the three pinned names, declarative export names EXACTLY {EffectiveSet, materializeEffectiveSet}, dev-process-marker hygiene", () => {
    expect(MODULE_SOURCE.includes("node:")).toBe(false);
    expect(
      partitionForScan(MODULE_SOURCE).residue.match(/\bclass\b/g),
    ).toBeNull();
    // Statement-aware, ORDER-PRESERVING extraction over the whitespace-
    // normalized source (house precedent: the state suite's edge-pin scan) -
    // long named-import lists wrap across lines, so a line-prefix filter
    // would miss them.
    const normalizedPermMech = MODULE_SOURCE.replace(/\s+/g, " ");
    const clauses = [
      ...normalizedPermMech.matchAll(
        /import\s+(type\s+)?\{[^}]*\}\s+from\s*"([^"]+)"/g,
      ),
    ].map((match) => ({
      typeOnly: match[1] !== undefined,
      specifier: match[2],
    }));
    expect(
      clauses.filter((clause) => !clause.typeOnly).map((c) => c.specifier),
    ).toEqual(["./sandbox/string-match-helpers.ts"]);
    expect(
      clauses.filter((clause) => clause.typeOnly).map((c) => c.specifier),
    ).toEqual(["./capability/guards/guard-vocabulary.ts"]);
    const clause = MODULE_SOURCE.match(
      /import\s+type\s*\{([\s\S]*?)\}\s*from\s*"(\.[^"]+)"/,
    );
    expect(clause).not.toBeNull();
    const importedNames = clause![1]
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    expect(importedNames.sort()).toEqual([
      "CapabilitySources",
      "PathAnchors",
      "PhasePermission",
    ]);
    expect(clause![2]).toBe("./capability/guards/guard-vocabulary.ts");
    const declared = [
      ...MODULE_SOURCE.matchAll(
        /^export\s+(?:interface|class|function|const|enum)\s+([A-Za-z_$][\w$]*)/gm,
      ),
    ].map((match) => match[1]);
    expect(declared.sort()).toEqual([
      "EffectiveSet",
      "materializeEffectiveSet",
    ]);
    for (const pattern of DEV_PROCESS_MARKERS) {
      expect(
        MODULE_SOURCE.match(new RegExp(pattern, "gi")),
        `marker slipped through: ${pattern}`,
      ).toBeNull();
    }
  });
});
