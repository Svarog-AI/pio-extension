// Hermetic unit suite for the per-session write gate (guards/write-gate.ts).
// Self-contained island: zero SDK imports to mock — every row drives the
// REAL module directly. One mkdtemp layout per row; providers are plain
// closures over it (faulty variants throw a sentinel standing in for the
// producer's typed no-silent-fallback error). Mechanical guards pin the
// import surface and the \u2014 escape discipline.

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CapabilitySources, WriteGateProviders } from "./write-gate.ts";
import { matchesAnchoredGlob, WriteGate } from "./write-gate.ts";

// ---------------------------------------------------------------------------
// Shared hermetic fixtures — one mkdtemp layout per row.
// ---------------------------------------------------------------------------

/** Sentinel error standing in for the producer's typed no-silent-fallback
 * error (e.g. base.ts's CapabilityEnvError behind the root provider). */
class SentinelFault extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentinelFault";
  }
}

/** One realistic tmpdir layout: project-slot root + workspace-cwd pair,
 * wired through plain lazy provider closures. os.tmpdir() IS under /tmp on
 * this host, so literal tmpdir paths would fall in the always-allowed parity
 * class and make denial rows unreachable — the minted dirs are the skeleton,
 * the PROVIDER VALUES are the same layout mapped onto a /tmp-free synthetic
 * root (row-unique via the tmpdir basename; the gate never consults the fs). */
function layout(): {
  base: string;
  slotRoot: string;
  cwd: string;
  providers: WriteGateProviders;
} {
  const base = mkdtempSync(join(tmpdir(), "write-gate-"));
  const uid = base.split("/").pop();
  mkdirSync(join(base, "state", "projects", "proj-x"), { recursive: true });
  mkdirSync(join(base, "workspace"), { recursive: true });
  const slotRoot = `/pio-test/${uid}/state/projects/proj-x`;
  const cwd = `/pio-test/${uid}/workspace`;
  trackCleanup(base);
  const providers: WriteGateProviders = {
    projectSlotRoot: () => slotRoot,
    workspaceCwd: () => cwd,
  };
  return { base, slotRoot, cwd, providers };
}

const cleanups: Array<() => void> = [];
function trackCleanup(base: string): void {
  cleanups.push(() => rmSync(base, { recursive: true, force: true }));
}
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** Capture a thrown error (row-invariant guard: the op MUST throw). */
function capture(fn: () => void): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected the operation to throw");
}

// ---------------------------------------------------------------------------
// (bookkeeping) the single-pair discipline — LIFO layers, save/restore,
// mismatched-exit loudness, sanctioned drain.
// ---------------------------------------------------------------------------

