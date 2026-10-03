// Hermetic unit suite for the stateless write-guard predicate
// (guards/write-gate.ts). Self-contained island: zero SDK imports — every row
// drives the REAL module directly with HAND-BUILT SNAPSHOTS as plain
// structural literals over LITERAL ABSOLUTE POSIX paths (path.resolve is
// identity on them, so literals round-trip byte-exactly). The module never
// touches disk: no minted directories, no provider closures, no async. The
// layer-bookkeeping tier, the two-object interleave tier, and the
// channel-fault rows live in the execution-state suite — that component owns
// the lifecycle and the channels. Mechanical guards pin the import
// partition, the escape discipline, and the retired-identifier absence
// across all five swept files (the three guard siblings, the relocated
// state skeleton, and the sandbox matcher module).

import { readFileSync } from "node:fs";
import * as stringMatchHelpersModule from "../../sandbox/string-match-helpers.ts";
import type { ExecutionSnapshot } from "../../session-execution-state.ts";
import * as stateModule from "../../session-execution-state.ts";
import type { CapabilitySources, PathAnchors } from "./guard-vocabulary.ts";
import * as vocabularyModule from "./guard-vocabulary.ts";
import * as writeGateModule from "./write-gate.ts";
import { decideWrite, matchesAnchoredGlob } from "./write-gate.ts";

// ---------------------------------------------------------------------------
// Shared hermetic fixtures — plain structural literals. One anchor pair;
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

// ---------------------------------------------------------------------------
// Suite-side replicas of the module's denial templates — SOLE OWNER of each
// byte shape is guards/write-gate.ts (renderPhaseDenial /
// renderCapabilityDenial / renderNoSpanDenial); these constructions exist
// only to assert lockstep byte-equality on decideWrite()'s `reason`.
// ---------------------------------------------------------------------------

const replicaPhaseDenial = (
  phaseId: string,
  survivors: readonly string[],
  workspaceCwd: string | null,
): string => {
  const parts: string[] = [...survivors];
  if (workspaceCwd !== null) parts.push(`project files under ${workspaceCwd}`);
  return `Writing is refused during phase '${phaseId}'. Allowed targets: ${parts.length === 0 ? "none" : parts.join(", ")}. Scratch files under /tmp/ stay open.`;
};

const replicaCapabilityDenial = (
  name: string,
  writes: readonly string[],
): string => {
  const parts: string[] = [...writes];
  return `Writing is refused during capability '${name}'. Allowed targets: ${parts.length === 0 ? "none" : parts.join(", ")}. Scratch files under /tmp/ stay open.`;
};

const replicaNoSpanDenial = (): string =>
  // U+2014 arrives escaped in the module literal — compare unescaped.
  `Writing is refused \u2014 no capability span is active. Allowed targets: none. Scratch files under /tmp/ stay open.`;

/** Narrow a refusal (row-invariant guard; allowed writes expect undefined). */
function asRefusal(verdict: { block: true; reason: string } | undefined): {
  block: true;
  reason: string;
} {
  if (verdict === undefined) throw new Error("expected a refusal, got allowed");
  return verdict;
}

// ---------------------------------------------------------------------------
// (a) The FIVE FIXTURE SHAPES as first-class rows — spanning both naming
// cases (phase-named AND capability-named refusals).
// ---------------------------------------------------------------------------

