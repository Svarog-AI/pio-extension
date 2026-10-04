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
// Suite-side replicas of the module's denial line shapes - SOLE OWNER of
// every byte shape is guards/write-gate.ts (the module-private phase
// renderer plus the module-private universal no-permission constant); these
// constructions exist only to assert lockstep byte-equality on
// decideWrite()'s `reason`. The capability-named and no-span tail renderers
// RETIRED with the strict-confirmation ruling - ONE parameter-free universal
// byte stands for every non-governing window (no /tmp/ clause anywhere).
// ---------------------------------------------------------------------------

const replicaPhaseDenial = (
  phaseId: string,
  survivors: readonly string[],
  workspaceCwd: string | null,
  scratchActive: boolean,
): string => {
  const parts: string[] = [...survivors];
  if (workspaceCwd !== null) parts.push(`project files under ${workspaceCwd}`);
  if (scratchActive) parts.push("scratch files under /tmp/");
  return `Writing is refused during phase '${phaseId}'. Allowed targets: ${parts.length === 0 ? "none" : parts.join(", ")}.`;
};

const replicaUniversalDenial = (): string =>
  // U+2014 arrives escaped in the module literal - compare unescaped.
  `Writing is refused \u2014 no write permission is declared by any active phase. Allowed targets: none.`;

/** Narrow a refusal (row-invariant guard; allowed writes expect undefined). */
function asRefusal(verdict: { block: true; reason: string } | undefined): {
  block: true;
  reason: string;
} {
  if (verdict === undefined) throw new Error("expected a refusal, got allowed");
  return verdict;
}

// ---------------------------------------------------------------------------
// (a) The FIVE FIXTURE SHAPES as first-class rows - spanning the governing
// (phase-named) and non-governing (universal-byte) refusal cases.
// ---------------------------------------------------------------------------

