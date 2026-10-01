// Hermetic unit suite for the dedicated per-session execution state
// (session-execution-state.ts) - direct-drive over the REAL state + REAL
// decideWrite composition. Self-contained island: zero SDK imports, zero fs
// fixtures, zero env manipulation, zero async - the sole sanctioned read is
// repo source for the mechanical guard rows (house idiom). All path fixtures
// are FIXED LITERAL strings over disjoint roots: tmpdir-derived roots sit
// under /tmp/ on POSIX and the parity class would silently ALLOW every
// refusal row, so the literal roots never touch /tmp/.

import { readFileSync } from "node:fs";
import type {
  CapabilitySources,
  PathAnchors,
} from "./capability/guards/guard-vocabulary.ts";
import { decideWrite } from "./capability/guards/write-gate.ts";
import type {
  AnchorChannels,
  ExecutionSnapshot,
} from "./session-execution-state.ts";
import * as stateModule from "./session-execution-state.ts";
import { SessionExecutionState } from "./session-execution-state.ts";

// ---------------------------------------------------------------------------
// Canonical hermetic fixtures - FIXED LITERAL roots, disjoint per object,
// constant-returning channel closures.
// ---------------------------------------------------------------------------

const SLOT_A = "/projA/projects/key";
const CWD_A = "/workA";
const SOURCES_A: CapabilitySources = {
  name: "cap-a",
  writes: ["artifacts/*.md"],
  allowProjectWrites: false,
};
const TARGET_A1 = `${SLOT_A}/artifacts/report.md`;

const SLOT_B = "/projB/projects/key";
const CWD_B = "/workB";
const SOURCES_B: CapabilitySources = {
  name: "cap-b",
  writes: ["deliverables/*.md"],
  allowProjectWrites: false,
};
const TARGET_B1 = `${SLOT_B}/deliverables/out.md`;

const channelsFor = (
  slotRoot: string,
  workspaceCwd: string,
): AnchorChannels => ({
  projectSlotRoot: () => slotRoot,
  workspaceCwd: () => workspaceCwd,
});

/** Composed drive helper: real state -> fresh snapshot() -> real decideWrite. */
const driveOf =
  (state: SessionExecutionState) => (toolName: string, path: string) =>
    decideWrite(state.snapshot(), toolName, { path });

/** Narrow a refusal (row-invariant guard; allowed writes expect undefined). */
function asRefusal(verdict: { block: true; reason: string } | undefined): {
  block: true;
  reason: string;
} {
  if (verdict === undefined) throw new Error("expected a refusal, got allowed");
  return verdict;
}

/** Capture a thrown Error (zero-cast narrowing; a non-Error fault or a
 * missing throw both fail loudly). */
function captureError(fn: () => void): Error {
  try {
    fn();
  } catch (err) {
    if (err instanceof Error) return err;
    throw new Error(`non-Error fault escaped: ${String(err)}`);
  }
  throw new Error("expected a fault, none thrown");
}

const FAULT_NAME = "ExecutionStateError";

// ---------------------------------------------------------------------------
// (a) BOOKKEEPING - LIFO span layers (suspend/restore), the scalar phase
// slot, the four loud fault forms, and the sanctioned reset drain.
// ---------------------------------------------------------------------------

