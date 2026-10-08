// Hermetic unit suite for the stateless variable-write gate predicate
// (guards/var-gate.ts). Self-contained island: zero SDK imports - every row
// drives the REAL module directly with HAND-BUILT SNAPSHOTS as plain
// structural literals; paths are inert dummies the predicate provably never
// reads (the var clause has no path semantics), so no minted directories, no
// provider closures, no async. The per-session execution state owns the
// lifecycle and the channels - that component is exercised in its own suite.
// Mechanical guards pin the import partition, the escape discipline, and the
// cast-free residue over the module source plus this suite.

import { readFileSync } from "node:fs";
import type { ExecutionSnapshot } from "../../session-execution-state.ts";
import { VariableRejectionError } from "../errors.ts";
import type { CapabilitySources, PathAnchors } from "./guard-vocabulary.ts";
import * as varGateModule from "./var-gate.ts";
import { decideVarWrite } from "./var-gate.ts";

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

/** The standing research-shaped sources (values never consulted by the
 * predicate; varied as sentinels where a row demands it). */
const RESEARCH: CapabilitySources = {
  name: "research",
  writes: ["research/*.md"],
  allowProjectWrites: false,
};

// ---------------------------------------------------------------------------
// Suite-side replicas of the refusal line shapes - SOLE OWNER of every byte
// shape is ./var-gate.ts (its module-private renderers, composed THROUGH the
// error home's family); these witnesses bind decideVarWrite()'s `reason` to
// the pinned bytes. U+2014 arrives escaped in the module literal identically
// here - compare unescaped.
// ---------------------------------------------------------------------------

const replicaPhaseLine = (
  name: string,
  phaseId: string,
  listing: readonly string[],
): string =>
  `variable '${name}' cannot be set during phase '${phaseId}'. Allowed variables: ${listing.length === 0 ? "none" : listing.join(", ")}.`;

const replicaUniversalLine = (name: string): string =>
  // U+2014 arrives escaped in the module literal - compare unescaped.
  `variable '${name}' cannot be set \u2014 no variable permission is declared by any active phase. Allowed variables: none.`;

/** Family-composed message over one rendered line (the verdict's exact
 * composition channel - read for its message bytes, never thrown). */
const familyMessage = (line: string): string =>
  new VariableRejectionError([line]).message;

/** Narrow a refusal (row-invariant guard; allowed calls expect undefined). */
function asRefusal(verdict: { block: true; reason: string } | undefined): {
  block: true;
  reason: string;
} {
  if (verdict === undefined) throw new Error("expected a refusal, got allowed");
  return verdict;
}

/** Governing-phase snapshot builder (plain structural literal). */
const governingSnap = (vars: readonly string[]): ExecutionSnapshot => ({
  sources: RESEARCH,
  phase: {
    id: "p",
    declared: [],
    allowProjectWrites: false,
    tmpDirAllowed: false,
    vars,
  },
  paths: PATHS,
});

// ---------------------------------------------------------------------------
// (a) ADJUDICATION CORE - the pinned verdict order over hand-built snapshots:
// self-filter, extraction, governing-phase admission, the tail.
// ---------------------------------------------------------------------------