describe("WriteGate bookkeeping — single scalar pair per layer", () => {
  const PARENT: CapabilitySources = {
    name: "parent-cap",
    writes: ["p/*.md"],
    allowProjectWrites: false,
  };
  const CHILD: CapabilitySources = {
    name: "child-cap",
    writes: ["c/*.md"],
    allowProjectWrites: false,
  };

  it("mismatched exits throw the typed module-local error (loud, never silent)", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);

    // Either exit on an empty stack — underflow.
    const underflowCap = capture(() => gate.exitCapability());
    expect(underflowCap.name).toBe("WriteGateBookkeepingError");
    expect(underflowCap.message).toBe(
      "write gate: exitCapability() with no active capability layer",
    );
    const underflowPhase = capture(() => gate.exitPhase());
    expect(underflowPhase.name).toBe("WriteGateBookkeepingError");
    expect(underflowPhase.message).toBe(
      "write gate: exitPhase() with no active phase entry",
    );

    // enterPhase without any active layer.
    const orphanPhase = capture(() => gate.enterPhase("orphan", []));
    expect(orphanPhase.name).toBe("WriteGateBookkeepingError");
    expect(orphanPhase.message).toBe(
      "write gate: enterPhase() with no active capability layer",
    );
  });

  it("exitCapability with an outstanding phase entry refuses and leaves the layer intact", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    gate.enterCapability(PARENT);
    gate.enterPhase("inner", [`${fx.slotRoot}/p/a.md`]);

    const premature = capture(() => gate.exitCapability());
    expect(premature.name).toBe("WriteGateBookkeepingError");
    expect(premature.message).toBe(
      // U+2014 arrives escaped in the module literal — compare unescaped.
      "write gate: exitCapability() with an outstanding phase entry \u2014 exitPhase() first",
    );

    // State intact: the mirrored unwind still succeeds, then depth-0 again.
    gate.exitPhase();
    gate.exitCapability();
    expect(() => gate.exitCapability()).toThrowError(
      /no active capability layer/,
    );
  });

  it("nested capability layers suspend and restore the outer pair intact", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    const pTarget = `${fx.slotRoot}/p/a.md`;
    const cTarget = `${fx.slotRoot}/c/b.md`;

    gate.enterCapability(PARENT);
    expect(gate.decide("write", { path: pTarget })).toBeUndefined(); // parent governs

    gate.enterCapability(CHILD);
    // The innermost layer is the ENTIRE permission world now:
    expect(gate.decide("write", { path: cTarget })).toBeUndefined(); // child allows
    const suspended = gate.decide("write", { path: pTarget });
    // …the suspended parent's pair is invisible (named source is the child).
    expect(suspended?.reason).toContain("'child-cap'");

    gate.exitCapability();
    expect(gate.decide("write", { path: pTarget })).toBeUndefined(); // restored intact
    const backToChildScope = gate.decide("write", { path: cTarget });
    expect(backToChildScope?.reason).toContain("'parent-cap'");
  });

  it("enterPhase replaces the current phase entry, saving it for symmetric restore", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    gate.enterCapability(PARENT);
    const first = `${fx.slotRoot}/p/one.md`;
    const second = `${fx.slotRoot}/p/two.md`;

    gate.enterPhase("first-phase", [first]);
    expect(gate.decide("write", { path: first })).toBeUndefined();
    expect(gate.decide("write", { path: second })?.reason).toContain(
      "'first-phase'",
    );

    // Re-entrant entry attaches over (and saves) the existing entry.
    gate.enterPhase("second-phase", [second]);
    expect(gate.decide("write", { path: second })).toBeUndefined();
    expect(gate.decide("write", { path: first })?.reason).toContain(
      "'second-phase'",
    );

    // Symmetric restore: the saved entry governs again, then none at all.
    gate.exitPhase();
    expect(gate.decide("write", { path: first })).toBeUndefined();
    expect(gate.decide("write", { path: second })?.reason).toContain(
      "'first-phase'",
    );
    gate.exitPhase();
    const spanLevel = gate.decide("write", {
      path: `${fx.slotRoot}/x/other.md`,
    });
    expect(spanLevel?.reason).toContain("'parent-cap'");
  });

  it("reset() drains to depth-0 regardless of outstanding entries, idempotently", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    gate.enterCapability(PARENT);
    gate.enterPhase("stale", [`${fx.slotRoot}/p/a.md`]);

    gate.reset();
    gate.reset(); // idempotent
    // Depth-0 again: the no-span refusal governs (empty-set code path).
    const refusal = gate.decide("write", { path: `${fx.slotRoot}/p/a.md` });
    expect(refusal?.reason).toContain("no capability span is active");
  });
});