describe("fixture shapes - the singular effective allowlist", () => {
  it("in-list: a declared, contract-covered target is allowed - write and edit alike", () => {
    const DECLARED = `${SLOT_ROOT}/research/alpha.md`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "gather", declared: [DECLARED], allowProjectWrites: false },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: DECLARED })).toBeUndefined();
    expect(decideWrite(snap, "edit", { path: DECLARED })).toBeUndefined();
  });

  it("out-of-list: a target outside the effective set refuses with the PHASE named, survivor listed", () => {
    const KEPT = `${SLOT_ROOT}/research/alpha.md`;
    const STRAY = `${SLOT_ROOT}/research/beta.md`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "gather", declared: [KEPT], allowProjectWrites: false },
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: STRAY }));
    expect(refusal.reason).toContain("'gather'");
    expect(refusal.reason).toContain(KEPT);
  });

  it("clamped-away-as-if-undeclared: a contract-uncovered declared entry is refused at DECISION TIME, absent from the listing", () => {
    const KEPT = `${SLOT_ROOT}/research/kept.md`;
    const UNCOVERED = `${SLOT_ROOT}/outside/dropped.txt`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "clamp",
        declared: [UNCOVERED, KEPT],
        allowProjectWrites: false,
      },
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: UNCOVERED }));
    expect(refusal.reason).toContain("'clamp'");
    expect(refusal.reason).toContain(KEPT);
    expect(refusal.reason).not.toContain(UNCOVERED);
    expect(decideWrite(snap, "write", { path: KEPT })).toBeUndefined();
  });

  it("inherited: an EMPTY declaration confers no phase governance - the capability's sources apply unchanged", () => {
    const HIT = `${SLOT_ROOT}/research/ok.md`;
    const MISS = `${SLOT_ROOT}/docs/other.md`;
    const emptyDecl: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "narrate", declared: [], allowProjectWrites: false },
      paths: PATHS,
    };
    const noPhase: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: null,
      paths: PATHS,
    };
    expect(decideWrite(emptyDecl, "write", { path: HIT })).toBeUndefined();
    expect(decideWrite(noPhase, "write", { path: HIT })).toBeUndefined();
    const refEmpty = asRefusal(decideWrite(emptyDecl, "write", { path: MISS }));
    const refNone = asRefusal(decideWrite(noPhase, "write", { path: MISS }));
    expect(refEmpty.reason).toBe(refNone.reason);
    expect(refEmpty.reason).toContain("'research'");
    expect(refEmpty.reason).toContain("research/*.md");
  });

  it("no-span: null sources with no phase yield the empty-set refusal naming the no-span state", () => {
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${WORKSPACE_CWD}/anything.md` }),
    );
    expect(refusal.block).toBe(true);
    expect(refusal.reason).toContain("no capability span is active");
    expect(refusal.reason).toContain("Allowed targets: none.");
  });
});

// ---------------------------------------------------------------------------
// (b) The /tmp/ parity invariant — ALWAYS allowed, BEFORE any other
// consideration, at EVERY depth (exact startsWith("/tmp/") semantics).
// ---------------------------------------------------------------------------

describe("/tmp/ parity at every depth", () => {
  it("depth-0 (null sources): allowed before any span exists", () => {
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    expect(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/depth0.txt" }),
    ).toBeUndefined();
  });

  it("span-only: allowed while a capability span governs", () => {
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: null,
      paths: PATHS,
    };
    expect(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/spanonly.txt" }),
    ).toBeUndefined();
  });

  it("span + non-empty effective phase: allowed despite the exhaustive phase set", () => {
    const KEPT = `${SLOT_ROOT}/research/alpha.md`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "gather", declared: [KEPT], allowProjectWrites: false },
      paths: PATHS,
    };
    expect(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/phased.txt" }),
    ).toBeUndefined();
  });

  it("span + wiped phase (empty-contract sources): allowed even though nothing is covered", () => {
    const WIPED: CapabilitySources = {
      name: "empty-cap",
      writes: [],
      allowProjectWrites: false,
    };
    const snap: ExecutionSnapshot = {
      sources: WIPED,
      phase: { id: "wiped", declared: [], allowProjectWrites: false },
      paths: PATHS,
    };
    expect(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/clamped.txt" }),
    ).toBeUndefined();
  });

  it("prefix semantics are EXACTLY the invariant: '/tmp' itself and '/tmpfoo/*' are NOT covered", () => {
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    // Both fall through to the empty-set refusal (no-span bytes, lockstep).
    expect(asRefusal(decideWrite(snap, "write", { path: "/tmp" })).reason).toBe(
      replicaNoSpanDenial(),
    );
    expect(
      asRefusal(decideWrite(snap, "write", { path: "/tmpfoo/scratch.txt" }))
        .reason,
    ).toBe(replicaNoSpanDenial());
  });
});

// ---------------------------------------------------------------------------
// (c) The PHASE-BRANCH DECISION-TIME MATRIX — five coverage outcomes driven
// over snapshots carrying RAW `declared` sets (attach stores verbatim; the
// judgment runs per call — there is no attach-time clamp anywhere).
// ---------------------------------------------------------------------------

describe("phase-branch decision-time matrix", () => {
  it("pattern-hit admission: a declared entry covered by a writes pattern is allowed", () => {
    const KEPT = `${SLOT_ROOT}/research/kept.md`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "p", declared: [KEPT], allowProjectWrites: false },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: KEPT })).toBeUndefined();
  });

  it("declared cwd path WITHOUT the flag: the declaration is no longer contract-covered, drops out of the effective set, the phase governs NOTHING, and the write is refused capability-named with the PATTERNS-ONLY listing (the new refusal corner, inert flavor)", () => {
    const APW: CapabilitySources = {
      name: "cap-apw",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    };
    const PROJECT_FILE = `${WORKSPACE_CWD}/notes.md`;
    const snap: ExecutionSnapshot = {
      sources: APW,
      phase: { id: "p", declared: [PROJECT_FILE], allowProjectWrites: false },
      paths: PATHS,
    };
    // Post-ruling: the flagless declaration is dropped at decision time, so
    // the phase confers NO governance and the span judgment alone decides -
    // patterns only, no scope class.
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: PROJECT_FILE }),
    );
    expect(refusal.reason).toBe(
      replicaCapabilityDenial("cap-apw", ["artifacts/*.md"]),
    );
    expect(refusal.reason).not.toContain("during phase");
    expect(refusal.reason).not.toContain(
      `project files under ${WORKSPACE_CWD}`,
    );
  });

  it("FULLY-UNCOVERED: no declared entry contract-covered ⇒ NO phase governance ⇒ refused AS IF UNDECLARED (the CAPABILITY is named - a phase-named line would be WRONG)", () => {
    const APW: CapabilitySources = {
      name: "cap-apw",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    };
    const FOREIGN = `/elsewhere/file.md`;
    const snap: ExecutionSnapshot = {
      sources: APW,
      phase: { id: "p", declared: [FOREIGN], allowProjectWrites: false },
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: FOREIGN }));
    expect(refusal.reason).toContain("'cap-apw'");
    expect(refusal.reason).not.toContain("during phase");
    expect(refusal.reason).not.toContain(FOREIGN);
  });

  it("PARTIAL coverage: mixed declared - survivors visible in declaration order, uncovered ones ABSENT (lockstep)", () => {
    const KEPT_A = `${SLOT_ROOT}/research/a.md`;
    const KEPT_B = `${SLOT_ROOT}/research/b.md`;
    const DROPPED = `${SLOT_ROOT}/else/nope.txt`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "mixed",
        declared: [KEPT_A, DROPPED, KEPT_B],
        allowProjectWrites: false,
      },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: KEPT_A })).toBeUndefined();
    expect(decideWrite(snap, "write", { path: KEPT_B })).toBeUndefined();
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/c.md` }),
    );
    // Exhaustive survivor listing, declaration order, deduplicated - no
    // third path:
    expect(refusal.reason).toBe(
      replicaPhaseDenial("mixed", [KEPT_A, KEPT_B], null),
    );
  });

  it("duplicate declared entries DEDUPE to the first occurrence - listed exactly once, declaration order", () => {
    const DUP = `${SLOT_ROOT}/research/dup.md`;
    const UNCOVERED = `${SLOT_ROOT}/else/nope.txt`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "dedupe",
        declared: [UNCOVERED, DUP, UNCOVERED, DUP],
        allowProjectWrites: false,
      },
      paths: PATHS,
    };
    // The repeated entry still admits its target exactly as a single one...
    expect(decideWrite(snap, "write", { path: DUP })).toBeUndefined();
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/x.md` }),
    );
    // ...and the denial lists the survivor EXACTLY ONCE (first-occurrence
    // dedupe over declaration order) - never double-listed:
    expect(refusal.reason).toBe(replicaPhaseDenial("dedupe", [DUP], null));
  });

  it("EMPTY-CONTRACT fall-through: the wiped phase behaves byte-identically to the undeclared shape - sentinel anchors provably unused", () => {
    const EMPTY: CapabilitySources = {
      name: "empty-cap",
      writes: [],
      allowProjectWrites: false,
    };
    const TARGET = "/outside/a.md";
    // SENTINEL PLACEHOLDER anchors — unique marker substrings engineered to
    // be found if ever interpolated into the denial:
    const SENTINEL_PATHS: PathAnchors = {
      projectSlotRoot: "MKR-slot-sentinel",
      workspaceCwd: "MKR-cwd-sentinel",
    };
    const wiped: ExecutionSnapshot = {
      sources: EMPTY,
      phase: {
        id: "wiped",
        declared: [TARGET, `${SENTINEL_PATHS.workspaceCwd}/proj.md`],
        allowProjectWrites: false,
      },
      paths: SENTINEL_PATHS,
    };
    const plain: ExecutionSnapshot = {
      sources: EMPTY,
      phase: null,
      paths: SENTINEL_PATHS,
    };
    expect(
      asRefusal(decideWrite(wiped, "write", { path: TARGET })).reason,
    ).toBe(asRefusal(decideWrite(plain, "write", { path: TARGET })).reason);
    expect(
      asRefusal(decideWrite(wiped, "write", { path: TARGET })).reason,
    ).toBe(replicaCapabilityDenial("empty-cap", []));
    // Swap in DIFFERENT placeholder anchors: identical bytes — `paths` is
    // provably never consulted for the wiped phase.
    const OTHER_PATHS: PathAnchors = {
      projectSlotRoot: "MKR-other-slot",
      workspaceCwd: "MKR-other-cwd",
    };
    const moved: ExecutionSnapshot = { ...wiped, paths: OTHER_PATHS };
    expect(
      asRefusal(decideWrite(moved, "write", { path: TARGET })).reason,
    ).toBe(replicaCapabilityDenial("empty-cap", []));
  });

  it("null sources + active phase: the effective set is empty and the NO-SPAN line governs - never a phase-named line", () => {
    const TARGET = "/outside/b.md";
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: {
        id: "stray-phase",
        declared: [TARGET],
        allowProjectWrites: false,
      },
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: TARGET }));
    expect(refusal.reason).toBe(replicaNoSpanDenial());
  });
});

// ---------------------------------------------------------------------------
// The FLAG-CLAMP DECISION-TIME MATRIX - the project-files (workspace-cwd)
// scope class as a PER-PHASE DECLARATION: a phase admits the class only when
// BOTH its own flag and the running sources' contract flag are true, judged
// at decision time. An unbacked flag is INVISIBLE - never granted, never
// listed; a phase that declares nothing confers NO phase governance (the
// lazy fall-through is kept). Fixtures reuse the standing constants; the
// flag-backed twin raises the contract flag.
// ---------------------------------------------------------------------------

describe("flag-clamp decision-time matrix - the per-phase scope declaration", () => {
  /** The RESEARCH twin with the contract flag raised (backed rows). */
  const BACKED: CapabilitySources = {
    name: "research",
    writes: ["research/*.md"],
    allowProjectWrites: true,
  };

  it("(a) backed flag-only: EXCLUSIVE class governance - the cwd-scope target admitted, the /tmp/ scratch admitted FIRST, and the slot-pattern target REFUSED with the phase named and the class-only full line", () => {
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: { id: "scope-only", declared: [], allowProjectWrites: true },
      paths: PATHS,
    };
    // The cwd-scope class admits a strictly-under-cwd target:
    expect(
      decideWrite(snap, "write", { path: `${WORKSPACE_CWD}/notes.md` }),
    ).toBeUndefined();
    // /tmp/ precedence holds under the new governance shape (first pass):
    expect(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/scopeonly.txt" }),
    ).toBeUndefined();
    // A slot-pattern target OUTSIDE the class is refused despite contract
    // coverage - slot-pattern targets are not class-admitted during a
    // flag-only phase:
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/beta.md` }),
    );
    expect(refusal.reason).toContain("'scope-only'");
    expect(refusal.reason).toBe(
      replicaPhaseDenial("scope-only", [], WORKSPACE_CWD),
    );
  });

  it("(b) unbacked flag: INVISIBLE - with a paths+flag phase the covered survivor is admitted while a slot stray refuses with SURVIVORS ONLY in the listing and a cwd target is ALSO refused (lost scope dimension); a flag-only-no-paths phase confers NO phase governance (capability named, byte-identical to the phase-null reading)", () => {
    const KEPT = `${SLOT_ROOT}/research/kept.md`;
    const pathsFlagged: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "unbacked",
        declared: [KEPT],
        allowProjectWrites: true,
      },
      paths: PATHS,
    };
    expect(decideWrite(pathsFlagged, "write", { path: KEPT })).toBeUndefined();
    // Shape 1: survivors-only listing - no scope element anywhere:
    const strayRefusal = asRefusal(
      decideWrite(pathsFlagged, "write", {
        path: `${SLOT_ROOT}/research/stray.md`,
      }),
    );
    expect(strayRefusal.reason).toBe(
      replicaPhaseDenial("unbacked", [KEPT], null),
    );
    expect(strayRefusal.reason).not.toContain("project files under");
    // The cwd dimension is lost too (same survivors-only line):
    const cwdRefusal = asRefusal(
      decideWrite(pathsFlagged, "write", { path: `${WORKSPACE_CWD}/m.md` }),
    );
    expect(cwdRefusal.reason).toBe(
      replicaPhaseDenial("unbacked", [KEPT], null),
    );
    // Shape 2: flag-only, no paths - NO phase governance, capability named:
    const flagOnly: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "flag-only", declared: [], allowProjectWrites: true },
      paths: PATHS,
    };
    const noPhase: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: null,
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(flagOnly, "write", { path: `${WORKSPACE_CWD}/m.md` }),
      ).reason,
    ).toBe(
      asRefusal(
        decideWrite(noPhase, "write", { path: `${WORKSPACE_CWD}/m.md` }),
      ).reason,
    );
  });

  it("(c) paths + flag, both backed: the covered survivor admitted, a cwd target ADMITTED (the delta vs exclusive governance), a slot stray refused with the FULL survivors-plus-class line", () => {
    const KEPT = `${SLOT_ROOT}/research/kept.md`;
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: {
        id: "both",
        declared: [KEPT],
        allowProjectWrites: true,
      },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: KEPT })).toBeUndefined();
    expect(
      decideWrite(snap, "write", { path: `${WORKSPACE_CWD}/notes.md` }),
    ).toBeUndefined();
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/stray.md` }),
    );
    expect(refusal.reason).toBe(
      replicaPhaseDenial("both", [KEPT], WORKSPACE_CWD),
    );
  });

  it("(d) paths-only phase inside a flag-TRUE span: the scope dimension is LOST - a cwd target outside the declared paths is REFUSED with the phase named and a survivors-only listing (no implicit allowance from the span's own flag)", () => {
    const KEPT = `${SLOT_ROOT}/research/kept.md`;
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: { id: "paths-only", declared: [KEPT], allowProjectWrites: false },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: KEPT })).toBeUndefined();
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${WORKSPACE_CWD}/leak.md` }),
    );
    expect(refusal.reason).toContain("'paths-only'");
    expect(refusal.reason).toBe(replicaPhaseDenial("paths-only", [KEPT], null));
  });

  it("(e) nothing declared (no paths, no flag): NO phase governance - the cwd target is now REFUSED capability-named (silent-phase pin of the new refusal corner, full-line patterns-only), and the miss-target refusal bytes stay identical between the phase-present and phase-null readings", () => {
    const bare: ExecutionSnapshot = {
      sources: BACKED,
      phase: { id: "bare", declared: [], allowProjectWrites: false },
      paths: PATHS,
    };
    const noPhase: ExecutionSnapshot = {
      sources: BACKED,
      phase: null,
      paths: PATHS,
    };
    // Post-ruling: the silent phase confers no governance and the span
    // admits patterns only - the cwd scope needs the phase class.
    expect(
      asRefusal(
        decideWrite(bare, "write", { path: `${WORKSPACE_CWD}/notes.md` }),
      ).reason,
    ).toBe(replicaCapabilityDenial("research", ["research/*.md"]));
    const MISS = `${SLOT_ROOT}/else/miss.md`;
    // Companion pin survives (now trivially true): both readings refuse
    // identically.
    expect(asRefusal(decideWrite(bare, "write", { path: MISS })).reason).toBe(
      asRefusal(decideWrite(noPhase, "write", { path: MISS })).reason,
    );
  });

  it("(f) null sources + flag-carrying phase: the class is INERT on the ONE code path - the NO-SPAN line governs (full-line golden with the escaped em dash), sentinel anchors vary with IDENTICAL bytes (paths provably unconsulted), and the flag-TRUE reading is byte-identical to the flag-FALSE counterpart (the flag never branches when sources are null)", () => {
    const TARGET = "/outside/f.md";
    const SENTINEL_A: PathAnchors = {
      projectSlotRoot: "MKR-slot-f",
      workspaceCwd: "MKR-cwd-f",
    };
    const SENTINEL_B: PathAnchors = {
      projectSlotRoot: "MKR-slot-f2",
      workspaceCwd: "MKR-cwd-f2",
    };
    const flaggedTrue: ExecutionSnapshot = {
      sources: null,
      phase: {
        id: "flagged",
        declared: [TARGET, `${SENTINEL_A.workspaceCwd}/proj.md`],
        allowProjectWrites: true,
      },
      paths: SENTINEL_A,
    };
    const moved: ExecutionSnapshot = { ...flaggedTrue, paths: SENTINEL_B };
    const flaggedFalse: ExecutionSnapshot = {
      sources: null,
      phase: {
        id: "flagged",
        declared: [TARGET, `${SENTINEL_A.workspaceCwd}/proj.md`],
        allowProjectWrites: false,
      },
      paths: SENTINEL_A,
    };
    expect(
      asRefusal(decideWrite(flaggedTrue, "write", { path: TARGET })).reason,
    ).toBe(replicaNoSpanDenial());
    // Sentinel-anchor variation: identical bytes - paths never consulted:
    expect(
      asRefusal(decideWrite(moved, "write", { path: TARGET })).reason,
    ).toBe(
      asRefusal(decideWrite(flaggedTrue, "write", { path: TARGET })).reason,
    );
    // Flag never branches when sources are null:
    expect(
      asRefusal(decideWrite(flaggedFalse, "write", { path: TARGET })).reason,
    ).toBe(
      asRefusal(decideWrite(flaggedTrue, "write", { path: TARGET })).reason,
    );
  });
});