describe("adjudication core - governing phase and the tail", () => {
  it("allow on EVERY declared name: each member of the moment's declaration yields NO verdict (setVar only)", () => {
    const snap = governingSnap(["alpha", "beta"]);
    expect(decideVarWrite(snap, "setVar", { name: "alpha" })).toBeUndefined();
    expect(decideVarWrite(snap, "setVar", { name: "beta" })).toBeUndefined();
  });

  it("deny an undeclared name with the PHASE line family bytes (golden: names the variable AND the moment's allowed set, deduplicated declaration order)", () => {
    const snap = governingSnap(["alpha", "beta"]);
    const golden = familyMessage(
      replicaPhaseLine("gamma", "p", ["alpha", "beta"]),
    );
    const refusal = asRefusal(
      decideVarWrite(snap, "setVar", { name: "gamma" }),
    );
    expect(refusal.block).toBe(true);
    expect(refusal.reason).toBe(golden);
  });

  it("depth-0 window (null/null reading): DENY with the UNIVERSAL line family bytes (golden)", () => {
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    const refusal = asRefusal(
      decideVarWrite(snap, "setVar", { name: "gamma" }),
    );
    expect(refusal.block).toBe(true);
    expect(refusal.reason).toBe(familyMessage(replicaUniversalLine("gamma")));
  });

  it("span-present-but-no-phase window: DENY byte-IDENTICAL to the depth-0 universal golden (lazy fall-through - span presence alters nothing)", () => {
    const noPhase: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: null,
      paths: PATHS,
    };
    const depth0: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    const refSpan = asRefusal(decideVarWrite(noPhase, "setVar", { name: "x" }));
    const refDepth = asRefusal(decideVarWrite(depth0, "setVar", { name: "x" }));
    expect(refSpan.reason).toBe(refDepth.reason);
    expect(refSpan.reason).toBe(familyMessage(replicaUniversalLine("x")));
  });

  it("vars-EMPTY phase: confers NO var governance - the reading is byte-IDENTICAL to the depth-0 universal line and NAMES NO PHASE (negative assertion on the phase-line marker)", () => {
    const emptyVars: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "empty-vars",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: false,
        vars: [],
      },
      paths: PATHS,
    };
    const depth0: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    const refEmpty = asRefusal(
      decideVarWrite(emptyVars, "setVar", { name: "x" }),
    );
    const refDepth = asRefusal(decideVarWrite(depth0, "setVar", { name: "x" }));
    expect(refEmpty.reason).toBe(refDepth.reason);
    expect(refEmpty.reason).toBe(familyMessage(replicaUniversalLine("x")));
    // the phase-line marker is ABSENT from the bytes - nothing named:
    expect(refEmpty.reason).not.toContain("during phase");
    expect(refEmpty.reason).not.toContain("'empty-vars'");
  });

  it("duplicate declaration entries DEDUPE to first occurrence in the listing (declaration order preserved; parity with the file gate's survivor doctrine)", () => {
    const snap = governingSnap(["alpha", "beta", "alpha"]);
    expect(decideVarWrite(snap, "setVar", { name: "alpha" })).toBeUndefined();
    const refusal = asRefusal(decideVarWrite(snap, "setVar", { name: "zzz" }));
    expect(refusal.reason).toBe(
      familyMessage(replicaPhaseLine("zzz", "p", ["alpha", "beta"])),
    );
  });
});

// ---------------------------------------------------------------------------
// (b) SELF-FILTER - the predicate intercepts setVar ONLY; every other tool
// name passes through with NO verdict, no consultation, no side effect.
// ---------------------------------------------------------------------------