// ---------------------------------------------------------------------------
// Suite-side replicas of the module's denial templates — SOLE OWNER of each
// byte shape is guards/write-gate.ts (renderPhaseDenial /
// renderCapabilityDenial / renderNoSpanDenial); these constructions exist
// only to assert lockstep byte-equality on decide()'s `reason`.
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
  const RESEARCH: CapabilitySources = {
    name: "research",
    writes: ["research/*.md"],
    allowProjectWrites: false,
  };

  it("in-list: a write inside the non-empty confirmed set is allowed", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    const declared = `${fx.slotRoot}/research/alpha.md`;
    gate.enterCapability(RESEARCH);
    gate.enterPhase("gather", [declared]);
    expect(gate.decide("write", { path: declared })).toBeUndefined();
    expect(gate.decide("edit", { path: declared })).toBeUndefined(); // same coverage
  });

  it("out-of-list: a write outside the confirmed set refuses with the PHASE named, survivors listed", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    const kept = `${fx.slotRoot}/research/alpha.md`;
    const stray = `${fx.slotRoot}/research/beta.md`;
    gate.enterCapability(RESEARCH);
    gate.enterPhase("gather", [kept]);
    expect(asRefusal(gate.decide("write", { path: stray })).reason).toContain(
      "'gather'",
    );
    expect(asRefusal(gate.decide("write", { path: stray })).reason).toContain(
      kept,
    );
  });

  it("clamped-away: an uncovered declaration is dropped at entry — absent from the listing, refused under phase governance", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    const kept = `${fx.slotRoot}/research/kept.md`;
    const dropped = `${fx.slotRoot}/outside/dropped.txt`; // pattern-miss + no apw scope
    gate.enterCapability(RESEARCH);
    gate.enterPhase("clamp", [dropped, kept]);

    // The dropped path is REFUSED — the phase names itself…
    const refusal = asRefusal(gate.decide("write", { path: dropped }));
    expect(refusal.reason).toContain("'clamp'");
    // …with only the SURVIVOR listed (the clamp is invisible) …
    expect(refusal.reason).toContain(kept);
    expect(refusal.reason).not.toContain(dropped);
    // …while the survivor stays granted.
    expect(gate.decide("write", { path: kept })).toBeUndefined();
  });

  it("inherited: a no-declaration phase takes the capability's sources unchanged", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    gate.enterCapability(RESEARCH); // no enterPhase at all
    // Pattern hit allowed …
    expect(
      gate.decide("write", { path: `${fx.slotRoot}/research/ok.md` }),
    ).toBeUndefined();
    // …pattern miss refuses with the CAPABILITY named.
    const refusal = asRefusal(
      gate.decide("write", { path: `${fx.slotRoot}/docs/other.md` }),
    );
    expect(refusal.reason).toContain("'research'");
    expect(refusal.reason).toContain("research/*.md");
  });

  it("no-span: depth-0 yields the empty-set refusal naming the no-span state", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    const refusal = asRefusal(
      gate.decide("write", { path: `${fx.cwd}/anything.md` }),
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
  const RESEARCH: CapabilitySources = {
    name: "research",
    writes: ["research/*.md"],
    allowProjectWrites: false,
  };

  it("depth-0: allowed before any span exists", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    expect(
      gate.decide("write", { path: "/tmp/wg-scratch/depth0.txt" }),
    ).toBeUndefined();
  });

  it("span-only: allowed while a capability layer is innermost", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    gate.enterCapability(RESEARCH);
    expect(
      gate.decide("write", { path: "/tmp/wg-scratch/spanonly.txt" }),
    ).toBeUndefined();
  });

  it("span + non-empty phase: allowed despite an exhaustive confirmed set", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    gate.enterCapability(RESEARCH);
    gate.enterPhase("gather", [`${fx.slotRoot}/research/alpha.md`]);
    expect(
      gate.decide("write", { path: "/tmp/wg-scratch/phased.txt" }),
    ).toBeUndefined();
  });

  it("span + fully-clamped (empty) declaration: allowed even though nothing was declared", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    const EMPTY_CONTRACT: CapabilitySources = {
      name: "empty-cap",
      writes: [],
      allowProjectWrites: false,
    };
    gate.enterCapability(EMPTY_CONTRACT);
    gate.enterPhase("wiped", []);
    expect(
      gate.decide("write", { path: "/tmp/wg-scratch/clamped.txt" }),
    ).toBeUndefined();
  });

  it("prefix semantics are EXACTLY legacy: '/tmp' itself and '/tmpfoo/*' are NOT covered", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    // Both fall through to the depth-0 empty-set refusal.
    expect(asRefusal(gate.decide("write", { path: "/tmp" })).reason).toBe(
      replicaNoSpanDenial(),
    );
    expect(
      asRefusal(gate.decide("write", { path: "/tmpfoo/scratch.txt" })).reason,
    ).toBe(replicaNoSpanDenial());
  });
});

// ---------------------------------------------------------------------------
// (c) The clamp-at-entry matrix — confirmation against the top layer's
// sources; silent drop; validate-then-commit; partial vs total wipe.
// ---------------------------------------------------------------------------