describe("fixture shapes - the singular effective allowlist", () => {
  it("in-list: a declared, contract-covered target is allowed - write and edit alike", () => {
    const DECLARED = `${SLOT_ROOT}/research/alpha.md`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "gather",
        declared: [DECLARED],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
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
      phase: {
        id: "gather",
        declared: [KEPT],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
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
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: UNCOVERED }));
    expect(refusal.reason).toContain("'clamp'");
    expect(refusal.reason).toContain(KEPT);
    expect(refusal.reason).not.toContain(UNCOVERED);
    expect(decideWrite(snap, "write", { path: KEPT })).toBeUndefined();
  });

  it("inherited: an EMPTY declaration confers NO phase governance - the universal no-permission byte governs the WHOLE span window, byte-identical to the no-phase reading BY CONSTRUCTION", () => {
    const HIT = `${SLOT_ROOT}/research/ok.md`;
    const MISS = `${SLOT_ROOT}/docs/other.md`;
    const emptyDecl: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "narrate",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    const noPhase: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: null,
      paths: PATHS,
    };
    // Strict confirmation: a pattern hit is REFUSED while no phase confirms
    // it - the span site admits NOTHING:
    const refHitEmpty = asRefusal(
      decideWrite(emptyDecl, "write", { path: HIT }),
    );
    const refHitNone = asRefusal(decideWrite(noPhase, "write", { path: HIT }));
    expect(refHitEmpty.reason).toBe(refHitNone.reason);
    expect(refHitEmpty.reason).toBe(replicaUniversalDenial());
    // Miss companion pin (strongest form - trivially the same fixed byte):
    const refMissEmpty = asRefusal(
      decideWrite(emptyDecl, "write", { path: MISS }),
    );
    const refMissNone = asRefusal(
      decideWrite(noPhase, "write", { path: MISS }),
    );
    expect(refMissEmpty.reason).toBe(refMissNone.reason);
    expect(refMissEmpty.reason).toBe(replicaUniversalDenial());
  });

  it("no-span: null sources with no phase yield the UNIVERSAL NO-PERMISSION BYTE (span presence makes NO difference - the same fixed string governs)", () => {
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${WORKSPACE_CWD}/anything.md` }),
    );
    expect(refusal.block).toBe(true);
    expect(refusal.reason).toBe(replicaUniversalDenial());
  });
});

// ---------------------------------------------------------------------------
// (b) The scratch class at decision time - /tmp/ (exact prefix) is admitted
// ONLY while the attached phase's stored tmpDirAllowed flag is active; ALL
// other windows REFUSE it (total default-deny, genuinely total). The exact
// startsWith("/tmp/") prefix invariant is UNCHANGED.
// ---------------------------------------------------------------------------

describe("/tmp/ scratch class at decision time", () => {
  it("depth-0 (null sources): REFUSED on the universal byte (genuinely total - no implicit allowance anywhere)", () => {
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/depth0.txt" }),
    );
    expect(refusal.reason).toBe(replicaUniversalDenial());
  });

  it("span-only (no phase): a span ADMITS NOTHING - the /tmp/ target refuses on the universal byte", () => {
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: null,
      paths: PATHS,
    };
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/spanonly.txt" }),
    );
    expect(refusal.reason).toBe(replicaUniversalDenial());
  });

  it("span + non-empty-effective phase WITHOUT the tmp flag: REFUSED with the PHASE named (survivor-only listing, no scratch element)", () => {
    const KEPT = `${SLOT_ROOT}/research/alpha.md`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "gather",
        declared: [KEPT],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/phased.txt" }),
    );
    expect(refusal.reason).toContain("'gather'");
    expect(refusal.reason).toBe(
      replicaPhaseDenial("gather", [KEPT], null, false),
    );
  });

  it("span + wiped phase (empty-contract sources; nothing declared, no flags): the phase branch never fires - the reading EQUALS the depth-0 universal shape", () => {
    const WIPED: CapabilitySources = {
      name: "empty-cap",
      writes: [],
      allowProjectWrites: false,
    };
    const snap: ExecutionSnapshot = {
      sources: WIPED,
      phase: {
        id: "wiped",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    const deepZero: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: "/tmp/wg-scratch/clamped.txt" }),
      ).reason,
    ).toBe(
      asRefusal(
        decideWrite(deepZero, "write", { path: "/tmp/wg-scratch/clamped.txt" }),
      ).reason,
    );
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: "/tmp/wg-scratch/clamped.txt" }),
      ).reason,
    ).toBe(replicaUniversalDenial());
  });

  it("prefix semantics are EXACTLY the admission invariant: '/tmp' itself and '/tmpfoo/*' are NOT covered (refused on the universal byte at depth 0)", () => {
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    // Both miss the exact prefix and take the non-governing universal byte.
    expect(asRefusal(decideWrite(snap, "write", { path: "/tmp" })).reason).toBe(
      replicaUniversalDenial(),
    );
    expect(
      asRefusal(decideWrite(snap, "write", { path: "/tmpfoo/scratch.txt" }))
        .reason,
    ).toBe(replicaUniversalDenial());
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
      phase: {
        id: "p",
        declared: [KEPT],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: KEPT })).toBeUndefined();
  });

  it("declared cwd path WITHOUT the flag: the declaration is not contract-covered, drops out of the effective set, the phase governs NOTHING, and the write is refused on the UNIVERSAL no-permission byte (the new refusal corner, inert flavor - nothing is named)", () => {
    const APW: CapabilitySources = {
      name: "cap-apw",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    };
    const PROJECT_FILE = `${WORKSPACE_CWD}/notes.md`;
    const snap: ExecutionSnapshot = {
      sources: APW,
      phase: {
        id: "p",
        declared: [PROJECT_FILE],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    // Post-ruling: the flagless declaration is dropped at decision time, so
    // the phase confers NO governance and the non-governing window returns
    // the universal verdict directly.
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: PROJECT_FILE }),
    );
    expect(refusal.reason).toBe(replicaUniversalDenial());
    expect(refusal.reason).not.toContain("during phase");
    expect(refusal.reason).not.toContain(
      `project files under ${WORKSPACE_CWD}`,
    );
  });

  it("FULLY-UNCOVERED: no declared entry contract-covered ⇒ NO phase governance ⇒ refused on the UNIVERSAL no-permission byte (nothing is named - a capability-named OR phase-named line would be WRONG)", () => {
    const APW: CapabilitySources = {
      name: "cap-apw",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    };
    const FOREIGN = `/elsewhere/file.md`;
    const snap: ExecutionSnapshot = {
      sources: APW,
      phase: {
        id: "p",
        declared: [FOREIGN],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: FOREIGN }));
    expect(refusal.reason).toBe(replicaUniversalDenial());
    expect(refusal.reason).not.toContain("'cap-apw'");
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
        tmpDirAllowed: false,
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
      replicaPhaseDenial("mixed", [KEPT_A, KEPT_B], null, false),
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
        tmpDirAllowed: false,
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
    expect(refusal.reason).toBe(
      replicaPhaseDenial("dedupe", [DUP], null, false),
    );
  });

  it("EMPTY-CONTRACT fall-through: the wiped phase behaves byte-identically to the undeclared shape (universal byte) - sentinel anchors provably unused", () => {
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
        tmpDirAllowed: false,
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
    ).toBe(replicaUniversalDenial());
    // Swap in DIFFERENT placeholder anchors: identical bytes — `paths` is
    // provably never consulted for the wiped phase.
    const OTHER_PATHS: PathAnchors = {
      projectSlotRoot: "MKR-other-slot",
      workspaceCwd: "MKR-other-cwd",
    };
    const moved: ExecutionSnapshot = { ...wiped, paths: OTHER_PATHS };
    expect(
      asRefusal(decideWrite(moved, "write", { path: TARGET })).reason,
    ).toBe(replicaUniversalDenial());
  });

  it("null sources + active phase: the effective construction is empty and the UNIVERSAL BYTE governs - never a phase-named line", () => {
    const TARGET = "/outside/b.md";
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: {
        id: "stray-phase",
        declared: [TARGET],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: TARGET }));
    expect(refusal.reason).toBe(replicaUniversalDenial());
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

  it("(a) backed flag-only: EXCLUSIVE class governance - the cwd-scope target admitted, the /tmp/ scratch REFUSED on the class-only full line (no tmp flag declared), and the slot-pattern target REFUSED with the phase named and the class-only full line", () => {
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: {
        id: "scope-only",
        declared: [],
        allowProjectWrites: true,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    // The cwd-scope class admits a strictly-under-cwd target:
    expect(
      decideWrite(snap, "write", { path: `${WORKSPACE_CWD}/notes.md` }),
    ).toBeUndefined();
    // Scratch WITHOUT the flag refuses on the same class-only line:
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: "/tmp/wg-scratch/scopeonly.txt" }),
      ).reason,
    ).toBe(replicaPhaseDenial("scope-only", [], WORKSPACE_CWD, false));
    // A slot-pattern target OUTSIDE the class is refused despite contract
    // coverage - slot-pattern targets are not class-admitted during a
    // flag-only phase:
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/beta.md` }),
    );
    expect(refusal.reason).toContain("'scope-only'");
    expect(refusal.reason).toBe(
      replicaPhaseDenial("scope-only", [], WORKSPACE_CWD, false),
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
        tmpDirAllowed: false,
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
      replicaPhaseDenial("unbacked", [KEPT], null, false),
    );
    expect(strayRefusal.reason).not.toContain("project files under");
    // The cwd dimension is lost too (same survivors-only line):
    const cwdRefusal = asRefusal(
      decideWrite(pathsFlagged, "write", { path: `${WORKSPACE_CWD}/m.md` }),
    );
    expect(cwdRefusal.reason).toBe(
      replicaPhaseDenial("unbacked", [KEPT], null, false),
    );
    // Shape 2: flag-only, no paths - NO phase governance, capability named:
    const flagOnly: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "flag-only",
        declared: [],
        allowProjectWrites: true,
        tmpDirAllowed: false,
      },
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
        tmpDirAllowed: false,
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
      replicaPhaseDenial("both", [KEPT], WORKSPACE_CWD, false),
    );
  });

  it("(d) paths-only phase inside a flag-TRUE span: the scope dimension is LOST - a cwd target outside the declared paths is REFUSED with the phase named and a survivors-only listing (no implicit allowance from the span's own flag)", () => {
    const KEPT = `${SLOT_ROOT}/research/kept.md`;
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: {
        id: "paths-only",
        declared: [KEPT],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: KEPT })).toBeUndefined();
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${WORKSPACE_CWD}/leak.md` }),
    );
    expect(refusal.reason).toContain("'paths-only'");
    expect(refusal.reason).toBe(
      replicaPhaseDenial("paths-only", [KEPT], null, false),
    );
  });

  it("(e) nothing declared (no paths, no flag): NO phase governance - the cwd target is REFUSED on the universal byte (silent-phase pin of the non-governing window, full-line golden), and the miss-target refusal bytes stay identical between the phase-present and phase-null readings", () => {
    const bare: ExecutionSnapshot = {
      sources: BACKED,
      phase: {
        id: "bare",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    const noPhase: ExecutionSnapshot = {
      sources: BACKED,
      phase: null,
      paths: PATHS,
    };
    // Post-ruling: the silent phase confers no governance and the tail
    // returns the universal verdict directly.
    expect(
      asRefusal(
        decideWrite(bare, "write", { path: `${WORKSPACE_CWD}/notes.md` }),
      ).reason,
    ).toBe(replicaUniversalDenial());
    const MISS = `${SLOT_ROOT}/else/miss.md`;
    // Companion pin survives (now trivially true): both readings refuse
    // identically on the fixed byte.
    expect(asRefusal(decideWrite(bare, "write", { path: MISS })).reason).toBe(
      asRefusal(decideWrite(noPhase, "write", { path: MISS })).reason,
    );
  });

  it("(f) null sources + flag-carrying phase: the class is INERT on the ONE code path - the UNIVERSAL BYTE governs (full-line golden carrying the escaped em dash), sentinel anchors vary with IDENTICAL bytes (paths provably unconsulted), and the flag-TRUE reading is byte-identical to the flag-FALSE counterpart (the flag never branches when sources are null)", () => {
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
        tmpDirAllowed: false,
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
        tmpDirAllowed: false,
      },
      paths: SENTINEL_A,
    };
    expect(
      asRefusal(decideWrite(flaggedTrue, "write", { path: TARGET })).reason,
    ).toBe(replicaUniversalDenial());
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
// The SCRATCH-CLASS DECISION-TIME MATRIX - /tmp/ (exact prefix) as a
// PER-PHASE DECLARATION: the scratch class is active ONLY while the attached
// phase's stored tmpDirAllowed flag is set (single-flag doctrine - there is
// NO contract-side counterpart to clamp against), mirroring the scope-class
// mechanics exactly. Without the flag /tmp/ falls through to the non-
// admitting tail. Fixtures reuse the standing constants.
// ---------------------------------------------------------------------------

describe("scratch-class decision-time matrix - the per-phase scratch declaration", () => {
  /** The RESEARCH twin with the contract flag raised (backed rows). */
  const BACKED: CapabilitySources = {
    name: "research",
    writes: ["research/*.md"],
    allowProjectWrites: true,
  };

  it("(a) tmp-only: EXCLUSIVE scratch governance - the /tmp/ exact prefix ADMITTED, the slot-pattern target REFUSED with the phase named and the scratch-element-only full line (compound three-outcome row)", () => {
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: {
        id: "scratch-only",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    };
    // The scratch class admits the exact prefix:
    expect(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/tmponly.txt" }),
    ).toBeUndefined();
    // A slot-pattern target OUTSIDE the class is refused despite contract
    // coverage - the scratch element is the ONLY listing element:
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/beta.md` }),
    );
    expect(refusal.reason).toContain("'scratch-only'");
    expect(refusal.reason).toBe(
      replicaPhaseDenial("scratch-only", [], null, true),
    );
    // No scope element either (the scope flag is off):
    expect(refusal.reason).not.toContain("project files under");
  });

  it("(b) tmp x scope combination: BOTH elements in the PINNED order (scope first, scratch LAST), /tmp/ AND the cwd ADMITTED, the stray refused with the both-elements full line", () => {
    const KEPT = `${SLOT_ROOT}/research/kept.md`;
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: {
        id: "both-classes",
        declared: [KEPT],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: KEPT })).toBeUndefined();
    expect(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/both.txt" }),
    ).toBeUndefined();
    expect(
      decideWrite(snap, "write", { path: `${WORKSPACE_CWD}/notes.md` }),
    ).toBeUndefined();
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/stray.md` }),
    );
    expect(refusal.reason).toBe(
      replicaPhaseDenial("both-classes", [KEPT], WORKSPACE_CWD, true),
    );
  });

  it("(c) inert-with-tmp corner: an uncovered declared entry plus an unbacked project flag plus the tmp flag => SCRATCH-exclusive governance (the /tmp/ target ADMITTED, the foreign entry INVISIBLE, the slot-pattern target refused with the scratch element ALONE)", () => {
    // The UNBACKED flavor: the phase declares the project flag but the
    // running sources' contract flag is FALSE - the scope class stays
    // inactive at the decision-time clamp.
    const FOREIGN = `/elsewhere/inert.md`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "inert-tmp",
        declared: [FOREIGN],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    };
    expect(
      decideWrite(snap, "write", { path: "/tmp/wg-scratch/inert.txt" }),
    ).toBeUndefined();
    const slotRefusal = asRefusal(
      decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/beta.md` }),
    );
    expect(slotRefusal.reason).toBe(
      replicaPhaseDenial("inert-tmp", [], null, true),
    );
    // The uncovered entry stays invisible - identical bytes:
    const foreignRefusal = asRefusal(
      decideWrite(snap, "write", { path: FOREIGN }),
    );
    expect(foreignRefusal.reason).toBe(slotRefusal.reason);
    expect(foreignRefusal.reason).not.toContain(FOREIGN);
  });

  it("(d) tmp-inactive /tmp/ refusal: PHASE-NAMED when the phase otherwise governs (survivor-only listing), otherwise the UNIVERSAL byte - span-present and span-absent readings BYTE-IDENTICAL (depth-0 included)", () => {
    const KEPT = `${SLOT_ROOT}/research/kept.md`;
    const TARGET = "/tmp/wg-scratch/inactive.txt";
    // A phase governing via survivors WITHOUT the tmp flag: /tmp/ refuses
    // phase-named with the survivor-only listing.
    const survivorSnap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "survivor",
        declared: [KEPT],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(
      asRefusal(decideWrite(survivorSnap, "write", { path: TARGET })).reason,
    ).toBe(replicaPhaseDenial("survivor", [KEPT], null, false));
    // Span present but non-governing (no phase): the universal byte...
    const spanSnap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: null,
      paths: PATHS,
    };
    const spanRefusal = asRefusal(
      decideWrite(spanSnap, "write", { path: TARGET }),
    );
    // ...and depth 0 renders the SAME fixed byte (byte-identity across span
    // presence - the strongest form).
    const depthZero: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: PATHS,
    };
    const zeroRefusal = asRefusal(
      decideWrite(depthZero, "write", { path: TARGET }),
    );
    expect(spanRefusal.reason).toBe(zeroRefusal.reason);
    expect(spanRefusal.reason).toBe(replicaUniversalDenial());
  });
});