describe("self-filter - setVar is the single intercepted tool name", () => {
  const OTHER_TOOLS = [
    "getVar",
    "listVars",
    "write",
    "edit",
    "bash",
    "someOtherTool",
  ];

  it("every non-setVar tool name yields NO verdict over a VALID admitted input (the governing phase would have allowed it had it been consulted)", () => {
    const snap = governingSnap(["alpha"]);
    for (const toolName of OTHER_TOOLS) {
      expect(decideVarWrite(snap, toolName, { name: "alpha" })).toBeUndefined();
    }
  });

  it("every non-setVar tool name yields NO verdict over a REFUSING input (the self-filter precedes any adjudication - the write/edit/bash lanes stay untouched by this gate)", () => {
    const snap = governingSnap(["alpha"]);
    for (const toolName of OTHER_TOOLS) {
      expect(
        decideVarWrite(snap, toolName, { name: "outside-the-declaration" }),
      ).toBeUndefined();
    }
  });

  it("non-setVar tool names yield NO verdict even over MALFORMED inputs (no extraction attempt whatsoever)", () => {
    const snap = governingSnap(["alpha"]);
    for (const toolName of OTHER_TOOLS) {
      expect(decideVarWrite(snap, toolName, null)).toBeUndefined();
      expect(decideVarWrite(snap, toolName, {})).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// (c) MALFORMED-INPUT LANE - shape policing belongs to the TOOL layer
// exclusively: any non-string-name input yields NO verdict (silent allow),
// even under a governing phase. One adjudication per concern, in its own
// layer.
// ---------------------------------------------------------------------------

describe("malformed-input lane - silent allow, shape is the tool layer's domain", () => {
  const snap = governingSnap(["alpha"]);

  it.each([
    ["null input", null],
    ["empty object", {}],
    ["numeric name member", { name: 42 }],
    ["array name member", { name: [] }],
    ["bare string input", "alpha"],
  ])("%s yields NO verdict even under a governing phase", (_label, input) => {
    expect(decideVarWrite(snap, "setVar", input)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (d) CONSULTATION PROOF + PER-CALL JUDGMENT - the predicate NEVER reads
// snapshot.sources or snapshot.paths (sentinel variation gives identical
// bytes) and keeps NO state (successively mutated snapshots flip the
// verdict).
// ---------------------------------------------------------------------------

describe("consultation proof + per-call judgment over the GIVEN value", () => {
  it("sentinel-varied anchors AND sources give IDENTICAL verdict bytes on both line shapes (sources/paths provably unconsulted)", () => {
    const SENTINEL_A: PathAnchors = {
      projectSlotRoot: "MKR-slot-v1",
      workspaceCwd: "MKR-cwd-v1",
    };
    const SENTINEL_B: PathAnchors = {
      projectSlotRoot: "MKR-slot-v2",
      workspaceCwd: "MKR-cwd-v2",
    };
    const SOURCES_X: CapabilitySources = {
      name: "cap-x",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    };
    const SOURCES_Y: CapabilitySources = {
      name: "cap-y",
      writes: [],
      allowProjectWrites: false,
    };
    // Universal shape across varied spans + anchors:
    const uniA: ExecutionSnapshot = {
      sources: SOURCES_X,
      phase: null,
      paths: SENTINEL_A,
    };
    const uniB: ExecutionSnapshot = {
      sources: SOURCES_Y,
      phase: null,
      paths: SENTINEL_B,
    };
    expect(
      asRefusal(decideVarWrite(uniA, "setVar", { name: "v" })).reason,
    ).toBe(asRefusal(decideVarWrite(uniB, "setVar", { name: "v" })).reason);
    // Phase-denial shape across varied anchors + sources (the phase record
    // alone decides):
    const govA: ExecutionSnapshot = {
      sources: SOURCES_X,
      phase: {
        id: "gov",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: false,
        vars: ["one"],
      },
      paths: SENTINEL_A,
    };
    const govB: ExecutionSnapshot = {
      sources: SOURCES_Y,
      phase: {
        id: "gov",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: false,
        vars: ["one"],
      },
      paths: SENTINEL_B,
    };
    expect(
      asRefusal(decideVarWrite(govA, "setVar", { name: "two" })).reason,
    ).toBe(asRefusal(decideVarWrite(govB, "setVar", { name: "two" })).reason);
    // And neither sentinel leaks into any byte:
    expect(
      asRefusal(decideVarWrite(govA, "setVar", { name: "two" })).reason,
    ).not.toContain("MKR-");
  });

  it("repeated calls over SUCCESSIVELY MUTATED snapshots flip the verdict on the SAME input (per-call judgment over the GIVEN value - the module caches NOTHING)", () => {
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "flip",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: false,
        vars: ["alpha"],
      },
      paths: PATHS,
    };
    const input = { name: "alpha" };
    // (i) governing: allowed.
    expect(decideVarWrite(snap, "setVar", input)).toBeUndefined();
    // (ii) mutate the declaration away on the SAME object: refused.
    snap.phase!.vars = ["other"];
    expect(asRefusal(decideVarWrite(snap, "setVar", input)).reason).toContain(
      "'flip'",
    );
    // (iii) drop the phase entirely (same object): universal denial.
    snap.phase = null;
    expect(asRefusal(decideVarWrite(snap, "setVar", input)).reason).toBe(
      familyMessage(replicaUniversalLine("alpha")),
    );
    // (iv) drop the sources too (depth-0 reading, same object): the
    // universal byte holds unchanged - nothing was cached anywhere.
    snap.sources = null;
    expect(asRefusal(decideVarWrite(snap, "setVar", input)).reason).toBe(
      familyMessage(replicaUniversalLine("alpha")),
    );
    // (v) restore governance on the SAME object: allowed again.
    snap.phase = {
      id: "flip",
      declared: [],
      allowProjectWrites: false,
      tmpDirAllowed: false,
      vars: ["alpha"],
    };
    expect(decideVarWrite(snap, "setVar", input)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (e) FAMILY COMPOSITION IDENTITY - every denied shape composes its reason
// THROUGH the error home's family: reason equals the family instance's
// message over the single rendered line (ONE owner of the prefix bytes
// across all three delivery channels of the variable concern).
// ---------------------------------------------------------------------------

describe("family composition identity - one voice through the family", () => {
  it("phase-line denial: reason === family message over the replica line", () => {
    const snap = governingSnap(["alpha"]);
    const refusal = asRefusal(decideVarWrite(snap, "setVar", { name: "beta" }));
    expect(refusal.reason).toBe(
      new VariableRejectionError([replicaPhaseLine("beta", "p", ["alpha"])])
        .message,
    );
  });

  it("universal denial (depth 0): reason === family message over the replica line", () => {
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    const refusal = asRefusal(
      decideVarWrite(snap, "setVar", { name: "gamma" }),
    );
    expect(refusal.reason).toBe(
      new VariableRejectionError([replicaUniversalLine("gamma")]).message,
    );
  });

  it("universal denial (vars-empty phase): reason === family message over the replica line - the SAME bytes as the depth-0 shape", () => {
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "void",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: false,
        vars: [],
      },
      paths: PATHS,
    };
    const refusal = asRefusal(
      decideVarWrite(snap, "setVar", { name: "delta" }),
    );
    expect(refusal.reason).toBe(
      new VariableRejectionError([replicaUniversalLine("delta")]).message,
    );
  });

  it("the pinned em-dash lands UNESCAPED in the runtime bytes while the SOURCE carries the escape (escape-discipline witness)", () => {
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    const refusal = asRefusal(decideVarWrite(snap, "setVar", { name: "dash" }));
    // The family prefix renders verbatim, then the line's dash byte:
    expect(refusal.reason).toBe(
      `Variable rejection: variable 'dash' cannot be set \u2014 no variable permission is declared by any active phase. Allowed variables: none.`,
    );
    expect(refusal.reason.includes("\u2014")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (f) MECHANICAL ISLAND SWEEP - self-source reads (house idiom:
// readFileSync(new URL(file, import.meta.url))) covering the module source
// AND this suite: import partition, runtime export surface, specifier bans,
// cast-free residue, glyph discipline, dev-process-marker scan.
// ---------------------------------------------------------------------------

describe("mechanical island sweep - module source and suite source", () => {
  const MODULE_SOURCE = readFileSync(
    new URL("./var-gate.ts", import.meta.url),
    "utf8",
  );
  const SUITE_SOURCE = readFileSync(
    new URL("./var-gate.test.ts", import.meta.url),
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

  it("zero occurrences of the SDK specifier in module OR suite (channel-free by construction)", () => {
    expect(MODULE_SOURCE.includes(SDK_SPECIFIER)).toBe(false);
    expect(SUITE_SOURCE.includes(SDK_SPECIFIER)).toBe(false);
  });

  it("module value imports are EXACTLY ['../errors.ts'] - the family edge alone (statement-aware, ORDER-PRESERVING extraction; zero node: builtins)", () => {
    expect(MODULE_SOURCE.includes("node:")).toBe(false);
    const normalized = MODULE_SOURCE.replace(/\s+/g, " ");
    const valueSpecifiers = [
      ...normalized.matchAll(
        /import\s+(type\s+)?\{[^}]*\}\s+from\s*"([^"]+)"/g,
      ),
    ]
      .filter((match) => match[1] === undefined)
      .map((match) => match[2]);
    expect(valueSpecifiers).toEqual(["../errors.ts"]);
  });

  it("module type-only imports are EXACTLY ['../../session-execution-state.ts'] - the state edge erased at compile time (same relative depth as the sibling gate)", () => {
    const typeSpecifiers = MODULE_SOURCE.split("\n")
      .filter((line) => line.startsWith("import type "))
      .flatMap((line) =>
        [...line.matchAll(/from "([^"]+)"/g)].map((match) => match[1]),
      );
    expect(typeSpecifiers).toEqual(["../../session-execution-state.ts"]);
  });

  it("runtime export surface is EXACTLY ['decideVarWrite'] - the interface erases under erasable syntax", () => {
    expect(Object.keys(varGateModule).sort()).toEqual(["decideVarWrite"]);
  });

  it("zero dynamic import() occurrences in the module; ZERO class declarations (statelessness asserted mechanically)", () => {
    // Fragment assembly prevents self-match inside this suite.
    const DYN_IMPORT_NEEDLE = ["im", "port("].join("");
    expect(MODULE_SOURCE.includes(DYN_IMPORT_NEEDLE)).toBe(false);
    expect(partitionSource(MODULE_SOURCE).code.match(/\bclass\b/g)).toBeNull();
  });

  it("glyph discipline: NO raw U+2014 in any literal payload or in the comment-free code residue of BOTH files - and NO slash survives the elision of the MODULE (the zero-regex-literals pin keeping this scan sound)", () => {
    const RAW_GLYPH = String.fromCharCode(0x2014);
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

  it("zero `as` casts and zero explicit `any` over the comment/literal-stripped residue of the MODULE (suite excluded: its namespace imports and harness narrowing legitimately carry the token)", () => {
    const CAST_TOKEN = ["a", "s"].join("");
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