describe("clamp-at-entry matrix", () => {
  it("pattern hit survives confirmation", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    const kept = `${fx.slotRoot}/research/kept.md`;
    gate.enterCapability({
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: false,
    });
    gate.enterPhase("p", [kept]);
    expect(gate.decide("write", { path: kept })).toBeUndefined(); // survived ⇒ governs
  });

  it("allowProjectWrites-scope hit survives without pattern coverage", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    const projectFile = `${fx.cwd}/notes.md`; // under cwd, no pattern covers it
    gate.enterCapability({
      name: "cap-apw",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    });
    gate.enterPhase("p", [projectFile]);
    expect(gate.decide("write", { path: projectFile })).toBeUndefined();
  });

  it("neither pattern nor scope → the entry is dropped at entry", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    const foreign = `/elsewhere/file.md`;
    gate.enterCapability({
      name: "cap-apw",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    });
    gate.enterPhase("p", [foreign]); // wiped: outside slot patterns AND outside cwd
    // Refused AS IF UNDECLARED — the capability's sources govern (non-empty here):
    const refusal = asRefusal(gate.decide("write", { path: foreign }));
    expect(refusal.reason).toContain("'cap-apw'");
    expect(refusal.reason).not.toContain(foreign);
  });

  it("partial clamp: some survive, some drop — ONLY survivors govern", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    const keptA = `${fx.slotRoot}/research/a.md`;
    const keptB = `${fx.slotRoot}/research/b.md`;
    const dropped = `${fx.slotRoot}/else/nope.txt`;
    gate.enterCapability({
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: false,
    });
    gate.enterPhase("mixed", [keptA, dropped, keptB]);
    expect(gate.decide("write", { path: keptA })).toBeUndefined();
    expect(gate.decide("write", { path: keptB })).toBeUndefined();
    const refusal = asRefusal(
      gate.decide("write", { path: `${fx.slotRoot}/research/c.md` }),
    );
    // Exhaustive survivor listing, declaration order, deduplicated — no third path:
    expect(refusal.reason).toBe(replicaPhaseDenial("mixed", [keptA, keptB]));
  });

  it("empty-contract wipe: every entry dropped — the wiped phase behaves byte-identically to the undeclared shape", () => {
    const fx = layout();
    const EMPTY: CapabilitySources = {
      name: "empty-cap",
      writes: [],
      allowProjectWrites: false,
    };
    const target = `${fx.slotRoot}/whatever/x.md`;

    // Wiped shape: a phase entered with declarations the empty contract wipes.
    const wipedGate = new WriteGate(fx.providers);
    wipedGate.enterCapability(EMPTY);
    wipedGate.enterPhase("wiped", [target, `${fx.cwd}/proj.md`]);

    // Undeclared shape: the identical span, no phase entry at all.
    const plainGate = new WriteGate(fx.providers);
    plainGate.enterCapability(EMPTY);

    expect(asRefusal(wipedGate.decide("write", { path: target })).reason).toBe(
      asRefusal(plainGate.decide("write", { path: target })).reason,
    );
    expect(asRefusal(wipedGate.decide("write", { path: target })).reason).toBe(
      replicaCapabilityDenial("empty-cap", [], null),
    );
  });

  it("enterPhase(id, []) is a valid no-op confirmation — verdict-identical to no entry", () => {
    const fx = layout();
    const RESEARCH: CapabilitySources = {
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: false,
    };
    const target = `${fx.slotRoot}/research/a.md`;

    const withEmptyEntry = new WriteGate(fx.providers);
    withEmptyEntry.enterCapability(RESEARCH);
    withEmptyEntry.enterPhase("empty-decl", []);

    const noEntry = new WriteGate(fx.providers);
    noEntry.enterCapability(RESEARCH);

    // Identical allowance (pattern hit) AND identical denial bytes elsewhere:
    expect(withEmptyEntry.decide("write", { path: target })).toBeUndefined();
    expect(noEntry.decide("write", { path: target })).toBeUndefined();
    const straggler = `${fx.slotRoot}/stray.md`;
    expect(
      asRefusal(withEmptyEntry.decide("write", { path: straggler })).reason,
    ).toBe(asRefusal(noEntry.decide("write", { path: straggler })).reason);
    // And the paired exit stays symmetric (no bookkeeping refusal).
    expect(() => withEmptyEntry.exitPhase()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// (d) Project-file admission — the allowProjectWrites disjunct (pio-
// extension parity dimension): refused WITHOUT the flag, admitted WITH it.
// ---------------------------------------------------------------------------

describe("project-file admission under allowProjectWrites", () => {
  const TARGET_RELPATH = "src/helper.ts"; // under the workspace cwd, no pattern coverage

  it("a contract WITHOUT allowProjectWrites refuses the project file, capability named", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    gate.enterCapability({
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: false,
    });
    const target = join(fx.cwd, TARGET_RELPATH);
    const refusal = asRefusal(gate.decide("write", { path: target }));
    expect(refusal.reason).toContain("'research'");
    expect(refusal.reason).not.toContain("project files under"); // no scope note
  });

  it("the INVERSE row: the same target is allowed with allowProjectWrites true", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    gate.enterCapability({
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    });
    const target = join(fx.cwd, TARGET_RELPATH);
    expect(gate.decide("write", { path: target })).toBeUndefined();
  });

  it("the scope is STRICTLY under the workspace cwd (cwd itself is not admitted)", () => {
    const fx = layout();
    const gate = new WriteGate(fx.providers);
    gate.enterCapability({
      name: "cap-apw",
      writes: [],
      allowProjectWrites: true,
    });
    expect(gate.decide("write", { path: fx.cwd })).toBeDefined(); // '/'-sibling prefix check
  });
});

// ---------------------------------------------------------------------------
// (f) NEW-LINE GOLDENS — full-byte pins for EVERY denial shape. Each replica
// constant asserts LOCKSTEP byte-equality between decide()'s `reason` and
// the suite-side construction above; the module's render* functions are the
// SOLE OWNER of each template.
// ---------------------------------------------------------------------------

describe("new-line goldens — lockstep byte-equality on every refusal shape", () => {
  const RESEARCH: CapabilitySources = {
    name: "research",
    writes: ["research/*.md"],
    allowProjectWrites: false,
  };

  it("phase-named denial with non-empty survivors", () => {
    const fx = layout();
    const kept = `${fx.slotRoot}/research/a.md`;
    // SOLE OWNER: renderPhaseDenial in guards/write-gate.ts.
    const GOLDEN_PHASE_NAMED = replicaPhaseDenial("guard-probe", [kept]);
    const gate = new WriteGate(fx.providers);
    gate.enterCapability(RESEARCH);
    gate.enterPhase("guard-probe", [kept]);
    expect(
      asRefusal(gate.decide("write", { path: `${fx.slotRoot}/research/b.md` }))
        .reason,
    ).toBe(GOLDEN_PHASE_NAMED);
  });

  it("capability-named denial with patterns only (no project-scope note)", () => {
    const fx = layout();
    // SOLE OWNER: renderCapabilityDenial (apw-off form) in guards/write-gate.ts.
    const GOLDEN_CAP_PATTERNS = replicaCapabilityDenial(
      "research",
      ["research/*.md"],
      null,
    );
    const gate = new WriteGate(fx.providers);
    gate.enterCapability(RESEARCH);
    expect(
      asRefusal(gate.decide("write", { path: `${fx.slotRoot}/docs/other.md` }))
        .reason,
    ).toBe(GOLDEN_CAP_PATTERNS);
  });

  it("capability-named denial with patterns AND the project-scope note carrying the actual cwd", () => {
    const fx = layout();
    // SOLE OWNER: renderCapabilityDenial (apw-on form) in guards/write-gate.ts.
    const GOLDEN_CAP_PROJECT_NOTE = replicaCapabilityDenial(
      "research",
      ["research/*.md"],
      fx.cwd,
    );
    const gate = new WriteGate(fx.providers);
    gate.enterCapability({ ...RESEARCH, allowProjectWrites: true });
    // A pattern-miss OUTSIDE the cwd scope reaches the denial with the note:
    expect(
      asRefusal(gate.decide("write", { path: `/outside/scope.md` })).reason,
    ).toBe(GOLDEN_CAP_PROJECT_NOTE);
    expect(GOLDEN_CAP_PROJECT_NOTE).toContain(`project files under ${fx.cwd}`);
  });

  it("capability-named 'none' — the empty-contract span refusal", () => {
    const fx = layout();
    // SOLE OWNER: renderCapabilityDenial (empty-sources form) in write-gate.ts.
    const GOLDEN_CAP_NONE = replicaCapabilityDenial("compose-demo", [], null);
    const gate = new WriteGate(fx.providers);
    gate.enterCapability({
      name: "compose-demo",
      writes: [],
      allowProjectWrites: false,
    });
    expect(
      asRefusal(gate.decide("write", { path: `${fx.slotRoot}/anything/x.md` }))
        .reason,
    ).toBe(GOLDEN_CAP_NONE);
    expect(GOLDEN_CAP_NONE).toContain("Allowed targets: none.");
  });

  it("no-span 'none' — the depth-0 refusal (carries the escaped U+2014 em dash)", () => {
    const fx = layout();
    // SOLE OWNER: renderNoSpanDenial in guards/write-gate.ts.
    const GOLDEN_NO_SPAN = replicaNoSpanDenial();
    const gate = new WriteGate(fx.providers);
    expect(
      asRefusal(gate.decide("write", { path: `${fx.slotRoot}/anything/x.md` }))
        .reason,
    ).toBe(GOLDEN_NO_SPAN);
    expect(GOLDEN_NO_SPAN).toContain("\u2014"); // the structural clause is present
  });

  it("every denial carries the /tmp/ parity clause (all four shapes)", () => {
    const fx = layout();
    const withScope = new WriteGate(fx.providers);
    withScope.enterCapability({
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: true,
    });
    withScope.enterPhase("guard-probe", [`${fx.slotRoot}/research/a.md`]);
    const shapes: Array<{ block: true; reason: string }> = [
      // Phase-named (non-empty survivors):
      asRefusal(
        withScope.decide("write", { path: `${fx.slotRoot}/research/b.md` }),
      ),
    ];
    withScope.exitPhase();
    // Capability-named WITH the project-scope note (target outside the scope):
    shapes.push(
      asRefusal(withScope.decide("write", { path: "/outside/x.md" })),
    );
    withScope.exitCapability();
    // No-span (depth-0):
    shapes.push(
      asRefusal(withScope.decide("write", { path: "/outside/y.md" })),
    );
    // Capability-named WITHOUT the note (empty-contract span):
    const emptyGate = new WriteGate(fx.providers);
    emptyGate.enterCapability({
      name: "empty-cap",
      writes: [],
      allowProjectWrites: false,
    });
    shapes.push(
      asRefusal(emptyGate.decide("write", { path: `/outside/z.md` })),
    );

    for (const shape of shapes) {
      expect(shape.block).toBe(true);
      expect(
        shape.reason.endsWith("Scratch files under /tmp/ stay open."),
      ).toBe(true);
    }
  });

  it("coverage is EXACTLY write/edit — other tools and malformed inputs never touch providers or state", () => {
    const fx = layout();
    let consulted = 0;
    const countingProviders: WriteGateProviders = {
      projectSlotRoot: () => {
        consulted += 1;
        return fx.slotRoot;
      },
      workspaceCwd: () => {
        consulted += 1;
        return fx.cwd;
      },
    };
    const gate = new WriteGate(countingProviders);
    // Non-writer tools — including bash (backlog territory) — yield no target:
    expect(
      gate.decide("bash", { command: "touch /outside/x.md" }),
    ).toBeUndefined();
    expect(gate.decide("read", { path: "/outside/x.md" })).toBeUndefined();
    expect(gate.decide("vscode_apply_workspace_edit", {})).toBeUndefined();
    // Writer tools with missing/non-string paths yield no target:
    expect(gate.decide("write", {})).toBeUndefined();
    expect(gate.decide("write", { path: 42 })).toBeUndefined();
    expect(gate.decide("write", null)).toBeUndefined();
    expect(gate.decide("write", undefined)).toBeUndefined();
    expect(consulted).toBe(0); // zero provider consultations
    // And the same calls under an active span (state unchanged either way):
    gate.enterCapability(RESEARCH);
    expect(gate.decide("bash", { command: "echo hi" })).toBeUndefined();
    expect(consulted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (g) Faulty channels — producer faults propagate VERBATIM at first consult;
// construction stays pure; empty sources make the fault structurally moot.
// ---------------------------------------------------------------------------

describe("faulty channels — loud typed failure at consult, never swallowed", () => {
  it("a throwing root provider propagates verbatim from a span decision (first pattern consult)", () => {
    const fx = layout();
    const fault = new SentinelFault("state-root-channel-fault");
    const providers: WriteGateProviders = {
      projectSlotRoot: () => {
        throw fault;
      },
      workspaceCwd: () => fx.cwd,
    };
    const gate = new WriteGate(providers);
    gate.enterCapability({
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: false,
    });
    try {
      gate.decide("write", { path: `/outside/a.md` }); // pattern disjunct consults first
      throw new Error("expected the provider fault to escape");
    } catch (error) {
      expect(error).toBe(fault); // SENTINEL IDENTITY — not caught/wrapped/fallen back
      expect((error as Error).message).toBe("state-root-channel-fault");
    }
  });

  it("a throwing root provider propagates verbatim from pattern-anchored confirmation (enterPhase)", () => {
    const fx = layout();
    const fault = new SentinelFault("confirm-fault");
    const providers: WriteGateProviders = {
      projectSlotRoot: () => {
        throw fault;
      },
      workspaceCwd: () => fx.cwd,
    };
    const gate = new WriteGate(providers);
    gate.enterCapability({
      name: "research",
      writes: ["research/*.md"],
      allowProjectWrites: false,
    });
    try {
      gate.enterPhase("p", [`${fx.slotRoot}/research/a.md`]);
      throw new Error("expected the provider fault to escape");
    } catch (error) {
      expect(error).toBe(fault);
    }
    // Validate-then-commit: the layer was left UNTOUCHED — the mirrored
    // unwind still succeeds (an entered phase would have made exitCapability throw).
    gate.exitCapability();
    expect(() => gate.exitCapability()).toThrowError(
      /no active capability layer/,
    );
  });

  it("a throwing cwd provider propagates verbatim from the scope disjunct", () => {
    const fx = layout();
    const fault = new SentinelFault("cwd-channel-fault");
    const providers: WriteGateProviders = {
      projectSlotRoot: () => fx.slotRoot,
      workspaceCwd: () => {
        throw fault;
      },
    };
    const gate = new WriteGate(providers);
    // Empty writes skip the root consult; the apw disjunct must consult cwd:
    gate.enterCapability({
      name: "cap-apw",
      writes: [],
      allowProjectWrites: true,
    });
    try {
      gate.decide("write", { path: `/outside/a.md` });
      throw new Error("expected the provider fault to escape");
    } catch (error) {
      expect(error).toBe(fault);
    }
  });

  it("construction with throwing providers succeeds — zero consults at construction", () => {
    const alwaysFaults = (): string => {
      throw new SentinelFault("never-consulted");
    };
    expect(
      () =>
        new WriteGate({
          projectSlotRoot: alwaysFaults,
          workspaceCwd: alwaysFaults,
        }),
    ).not.toThrow();
  });

  it("empty sources render denials NORMALLY despite a throwing root provider (zero-consult guarantee)", () => {
    const fx = layout();
    const fault = new SentinelFault("structurally-unreachable");
    const providers: WriteGateProviders = {
      projectSlotRoot: () => {
        throw fault;
      },
      workspaceCwd: () => fx.cwd,
    };
    const gate = new WriteGate(providers);
    gate.enterCapability({
      name: "empty-cap",
      writes: [],
      allowProjectWrites: false,
    });
    // Both branches skip — the cannot-determine-project-root condition is
    // STRUCTURALLY UNREACHABLE: a loud typed failure at consult instead of
    // a per-write refusal.
    const refusal = asRefusal(gate.decide("write", { path: `/outside/a.md` }));
    expect(refusal.reason).toBe(replicaCapabilityDenial("empty-cap", [], null));
  });
});

// ---------------------------------------------------------------------------
// (h) LEG-2 HERMETIC CONCURRENCY TIER — the REAL gate module driven with
// TWO independent per-session gate objects under ADVERSARIAL INTERLEAVED
// request ordering (deterministic script, alternating A/B operations across
// all five fixture shapes, staggered exits). Zero cross-talk: every verdict
// equals its SOLO-RUN expectation under the interleave; neither object's
// state ever leaks into the other's verdicts; both drain to depth-0.
// Fast CI leg — script-driven, no real async parallelism.
// ---------------------------------------------------------------------------

describe("leg-2 hermetic concurrency — two gates, adversarial interleave", () => {
  it("zero cross-talk across all five fixture shapes; both objects drain to depth-0", () => {
    const fa = layout();
    const fb = layout();
    const gateA = new WriteGate(fa.providers);
    const gateB = new WriteGate(fb.providers);

    // Session A — pattern-governed span (the "research" shape).
    const ALPHA: CapabilitySources = {
      name: "alpha",
      writes: ["artifacts/*.md"],
      allowProjectWrites: false,
    };
    const aInList = `${fa.slotRoot}/artifacts/one.md`;
    const aOutOfList = `${fa.slotRoot}/artifacts/two.md`;
    const aInheritedMiss = `${fa.slotRoot}/docs/inherited.md`;
    const aDropped = `/clamped-a/file.md`; // outside slot AND outside cwdA
    const aKept = `${fa.slotRoot}/artifacts/kept.md`;

    // Session B — scope-governed span (the "allowProjectWrites" shape).
    const BETA: CapabilitySources = {
      name: "beta",
      writes: [],
      allowProjectWrites: true,
    };
    const bProjectOk = `${fb.cwd}/docs/note.md`; // apw-scope survivor
    const bForeign = `/foreign-b/file.md`; // wiped: outside slot, outside cwdB
    const bPost = `${fb.cwd}/post.md`;

    const expectAllowed = (
      verdict: { block: true; reason: string } | undefined,
      label: string,
    ) => {
      expect(verdict, `expected allowed at ${label}`).toBeUndefined();
    };
    const expectRefusalAt = (
      verdict: { block: true; reason: string } | undefined,
      expectedReason: string,
      label: string,
    ) => {
      expect(asRefusal(verdict).reason, `wrong bytes at ${label}`).toBe(
        expectedReason,
      );
    };

    // Op 01–03: staggered entries — A opens its span+phase first…
    gateA.enterCapability(ALPHA);
    // …B opens its span while A sits inside a phase…
    gateB.enterCapability(BETA);
    gateA.enterPhase("gather-a", [aInList]);

    // Op 04–07: decisions interleave at DIFFERENT depths/shapes.
    expectAllowed(
      gateB.decide("write", { path: "/tmp/wg-leg2/b-span.txt" }),
      "op04 b /tmp span-only",
    );
    expectAllowed(
      gateB.decide("write", { path: bProjectOk }),
      "op05 b inherited apw scope",
    );
    expectRefusalAt(
      gateA.decide("write", { path: aOutOfList }),
      replicaPhaseDenial("gather-a", [aInList]),
      "op06 a out-of-list (phase-named)",
    );
    expectAllowed(gateA.decide("write", { path: aInList }), "op07 a in-list");

    // Op 08–11: B takes a clamped phase while A still governs its own.
    gateB.enterPhase("scope-b", [bProjectOk, bForeign]); // bForeign wipes
    expectAllowed(
      gateB.decide("write", { path: bProjectOk }),
      "op08 b in-list (survivor)",
    );
    expectRefusalAt(
      gateB.decide("write", { path: bForeign }),
      replicaPhaseDenial("scope-b", [bProjectOk]),
      "op09 b clamped-away (dropped absent from listing)",
    );
    expectAllowed(
      gateA.decide("write", { path: "/tmp/wg-leg2/a-phased.txt" }),
      "op10 a /tmp non-empty phase",
    );
    expectRefusalAt(
      gateB.decide("write", { path: `${fb.slotRoot}/x/y.md` }),
      replicaPhaseDenial("scope-b", [bProjectOk]),
      "op11 b out-of-list (pattern-miss inside slot)",
    );

    // Op 12–15: symmetric exits, then span-level governance resumes.
    gateA.exitPhase();
    gateB.exitPhase();
    expectRefusalAt(
      gateA.decide("write", { path: aInheritedMiss }),
      replicaCapabilityDenial("alpha", ["artifacts/*.md"], null),
      "op12 a inherited (capability-named)",
    );
    gateB.enterPhase("empty-b", []); // B's empty-declaration phase entry
    expectAllowed(
      gateA.decide("write", { path: "/tmp/wg-leg2/a-spanonly.txt" }),
      "op14 a /tmp span-only",
    );
    expectRefusalAt(
      gateB.decide("write", { path: bForeign }),
      replicaCapabilityDenial("beta", [], fb.cwd),
      "op15 b empty-set fall-through (capability-named + scope note)",
    );

    // Op 16–19: B DRAINS while A enters its clamped-away phase.
    gateA.enterPhase("clamp-a", [aDropped, aKept]);
    gateB.exitPhase();
    gateB.exitCapability();
    expectRefusalAt(
      gateA.decide("write", { path: aDropped }),
      replicaPhaseDenial("clamp-a", [aKept]),
      "op18 a clamped-away (survivor listed, dropped absent)",
    );
    expectRefusalAt(
      gateB.decide("write", { path: bPost }),
      replicaNoSpanDenial(),
      "op19 b no-span (drained)",
    );

    // Op 20–22: A unwinds and drains.
    expectAllowed(
      gateA.decide("write", { path: aKept }),
      "op20 a survivor still granted",
    );
    gateA.exitPhase();
    gateA.exitCapability();
    expectRefusalAt(
      gateA.decide("write", { path: aInheritedMiss }),
      replicaNoSpanDenial(),
      "op21 a no-span (drained)",
    );

    // Drained proofs: both objects sit at depth-0 — a further pop underflows.
    expect(() => gateA.exitCapability()).toThrowError(
      /no active capability layer/,
    );
    expect(() => gateB.exitCapability()).toThrowError(
      /no active capability layer/,
    );
  });
});

// ---------------------------------------------------------------------------
// (i) Mechanical rows — self-source guards (house idiom:
// readFileSync(import.meta.url)), pinning import surface + escape discipline.
// ---------------------------------------------------------------------------

describe("mechanical source guards", () => {
  const MODULE_URL = new URL("./write-gate.ts", import.meta.url);
  const SUITE_URL = new URL("./write-gate.test.ts", import.meta.url);
  const moduleSource = readFileSync(MODULE_URL, "utf8");
  const suiteSource = readFileSync(SUITE_URL, "utf8");

  // Assembled at runtime so this guard does not self-match its own text.
  const SDK_SPECIFIER = ["@earendil-works", "pi-coding-agent"].join("/");

  it("zero occurrences of the SDK specifier in the module AND the suite", () => {
    expect(moduleSource.includes(SDK_SPECIFIER)).toBe(false);
    expect(suiteSource.includes(SDK_SPECIFIER)).toBe(false);
  });

  it("the module's value-import clause set is within {node:path, ../../sandbox/fsview.ts} — zero node:fs", () => {
    expect(moduleSource.includes("node:fs")).toBe(false);
    const importLines = moduleSource
      .split("\n")
      .filter((line) => line.startsWith("import "));
    const specifiers = importLines.flatMap((line) =>
      [...line.matchAll(/from "([^"]+)"/g)].map((match) => match[1]),
    );
    expect(specifiers).toEqual(["node:path", "../../sandbox/fsview.ts"]);
  });

  it("pinned denial literals carry \\u2014 escapes — never a raw glyph in a string literal", () => {
    // The escaped form must be present in the module's pinned literals…
    expect(
      moduleSource.includes(`Writing is refused \\u2014 no capability span`),
    ).toBe(true);
    expect(
      moduleSource.includes(
        `outstanding phase entry \\u2014 exitPhase() first`,
      ),
    ).toBe(true);
    // …and NO raw U+2014 may occur inside any string LITERAL of the module
    // (raw glyphs in prose comments are house precedent — not pinned bytes).
    // Comments are stripped first so quote-paired "spans" cannot cross
    // comment text (quoted words in prose would create phantom spans).
    const codeOnly = moduleSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const rawGlyph = String.fromCharCode(0x2014);
    const literalSpans = [...codeOnly.matchAll(/["'`]([^"'`]*)["'`]/g)].map(
      (m) => m[1],
    );
    expect(literalSpans.some((span) => span.includes(rawGlyph))).toBe(false);
    // The suite's golden replicas mirror the escaped bytes (lockstep proof):
    expect(
      suiteSource.includes(`Writing is refused \\u2014 no capability span`),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (e) The pattern-direction membership predicate — edge rows drive
// matchesAnchoredGlob directly over fixed string roots (no filesystem needed:
// the predicate answers "would this candidate target fall inside this
// declared pattern" for a path that does not yet exist).
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
