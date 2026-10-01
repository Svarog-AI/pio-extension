// Hermetic unit suite for the stateless write-guard predicate
// (guards/write-gate.ts). Self-contained island: zero SDK imports — every row
// drives the REAL module directly with HAND-BUILT SNAPSHOTS as plain
// structural literals over LITERAL ABSOLUTE POSIX paths (path.resolve is
// identity on them, so literals round-trip byte-exactly). The module never
// touches disk: no minted directories, no provider closures, no async. The
// layer-bookkeeping tier, the two-object interleave tier, and the
// channel-fault rows live in the execution-state suite — that component owns
// the lifecycle and the channels. Mechanical guards pin the import
// partition, the escape discipline, and the retired-identifier absence across
// ALL FOUR sibling files.

import { readFileSync } from "node:fs";
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
): string =>
  `Writing is refused during phase '${phaseId}'. Allowed targets: ${survivors.join(", ")}. Scratch files under /tmp/ stay open.`;

const replicaCapabilityDenial = (
  name: string,
  writes: readonly string[],
  workspaceCwd: string | null,
): string => {
  const parts: string[] = [...writes];
  if (workspaceCwd !== null) parts.push(`project files under ${workspaceCwd}`);
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

describe("fixture shapes — the singular effective allowlist", () => {
  it("in-list: a declared, contract-covered target is allowed — write and edit alike", () => {
    const DECLARED = `${SLOT_ROOT}/research/alpha.md`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "gather", declared: [DECLARED] },
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
      phase: { id: "gather", declared: [KEPT] },
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
      phase: { id: "clamp", declared: [UNCOVERED, KEPT] },
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: UNCOVERED }));
    expect(refusal.reason).toContain("'clamp'");
    expect(refusal.reason).toContain(KEPT);
    expect(refusal.reason).not.toContain(UNCOVERED);
    expect(decideWrite(snap, "write", { path: KEPT })).toBeUndefined();
  });

  it("inherited: an EMPTY declaration confers no phase governance — the capability's sources apply unchanged", () => {
    const HIT = `${SLOT_ROOT}/research/ok.md`;
    const MISS = `${SLOT_ROOT}/docs/other.md`;
    const emptyDecl: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "narrate", declared: [] },
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
      phase: { id: "gather", declared: [KEPT] },
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
      phase: { id: "wiped", declared: [] },
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
      phase: { id: "p", declared: [KEPT] },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: KEPT })).toBeUndefined();
  });

  it("allowProjectWrites-scope-hit admission: a declared entry under the cwd without pattern coverage is allowed", () => {
    const APW: CapabilitySources = {
      name: "cap-apw",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    };
    const PROJECT_FILE = `${WORKSPACE_CWD}/notes.md`;
    const snap: ExecutionSnapshot = {
      sources: APW,
      phase: { id: "p", declared: [PROJECT_FILE] },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: PROJECT_FILE })).toBeUndefined();
  });

  it("FULLY-UNCOVERED: no declared entry contract-covered ⇒ NO phase governance ⇒ refused AS IF UNDECLARED (the CAPABILITY is named — a phase-named line would be WRONG)", () => {
    const APW: CapabilitySources = {
      name: "cap-apw",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    };
    const FOREIGN = `/elsewhere/file.md`;
    const snap: ExecutionSnapshot = {
      sources: APW,
      phase: { id: "p", declared: [FOREIGN] },
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: FOREIGN }));
    expect(refusal.reason).toContain("'cap-apw'");
    expect(refusal.reason).not.toContain("during phase");
    expect(refusal.reason).not.toContain(FOREIGN);
  });

  it("PARTIAL coverage: mixed declared — survivors visible in declaration order, uncovered ones ABSENT (lockstep)", () => {
    const KEPT_A = `${SLOT_ROOT}/research/a.md`;
    const KEPT_B = `${SLOT_ROOT}/research/b.md`;
    const DROPPED = `${SLOT_ROOT}/else/nope.txt`;
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "mixed", declared: [KEPT_A, DROPPED, KEPT_B] },
      paths: PATHS,
    };
    expect(decideWrite(snap, "write", { path: KEPT_A })).toBeUndefined();
    expect(decideWrite(snap, "write", { path: KEPT_B })).toBeUndefined();
    const refusal = asRefusal(
      decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/c.md` }),
    );
    // Exhaustive survivor listing, declaration order, deduplicated — no
    // third path:
    expect(refusal.reason).toBe(replicaPhaseDenial("mixed", [KEPT_A, KEPT_B]));
  });

  it("EMPTY-CONTRACT fall-through: the wiped phase behaves byte-identically to the undeclared shape — sentinel anchors provably unused", () => {
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
    ).toBe(replicaCapabilityDenial("empty-cap", [], null));
    // Swap in DIFFERENT placeholder anchors: identical bytes — `paths` is
    // provably never consulted for the wiped phase.
    const OTHER_PATHS: PathAnchors = {
      projectSlotRoot: "MKR-other-slot",
      workspaceCwd: "MKR-other-cwd",
    };
    const moved: ExecutionSnapshot = { ...wiped, paths: OTHER_PATHS };
    expect(
      asRefusal(decideWrite(moved, "write", { path: TARGET })).reason,
    ).toBe(replicaCapabilityDenial("empty-cap", [], null));
  });

  it("null sources + active phase: the effective set is empty and the NO-SPAN line governs — never a phase-named line", () => {
    const TARGET = "/outside/b.md";
    const snap: ExecutionSnapshot = {
      sources: null,
      phase: { id: "stray-phase", declared: [TARGET] },
      paths: PATHS,
    };
    const refusal = asRefusal(decideWrite(snap, "write", { path: TARGET }));
    expect(refusal.reason).toBe(replicaNoSpanDenial());
  });
});

// ---------------------------------------------------------------------------
// (d) Project-file admission — the allowProjectWrites disjunct (pio-
// extension parity dimension): refused WITHOUT the flag, admitted WITH it.
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
    expect(refusal.reason).not.toContain("project files under"); // no scope note
  });

  it("the INVERSE row: the same target is allowed WITH allowProjectWrites true", () => {
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
    expect(decideWrite(snap, "write", { path: target })).toBeUndefined();
  });

  it("the scope is STRICTLY under the workspace cwd (cwd itself is not admitted)", () => {
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

describe("matchesAnchoredGlob — the documented fsview dialect in permission direction", () => {
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

describe("goldens — lockstep byte-equality on every refusal shape", () => {
  it("phase-named denial with non-empty survivors", () => {
    const KEPT = `${SLOT_ROOT}/research/a.md`;
    // SOLE OWNER: renderPhaseDenial in guards/write-gate.ts.
    const GOLDEN_PHASE_NAMED = replicaPhaseDenial("guard-probe", [KEPT]);
    const snap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "guard-probe", declared: [KEPT] },
      paths: PATHS,
    };
    expect(
      asRefusal(
        decideWrite(snap, "write", { path: `${SLOT_ROOT}/research/b.md` }),
      ).reason,
    ).toBe(GOLDEN_PHASE_NAMED);
  });

  it("capability-named denial with patterns only (no project-scope note)", () => {
    // SOLE OWNER: renderCapabilityDenial (apw-off form) in guards/write-gate.ts.
    const GOLDEN_CAP_PATTERNS = replicaCapabilityDenial(
      "research",
      ["research/*.md"],
      null,
    );
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

  it("capability-named denial with patterns AND the project-scope note carrying the actual cwd", () => {
    // SOLE OWNER: renderCapabilityDenial (apw-on form) in guards/write-gate.ts.
    const GOLDEN_CAP_PROJECT_NOTE = replicaCapabilityDenial(
      "research",
      ["research/*.md"],
      WORKSPACE_CWD,
    );
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
    // A pattern-miss OUTSIDE the cwd scope reaches the denial with the note:
    expect(
      asRefusal(decideWrite(snap, "write", { path: `/outside/scope.md` }))
        .reason,
    ).toBe(GOLDEN_CAP_PROJECT_NOTE);
    expect(GOLDEN_CAP_PROJECT_NOTE).toContain(
      `project files under ${WORKSPACE_CWD}`,
    );
  });

  it("capability-named 'none' — the empty-contract span refusal", () => {
    // SOLE OWNER: renderCapabilityDenial (empty-sources form) in write-gate.ts.
    const GOLDEN_CAP_NONE = replicaCapabilityDenial("compose-demo", [], null);
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

  it("no-span 'none' — the depth-0 refusal (carries the escaped U+2014 em dash)", () => {
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
            phase: { id: "guard-probe", declared: [KEPT] },
            paths: PATHS,
          },
          "write",
          { path: `${SLOT_ROOT}/research/b.md` },
        ),
      ),
    );
    // Capability-named WITH the project-scope note (target outside the scope):
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

describe("coverage is exactly write/edit — short-circuit before any snapshot consultation", () => {
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

  it("non-writer tools and malformed writer inputs yield NO target — no verdict, no exception, markers uninterpolated", () => {
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

  it("the same no-target inputs under an ACTIVE-SPAN-shaped snapshot — still no verdict", () => {
    const SPAN_SHAPED: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "gather", declared: [`${SLOT_ROOT}/research/a.md`] },
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
  it("every public signature takes PLAIN VALUES — allowed AND refused end-to-end on structural literals only", () => {
    const KEPT = `${SLOT_ROOT}/research/a.md`;
    const allowedSnap: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: { id: "gather", declared: [KEPT] },
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

  it("write-gate's runtime namespace is EXACTLY {decideWrite, matchesAnchoredGlob} — the type erases", () => {
    expect(Object.keys(writeGateModule).sort()).toEqual([
      "decideWrite",
      "matchesAnchoredGlob",
    ]);
  });

  it("the vocabulary and the state skeleton export NOTHING at runtime — types-only, mechanically", () => {
    expect(Object.keys(vocabularyModule)).toEqual([]);
    expect(Object.keys(stateModule)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (i) MECHANICAL SOURCE GUARDS — self-source reads (house idiom:
// readFileSync(new URL(file, import.meta.url))) covering ALL FOUR files:
// import partition, statelessness, types-only surfaces, escape discipline,
// retired-identifier absence.
// ---------------------------------------------------------------------------

describe("mechanical source guards — all four sibling files", () => {
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

  /** Strip block and line comments FIRST so quote-paired "spans" cannot cross
   * comment text (quoted words in prose would create phantom spans). Raw
   * glyphs in prose comments are house precedent — not pinned bytes. */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  }

  // Assembled at runtime so this guard does not self-match its own text.
  const SDK_SPECIFIER = ["@earendil-works", "pi-coding-agent"].join("/");

  it("zero occurrences of the SDK specifier in ANY of the four files", () => {
    for (const source of [
      GATE_SOURCE,
      SUITE_SOURCE,
      VOCAB_SOURCE,
      STATE_SOURCE,
    ]) {
      expect(source.includes(SDK_SPECIFIER)).toBe(false);
    }
  });

  it("write-gate.ts: value imports are EXACTLY [node:path, ../../sandbox/fsview.ts] — zero node:fs, zero value sibling imports", () => {
    expect(GATE_SOURCE.includes("node:fs")).toBe(false);
    const valueSpecifiers = GATE_SOURCE.split("\n")
      .filter(
        (line) =>
          line.startsWith("import ") && !line.startsWith("import type "),
      )
      .flatMap((line) =>
        [...line.matchAll(/from "([^"]+)"/g)].map((match) => match[1]),
      );
    expect(valueSpecifiers).toEqual(["node:path", "../../sandbox/fsview.ts"]);
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

  it("write-gate.ts: NO class declarations — statelessness asserted mechanically", () => {
    expect(stripComments(GATE_SOURCE).match(/\bclass\b/g)).toBeNull();
  });

  it("write-gate.ts: the single coverage rule is defined ONCE and called EXACTLY TWICE (one definition + two call sites)", () => {
    const occurrences = stripComments(GATE_SOURCE).match(/\badmittedBy\b/g);
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

  it("session-execution-state.ts: ONE type-only import clause (three names, the vocabulary specifier), ONE interface export, no class/function", () => {
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
    expect(exportLines).toHaveLength(1);
    expect(
      exportLines[0].match(/^export interface ExecutionSnapshot \{$/),
    ).not.toBeNull();
    const codeOnly = stripComments(STATE_SOURCE);
    expect(codeOnly.match(/\bclass\b/g)).toBeNull();
    expect(codeOnly.match(/\bfunction\b/g)).toBeNull();
  });

  it("\\u2014 discipline: the pinned escaped literal is retained; NO raw U+2014 inside any string LITERAL of any of the four files", () => {
    expect(
      GATE_SOURCE.includes("Writing is refused \\u2014 no capability span"),
    ).toBe(true);
    const rawGlyph = String.fromCharCode(0x2014);
    for (const [label, source] of [
      ["write-gate.ts", GATE_SOURCE],
      ["write-gate.test.ts", SUITE_SOURCE],
      ["guard-vocabulary.ts", VOCAB_SOURCE],
      ["session-execution-state.ts", STATE_SOURCE],
    ]) {
      const codeOnly = stripComments(source);
      for (const match of codeOnly.matchAll(/["'`]([^"'`]*)["'`]/g)) {
        expect(
          match[1],
          `${label}: raw glyph in a string literal`,
        ).not.toContain(rawGlyph);
      }
    }
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

  it("tiers absent by design — the bookkeeping block, the two-object interleave tier, and the faulty-channel tier belong to the execution-state suite", () => {
    // Assembled at runtime so this check does not self-match its own text.
    const BOOKKEEPING_TITLE = "Write" + "Gate bookkeeping";
    const INTERLEAVE_TITLE = "leg-" + "2 hermetic concurrency";
    const FAULTY_TITLE = "faulty" + " channels";
    expect(SUITE_SOURCE).not.toContain(BOOKKEEPING_TITLE);
    expect(SUITE_SOURCE).not.toContain(INTERLEAVE_TITLE);
    expect(SUITE_SOURCE).not.toContain(FAULTY_TITLE);
  });
});