// ---------------------------------------------------------------------------
// (d) Project-file (workspace-cwd) admission - the scope dimension lives
// ONLY in the phase branch: a flag-TRUE contract alone refuses the project
// file at the span site (the capability line lists its patterns only).
// ---------------------------------------------------------------------------

describe("project-file admission under allowProjectWrites", () => {
  const TARGET_RELPATH = "src/helper.ts"; // under the workspace cwd, no pattern coverage

  it("a contract WITHOUT allowProjectWrites refuses the project file, capability named", () => {
    const target = `${WORKSPACE_CWD}/${TARGET_RELPATH}`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: null,
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: target }));
    expect(refusal.reason).toContain("'research'");
    // The scope element is absent from EVERY capability line now:
    expect(refusal.reason).not.toContain("project files under");
  });

  it("the INVERSE row: the same target is REFUSED even WITH allowProjectWrites true - the flag-TRUE contract ALONE admits no project file (full-line patterns-only)", () => {
    const target = `${WORKSPACE_CWD}/${TARGET_RELPATH}`;
    const APW_RESEARCH: CapabilitySources = {
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    };
    const snap: ExecutionSnapshot = {
      sources: APW_RESEARCH,
      phase: null,
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: target }));
    expect(refusal.reason).toBe(
      replicaCapabilityDenial("research", ["research/*.md"]),
    );
    expect(refusal.reason).not.toContain(
      `project files under ${WORKSPACE_CWD}`,
    );
  });

  it("the scope is STRICTLY under the workspace cwd (cwd itself is not admitted)", () => {
    // Purpose note: the strictly-under prefix form is enforced ONLY at the
    // phase-branch class site; here the span admits patterns only, so the
    // cwd boundary shows up as the plain span refusal.
    const APW_ONLY: CapabilitySources = {
      name: "cap-apw",
      writes: [],
      allowProjectWrites: true,
    };
    const snap: ExecutionSnapshot = {
      sources: APW_ONLY,
      phase: null,
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: WORKSPACE_CWD })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// (e) The pattern-direction membership predicate — the documented fsview
// dialect in permission direction. All TEN carried rows drive
// matchesAnchoredGlob directly over fixed string roots (pure strings; the
// predicate answers "would this candidate target fall inside this declared
// pattern" for a path that does not yet exist).
// ---------------------------------------------------------------------------

describe("matchesAnchoredGlob - the documented fsview dialect in permission direction", () => {
  const R = "/state/projects/proj-x"; // fixed project-slot root

  it("brace-only pattern receives the full transform even when hasWildcard reports false", () => {
    // 'docs/{a,b}.md' carries none of '* ? [' — the fast-path hint must not
    // shortcut the brace handling (brace-only patterns are dialect members).
    expect(matchesAnchoredGlob("docs/{a,b}.md", R, `${R}/docs/a.md`)).toBe(
      true,
    );
    expect(matchesAnchoredGlob("docs/{a,b}.md", R, `${R}/docs/b.md`)).toBe(
      true,
    );
    expect(matchesAnchoredGlob("docs/{a,b}.md", R, `${R}/docs/c.md`)).toBe(
      false,
    );
  });

  it("character classes include by range and exclude by negation", () => {
    // [a-c] includes exactly a, b, c within the segment.
    expect(matchesAnchoredGlob("data/[a-c].json", R, `${R}/data/b.json`)).toBe(
      true,
    );
    expect(matchesAnchoredGlob("data/[a-c].json", R, `${R}/data/z.json`)).toBe(
      false,
    );
    // [!a-c] is the negated class: everything outside the range.
    expect(matchesAnchoredGlob("data/[!a-c].json", R, `${R}/data/z.json`)).toBe(
      true,
    );
    expect(matchesAnchoredGlob("data/[!a-c].json", R, `${R}/data/b.json`)).toBe(
      false,
    );
  });

  it("? matches exactly one character, never zero or two", () => {
    expect(matchesAnchoredGlob("file?.txt", R, `${R}/file1.txt`)).toBe(true);
    expect(matchesAnchoredGlob("file?.txt", R, `${R}/file.txt`)).toBe(false);
    expect(matchesAnchoredGlob("file?.txt", R, `${R}/file12.txt`)).toBe(false);
  });

  it("nested braces expand recursively ({x,{y,z}})", () => {
    expect(matchesAnchoredGlob("{x,{y,z}}/deep.md", R, `${R}/x/deep.md`)).toBe(
      true,
    );
    expect(matchesAnchoredGlob("{x,{y,z}}/deep.md", R, `${R}/y/deep.md`)).toBe(
      true,
    );
    expect(matchesAnchoredGlob("{x,{y,z}}/deep.md", R, `${R}/z/deep.md`)).toBe(
      true,
    );
    expect(matchesAnchoredGlob("{x,{y,z}}/deep.md", R, `${R}/w/deep.md`)).toBe(
      false,
    );
  });

  it("* stays confined to a single segment (segment-boundary exclusion)", () => {
    // 'a*/f.txt' covers 'aSub/f.txt' (star inside the first segment)…
    expect(matchesAnchoredGlob("a*/f.txt", R, `${R}/aSub/f.txt`)).toBe(true);
    // …but NEVER 'a/sub/f.txt' (the star would have to cross '/').
    expect(matchesAnchoredGlob("a*/f.txt", R, `${R}/a/sub/f.txt`)).toBe(false);
  });

  it("top-level arm splits recurse independently per arm ({src,test}/files/*.txt)", () => {
    expect(
      matchesAnchoredGlob("{src,test}/files/*.txt", R, `${R}/src/files/a.txt`),
    ).toBe(true);
    expect(
      matchesAnchoredGlob("{src,test}/files/*.txt", R, `${R}/test/files/b.txt`),
    ).toBe(true);
    expect(
      matchesAnchoredGlob("{src,test}/files/*.txt", R, `${R}/lib/files/a.txt`),
    ).toBe(false);
    // A deeper remainder breaks the equal-segment-count requirement.
    expect(
      matchesAnchoredGlob(
        "{src,test}/files/*.txt",
        R,
        `${R}/src/files/deep/a.txt`,
      ),
    ).toBe(false);
  });

  it("non-metacharacter specials match literally (dot and hyphen are not regex)", () => {
    expect(
      matchesAnchoredGlob("v1.2/file-name.txt", R, `${R}/v1.2/file-name.txt`),
    ).toBe(true);
    // '.' must not interpret as any-character.
    expect(
      matchesAnchoredGlob("v1.2/file-name.txt", R, `${R}/v1x2/file-name.txt`),
    ).toBe(false);
    // '-' must not interpret as a range outside a class.
    expect(
      matchesAnchoredGlob("v1.2/file-name.txt", R, `${R}/v1.2/file_name.txt`),
    ).toBe(false);
  });

  it("multi-segment trailing star matches exactly one segment deep (research/*.md)", () => {
    expect(
      matchesAnchoredGlob("research/*.md", R, `${R}/research/report.md`),
    ).toBe(true);
    // Zero characters after the slash is legal: '*' allows zero-or-more.
    expect(matchesAnchoredGlob("research/*.md", R, `${R}/research/.md`)).toBe(
      true,
    );
    expect(
      matchesAnchoredGlob("research/*.md", R, `${R}/research/sub/report.md`),
    ).toBe(false);
    expect(matchesAnchoredGlob("research/*.md", R, `${R}/research.md`)).toBe(
      false,
    );
  });

  it("anchoring excludes out-of-root targets, the root itself, and suffix impostors", () => {
    // Outside the root entirely (suffix matches textually — rejected).
    expect(
      matchesAnchoredGlob("research/*.md", R, `/elsewhere/research/r.md`),
    ).toBe(false);
    // The root itself is never strictly-under the root.
    expect(matchesAnchoredGlob("*", R, R)).toBe(false);
    // Sibling prefix impostor: '/slots' is not under '/slot/'.
    expect(
      matchesAnchoredGlob("a/*.md", "/opt/slot", `/opt/slots/a/x.md`),
    ).toBe(false);
  });

  it("out-of-dialect pattern text fails closed (no match, never throws)", () => {
    // Unbalanced open brace.
    expect(matchesAnchoredGlob("docs/{a,b", R, `${R}/docs/a.md`)).toBe(false);
    // Stray unpaired close brace.
    expect(matchesAnchoredGlob("docs/a}b.md", R, `${R}/docs/a}b.md`)).toBe(
      false,
    );
    // Unclosed character class.
    expect(matchesAnchoredGlob("data/[abc.json", R, `${R}/data/a.json`)).toBe(
      false,
    );
    // None of these may throw: fail-closed means a plain boolean no-match.
    expect(() =>
      matchesAnchoredGlob("docs/{a,b", R, `${R}/docs/a.md`),
    ).not.toThrow();
  });

  it("wildcard-free, brace-free patterns compare as literal paths after anchoring", () => {
    expect(
      matchesAnchoredGlob("plain/readme.md", R, `${R}/plain/readme.md`),
    ).toBe(true);
    expect(
      matchesAnchoredGlob("plain/readme.md", R, `${R}/plain/readme.MD`),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (f) GOLDENS — lockstep byte-equality on EVERY refusal shape. Each replica
// constant asserts LOCKSTEP byte-equality between decideWrite()'s `reason`
// and the suite-side construction above; the module's render* functions are
// the SOLE OWNER of each template.
// ---------------------------------------------------------------------------

describe("goldens - lockstep byte-equality on every refusal shape", () => {
  it("phase-named denial with non-empty survivors", () => {
    const KEPT = `${SLOT_ROOT}/research/a.md`;
    // SOLE OWNER: renderPhaseDenial in guards/write-gate.ts.
    const GOLDEN_PHASE_NAMED = replicaPhaseDenial("guard-probe", [KEPT], null);
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "guard-probe", declared: [KEPT], allowProjectWrites: false },
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/b.md` }),
      ).reason,
    ).toBe(GOLDEN_PHASE_NAMED);
  });

  it("phase-named denial with the SCOPE CLASS ACTIVE ALONE (flag-only shape): the class element stands in the listing alone - new class-active full-line golden", () => {
    // SOLE OWNER: renderPhaseDenial (class-active form) in write-gate.ts.
    const BACKED: CapabilitySources = {
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    };
    const GOLDEN_CLASS_ONLY = replicaPhaseDenial(
      "scope-only",
      [],
      WORKSPACE_CWD,
    );
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: { id: "scope-only", declared: [], allowProjectWrites: true },
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/b.md` }),
      ).reason,
    ).toBe(GOLDEN_CLASS_ONLY);
    expect(GOLDEN_CLASS_ONLY).toContain(`project files under ${WORKSPACE_CWD}`);
  });

  it("phase-named denial with SURVIVORS AND the scope class active: the class element appended AFTER the surviving paths - new class-active full-line golden", () => {
    // SOLE OWNER: renderPhaseDenial (survivors-plus-class form) in
    // write-gate.ts.
    const BACKED: CapabilitySources = {
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    };
    const KEPT = `${SLOT_ROOT}/research/a.md`;
    const GOLDEN_SURVIVORS_AND_CLASS = replicaPhaseDenial(
      "both",
      [KEPT],
      WORKSPACE_CWD,
    );
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: {
        id: "both",
        declared: [KEPT],
        allowProjectWrites: true,
      },
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/c.md` }),
      ).reason,
    ).toBe(GOLDEN_SURVIVORS_AND_CLASS);
    // The trailing clause stays last (structural pin):
    expect(
      GOLDEN_SURVIVORS_AND_CLASS.endsWith(
        "Scratch files under /tmp/ stay open.",
      ),
    ).toBe(true);
  });

  it("capability-named denial with patterns only - the universal listing shape (the contract flag adds no element to the line)", () => {
    // SOLE OWNER: renderCapabilityDenial in guards/write-gate.ts.
    const GOLDEN_CAP_PATTERNS = replicaCapabilityDenial("research", [
      "research/*.md",
    ]);
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: null,
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/docs/other.md` }),
      ).reason,
    ).toBe(GOLDEN_CAP_PATTERNS);
  });

  it("capability-named denial over FLAG-TRUE sources: the flag is INVISIBLE on the capability line - the patterns-only bytes are IDENTICAL to the flag-off shape (refusing-what-is-listed is forbidden)", () => {
    // SOLE OWNER: renderCapabilityDenial in guards/write-gate.ts.
    const GOLDEN_CAP_FLAG_INVISIBLE = replicaCapabilityDenial("research", [
      "research/*.md",
    ]);
    const APW_RESEARCH: CapabilitySources = {
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    };
    const snap: ExecutionSnapshot = {
      sources: APW_RESEARCH,
      phase: null,
      paths: PATHS,
    };
    // A pattern-miss OUTSIDE every scope reaches the denial: the flag adds
    // no element - the line matches the flag-off bytes exactly.
    expect(
      asRefusal(decideWrite(snap, "write", { path: `/outside/scope.md` }))
        .reason,
    ).toBe(GOLDEN_CAP_FLAG_INVISIBLE);
    expect(GOLDEN_CAP_FLAG_INVISIBLE).not.toContain("project files under");
  });

  it("capability-named 'none' - the empty-contract span refusal", () => {
    // SOLE OWNER: renderCapabilityDenial (empty-sources form) in write-gate.ts.
    const GOLDEN_CAP_NONE = replicaCapabilityDenial("compose-demo", []);
    const COMPOSE_DEMO: CapabilitySources = {
      name: "compose-demo",
      writes: [],
      allowProjectWrites: false,
    };
    const snap: ExecutionSnapshot = {
      sources: COMPOSE_DEMO,
      phase: null,
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/anything/x.md` }),
      ).reason,
    ).toBe(GOLDEN_CAP_NONE);
    expect(GOLDEN_CAP_NONE).toContain("Allowed targets: none.");
  });

  it("no-span 'none' - the depth-0 refusal (carries the escaped U+2014 em dash)", () => {
    // SOLE OWNER: renderNoSpanDenial in guards/write-gate.ts.
    const GOLDEN_NO_SPAN = replicaNoSpanDenial();
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/anything/x.md` }),
      ).reason,
    ).toBe(GOLDEN_NO_SPAN);
    expect(GOLDEN_NO_SPAN).toContain("\u2014"); // the structural clause is present
  });

  it("every denial carries the /tmp/ parity clause (all four line shapes)", () => {
    const APW_RESEARCH: CapabilitySources = {
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    };
    const KEPT = `${SLOT_ROOT}/research/a.md`;
    const shapes: Array<{ block: true; reason: string }> = [];
    // Phase-named (non-empty survivors):
    shapes.push(
      asRefusal(
        decideWrite(
          {
            sources: APW_RESEARCH,
            phase: {
              id: "guard-probe",
              declared: [KEPT],
              allowProjectWrites: false,
            },
            paths: PATHS,
          },
          "write",
          { path: `${SLOT_ROOT}/research/b.md` },
        ),
      ),
    );
    // Capability-named over FLAG-TRUE sources (target outside every scope):
    shapes.push(
      asRefusal(
        decideWrite(
          { sources: APW_RESEARCH, phase: null, paths: PATHS },
          "write",
          { path: "/outside/x.md" },
        ),
      ),
    );
    // No-span (depth-0):
    shapes.push(
      asRefusal(
        decideWrite({ sources: null, phase: null, paths: PATHS }, "write", {
          path: "/outside/y.md",
        }),
      ),
    );
    // Capability-named WITHOUT the note (empty-contract span):
    const EMPTY: CapabilitySources = {
      name: "empty-cap",
      writes: [],
      allowProjectWrites: false,
    };
    shapes.push(
      asRefusal(
        decideWrite({ sources: EMPTY, phase: null, paths: PATHS }, "write", {
          path: `/outside/z.md`,
        }),
      ),
    );

    for (const shape of shapes) {
      expect(shape.block).toBe(true);
      expect(
        shape.reason.endsWith("Scratch files under /tmp/ stay open."),
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// (g) Coverage is EXACTLY write/edit — non-writer tools and malformed inputs
// bail BEFORE touching the snapshot's pair fields: immediate `undefined`,
// zero side effects. Driven against a well-formed snapshot AND a
// MARKER-POISONED snapshot whose fields carry unique substrings engineered to
// be found if ever interpolated into a returned string.
// ---------------------------------------------------------------------------

describe("coverage is exactly write/edit - short-circuit before any snapshot consultation", () => {
  // MARKER-POISONED snapshot: every field carries a unique marker substring.
  const POISONED: ExecutionSnapshot = {
    sources: {
      name: "MKR-poisoned-name",
      writes: ["MKR-poisoned-pattern"],
      allowProjectWrites: true,
    },
    phase: {
      id: "MKR-poisoned-phase",
      declared: ["MKR-poisoned-declared"],
      allowProjectWrites: false,
    },
    paths: {
      projectSlotRoot: "MKR-poisoned-slot",
      workspaceCwd: "MKR-poisoned-cwd",
    },
  };
  const WELL_FORMED: ExecutionSnapshot = {
    sources: RESEARCH,
    phase: null,
    paths: PATHS,
  };

  const NO_TARGET_INPUTS: Array<[string, unknown]> = [
    // Non-writer tools — including bash (backlog territory) — yield no target:
    ["bash", { command: "touch /outside/x.md" }],
    ["read", { path: "/outside/x.md" }],
    ["vscode_apply_workspace_edit", {}],
    // Writer tools with missing/non-string/absent paths yield no target:
    ["write", {}],
    ["write", { path: 42 }],
    ["write", null],
    ["write", undefined],
  ];

  it("non-writer tools and malformed writer inputs yield NO target - no verdict, no exception, markers uninterpolated", () => {
    for (const [toolName, input] of NO_TARGET_INPUTS) {
      for (const snap of [WELL_FORMED, POISONED]) {
        // Strict undefined: there is no returned string in which a marker
        // could appear, and no exception is thrown.
        expect(
          decideWrite(snap, toolName, input),
          `unexpected verdict for ${toolName}`,
        ).toBeUndefined();
      }
    }
  });

  it("the same no-target inputs under an ACTIVE-SPAN-shaped snapshot - still no verdict", () => {
    const SPAN_SHAPED: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "gather",
        declared: [`${SLOT_ROOT}/research/a.md`],
        allowProjectWrites: false,
      },
      paths: PATHS,
    };
    for (const [toolName, input] of NO_TARGET_INPUTS) {
      expect(decideWrite(SPAN_SHAPED, toolName, input)).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// (h) Channel-freedom + runtime-namespace surface pins — every public
// signature takes PLAIN VALUES; the runtime module namespaces expose ONLY
// the value exports (the types erase to nothing).
// ---------------------------------------------------------------------------

describe("channel freedom + runtime namespace surface", () => {
  it("every public signature takes PLAIN VALUES - allowed AND refused end-to-end on structural literals only", () => {
    const KEPT = `${SLOT_ROOT}/research/a.md`;
    const allowedSnap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "gather", declared: [KEPT], allowProjectWrites: false },
      paths: PATHS,
    };
    expect(decideWrite(allowedSnap, "write", { path: KEPT })).toBeUndefined();
    const refusedSnap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    expect(
      asRefusal(decideWrite(refusedSnap, "write", { path: "/outside/h.md" }))
        .block,
    ).toBe(true);
  });

  it("write-gate's runtime namespace is EXACTLY {decideWrite, matchesAnchoredGlob} - the type erases", () => {
    expect(Object.keys(writeGateModule).sort()).toEqual([
      "decideWrite",
      "matchesAnchoredGlob",
    ]);
  });

  it("the vocabulary exports NOTHING at runtime (types-only) and the state module exports EXACTLY {SessionExecutionState} - its types erase, mechanically", () => {
    expect(Object.keys(vocabularyModule)).toEqual([]);
    expect(Object.keys(stateModule).sort()).toEqual(["SessionExecutionState"]);
  });

  it("the sandbox matcher module exports EXACTLY {hasWildcard, matchesAnchoredGlob} at runtime - the private helper chain never leaks", () => {
    expect(Object.keys(stringMatchHelpersModule).sort()).toEqual([
      "hasWildcard",
      "matchesAnchoredGlob",
    ]);
  });
});

// ---------------------------------------------------------------------------
// (i) MECHANICAL SOURCE GUARDS — self-source reads (house idiom:
// readFileSync(new URL(file, import.meta.url))) covering ALL FIVE swept
// files: import partition, statelessness, types-only surfaces, escape
// discipline, retired-identifier absence.
// ---------------------------------------------------------------------------

describe("mechanical source guards - all swept files", () => {
  const GATE_SOURCE = readFileSync(
    new URL("./write-gate.ts", import.meta.url),
    "utf8",
  );
  const SUITE_SOURCE = readFileSync(
    new URL("./write-gate.test.ts", import.meta.url),
    "utf8",
  );
  const VOCAB_SOURCE = readFileSync(
    new URL("./guard-vocabulary.ts", import.meta.url),
    "utf8",
  );
  const STATE_SOURCE = readFileSync(
    new URL("../../session-execution-state.ts", import.meta.url),
    "utf8",
  );
  const HELPER_SOURCE = readFileSync(
    new URL("../../sandbox/string-match-helpers.ts", import.meta.url),
    "utf8",
  );

  /** Single-pass, STATE-AWARE scan over the raw source: elides comments
   * (line and block), consumes every string/template literal to its
   * matching close quote HONORING BACKSLASH ESCAPES (recording each raw
   * interior in `payloads`, blanking it in the returned `code` with the
   * quote characters kept around a `P` placeholder), and recognizes
   * REGEX LITERALS — a `/` opens one only after an expression-start
   * character (a division `/` never does), consumed through the closing
   * `/` with `[...]` class and backslash-escape fidelity. The downstream
   * assertions are thereby sound: a block-comment opener inside a glob
   * string can no longer swallow real code, an apostrophe in prose can
   * no longer open a phantom literal, a quote inside a regex can no
   * longer desynchronize pairing, and no pairing crosses a line
   * blindly. Raw glyphs in prose comments are house precedent — comments
   * elide here; literals are recorded, not elided. */
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

  it("zero occurrences of the SDK specifier in ANY swept file", () => {
    for (const source of [
      GATE_SOURCE,
      SUITE_SOURCE,
      VOCAB_SOURCE,
      STATE_SOURCE,
      HELPER_SOURCE,
    ]) {
      expect(source.includes(SDK_SPECIFIER)).toBe(false);
    }
  });

  it("write-gate.ts: value imports are EXACTLY [node:path, ../../sandbox/string-match-helpers.ts] - zero node:fs, zero value sibling imports", () => {
    expect(GATE_SOURCE.includes("node:fs")).toBe(false);
    const valueSpecifiers = GATE_SOURCE.split("\n")
      .filter(
        (line) =>
          line.startsWith("import ") && !line.startsWith("import type "),
      )
      .flatMap((line) =>
        [...line.matchAll(/from "([^"]+)"/g)].map((match) => match[1]),
      );
    expect(valueSpecifiers).toEqual([
      "node:path",
      "../../sandbox/string-match-helpers.ts",
    ]);
  });

  it("string-match-helpers.ts: ZERO import lines (self-contained - owns hasWildcard), zero node:fs, NO class declarations", () => {
    expect(HELPER_SOURCE.includes("node:fs")).toBe(false);
    expect(HELPER_SOURCE.match(/^import\b/gm)).toBeNull();
    expect(partitionSource(HELPER_SOURCE).code.match(/\bclass\b/g)).toBeNull();
  });

  it("write-gate.ts: type-only imports are a SUBSET of the two siblings, and the state edge is REQUIRED (erased at compile time)", () => {
    const typeSpecifiers = GATE_SOURCE.split("\n")
      .filter((line) => line.startsWith("import type "))
      .flatMap((line) =>
        [...line.matchAll(/from "([^"]+)"/g)].map((match) => match[1]),
      );
    expect(typeSpecifiers.length).toBeGreaterThanOrEqual(1);
    for (const spec of typeSpecifiers) {
      expect(spec).toMatch(/^\.\.?\//);
      expect([
        "./guard-vocabulary.ts",
        "../../session-execution-state.ts",
      ]).toContain(spec);
    }
    expect(typeSpecifiers).toContain("../../session-execution-state.ts");
  });

  it("write-gate.ts: NO class declarations - statelessness asserted mechanically", () => {
    expect(partitionSource(GATE_SOURCE).code.match(/\bclass\b/g)).toBeNull();
  });

  it("write-gate.ts: the single coverage rule is defined ONCE and called EXACTLY TWICE (one definition + two call sites)", () => {
    const occurrences =
      partitionSource(GATE_SOURCE).code.match(/\badmittedBy\b/g);
    expect(occurrences?.length ?? 0).toBe(3);
  });

  it("guard-vocabulary.ts: ZERO import lines; EXACTLY three `export interface` members, name-set pinned", () => {
    expect(VOCAB_SOURCE.match(/^import\b/gm)).toBeNull();
    const exportLines = VOCAB_SOURCE.split("\n").filter((line) =>
      line.startsWith("export"),
    );
    expect(exportLines).toHaveLength(3);
    const names = exportLines.flatMap((line) => {
      const match = line.match(/^export interface (\w+)/);
      return match ? [match[1]] : [];
    });
    expect(names.sort()).toEqual([
      "CapabilitySources",
      "PathAnchors",
      "PhasePermission",
    ]);
  });

  it("session-execution-state.ts: ONE type-only import clause (three names, the vocabulary specifier), the EXACTLY THREE pinned export declarations, no function declarations", () => {
    const importStatements = STATE_SOURCE.match(/^import\b/gm);
    expect(importStatements?.length ?? 0).toBe(1);
    const clause = STATE_SOURCE.match(
      /import\s+type\s*\{([\s\S]*?)\}\s*from\s+"(\.[^"]+)"/,
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
    const exportLines = STATE_SOURCE.split("\n").filter((line) =>
      line.startsWith("export "),
    );
    // The completed module's pinned three-name export surface:
    expect(exportLines.sort()).toEqual([
      "export class SessionExecutionState {",
      "export interface AnchorChannels {",
      "export interface ExecutionSnapshot {",
    ]);
    const codeOnly = partitionSource(STATE_SOURCE).code;
    expect(codeOnly.match(/\bfunction\b/g)).toBeNull();
  });

  it("zero `as` assertion casts over the four swept PRODUCTION modules - the zero-cast convention enforced mechanically (suite excluded: its namespace imports and harness narrowing legitimately carry the token)", () => {
    // Assembled at runtime so this guard does not self-match its own text.
    const CAST_TOKEN = ["a", "s"].join("");
    const castPattern = new RegExp(`\\b${CAST_TOKEN}\\b`, "g");
    // Sweeps EXACTLY the production files — the suite itself uses `* as` in
    // its namespace imports and one documented narrowing seam, both outside
    // the convention's reach.
    const offenders: string[] = [];
    for (const [label, source] of [
      ["write-gate.ts", GATE_SOURCE],
      ["guard-vocabulary.ts", VOCAB_SOURCE],
      ["session-execution-state.ts", STATE_SOURCE],
      ["string-match-helpers.ts", HELPER_SOURCE],
    ]) {
      // Comments elide and every literal payload blanks in the SAME sound
      // pass (partitionSource), so prose `as` words cannot false-positive:
      // only real code residue is scanned.
      const hits = partitionSource(source).code.match(castPattern);
      if (hits !== null) offenders.push(`${label}: ${hits.length}`);
    }
    expect(offenders).toEqual([]);
  });

  it("\\u2014 discipline: the pinned escaped literal is retained; NO raw U+2014 inside ANY string LITERAL of any swept file", () => {
    expect(
      GATE_SOURCE.includes("Writing is refused \\u2014 no capability span"),
    ).toBe(true);
    const rawGlyph = String.fromCharCode(0x2014);
    // Sound sweep: partitionSource extracts every literal payload
    // escape-aware and elides comments in the SAME pass — the former
    // two-regex pipeline opened phantom block comments from block-opener
    // sequences inside glob strings and paired quotes blindly across
    // lines, passing vacuously over live violations in this very file.
    // Violations are COLLECTED first so one failure surfaces the full
    // finding list (self-match-proofing: this suite sweeps ITSELF too).
    const violations: string[] = [];
    for (const [label, source] of [
      ["write-gate.ts", GATE_SOURCE],
      ["write-gate.test.ts", SUITE_SOURCE],
      ["guard-vocabulary.ts", VOCAB_SOURCE],
      ["session-execution-state.ts", STATE_SOURCE],
      ["string-match-helpers.ts", HELPER_SOURCE],
    ]) {
      const { code, payloads } = partitionSource(source);
      for (const payload of payloads) {
        if (payload.includes(rawGlyph)) violations.push(label);
      }
      // A glyph outside every literal (in plain code) would be equally
      // wrong — none may exist.
      if (code.includes(rawGlyph)) violations.push(`${label} (non-literal)`);
    }
    expect(violations).toEqual([]);
  });

  it("retired combined-module identifiers are absent from BOTH rewritten files (fragments assembled at runtime prevent self-match)", () => {
    const RETIRED_FAMILIES: Array<[string, string]> = [
      ["W", "riteGate"],
      ["W", "riteGateProviders"],
      ["W", "riteGateBookkeepingError"],
      ["ent", "erCapability"],
      ["ext", "itCapability"],
      ["ent", "erPhase"],
      ["ext", "itPhase"],
    ];
    for (const [head, tail] of RETIRED_FAMILIES) {
      const identifier = head + tail;
      const pattern = new RegExp(`\\b${identifier}\\b`, "g");
      expect(
        GATE_SOURCE.match(pattern),
        `module leaks ${identifier}`,
      ).toBeNull();
      expect(
        SUITE_SOURCE.match(pattern),
        `suite leaks ${identifier}`,
      ).toBeNull();
    }
  });

  it("tiers absent by design - the bookkeeping block, the two-object interleave tier, and the faulty-channel tier belong to the execution-state suite", () => {
    // Assembled at runtime so this check does not self-match its own text.
    const BOOKKEEPING_TITLE = "Write" + "Gate bookkeeping";
    const INTERLEAVE_TITLE = "leg-" + "2 hermetic concurrency";
    const FAULTY_TITLE = "faulty" + " channels";
    expect(SUITE_SOURCE).not.toContain(BOOKKEEPING_TITLE);
    expect(SUITE_SOURCE).not.toContain(INTERLEAVE_TITLE);
    expect(SUITE_SOURCE).not.toContain(FAULTY_TITLE);
  });
});