// ---------------------------------------------------------------------------
// (d) Project-file (workspace-cwd) admission - the scope dimension lives
// ONLY in the phase branch: a flag-TRUE contract alone refuses the project
// file (the span site is NON-ADMITTING - no pattern listing anywhere).
// ---------------------------------------------------------------------------

describe("project-file admission under allowProjectWrites", () => {
  const TARGET_RELPATH = "src/helper.ts"; // under the workspace cwd, no pattern coverage

  it("a contract WITHOUT allowProjectWrites refuses the project file on the UNIVERSAL BYTE (the span site is non-admitting - nothing is named)", () => {
    const target = `${WORKSPACE_CWD}/${TARGET_RELPATH}`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: null,
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: target }));
    expect(refusal.reason).toBe(replicaUniversalDenial());
    // The scope element is absent from EVERY universal byte:
    expect(refusal.reason).not.toContain("project files under");
  });

  it("the INVERSE row: the same target is REFUSED even WITH allowProjectWrites true - the flag-TRUE contract ALONE admits no project file (the universal byte - the flag adds no admission and no element)", () => {
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
    expect(refusal.reason).toBe(replicaUniversalDenial());
    expect(refusal.reason).not.toContain(
      `project files under ${WORKSPACE_CWD}`,
    );
  });

  it("the scope is STRICTLY under the workspace cwd (cwd itself is not admitted)", () => {
    // Purpose note: the strictly-under prefix form is enforced ONLY at the
    // phase-branch class site; here NO phase governs, so the cwd boundary
    // shows up as the plain tail refusal.
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
// (f) GOLDENS - lockstep byte-equality on EVERY refusal shape. Each replica
// constant asserts LOCKSTEP byte-equality between decideWrite()'s `reason`
// and the suite-side construction above; the module's renderers are the
// SOLE OWNER of each template.
// ---------------------------------------------------------------------------

describe("goldens - lockstep byte-equality on every refusal shape", () => {
  it("phase-named denial with non-empty survivors", () => {
    const KEPT = `${SLOT_ROOT}/research/a.md`;
    // SOLE OWNER: renderPhaseDenial in guards/write-gate.ts.
    const GOLDEN_PHASE_NAMED = replicaPhaseDenial(
      "guard-probe",
      [KEPT],
      null,
      false,
    );
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "guard-probe",
        declared: [KEPT],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
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
      false,
    );
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: {
        id: "scope-only",
        declared: [],
        allowProjectWrites: true,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/b.md` }),
      ).reason,
    ).toBe(GOLDEN_CLASS_ONLY);
    expect(GOLDEN_CLASS_ONLY).toContain(`project files under ${WORKSPACE_CWD}`);
  });

  it("phase-named denial with the SCRATCH CLASS ACTIVE ALONE (tmp-flag-only shape): the scratch element stands in the listing alone - new scratch-element full-line golden", () => {
    // SOLE OWNER: renderPhaseDenial (scratch-active form) in write-gate.ts.
    const GOLDEN_SCRATCH_ONLY = replicaPhaseDenial(
      "scratch-only",
      [],
      null,
      true,
    );
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "scratch-only",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/b.md` }),
      ).reason,
    ).toBe(GOLDEN_SCRATCH_ONLY);
    expect(GOLDEN_SCRATCH_ONLY).toContain("scratch files under /tmp/");
  });

  it("phase-named denial with BOTH the scope and scratch classes active: the scratch element appended AFTER the scope element (pinned order) - new both-elements full-line golden", () => {
    // SOLE OWNER: renderPhaseDenial (both-elements form) in write-gate.ts.
    const BACKED: CapabilitySources = {
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    };
    const GOLDEN_BOTH_CLASSES = replicaPhaseDenial(
      "both-classes",
      [],
      WORKSPACE_CWD,
      true,
    );
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: {
        id: "both-classes",
        declared: [],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/b.md` }),
      ).reason,
    ).toBe(GOLDEN_BOTH_CLASSES);
    // Pinned order: the scope element precedes the scratch element (which
    // stands last):
    expect(
      GOLDEN_BOTH_CLASSES.endsWith(
        `project files under ${WORKSPACE_CWD}, scratch files under /tmp/.`,
      ),
    ).toBe(true);
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
      false,
    );
    const snap: ExecutionSnapshot = {
      sources: BACKED,
      phase: {
        id: "both",
        declared: [KEPT],
        allowProjectWrites: true,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/c.md` }),
      ).reason,
    ).toBe(GOLDEN_SURVIVORS_AND_CLASS);
    // The scope element stands LAST while the scratch class is inactive
    // (structural position pin):
    expect(
      GOLDEN_SURVIVORS_AND_CLASS.endsWith(
        `project files under ${WORKSPACE_CWD}.`,
      ),
    ).toBe(true);
  });

  it("the UNIVERSAL NO-PERMISSION BYTE is the SOLE tail shape: span-present/span-absent, flag-on/off, and named-vs-unnamed fixtures ALL refuse with IDENTICAL bytes (strongest-form identity companions)", () => {
    // SOLE OWNER: the module-private universal constant in write-gate.ts.
    const GOLDEN_UNIVERSAL = replicaUniversalDenial();
    const APW_RESEARCH: CapabilitySources = {
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    };
    const COMPOSE_DEMO: CapabilitySources = {
      name: "compose-demo",
      writes: [],
      allowProjectWrites: false,
    };
    // Four former shapes CONVERGE on the single fixed byte:
    //   1. span-present, named, patterns fixture (the old patterns-only line)
    //   2. span-present over FLAG-TRUE sources (the flag adds nothing)
    //   3. empty-contract span (the old capability-named 'none' line)
    //   4. span-absent / depth 0 (the old no-span line)
    const readings = [
      decideWrite({ sources: RESEARCH, phase: null, paths: PATHS }, "write", {
        path: `${SLOT_ROOT}/docs/other.md`,
      }),
      decideWrite(
        { sources: APW_RESEARCH, phase: null, paths: PATHS },
        "write",
        { path: `/outside/scope.md` },
      ),
      decideWrite(
        { sources: COMPOSE_DEMO, phase: null, paths: PATHS },
        "write",
        { path: `${SLOT_ROOT}/anything/x.md` },
      ),
      decideWrite({ sources: null, phase: null, paths: PATHS }, "write", {
        path: `${SLOT_ROOT}/anything/x.md`,
      }),
    ];
    for (const reading of readings) {
      expect(asRefusal(reading).reason).toBe(GOLDEN_UNIVERSAL);
    }
    expect(GOLDEN_UNIVERSAL).toContain("\u2014"); // the structural clause is present
    expect(GOLDEN_UNIVERSAL).toContain("Allowed targets: none.");
  });

  it("TWO-SHAPE LINE VOCABULARY: every refusal resolves to EXACTLY one of the two system shapes (the phase line with its elements; the universal no-permission byte) and the retired /tmp/ clause is ABSENT from every line", () => {
    const APW_RESEARCH: CapabilitySources = {
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    };
    const EMPTY: CapabilitySources = {
      name: "empty-cap",
      writes: [],
      allowProjectWrites: false,
    };
    const KEPT = `${SLOT_ROOT}/research/a.md`;
    const CLAUSE_TEXT = "Scratch files under /tmp/ stay open.";
    const PHASE_LINE_PREFIX = "Writing is refused during phase '";
    const shapes: Array<{ block: true; reason: string }> = [
      // The PHASE line (survivor listing, no classes active):
      asRefusal(
        decideWrite(
          {
            sources: APW_RESEARCH,
            phase: {
              id: "guard-probe",
              declared: [KEPT],
              allowProjectWrites: false,
              tmpDirAllowed: false,
            },
            paths: PATHS,
          },
          "write",
          { path: `${SLOT_ROOT}/research/b.md` },
        ),
      ),
      // The UNIVERSAL byte over FLAG-TRUE sources (no phase):
      asRefusal(
        decideWrite(
          { sources: APW_RESEARCH, phase: null, paths: PATHS },
          "write",
          { path: "/outside/x.md" },
        ),
      ),
      // The UNIVERSAL byte at depth 0:
      asRefusal(
        decideWrite({ sources: null, phase: null, paths: PATHS }, "write", {
          path: "/outside/y.md",
        }),
      ),
      // The UNIVERSAL byte over an empty-contract span:
      asRefusal(
        decideWrite({ sources: EMPTY, phase: null, paths: PATHS }, "write", {
          path: `/outside/z.md`,
        }),
      ),
    ];
    for (const shape of shapes) {
      expect(shape.block).toBe(true);
      expect(
        shape.reason.startsWith(PHASE_LINE_PREFIX) ||
          shape.reason === replicaUniversalDenial(),
      ).toBe(true);
      expect(shape.reason).not.toContain(CLAUSE_TEXT);
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
      tmpDirAllowed: false,
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
        tmpDirAllowed: false,
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
      phase: {
        id: "gather",
        declared: [KEPT],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
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

  it("write-gate.ts: the single coverage rule is defined ONCE and called EXACTLY ONCE (one definition + one call site - the span-site consult retires with the strict-confirmation ruling)", () => {
    const occurrences =
      partitionSource(GATE_SOURCE).code.match(/\badmittedBy\b/g);
    expect(occurrences?.length ?? 0).toBe(2);
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

  it("\\u2014 discipline: the universal byte's leading fragment is retained escaped; NO raw U+2014 inside ANY string LITERAL of any swept file", () => {
    expect(
      GATE_SOURCE.includes("Writing is refused \\u2014 no write permission"),
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

  it("retired identifiers are absent from BOTH rewritten files (fragments assembled at runtime prevent self-match) - INCLUDING the two retired tail renderers and the retired clause constant", () => {
    const RETIRED_FAMILIES: Array<[string, string]> = [
      ["W", "riteGate"],
      ["W", "riteGateProviders"],
      ["W", "riteGateBookkeepingError"],
      ["ent", "erCapability"],
      ["ext", "itCapability"],
      ["ent", "erPhase"],
      ["ext", "itPhase"],
      ["rend", "erCapabilityDenial"],
      ["rend", "erNoSpanDenial"],
      ["TMP_PARI", "TY_CLAUSE"],
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

  it("clause death: the retired /tmp/ parity clause text is ABSENT from the module source itself (every refusal line is either the phase line or the universal byte - nothing else exists)", () => {
    const CLAUSE_TEXT = "Scratch files under /tmp/ stay open.";
    expect(GATE_SOURCE).not.toContain(CLAUSE_TEXT);
  });
});
