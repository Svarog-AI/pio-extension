// Hermetic unit suite for the shared denial byte family
// (denial-vocabulary.ts). Self-contained island: own byte witnesses typed
// locally, own compact comment/literal-eliding scanner for the source-guard
// rows, NO cross-suite imports, zero SDK imports - the sole sanctioned read
// is the repo source of the module under test (house idiom). All path
// fixtures are FIXED LITERAL strings over disjoint roots (literal absolute
// POSIX paths; the shapes mirror the standing goldens). Behavioral rows use
// plain-string comparisons only - no regex literals.

import { readFileSync } from "node:fs";
import * as denialVocabularyModule from "./denial-vocabulary.ts";
import {
  renderPhaseDenial,
  UNIVERSAL_NO_PERMISSION_DENIAL,
} from "./denial-vocabulary.ts";

// ---------------------------------------------------------------------------
// Own hermetic fixtures + byte witnesses - small local constructions bound
// to the pinned bytes (NO cross-suite imports by construction); the
// argument shapes mirror the standing goldens (a slot-rooted survivor path,
// a workspace cwd).
// ---------------------------------------------------------------------------

const SLOT_ROOT = "/state/projects/proj-x";
const WORKSPACE_CWD = "/workspace/proj-x";
const SURVIVOR_PATH = `${SLOT_ROOT}/research/a.md`;

const witnessUniversalDenial = (): string =>
  // U+2014 arrives escaped in the module literal - compare unescaped.
  `Writing is refused \u2014 no write permission is declared by any active phase. Allowed targets: none.`;

const witnessPhaseDenial = (
  phaseId: string,
  survivors: readonly string[],
  workspaceCwd: string | null,
  scratchActive: boolean,
): string => {
  const parts: string[] = [...survivors];
  if (workspaceCwd !== null) parts.push(`project files under ${workspaceCwd}`);
  if (scratchActive) parts.push("scratch files under /tmp/");
  return `Writing is refused during phase '${phaseId}'. Allowed targets: ${
    parts.length === 0 ? "none" : parts.join(", ")
  }.`;
};

describe("lockstep parity over the shared byte family (own witnesses)", () => {
  it("universal constant parity: the exported constant EQUALS the suite witness, carrying the em dash and the pinned trailing clause", () => {
    expect(UNIVERSAL_NO_PERMISSION_DENIAL).toBe(witnessUniversalDenial());
    expect(UNIVERSAL_NO_PERMISSION_DENIAL).toContain("\u2014");
    expect(
      UNIVERSAL_NO_PERMISSION_DENIAL.endsWith("Allowed targets: none."),
    ).toBe(true);
  });

  it("renderer parity across the FOUR element shapes (survivors-only / scope-alone / scratch-alone / both): the exported renderer EQUALS the suite witness on the SAME argument shapes the standing goldens use", () => {
    expect(renderPhaseDenial("gather", [SURVIVOR_PATH], null, false)).toBe(
      witnessPhaseDenial("gather", [SURVIVOR_PATH], null, false),
    );
    expect(renderPhaseDenial("scope-only", [], WORKSPACE_CWD, false)).toBe(
      witnessPhaseDenial("scope-only", [], WORKSPACE_CWD, false),
    );
    expect(renderPhaseDenial("scratch-only", [], null, true)).toBe(
      witnessPhaseDenial("scratch-only", [], null, true),
    );
    expect(
      renderPhaseDenial("both-classes", [SURVIVOR_PATH], WORKSPACE_CWD, true),
    ).toBe(
      witnessPhaseDenial("both-classes", [SURVIVOR_PATH], WORKSPACE_CWD, true),
    );
  });
});

describe("runtime namespace surface", () => {
  it("denial-vocabulary's runtime namespace is EXACTLY {UNIVERSAL_NO_PERMISSION_DENIAL, renderPhaseDenial} - the byte leaf's full surface", () => {
    expect(Object.keys(denialVocabularyModule).sort()).toEqual([
      "UNIVERSAL_NO_PERMISSION_DENIAL",
      "renderPhaseDenial",
    ]);
  });
});

// ---------------------------------------------------------------------------
// MECHANICAL SOURCE GUARDS - self-source reads (house idiom:
// readFileSync(new URL(file, import.meta.url))) over the module under test
// only; needles assembled at runtime from fragments (self-match prevention).
// ---------------------------------------------------------------------------

describe("mechanical source guards - denial-vocabulary.ts", () => {
  const MODULE_SOURCE = readFileSync(
    new URL("./denial-vocabulary.ts", import.meta.url),
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

  it("\\u2014 discipline over ITS OWN source: the universal byte's leading fragment is retained escaped; NO raw U+2014 in any literal payload or in the comment-free code residue - and NO slash survives the elision (the zero-regex-literals pin that keeps this scan sound)", () => {
    expect(
      MODULE_SOURCE.includes("Writing is refused \\u2014 no write permission"),
    ).toBe(true);
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

  it("charter: ZERO import lines, zero node: specifiers, NO class declarations, declarative export names EXACTLY {UNIVERSAL_NO_PERMISSION_DENIAL, renderPhaseDenial}, dev-process-marker hygiene", () => {
    expect(MODULE_SOURCE.match(/^import\b/gm)).toBeNull();
    expect(MODULE_SOURCE.includes("node:")).toBe(false);
    expect(
      partitionForScan(MODULE_SOURCE).residue.match(/\bclass\b/g),
    ).toBeNull();
    const declared = [
      ...MODULE_SOURCE.matchAll(
        /^export\s+(?:interface|class|function|const|enum)\s+([A-Za-z_$][\w$]*)/gm,
      ),
    ].map((match) => match[1]);
    expect(declared.sort()).toEqual([
      "UNIVERSAL_NO_PERMISSION_DENIAL",
      "renderPhaseDenial",
    ]);
    for (const pattern of DEV_PROCESS_MARKERS) {
      expect(
        MODULE_SOURCE.match(new RegExp(pattern, "gi")),
        `marker slipped through: ${pattern}`,
      ).toBeNull();
    }
  });
});