describe("bookkeeping - LIFO span layers and the scalar phase slot", () => {
  it("nested spans SUSPEND/RESTORE the outer pair - after the inner exits, the outer sources govern again (row-1 property)", () => {
    const state = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    const outer: CapabilitySources = {
      name: "cap-outer",
      writes: [],
      allowProjectWrites: false,
    };
    const inner: CapabilitySources = {
      name: "cap-inner",
      writes: [],
      allowProjectWrites: false,
    };
    state.enterCapability(outer);
    expect(state.snapshot().sources).toBe(outer);
    state.enterCapability(inner);
    expect(state.snapshot().sources).toBe(inner); // innermost governs
    state.exitCapability();
    expect(state.snapshot().sources).toBe(outer); // outer governs again
    state.exitCapability();
    expect(state.snapshot().sources).toBeNull();
  });

  it("enterCapability stores sources BY REFERENCE (identity passthrough, no clone)", () => {
    const state = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    const sources: CapabilitySources = {
      name: "cap-ref",
      writes: ["w/*.md"],
      allowProjectWrites: false,
    };
    state.enterCapability(sources);
    expect(state.snapshot().sources).toBe(sources);
  });

  it("exitCapability UNDERFLOW faults with the unexported typed error and the exact pinned message", () => {
    const under = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    const err = captureError(() => under.exitCapability());
    expect(err.name).toBe(FAULT_NAME);
    expect(err.message).toBe(
      "execution state: exitCapability() called with no capability span active",
    );
  });

  it("exitCapability with an OUTSTANDING PHASE faults (message carries the attached id) and leaves the stack intact", () => {
    const staged = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    staged.enterCapability(SOURCES_A);
    staged.attachPhase("phase-x", [TARGET_A1]);
    const err = captureError(() => staged.exitCapability());
    expect(err.name).toBe(FAULT_NAME);
    expect(err.message).toBe(
      "execution state: exitCapability() called while phase 'phase-x' is still attached",
    );
    // loud, never half-applied: the layer and its slot survive the fault:
    expect(staged.snapshot().sources).toBe(SOURCES_A);
    expect(staged.snapshot().phase?.id).toBe("phase-x");
  });

  it("attachPhase at DEPTH 0 faults (message carries the id)", () => {
    const cold = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    const err = captureError(() => cold.attachPhase("phase-y", [TARGET_A1]));
    expect(err.name).toBe(FAULT_NAME);
    expect(err.message).toBe(
      "execution state: attachPhase('phase-y') called with no capability span active",
    );
  });

  it("detachPhase with NO ATTACHED PHASE faults - INCLUDING at depth 0 (one form, no fifth variant)", () => {
    const bare = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    const bareErr = captureError(() => bare.detachPhase());
    expect(bareErr.name).toBe(FAULT_NAME);
    expect(bareErr.message).toBe(
      "execution state: detachPhase() called with no attached phase",
    );
    // the SAME single form fires at positive depth with an empty slot:
    const emptied = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    emptied.enterCapability(SOURCES_A);
    emptied.attachPhase("phase-z", [TARGET_A1]);
    emptied.detachPhase();
    const emptiedErr = captureError(() => emptied.detachPhase());
    expect(emptiedErr.name).toBe(FAULT_NAME);
    expect(emptiedErr.message).toBe(
      "execution state: detachPhase() called with no attached phase",
    );
  });

  it("reset() drains regardless of outstanding entries (spans with attached phases) and is idempotent - post-drain re-enter behaves fresh", () => {
    const state = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    state.enterCapability(SOURCES_A);
    state.attachPhase("phase-a", [TARGET_A1]);
    state.enterCapability(SOURCES_B);
    state.attachPhase("phase-b", [TARGET_B1]);
    state.reset();
    const drained = state.snapshot();
    expect(drained.sources).toBeNull();
    expect(drained.phase).toBeNull();
    expect(drained.paths).toEqual({
      projectSlotRoot: SLOT_A,
      workspaceCwd: CWD_A,
    });
    state.reset(); // idempotent: second call is a no-op
    state.enterCapability(SOURCES_B);
    expect(state.snapshot().sources).toBe(SOURCES_B);
    expect(state.snapshot().phase).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (c) ATTACH-STORES-VERBATIM + DECISION-TIME COMPOSITION - real state ->
// snapshot() -> real decideWrite; the five coverage outcomes plus snapshot-
// read semantics. Fresh scenario objects per row.
// ---------------------------------------------------------------------------

describe("attach-stores-verbatim + decision-time composition", () => {
  it("pattern-hit admission: a declared path covered by a writes pattern anchored at the object's slot root is allowed", () => {
    const state = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    state.enterCapability(SOURCES_A);
    state.attachPhase("p1", [TARGET_A1]);
    expect(driveOf(state)("write", TARGET_A1)).toBeUndefined();
    expect(driveOf(state)("edit", TARGET_A1)).toBeUndefined();
  });

  it("allowProjectWrites-scope-hit admission: a target STRICTLY under workspaceCwd, pattern-uncovered, is allowed with the flag on", () => {
    const APW: CapabilitySources = {
      name: "cap-apw",
      writes: ["artifacts/*.md"],
      allowProjectWrites: true,
    };
    const PROJECT_FILE = `${CWD_A}/notes.md`;
    const state = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    state.enterCapability(APW);
    state.attachPhase("p2", [PROJECT_FILE]);
    expect(driveOf(state)("write", PROJECT_FILE)).toBeUndefined();
  });

  it("FULLY-UNCOVERED: the entry is refused AS IF UNDECLARED - verdict byte-IDENTICAL to the no-phase capability-named denial (lazy fall-through proof)", () => {
    const FOREIGN = "/elsewhere/declared.md";
    const withPhase = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    withPhase.enterCapability(SOURCES_A);
    withPhase.attachPhase("clamp", [FOREIGN]);
    const withoutPhase = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    withoutPhase.enterCapability(SOURCES_A);
    const rWith = asRefusal(driveOf(withPhase)("write", FOREIGN));
    const rWithout = asRefusal(driveOf(withoutPhase)("write", FOREIGN));
    // byte-identical: the wiped phase confers NO governance
    expect(rWith.reason).toBe(rWithout.reason);
    // capability named (a phase-named line would be WRONG), full effective set
    // listed, uncovered entry ABSENT:
    expect(rWith.reason).toContain("'cap-a'");
    expect(rWith.reason).not.toContain("during phase");
    expect(rWith.reason).toContain("artifacts/*.md");
    expect(rWith.reason).not.toContain(FOREIGN);
  });

  it("PARTIAL coverage: mixed survivors - the covered declared entry admitted, the uncovered one refused with the SURVIVOR visible and itself ABSENT", () => {
    const FOREIGN = "/elsewhere/partial.md";
    const state = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    state.enterCapability(SOURCES_A);
    state.attachPhase("mixed", [TARGET_A1, FOREIGN]);
    expect(driveOf(state)("write", TARGET_A1)).toBeUndefined();
    const refusal = asRefusal(driveOf(state)("write", FOREIGN));
    expect(refusal.reason).toContain("'mixed'");
    expect(refusal.reason).toContain(TARGET_A1);
    expect(refusal.reason).not.toContain(FOREIGN);
  });

  it("EMPTY-CONTRACT + null-sources fall-through: non-empty declared yet no phase governance - verdict byte-identical across SENTINEL-VARYED anchors (paths provably never consulted), the 'none' line renders", () => {
    const WIPED: CapabilitySources = {
      name: "cap-wiped",
      writes: [],
      allowProjectWrites: false,
    };
    const TARGET = "/outside/w1.md";
    const SENTINEL_A: PathAnchors = {
      projectSlotRoot: "MKR-slot-w1",
      workspaceCwd: "MKR-cwd-w1",
    };
    const SENTINEL_B: PathAnchors = {
      projectSlotRoot: "MKR-slot-w2",
      workspaceCwd: "MKR-cwd-w2",
    };
    const stateA = new SessionExecutionState(
      channelsFor(SENTINEL_A.projectSlotRoot, SENTINEL_A.workspaceCwd),
    );
    stateA.enterCapability(WIPED);
    stateA.attachPhase("wiped", [TARGET]);
    const stateB = new SessionExecutionState(
      channelsFor(SENTINEL_B.projectSlotRoot, SENTINEL_B.workspaceCwd),
    );
    stateB.enterCapability(WIPED);
    stateB.attachPhase("wiped", [TARGET]);
    const rA = asRefusal(driveOf(stateA)("write", TARGET));
    const rB = asRefusal(driveOf(stateB)("write", TARGET));
    // byte-identical across distinct placeholder anchors:
    expect(rA.reason).toBe(rB.reason);
    // the 'none' line renders, capability named, sentinels uninterpolated:
    expect(rA.reason).toContain("'cap-wiped'");
    expect(rA.reason).toContain("Allowed targets: none.");
    expect(rA.reason).not.toContain("MKR-slot-w1");
    expect(rA.reason).not.toContain("MKR-cwd-w1");
    expect(rA.reason.endsWith("Scratch files under /tmp/ stay open.")).toBe(
      true,
    );
    // the null-sources half of the same shape (hand-built snapshot - a real
    // span always carries real sources): identical bytes across sentinels,
    // and the no-span line governs:
    const nullSnapA: ExecutionSnapshot = {
      sources: null,
      phase: { id: "wiped-null", declared: [TARGET] },
      paths: SENTINEL_A,
    };
    const nullSnapB: ExecutionSnapshot = {
      ...nullSnapA,
      paths: SENTINEL_B,
    };
    const rNullA = asRefusal(decideWrite(nullSnapA, "write", { path: TARGET }));
    const rNullB = asRefusal(decideWrite(nullSnapB, "write", { path: TARGET }));
    expect(rNullA.reason).toBe(rNullB.reason);
    expect(rNullA.reason).toContain("no capability span is active");
    expect(rNullA.reason).not.toContain("MKR-slot-w2");
  });

  it("verbatim storage: snapshot().phase.declared deep-equals (order-sensitive) the attach argument INCLUDING contract-uncovered entries; sources are handed out BY REFERENCE", () => {
    const FOREIGN = "/elsewhere/v1.md";
    const declaredArg: readonly string[] = [TARGET_A1, FOREIGN];
    const sources = SOURCES_A;
    const state = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    state.enterCapability(sources);
    state.attachPhase("verbatim", declaredArg);
    const snap = state.snapshot();
    // zero-copy pin: identity, not just content equality
    expect(snap.phase?.declared).toBe(declaredArg);
    expect(snap.sources).toBe(sources);
  });

  it("snapshot-fault rows: a throwing channel propagates VERBATIM (instance identity) from snapshot() at each position; first fault wins; a healthy pair resolves both fields; a faulty channel AT DEPTH 0 still throws", () => {
    const boomSlot = new Error("chan-slot-boom");
    const failingFirst = new SessionExecutionState({
      projectSlotRoot: () => {
        throw boomSlot;
      },
      workspaceCwd: () => CWD_A,
    });
    failingFirst.enterCapability(SOURCES_A);
    // verbatim instance escape (assertSame-grade: toBe on the instance):
    expect(captureError(() => failingFirst.snapshot())).toBe(boomSlot);
    // first fault wins: the healthy second channel is never consulted:
    let consults = 0;
    const countingSecond = new SessionExecutionState({
      projectSlotRoot: () => {
        throw boomSlot;
      },
      workspaceCwd: () => {
        consults += 1;
        return CWD_A;
      },
    });
    captureError(() => countingSecond.snapshot());
    expect(consults).toBe(0);
    // the SECOND position faults as well (first healthy):
    const boomCwd = new Error("chan-cwd-boom");
    const failingSecond = new SessionExecutionState({
      projectSlotRoot: () => SLOT_A,
      workspaceCwd: () => {
        throw boomCwd;
      },
    });
    expect(captureError(() => failingSecond.snapshot())).toBe(boomCwd);
    // a healthy pair resolves BOTH path fields:
    const healthy = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    expect(healthy.snapshot().paths).toEqual({
      projectSlotRoot: SLOT_A,
      workspaceCwd: CWD_A,
    });
    // a throwing channel AT DEPTH 0 still throws (paths always resolved):
    const coldFaulty = new SessionExecutionState({
      projectSlotRoot: () => {
        throw boomSlot;
      },
      workspaceCwd: () => CWD_A,
    });
    expect(captureError(() => coldFaulty.snapshot())).toBe(boomSlot);
  });

  it("no-attach-fault row: attach succeeds WHILE a channel faults (attach consults nothing); the healed snapshot resolves paths AND shows the committed phase", () => {
    let fault: Error | null = new Error("chan-fault-live");
    const channels: AnchorChannels = {
      projectSlotRoot: () => {
        if (fault) throw fault;
        return SLOT_A;
      },
      workspaceCwd: () => {
        if (fault) throw fault;
        return CWD_A;
      },
    };
    const state = new SessionExecutionState(channels);
    state.enterCapability(SOURCES_A);
    const arg: readonly string[] = [TARGET_A1];
    expect(() => state.attachPhase("committed", arg)).not.toThrow();
    // while the holder faults, snapshot escapes the held instance verbatim:
    expect(captureError(() => state.snapshot())).toBe(fault);
    fault = null;
    const healed = state.snapshot();
    expect(healed.paths).toEqual({
      projectSlotRoot: SLOT_A,
      workspaceCwd: CWD_A,
    });
    expect(healed.phase).toEqual({ id: "committed", declared: arg });
  });

  it("read semantics: two consecutive unmutated snapshots are !== (fresh wrapper) but deep-equal; a counting channel proves EXACTLY ONE fresh consult per field per call", () => {
    let slotConsults = 0;
    let cwdConsults = 0;
    const state = new SessionExecutionState({
      projectSlotRoot: () => {
        slotConsults += 1;
        return SLOT_A;
      },
      workspaceCwd: () => {
        cwdConsults += 1;
        return CWD_A;
      },
    });
    state.enterCapability(SOURCES_A);
    const first = state.snapshot();
    const second = state.snapshot();
    expect(first).not.toBe(second);
    expect(second).toEqual(first);
    expect(slotConsults).toBe(2);
    expect(cwdConsults).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// (d) SCALAR-SLOT SYMMETRY - proves no phase save/restore exists anywhere.
// ---------------------------------------------------------------------------

describe("scalar-slot symmetry - no phase save/restore", () => {
  it("post-detach reading is IDENTICAL (deep) to the pre-attach reading (both phase: null)", () => {
    const state = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    state.enterCapability(SOURCES_A);
    const pre = state.snapshot();
    state.attachPhase("p", [TARGET_A1]);
    state.detachPhase();
    const post = state.snapshot();
    expect(post).toEqual(pre);
    expect(post.phase).toBeNull();
  });

  it("a second phase after detach starts CLEAN (new id/declared visible, zero residue of the prior)", () => {
    const OTHER = `${SLOT_A}/artifacts/other.md`;
    const state = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    state.enterCapability(SOURCES_A);
    state.attachPhase("first", [TARGET_A1]);
    state.detachPhase();
    state.attachPhase("second", [OTHER]);
    const snap = state.snapshot();
    expect(snap.phase).toEqual({ id: "second", declared: [OTHER] });
    expect(snap.phase?.id).not.toBe("first");
    expect(snap.phase?.declared).not.toContain(TARGET_A1);
  });

  it("double-attach OVERWRITES the slot (last-wins); a SINGLE detachPhase clears it fully", () => {
    const TWO = `${SLOT_A}/artifacts/two.md`;
    const state = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    state.enterCapability(SOURCES_A);
    state.attachPhase("p1", [TARGET_A1]);
    state.attachPhase("p2", [TWO]);
    expect(state.snapshot().phase).toEqual({ id: "p2", declared: [TWO] });
    state.detachPhase();
    expect(state.snapshot().phase).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (b) THE LEG-2 HERMETIC CONCURRENCY TIER - TWO independent real objects
// (canonical fixtures A/B) driven under ADVERSARIAL INTERLEAVED ordering,
// verdicts through the composed drive helper, proving ZERO cross-talk
// (structural isolation under script - the fast CI leg of Leg 2). One
// canonical scripted sequence; rows assert per stage.
// ---------------------------------------------------------------------------

describe("leg-2 hermetic concurrency - adversarial interleave over two independent objects", () => {
  const A = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
  const B = new SessionExecutionState(channelsFor(SLOT_B, CWD_B));
  const driveA = driveOf(A);
  const driveB = driveOf(B);

  it("stage 1 - both enter their own spans: each snapshot shows OWN sources (identity), zero cross-talk", () => {
    A.enterCapability(SOURCES_A);
    B.enterCapability(SOURCES_B);
    expect(A.snapshot().sources).toBe(SOURCES_A);
    expect(B.snapshot().sources).toBe(SOURCES_B);
    expect(A.snapshot().sources).not.toBe(SOURCES_B);
    expect(B.snapshot().sources).not.toBe(SOURCES_A);
  });

  it("stage 2 - both attach their phases (verbatim declarations stored per object)", () => {
    A.attachPhase("phase-a", [TARGET_A1]);
    B.attachPhase("phase-b", [TARGET_B1]);
    expect(A.snapshot().phase).toEqual({
      id: "phase-a",
      declared: [TARGET_A1],
    });
    expect(B.snapshot().phase).toEqual({
      id: "phase-b",
      declared: [TARGET_B1],
    });
  });

  it("stage 3 - interleaved verdicts: own in-list targets allowed, cross-targets refused with OWN ids/anchors only, byte-equal to the solo-object expectation", () => {
    expect(driveA("write", TARGET_A1)).toBeUndefined();
    expect(driveB("write", TARGET_B1)).toBeUndefined();
    const crossA = asRefusal(driveA("write", TARGET_B1));
    const crossB = asRefusal(driveB("write", TARGET_A1));
    // A's refusal names A's phase and lists A's root subtree...
    expect(crossA.reason).toContain("'phase-a'");
    expect(crossA.reason).toContain(TARGET_A1);
    expect(crossA.reason).toContain(SLOT_A);
    // ...and NONE of the other object's:
    expect(crossA.reason).not.toContain("phase-b");
    expect(crossA.reason).not.toContain(TARGET_B1);
    expect(crossA.reason).not.toContain(SLOT_B);
    // ...and B's refusal is the mirror image:
    expect(crossB.reason).toContain("'phase-b'");
    expect(crossB.reason).toContain(TARGET_B1);
    expect(crossB.reason).toContain(SLOT_B);
    expect(crossB.reason).not.toContain("phase-a");
    expect(crossB.reason).not.toContain(TARGET_A1);
    expect(crossB.reason).not.toContain(SLOT_A);
    // behavioral equality to the solo-object expectations:
    const soloA = new SessionExecutionState(channelsFor(SLOT_A, CWD_A));
    soloA.enterCapability(SOURCES_A);
    soloA.attachPhase("phase-a", [TARGET_A1]);
    expect(crossA.reason).toBe(
      asRefusal(driveOf(soloA)("write", TARGET_B1)).reason,
    );
    const soloB = new SessionExecutionState(channelsFor(SLOT_B, CWD_B));
    soloB.enterCapability(SOURCES_B);
    soloB.attachPhase("phase-b", [TARGET_B1]);
    expect(crossB.reason).toBe(
      asRefusal(driveOf(soloB)("write", TARGET_A1)).reason,
    );
  });

  it("stage 4 - clamped mid-flight: A's slot OVERWRITTEN with a contract-uncovered entry - driveA refuses it AS IF UNDECLARED while driveB remains undisturbed under its phase", () => {
    const FOREIGN_A = `${SLOT_A}/foreign/x.md`; // artifacts/*.md does not cover it
    A.attachPhase("phase-a2", [FOREIGN_A]); // overwrite - last-wins
    const clampA = asRefusal(driveA("write", FOREIGN_A));
    expect(clampA.reason).toContain("'cap-a'"); // capability-named line
    expect(clampA.reason).toContain("artifacts/*.md"); // effective set listed
    expect(clampA.reason).not.toContain(FOREIGN_A); // uncovered entry ABSENT
    expect(clampA.reason).not.toContain("phase-a2");
    // B remains undisturbed under phase-b:
    expect(driveB("write", TARGET_B1)).toBeUndefined();
    const crossB2 = asRefusal(driveB("write", FOREIGN_A));
    expect(crossB2.reason).toContain("'phase-b'");
    expect(crossB2.reason).toContain(TARGET_B1);
    expect(crossB2.reason).not.toContain(FOREIGN_A);
  });

  it("stage 5 - inherited: both detach - pattern-hit admission runs through span admission alone on each drive", () => {
    A.detachPhase();
    B.detachPhase();
    expect(A.snapshot().phase).toBeNull();
    expect(B.snapshot().phase).toBeNull();
    expect(driveA("write", TARGET_A1)).toBeUndefined();
    expect(driveB("write", TARGET_B1)).toBeUndefined();
    // span denials still name the OWN capability:
    expect(asRefusal(driveA("write", TARGET_B1)).reason).toContain("'cap-a'");
    expect(asRefusal(driveB("write", TARGET_A1)).reason).toContain("'cap-b'");
  });

  it("stage 6 - no-span: both exitCapability - the empty-set refusal fires on both drives", () => {
    A.exitCapability();
    B.exitCapability();
    const emptyA = asRefusal(driveA("write", TARGET_A1));
    const emptyB = asRefusal(driveB("write", TARGET_B1));
    expect(emptyA.reason).toContain("no capability span is active");
    expect(emptyA.reason).toContain("Allowed targets: none.");
    expect(emptyB.reason).toContain("no capability span is active");
    expect(emptyB.reason).toContain("Allowed targets: none.");
  });

  it("stage 7 - drained: both at depth 0 (snapshots null/null), reset() on both (sanctioned non-mirrored path), final readings null with resolved paths", () => {
    expect(A.snapshot().sources).toBeNull();
    expect(B.snapshot().sources).toBeNull();
    A.reset();
    B.reset();
    expect(A.snapshot()).toEqual({
      sources: null,
      phase: null,
      paths: { projectSlotRoot: SLOT_A, workspaceCwd: CWD_A },
    });
    expect(B.snapshot()).toEqual({
      sources: null,
      phase: null,
      paths: { projectSlotRoot: SLOT_B, workspaceCwd: CWD_B },
    });
  });
});

// ---------------------------------------------------------------------------
// (e) MECHANICAL SOURCE GUARDS - repo-source reads (house idiom); needles
// assembled at runtime from fragments (self-match prevention).
// ---------------------------------------------------------------------------

describe("mechanical source guards", () => {
  const STATE_SOURCE = readFileSync(
    new URL("./session-execution-state.ts", import.meta.url),
    "utf8",
  );
  const GATE_SOURCE = readFileSync(
    new URL("./capability/guards/write-gate.ts", import.meta.url),
    "utf8",
  );
  const VOCAB_SOURCE = readFileSync(
    new URL("./capability/guards/guard-vocabulary.ts", import.meta.url),
    "utf8",
  );

  /** Compact comment/literal-aware scan (house precedent: prose comments are
   * elided and exempt; literal payloads are recorded, not elided). Soundness
   * rests on the pinned ZERO-REGEX-LITERALS rule below - no expression-start
   * heuristic is needed. */
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
        residue += ch + "P" + ch;
        i = end + 1;
        continue;
      }
      residue += ch;
      i += 1;
    }
    return { residue, payloads };
  }

  const SDK_SPECIFIER = ["@earendil-works", "pi-coding-agent"].join("/");
  const GATE_SPECIFIER = ["./capability/guards/wr", "ite-gate.ts"].join("");
  const STATE_EDGE_SPECIFIER = ["../..", "/session-execution-state.ts"].join(
    "",
  );
  const CAST_TOKEN = ["a", "s"].join("");
  const RAW_GLYPH = String.fromCharCode(0x2014);

  it("EXACTLY ONE import clause in the state file - type-only, resolving to the vocabulary specifier (statement-aware, whitespace-tolerant)", () => {
    const importClauseLines = STATE_SOURCE.match(/^import\b/gm);
    expect(importClauseLines?.length ?? 0).toBe(1);
    expect(STATE_SOURCE.includes("import type {")).toBe(true);
    const fromSpecifiers = [
      ...STATE_SOURCE.matchAll(/\bfrom\s+"([^"]+)"/g),
    ].map((match) => match[1]);
    expect(fromSpecifiers).toEqual(["./capability/guards/guard-vocabulary.ts"]);
    const clause = STATE_SOURCE.match(/import\s+type\s*\{([\s\S]*?)\}/);
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
  });

  it("zero node: specifiers, zero write-gate.ts specifier, zero SDK specifier occurrences in the state file", () => {
    expect(STATE_SOURCE.includes("node:")).toBe(false);
    expect(STATE_SOURCE.includes(GATE_SPECIFIER)).toBe(false);
    expect(STATE_SOURCE.includes(SDK_SPECIFIER)).toBe(false);
  });

  it("bidirectional sibling-edge pin: the gate's ONLY clause touching the state specifier is a type-only one", () => {
    const normalizedGate = GATE_SOURCE.replace(/\s+/g, " ");
    const clauses = [
      ...normalizedGate.matchAll(
        /import\s+(type\s+)?\{[\s\S]*?\}\s+from\s*"([^"]+)"/g,
      ),
    ].map((match) => ({
      typeOnly: match[1] !== undefined,
      specifier: match[2],
    }));
    const stateEdge = clauses.filter(
      (clause) => clause.specifier === STATE_EDGE_SPECIFIER,
    );
    expect(stateEdge).toHaveLength(1);
    expect(stateEdge[0].typeOnly).toBe(true);
  });

  it("TYPE-HOME pin: ExecutionSnapshot is DECLARED in the state file and word-boundary-ABSENT from the vocabulary (whose member count stays EXACTLY three)", () => {
    expect(
      STATE_SOURCE.match(/export\s+interface\s+ExecutionSnapshot\b/),
    ).not.toBeNull();
    expect(VOCAB_SOURCE.match(/\bExecutionSnapshot\b/g)).toBeNull();
    const vocabExports = VOCAB_SOURCE.split("\n").filter((line) =>
      line.startsWith("export "),
    );
    expect(vocabExports).toHaveLength(3);
  });

  it("runtime namespace keys are EXACTLY {SessionExecutionState}; the prototype exposes EXACTLY the six pinned methods (constructor excluded); no static members leak", () => {
    expect(Object.keys(stateModule).sort()).toEqual(["SessionExecutionState"]);
    const protoKeys = Object.getOwnPropertyNames(
      SessionExecutionState.prototype,
    ).filter((key) => key !== "constructor");
    expect(protoKeys.sort()).toEqual([
      "attachPhase",
      "detachPhase",
      "enterCapability",
      "exitCapability",
      "reset",
      "snapshot",
    ]);
    expect(Object.getOwnPropertyNames(SessionExecutionState).sort()).toEqual([
      "length",
      "name",
      "prototype",
    ]);
  });

  it("declarative export surface names are EXACTLY {AnchorChannels, ExecutionSnapshot, SessionExecutionState}", () => {
    const declared = [
      ...STATE_SOURCE.matchAll(
        /^export\s+(?:interface|class|function|const|enum)\s+([A-Za-z_$][\w$]*)/gm,
      ),
    ].map((match) => match[1]);
    expect(declared.sort()).toEqual([
      "AnchorChannels",
      "ExecutionSnapshot",
      "SessionExecutionState",
    ]);
  });

  it("glyph discipline: NO raw U+2014 in any literal payload or in the comment-free code residue - and NO slash survives the elision (the zero-regex-literals pin that keeps this scan sound)", () => {
    const { residue, payloads } = partitionForScan(STATE_SOURCE);
    for (const payload of payloads) {
      expect(payload.includes(RAW_GLYPH)).toBe(false);
    }
    expect(residue.includes(RAW_GLYPH)).toBe(false);
    expect(residue.includes("/")).toBe(false);
  });

  it("zero `as` casts and zero explicit `any` over the comment/literal-stripped residue of THIS file (scoped row - the foreign suite's sweep additionally covers it)", () => {
    const { residue } = partitionForScan(STATE_SOURCE);
    expect(residue.match(new RegExp(`\\b${CAST_TOKEN}\\b`, "g"))).toBeNull();
    expect(residue.match(/\bany\b/g)).toBeNull();
  });

  it("dev-process-marker scan over the FINAL state file: zero step-attribution / planning-meta tokens", () => {
    const markers: string[] = [
      "\\bstep\\s+\\d",
      "\\bS0\\d\\b",
      "\\bD#\\d",
      "\\u00a7",
      "(?:TASK|PLAN)\\.md",
      "\\bskeleton\\b",
      "\\b20\\d{2}-\\d{2}-\\d{2}\\b",
    ];
    for (const pattern of markers) {
      expect(
        STATE_SOURCE.match(new RegExp(pattern, "gi")),
        `marker slipped through: ${pattern}`,
      ).toBeNull();
    }
  });
});
