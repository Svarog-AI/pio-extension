// Hermetic island suite for the pure snapshot-to-ruleset materializer of the
// command write fence (landlock-ruleset.ts). Self-contained island per the
// standing ruling: own fixtures, own scanner, own needles typed locally; NO
// cross-suite imports; zero SDK; no network; no $HOME; disk access LIMITED
// to two source reads (the module under test + the sibling helper suite
// whose const block these parity rows bind). Plain-value comparisons in
// behavioral rows; ONE sanctioned cross-module value dependency per row-
// group, integration-edge only (decideWrite + the shared byte family + the
// real execution state mirror the standing agreement-row idiom). All path
// fixtures are FIXED LITERAL absolute POSIX strings (path.resolve identity)
// unless a row explicitly states a defensive plain-literal exception.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  CapabilitySources,
  PathAnchors,
} from "../../capability/guards/guard-vocabulary.ts";
import { decideWrite } from "../../capability/guards/write-gate.ts";
import {
  renderPhaseDenial,
  UNIVERSAL_NO_PERMISSION_DENIAL,
} from "../../denial-vocabulary.ts";
import type { ExecutionSnapshot } from "../../session-execution-state.ts";
import { SessionExecutionState } from "../../session-execution-state.ts";
import type {
  HelperCheck,
  ShellSpec,
  SpawnPlanVerdict,
} from "./landlock-ruleset.ts";
import * as landlockRulesetModule from "./landlock-ruleset.ts";
import {
  buildHelperArgv,
  checkLandlockHelper,
  classifyHelper,
  classifyLandlockExit,
  composeKernelWritableSet,
  composeSpawnPlan,
  LANDLOCK_FAULT_BAND,
  LANDLOCK_FAULT_CODES,
  landlockArchToken,
  PERMISSION_DENIED_MARKER,
  parseOverlayProbeReport,
  parseProbeReport,
  renderCommandLandlockDenial,
  renderMechanismRefusal,
  resolveLandlockHelperPath,
} from "./landlock-ruleset.ts";

// ---------------------------------------------------------------------------
// Own hermetic fixtures - plain structural literals mirroring the shared
// fixture roots for downstream comparability.
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
  allowProjectWrites: true,
};

/** The empty-contract span (a real sources object with nothing declared). */
const EMPTY_CONTRACT: CapabilitySources = {
  name: "guards-demo",
  writes: [],
  allowProjectWrites: false,
};

const KEPT_A = `${SLOT_ROOT}/research/a.md`;
const KEPT_B = `${SLOT_ROOT}/research/b.md`;
const UNCOVERED = `${SLOT_ROOT}/else/nope.txt`;
/** A covered WILDCARD-PATTERN entry: survives the coverage consult as a
 * literal-text target, then dropped by the strictly-concrete filter. */
const WILD_ENTRY = `${SLOT_ROOT}/research/*.md`;

/** Guaranteed non-admitted in EVERY window below: never a fixture survivor,
 * never under WORKSPACE_CWD, never under /tmp/, never the degenerate anchors.
 * Sanctioned integration edge - the lockstep rows drive the REAL gate with
 * this target and compare its refusal bytes against the subject renderer. */
const OFF_LIST_TARGET = "/off/list/target";

interface WindowRow {
  readonly name: string;
  readonly snapshot: ExecutionSnapshot;
  /** The EXACT pinned kernel vector (order + contents). */
  readonly kernel: string[];
}

const WINDOWS: readonly WindowRow[] = [
  {
    name: "depth-0 (no span, no phase)",
    snapshot: { sources: null, phase: null, paths: PATHS },
    kernel: ["/dev"],
  },
  {
    name: "span-only (sources present, phase null - span layers NEVER admit)",
    snapshot: { sources: RESEARCH, phase: null, paths: PATHS },
    kernel: ["/dev"],
  },
  {
    name: "span-only (empty contract)",
    snapshot: { sources: EMPTY_CONTRACT, phase: null, paths: PATHS },
    kernel: ["/dev"],
  },
  {
    name: "empty-contract span + declaring phase (nothing survives the empty coverage filter - governance falls through lazily)",
    snapshot: {
      sources: EMPTY_CONTRACT,
      phase: {
        id: "lazy",
        declared: [`${SLOT_ROOT}/research/lazy.md`],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    },
    kernel: ["/dev"],
  },
  {
    name: "governing phase, mixed declarations (two covered concrete + one uncovered + one covered wildcard-pattern entry - shown to survive the coverage consult as literal text, then dropped by the concrete filter)",
    snapshot: {
      sources: RESEARCH,
      phase: {
        id: "mixed",
        declared: [KEPT_A, KEPT_B, UNCOVERED, WILD_ENTRY],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    },
    kernel: [KEPT_A, KEPT_B, "/dev"],
  },
  {
    name: "mixed declarations + scratch (appends /tmp after /dev)",
    snapshot: {
      sources: RESEARCH,
      phase: {
        id: "mixed-scratch",
        declared: [KEPT_A, KEPT_B, UNCOVERED, WILD_ENTRY],
        allowProjectWrites: false,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    },
    kernel: [KEPT_A, KEPT_B, "/dev", "/tmp"],
  },
  {
    name: "project flags agreed (no declared entries - the class term appends the workspace cwd LAST)",
    snapshot: {
      sources: RESEARCH,
      phase: {
        id: "proj",
        declared: [],
        allowProjectWrites: true,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    },
    kernel: ["/dev", WORKSPACE_CWD],
  },
  {
    name: "both classes active (pinned order: survivor before /dev before /tmp before cwd)",
    snapshot: {
      sources: RESEARCH,
      phase: {
        id: "both",
        declared: [KEPT_A],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    },
    kernel: [KEPT_A, "/dev", "/tmp", WORKSPACE_CWD],
  },
  {
    name: "dual-flag DISAGREEMENT (phase flag true, contract flag false - the class term is ABSENT)",
    snapshot: {
      sources: EMPTY_CONTRACT,
      phase: {
        id: "disagree",
        declared: [],
        allowProjectWrites: true,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    },
    kernel: ["/dev"],
  },
  {
    name: "all-uncovered declaration (empty effective construction - degrades to the machinery minimum)",
    snapshot: {
      sources: RESEARCH,
      phase: {
        id: "uncov",
        declared: [UNCOVERED],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    },
    kernel: ["/dev"],
  },
  {
    name: "null sources + scratch-bearing phase (construction coalesces internally; projectWritesActive FALSE by the clamp, scratchActive TRUE - single-flag doctrine)",
    snapshot: {
      sources: null,
      phase: {
        id: "nullsrc",
        declared: [`${SLOT_ROOT}/research/z.md`],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    },
    kernel: ["/dev", "/tmp"],
  },
  {
    name: "degenerate collision (covered survivor literally /tmp + scratch active - ONE /tmp, survivor-position-first)",
    snapshot: {
      sources: { name: "cov", writes: ["*"], allowProjectWrites: false },
      phase: {
        id: "coltmp",
        declared: ["/tmp"],
        allowProjectWrites: false,
        tmpDirAllowed: true,
      },
      // Contrived anchor pair (defensive plain-literal row - unreachable
      // through the state channel's resolved-absolute contract): an empty
      // slot root admits the literal /tmp through the coverage consult.
      paths: { projectSlotRoot: "", workspaceCwd: WORKSPACE_CWD },
    },
    kernel: ["/tmp", "/dev"],
  },
  {
    name: "degenerate anchor pair (workspaceCwd degenerate to /dev - single /dev via global dedupe)",
    snapshot: {
      sources: RESEARCH,
      phase: {
        id: "cwddev",
        declared: [],
        allowProjectWrites: true,
        tmpDirAllowed: false,
      },
      paths: { projectSlotRoot: SLOT_ROOT, workspaceCwd: "/dev" },
    },
    kernel: ["/dev"],
  },
  {
    name: "RELATIVE survivor entry (defensive plain-literal row - unreachable through the state channel; pinned as filtered out)",
    snapshot: {
      sources: {
        name: "cov",
        writes: ["rel/*.txt"],
        allowProjectWrites: false,
      },
      phase: {
        id: "rel",
        declared: ["projslot/rel/a.txt"],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: { projectSlotRoot: "projslot", workspaceCwd: WORKSPACE_CWD },
    },
    kernel: ["/dev"],
  },
];

/** Narrow a refusal loudly (row-invariant guard; the off-list target must
 * be denied in every window - an admission flips the whole table red). */
function gateReason(snapshot: ExecutionSnapshot): string {
  const verdict = decideWrite(snapshot, "write", { path: OFF_LIST_TARGET });
  if (verdict === undefined) {
    throw new Error(
      `OFF_LIST_TARGET unexpectedly admitted - the lockstep table is invalid`,
    );
  }
  return verdict.reason;
}

// ===========================================================================
// A. Kernel writable-set composition truth table
// ===========================================================================

describe("A. kernel writable-set composition (exact ordered vectors)", () => {
  it("every degenerate or non-governing window composes to EXACTLY [/dev] (never an empty vector)", () => {
    const minimums = WINDOWS.filter((row) => row.kernel.length === 1);
    expect(minimums.length).toBeGreaterThanOrEqual(5);
    for (const row of minimums) {
      expect(composeKernelWritableSet(row.snapshot), row.name).toEqual([
        "/dev",
      ]);
    }
  });

  for (const row of WINDOWS) {
    if (row.kernel.length !== 1) {
      it(`${row.name} composes to the exact pinned vector`, () => {
        expect(composeKernelWritableSet(row.snapshot)).toEqual(row.kernel);
      });
    }
  }

  it("freshness: two calls return DISTINCT array instances with equal contents", () => {
    const snapshot = WINDOWS[4].snapshot;
    const first = composeKernelWritableSet(snapshot);
    const second = composeKernelWritableSet(snapshot);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it("real SessionExecutionState (fake AnchorChannels over literal anchors): the snapshot() output shape composes end-to-end", () => {
    const state = new SessionExecutionState({
      projectSlotRoot: () => SLOT_ROOT,
      workspaceCwd: () => WORKSPACE_CWD,
    });
    expect(composeKernelWritableSet(state.snapshot())).toEqual(["/dev"]);
    state.enterCapability(RESEARCH);
    state.attachPhase(
      "mixed",
      [KEPT_A, KEPT_B, UNCOVERED, WILD_ENTRY],
      false,
      false,
    );
    expect(composeKernelWritableSet(state.snapshot())).toEqual([
      KEPT_A,
      KEPT_B,
      "/dev",
    ]);
    state.detachPhase();
    state.attachPhase("scrap", [], false, true);
    expect(composeKernelWritableSet(state.snapshot())).toEqual([
      "/dev",
      "/tmp",
    ]);
  });

  it("real SessionExecutionState at depth 0 (no spans entered): the producer hands PLAIN VALUES that compose to the machinery minimum", () => {
    const state = new SessionExecutionState({
      projectSlotRoot: () => SLOT_ROOT,
      workspaceCwd: () => WORKSPACE_CWD,
    });
    expect(state.snapshot()).toEqual({
      sources: null,
      phase: null,
      paths: { projectSlotRoot: SLOT_ROOT, workspaceCwd: WORKSPACE_CWD },
    });
  });
});

// ===========================================================================
// B. Lockstep byte-equality goldens against the gate
// ===========================================================================

describe("B. lockstep byte-equality against the real gate", () => {
  it("the fence denial line STRICT-EQUALS the real gate's refusal reason over the FULL window table (both pinned shapes; lazy fall-through included)", () => {
    for (const row of WINDOWS) {
      expect(renderCommandLandlockDenial(row.snapshot), row.name).toBe(
        gateReason(row.snapshot),
      );
    }
  });

  it("direct consumption - four element combinations vs the imported renderer fed the builder's literal outputs (the standing matrix)", () => {
    const scopeAlone: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "sh-a",
        declared: [],
        allowProjectWrites: true,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(renderCommandLandlockDenial(scopeAlone)).toBe(
      renderPhaseDenial("sh-a", [], WORKSPACE_CWD, false),
    );
    const survivorOnly: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "sh-b",
        declared: [KEPT_A],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(renderCommandLandlockDenial(survivorOnly)).toBe(
      renderPhaseDenial("sh-b", [KEPT_A], null, false),
    );
    const plusScratch: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "sh-c",
        declared: [KEPT_A],
        allowProjectWrites: false,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    };
    expect(renderCommandLandlockDenial(plusScratch)).toBe(
      renderPhaseDenial("sh-c", [KEPT_A], null, true),
    );
    const plusBoth: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "sh-d",
        declared: [KEPT_A],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    };
    expect(renderCommandLandlockDenial(plusBoth)).toBe(
      renderPhaseDenial("sh-d", [KEPT_A], WORKSPACE_CWD, true),
    );
  });

  it("universal shape: EVERY non-governing window (including the lazy fall-through phase) renders the imported constant verbatim", () => {
    const universalWindows: readonly ExecutionSnapshot[] = [
      { sources: null, phase: null, paths: PATHS },
      { sources: RESEARCH, phase: null, paths: PATHS },
      { sources: EMPTY_CONTRACT, phase: null, paths: PATHS },
      WINDOWS[3].snapshot, // empty-contract declaring phase (lazy)
      WINDOWS[9].snapshot, // all-uncovered declaration
      WINDOWS[8].snapshot, // dual-flag disagreement (empty effective)
      {
        sources: null,
        phase: {
          id: "noinc",
          declared: [`${SLOT_ROOT}/research/n.md`],
          allowProjectWrites: false,
          tmpDirAllowed: false,
        },
        paths: PATHS,
      },
    ];
    for (const snapshot of universalWindows) {
      expect(renderCommandLandlockDenial(snapshot)).toBe(
        UNIVERSAL_NO_PERMISSION_DENIAL,
      );
    }
  });

  it("glyph discipline over the MODULE source: the escaped sequence occurs at least once per pinned template (>= 11 raw-source occurrences) and NO raw U+2014 glyph appears anywhere", () => {
    const source = MODULE_SOURCE;
    expect(source.match(/\\u2014/g)?.length ?? 0).toBeGreaterThanOrEqual(11);
    const { residue, payloads, comments } = partitionForScan(source);
    for (const payload of payloads) {
      expect(payload.includes(RAW_GLYPH)).toBe(false);
    }
    expect(residue.includes(RAW_GLYPH)).toBe(false);
    for (const comment of comments) {
      expect(comment.includes(RAW_GLYPH), "em-dash-free prose").toBe(false);
    }
  });

  it("two-shapes inventory: the module introduces NO third shape (zero denial-shaped string literals defined locally - both shapes ride the import)", () => {
    const DENIAL_FRAGMENT = ["Writing", "is", "refused"].join(" ");
    expect(MODULE_SOURCE.includes(DENIAL_FRAGMENT)).toBe(false);
  });
});

// ===========================================================================
// C. Assembler goldens
// ===========================================================================

const BASH_SHELL: ShellSpec = { shell: "/bin/bash", args: ["-c"] };

describe("C. helper argv assembly (byte goldens + invalid-form matrix)", () => {
  it("ready (argv transport): the exemplar vector pinned verbatim", () => {
    expect(buildHelperArgv(["/a/b", "/dev"], BASH_SHELL, "echo hi")).toEqual({
      kind: "ready",
      argv: [
        "--write",
        "/a/b",
        "--write",
        "/dev",
        "--",
        "/bin/bash",
        "-c",
        "echo hi",
      ],
      commandViaStdin: false,
    });
  });

  it("ready (stdin transport): the command flows over the child stdin - absent from the argv tail", () => {
    expect(
      buildHelperArgv(
        ["/a/b", "/dev"],
        { ...BASH_SHELL, commandTransport: "stdin" },
        "echo hi",
      ),
    ).toEqual({
      kind: "ready",
      argv: ["--write", "/a/b", "--write", "/dev", "--", "/bin/bash", "-c"],
      commandViaStdin: true,
    });
  });

  it("multi-entry set preserves ORDER and dedupes on FIRST occurrence (mirrors the carrier's silent dedupe)", () => {
    expect(
      buildHelperArgv(["/x/y", "/a/b", "/x/y"], BASH_SHELL, "true"),
    ).toEqual({
      kind: "ready",
      argv: [
        "--write",
        "/x/y",
        "--write",
        "/a/b",
        "--",
        "/bin/bash",
        "-c",
        "true",
      ],
      commandViaStdin: false,
    });
  });

  it('commandViaStdin is true IFF the transport is the literal "stdin"', () => {
    const via = (transport?: "argv" | "stdin"): boolean => {
      const verdict = buildHelperArgv(
        ["/a"],
        { shell: "/bin/sh", args: ["-c"], commandTransport: transport },
        "x",
      );
      if (verdict.kind === "invalid") {
        throw new Error(`unexpected invalid form: ${verdict.reason}`);
      }
      return verdict.commandViaStdin;
    };
    expect(via(undefined)).toBe(false);
    expect(via("argv")).toBe(false);
    expect(via("stdin")).toBe(true);
  });

  it("INVALID (1 of 4): the empty writable set resolves to empty-writable-set (total - never throws)", () => {
    expect(buildHelperArgv([], BASH_SHELL, "x")).toEqual({
      kind: "invalid",
      reason: "empty-writable-set",
    });
  });

  it("INVALID (2 of 4): one relative entry among absolutes resolves to non-absolute-writable-entry", () => {
    expect(buildHelperArgv(["/abs", "rel/path"], BASH_SHELL, "x")).toEqual({
      kind: "invalid",
      reason: "non-absolute-writable-entry",
    });
  });

  it("INVALID (3 of 4): the empty shell string resolves to empty-shell", () => {
    expect(buildHelperArgv(["/a"], { shell: "", args: ["-c"] }, "x")).toEqual({
      kind: "invalid",
      reason: "empty-shell",
    });
  });

  it('INVALID (4 of 4): the RELATIVE-FALLBACK shell \'sh\' resolves to non-absolute-shell - the program-absoluteness row (SDK last-resort {shell:"sh",args:["-c"]} origin; refusing pre-child beats dying after restriction)', () => {
    expect(buildHelperArgv(["/a"], { shell: "sh", args: ["-c"] }, "x")).toEqual(
      {
        kind: "invalid",
        reason: "non-absolute-shell",
      },
    );
  });

  it("validation order is fixed (first violation wins): set violations beat shell violations", () => {
    expect(buildHelperArgv(["rel"], { shell: "", args: [] }, "x")).toEqual({
      kind: "invalid",
      reason: "non-absolute-writable-entry",
    });
    expect(buildHelperArgv([], { shell: "sh", args: [] }, "x")).toEqual({
      kind: "invalid",
      reason: "empty-writable-set",
    });
  });

  it("pass-through: a --write-looking command arrives VERBATIM after the FIRST -- (terminator discipline); an empty command is legal in argv transport", () => {
    expect(
      buildHelperArgv(["/a"], BASH_SHELL, "--write /fake -- echo nope"),
    ).toEqual({
      kind: "ready",
      argv: [
        "--write",
        "/a",
        "--",
        "/bin/bash",
        "-c",
        "--write /fake -- echo nope",
      ],
      commandViaStdin: false,
    });
    expect(buildHelperArgv(["/a"], BASH_SHELL, "")).toEqual({
      kind: "ready",
      argv: ["--write", "/a", "--", "/bin/bash", "-c", ""],
      commandViaStdin: false,
    });
  });

  it("no-throw guarantee: every hostile input RESOLVES to a verdict form (no row observes a thrown error)", () => {
    const hostile: Array<
      [readonly string[], { shell: string; args: readonly string[] }, string]
    > = [
      [[], BASH_SHELL, ""],
      [["", "/a"], BASH_SHELL, "x"],
      [["/a"], { shell: "", args: [] }, ""],
      [["/a", "rel"], { shell: "", args: [] }, "x"],
    ];
    for (const [set, shell, command] of hostile) {
      expect(() => buildHelperArgv(set, shell, command)).not.toThrow();
    }
  });
});

// ===========================================================================
// D. Fault vocabulary + refusal lines
// ===========================================================================

const EM = "\u2014";
const X86_PATH =
  "/root/vendor/landlock-helper/bin/x86_64-linux/landlock-helper";
const AARCH_PATH =
  "/root/vendor/landlock-helper/bin/aarch64-linux/landlock-helper";

describe("D. fault-code vocabulary + twenty-four-line refusal family", () => {
  it("table integrity mirrors the sibling suite group A: twelve pairwise-distinct nonzero codes, all inside the reserved band", () => {
    const codes = Object.values(LANDLOCK_FAULT_CODES);
    expect(new Set(codes).size).toBe(12);
    for (const code of codes) {
      expect(code).toBeGreaterThanOrEqual(LANDLOCK_FAULT_BAND[0]);
      expect(code).toBeLessThanOrEqual(LANDLOCK_FAULT_BAND[1]);
      expect(code).not.toBe(0);
    }
  });

  it("the band bounds equal the reserved low-to-high pair", () => {
    expect(LANDLOCK_FAULT_BAND).toEqual([100, 199]);
  });

  it("classifyLandlockExit totalness matrix: named classes on 100-111 (all twelve assigned), band-reserved on 112-199, command-exit everywhere else (out-of-band, negative, NaN, fractional - total over number)", () => {
    const named: Array<[number, string]> = [
      [100, "malformed-spec"],
      [101, "abi-missing-or-blocked"],
      [102, "add-rule-failure"],
      [103, "restrict-self-failure"],
      [104, "execve-failure"],
      [105, "supervisor-table-malformed"],
      [106, "realm-clone-failure"],
      [107, "realm-map-write-failure"],
      [108, "child-early-death"],
      [109, "realm-unshare-failure"],
      [110, "overlay-mount-failure"],
      [111, "overlay-umount-failure"],
    ];
    for (const [code, fault] of named) {
      expect(classifyLandlockExit(code)).toEqual({
        kind: "mechanism-fault",
        code,
        fault,
      });
    }
    for (const code of [112, 150, 199]) {
      expect(classifyLandlockExit(code)).toEqual({
        kind: "mechanism-fault",
        code,
        fault: "band-reserved",
      });
    }
    for (const code of [
      0,
      1,
      2,
      99,
      200,
      999,
      -1,
      -100,
      Number.NaN,
      100.5,
      199.9,
    ]) {
      expect(classifyLandlockExit(code)).toEqual({
        kind: "command-exit",
        code,
      });
    }
  });

  it("static refusal lines (rows 1-3 of the eleven): full-detail AND degraded-detail byte goldens - missing context degrades to placeholders, never leaks undefined", () => {
    expect(
      renderMechanismRefusal("helper-unmapped-arch", { arch: "riscv64" }),
    ).toBe(
      `Command execution refused ${EM} the Landlock fence carrier cannot be resolved for host architecture 'riscv64'; refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("helper-unmapped-arch")).toBe(
      `Command execution refused ${EM} the Landlock fence carrier cannot be resolved for host architecture 'n/a'; refusing to run unfenced.`,
    );
    expect(
      renderMechanismRefusal("helper-absent", { helperPath: AARCH_PATH }),
    ).toBe(
      `Command execution refused ${EM} the Landlock fence carrier is absent at ${AARCH_PATH}; refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("helper-absent")).toBe(
      `Command execution refused ${EM} the Landlock fence carrier is absent at n/a; refusing to run unfenced.`,
    );
    expect(
      renderMechanismRefusal("helper-not-executable", { helperPath: X86_PATH }),
    ).toBe(
      `Command execution refused ${EM} the Landlock fence carrier at ${X86_PATH} is not executable; refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("helper-not-executable")).toBe(
      `Command execution refused ${EM} the Landlock fence carrier at n/a is not executable; refusing to run unfenced.`,
    );
  });

  it("probe refusal lines (rows 4-5): identity-refused carries discovered/pinned riding; abnormal collapses the output to one physical line and degrades exit to n/a", () => {
    expect(
      renderMechanismRefusal("probe-refused", {
        discoveredAbi: 9,
        pinnedAbi: 8,
      }),
    ).toBe(
      `Command execution refused ${EM} the Landlock applicability probe reported abi=9 pin=8 (exact identity required); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("probe-refused")).toBe(
      `Command execution refused ${EM} the Landlock applicability probe reported abi=n/a pin=n/a (exact identity required); refusing to run unfenced.`,
    );
    expect(
      renderMechanismRefusal("probe-abnormal", {
        probeExit: null,
        probeOutput: "segv\n at 0x1",
      }),
    ).toBe(
      `Command execution refused ${EM} the Landlock applicability probe reported no usable verdict (exit=n/a, output=segv at 0x1); refusing to run unfenced.`,
    );
    expect(
      renderMechanismRefusal("probe-abnormal", {
        probeExit: 101,
        probeOutput: "",
      }),
    ).toBe(
      `Command execution refused ${EM} the Landlock applicability probe reported no usable verdict (exit=101, output=(no message)); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("probe-abnormal")).toBe(
      `Command execution refused ${EM} the Landlock applicability probe reported no usable verdict (exit=n/a, output=(no message)); refusing to run unfenced.`,
    );
  });

  it("C-exit class refusal lines (rows 6-10): the five machinery faults pinned verbatim with their baked-in codes", () => {
    expect(renderMechanismRefusal("malformed-spec")).toBe(
      `Command execution refused ${EM} the fence carrier rejected its own specification (fault class 'malformed-spec', exit 100); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("abi-missing-or-blocked")).toBe(
      `Command execution refused ${EM} the Landlock fence could not be established (fault class 'abi-missing-or-blocked', exit 101); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("add-rule-failure")).toBe(
      `Command execution refused ${EM} the writable allowlist could not be granted to the Landlock fence (fault class 'add-rule-failure', exit 102); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("restrict-self-failure")).toBe(
      `Command execution refused ${EM} the Landlock fence could not be applied to the spawn (fault class 'restrict-self-failure', exit 103); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("execve-failure")).toBe(
      `Command execution refused ${EM} the fenced command shell failed to start after restriction (fault class 'execve-failure', exit 104); refusing to run unfenced.`,
    );
  });

  it("supervisor-family C-exit class refusal lines (rows 11-17): the seven committed 105-111 assignments pinned verbatim with their const-block codes (single template per class, pre-child AND settlement alike)", () => {
    expect(renderMechanismRefusal("supervisor-table-malformed")).toBe(
      `Command execution refused ${EM} the supervisor mirror table was rejected before any state change (fault class 'supervisor-table-malformed', exit ${LANDLOCK_FAULT_CODES.supervisorTableMalformed}); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("realm-clone-failure")).toBe(
      `Command execution refused ${EM} the private user realm could not be cloned (fault class 'realm-clone-failure', exit ${LANDLOCK_FAULT_CODES.realmCloneFailure}); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("realm-map-write-failure")).toBe(
      `Command execution refused ${EM} the realm identity maps could not be written on the parent side (fault class 'realm-map-write-failure', exit ${LANDLOCK_FAULT_CODES.realmMapWriteFailure}); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("child-early-death")).toBe(
      `Command execution refused ${EM} the vehicle child died before the realm identity maps completed (fault class 'child-early-death', exit ${LANDLOCK_FAULT_CODES.childEarlyDeath}); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("realm-unshare-failure")).toBe(
      `Command execution refused ${EM} the private mount namespace could not be unshared inside the realm (fault class 'realm-unshare-failure', exit ${LANDLOCK_FAULT_CODES.realmUnshareFailure}); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("overlay-mount-failure")).toBe(
      `Command execution refused ${EM} the mirror overlay could not be mounted or verified through the merged view (fault class 'overlay-mount-failure', exit ${LANDLOCK_FAULT_CODES.overlayMountFailure}); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("overlay-umount-failure")).toBe(
      `Command execution refused ${EM} the throwaway probe tree could not be detached after verification (fault class 'overlay-umount-failure', exit ${LANDLOCK_FAULT_CODES.overlayUmountFailure}); refusing to run unfenced.`,
    );
  });

  it("pre-child machinery refusal lines (rows 18-24 minus band-reserved): planner-refusal, combined-probe, and scratch-machinery forms ride their measured detail slots - full-detail AND degraded-detail byte goldens", () => {
    expect(
      renderMechanismRefusal("nested-mirror", {
        mirrorInner: "/slot/a",
        mirrorOuter: "/slot",
      }),
    ).toBe(
      `Command execution refused ${EM} the planned mirror mounts nest (/slot/a beneath /slot); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("nested-mirror")).toBe(
      `Command execution refused ${EM} the planned mirror mounts nest (n/a beneath n/a); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("root-mount")).toBe(
      `Command execution refused ${EM} the spawn plan refuses a mirror mount at the filesystem root; refusing to run unfenced.`,
    );
    expect(
      renderMechanismRefusal("overlay-probe-refused", {
        combinedRealm: "fail",
        combinedStatus: "fail",
        combinedStage: "landlock-helper overlay: failed at setup (errno=1)\n",
      }),
    ).toBe(
      `Command execution refused ${EM} the combined applicability probe reported realm=fail status=fail (stage=landlock-helper overlay: failed at setup (errno=1)); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("overlay-probe-refused")).toBe(
      `Command execution refused ${EM} the combined applicability probe reported realm=n/a status=n/a (stage=(no message)); refusing to run unfenced.`,
    );
    expect(
      renderMechanismRefusal("overlay-probe-abnormal", {
        combinedProbeExit: null,
        combinedProbeOutput: "garbage\nline two",
      }),
    ).toBe(
      `Command execution refused ${EM} the combined applicability probe reported no usable verdict (exit=n/a, output=garbage line two); refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("overlay-probe-abnormal")).toBe(
      `Command execution refused ${EM} the combined applicability probe reported no usable verdict (exit=n/a, output=(no message)); refusing to run unfenced.`,
    );
    expect(
      renderMechanismRefusal("scratch-area-collision", {
        scratchCollisionDetail:
          "/slot/.fence-scratch/n-0 intersects /slot/leaf",
      }),
    ).toBe(
      `Command execution refused ${EM} the scratch area intersects a planned mirror mount (/slot/.fence-scratch/n-0 intersects /slot/leaf); refusing to run unfenced.`,
    );
    expect(
      renderMechanismRefusal("scratch-mint-failure", {
        scratchRoot: "/slot/.fence-scratch/n-1",
      }),
    ).toBe(
      `Command execution refused ${EM} the scratch triples could not be created under /slot/.fence-scratch/n-1; refusing to run unfenced.`,
    );
    expect(renderMechanismRefusal("scratch-mint-failure")).toBe(
      `Command execution refused ${EM} the scratch triples could not be created under n/a; refusing to run unfenced.`,
    );
  });

  it("band-reserved refusal line (row 11): conservative in-band reading with the pinned enforcement clause; degraded context degrades to n/a", () => {
    const full = renderMechanismRefusal("band-reserved", { exitCode: 150 });
    expect(full).toBe(
      `Command execution refused ${EM} the fenced command exited with code 150 inside the reserved fault band 100-199 (interpreted conservatively as a fence machinery fault; enforcement was active throughout).`,
    );
    expect(full).toContain("enforcement was active throughout");
    expect(renderMechanismRefusal("band-reserved")).toBe(
      `Command execution refused ${EM} the fenced command exited with code n/a inside the reserved fault band 100-199 (interpreted conservatively as a fence machinery fault; enforcement was active throughout).`,
    );
  });

  it("PERMISSION_DENIED_MARKER is the measured common substring (ASCII, whitespace-trimmed) present inside ALL THREE measured denial forms re-typed locally", () => {
    expect(PERMISSION_DENIED_MARKER).toBe("Permission denied");
    const marker = PERMISSION_DENIED_MARKER;
    for (const char of marker) {
      expect(char.charCodeAt(0) < 128, `non-ASCII byte: ${char}`).toBe(true);
    }
    expect(marker.startsWith(" ")).toBe(false);
    expect(marker.endsWith(" ")).toBe(false);
    const dashForm = `/bin/sh: 1: cannot create /out/off.txt: Permission denied`;
    const pythonForm = `[Errno 13] Permission denied`;
    const rmForm = `rm: cannot remove '/out/victim': Permission denied`;
    for (const form of [dashForm, pythonForm, rmForm]) {
      expect(form).toContain(PERMISSION_DENIED_MARKER);
    }
  });
});

// ===========================================================================
// E. Probe ABI-report line parse
// ===========================================================================

describe("E. manual probe-line parse (accept/reject, zero regex)", () => {
  it("accepts the pinned ok and fail forms with exact field extraction (discriminant-narrowed status - never a raw cast)", () => {
    expect(
      parseProbeReport("landlock-helper probe abi=8 pin=8 status=ok"),
    ).toEqual({ abi: 8, pin: 8, status: "ok" });
    const fail = parseProbeReport(
      "landlock-helper probe abi=0 pin=8 status=fail",
    );
    expect(fail).toEqual({ abi: 0, pin: 8, status: "fail" });
    if (fail !== null) {
      // The returned discriminant narrows: member access compiles only
      // because the parser builds the literal, it never widens/casts.
      expect(fail.status).toBe("fail");
    }
  });

  it("rejects every off-form sample (embedded LF, unstripped trailing terminator, CRLF, zero digits, >9-digit run, 4-token truncation, 6-token surplus, wrong program name, swapped word order, unknown status, double space, leading space)", () => {
    const rejectSamples: readonly string[] = [
      "landlock-helper probe abi=8 pin=8 status=ok\n", // embedded LF (unstripped)
      "landlock-helper probe abi=8 pin=8 status=ok\r\n", // CRLF
      "landlock-helper probe a\nbi=8 pin=8 status=ok", // mid-field newline
      "landlock-helper probe abi= pin=8 status=ok", // zero digits
      "landlock-helper probe abi=1234567890 pin=8 status=ok", // >9 digits
      "landlock-helper probe abi=8 pin=8", // 4 tokens
      "landlock-helper probe abi=8 pin=8 status=ok extra", // 6 tokens
      "fence-helper probe abi=8 pin=8 status=ok", // wrong program name
      "landlock-helper probe pin=8 abi=8 status=ok", // swapped word order
      "landlock-helper probe abi=8 pin=8 status=maybe", // unknown status
      "landlock-helper probe abi=8  pin=8 status=ok", // double space
      " landlock-helper probe abi=8 pin=8 status=ok", // leading space
    ];
    for (const sample of rejectSamples) {
      expect(parseProbeReport(sample), sample).toBeNull();
    }
  });

  it("the identity judgment is NOT the parser's job: a fail line with abi != pin parses to its fields untouched", () => {
    expect(
      parseProbeReport("landlock-helper probe abi=9 pin=8 status=fail"),
    ).toEqual({ abi: 9, pin: 8, status: "fail" });
  });

  it("documented corner (intentional strictening - NOT a lockstep binding): a 10-digit abi run refuses where the sibling suite's regex form would admit it", () => {
    expect(
      parseProbeReport("landlock-helper probe abi=1234567890 pin=8 status=ok"),
    ).toBeNull();
  });
});

// ===========================================================================
// E2. Combined-arm report-line parse (total manual, zero regex)
// ===========================================================================

describe("E2. combined-arm report-line parse (total manual, zero regex)", () => {
  it("accepts ALL FOUR syntactic cells with exact field extraction (incl. the documented-unreachable (status=ok, realm=fail) cell - the parser stays TOTAL over syntax; reachability is the consumer's concern)", () => {
    expect(
      parseOverlayProbeReport("landlock-helper overlay realm=ok status=ok"),
    ).toEqual({ realm: "ok", status: "ok" });
    const vehicleFail = parseOverlayProbeReport(
      "landlock-helper overlay realm=fail status=fail",
    );
    expect(vehicleFail).toEqual({ realm: "fail", status: "fail" });
    if (vehicleFail !== null) {
      // The returned discriminant narrows: member access compiles only
      // because the parser builds the literal, it never widens/casts.
      expect(vehicleFail.realm).toBe("fail");
      expect(vehicleFail.status).toBe("fail");
    }
    const laterStage = parseOverlayProbeReport(
      "landlock-helper overlay realm=ok status=fail",
    );
    expect(laterStage).toEqual({ realm: "ok", status: "fail" });
    expect(
      parseOverlayProbeReport("landlock-helper overlay realm=fail status=ok"),
    ).toEqual({ realm: "fail", status: "ok" });
  });

  it("rejects every off-form sample (embedded LF, CRLF, 3-token truncation, 5-token surplus, wrong program, wrong verb, unknown realm cell, unknown status cell, swapped field order, double space, leading/trailing space)", () => {
    const rejectSamples: readonly string[] = [
      "landlock-helper overlay realm=ok status=ok\n", // unstripped trailing terminator
      "landlock-helper overlay realm=ok status=ok\r\n", // CRLF
      "landlock-helper overlay realm=ok", // 3 tokens
      "landlock-helper overlay realm=ok status=ok extra", // 5 tokens
      "fence-helper overlay realm=ok status=ok", // wrong program
      "landlock-helper probe realm=ok status=ok", // wrong verb
      "landlock-helper overlay realm=maybe status=ok", // unknown realm cell
      "landlock-helper overlay realm=ok status=maybe", // unknown status cell
      "landlock-helper overlay status=ok realm=ok", // swapped field order
      "landlock-helper overlay realm=ok  status=ok", // double space
      " landlock-helper overlay realm=ok status=ok", // leading space
      "landlock-helper overlay realm=ok status=ok ", // trailing space
      "landlock-helper overlay REalm=ok status=ok", // case-sensitive refusal
    ];
    for (const sample of rejectSamples) {
      expect(parseOverlayProbeReport(sample), sample).toBeNull();
    }
  });

  it("the ok-cell judgment is NOT the parser's job: a realm=fail/status=fail line parses to its fields untouched (the latch reads exit + line and decides nothing here)", () => {
    expect(
      parseOverlayProbeReport(
        "landlock-helper overlay realm=fail status=fail",
      ) !== null,
    ).toBe(true);
  });
});

// ===========================================================================
// F. Resolver + static classify (launcher-trio posture)
// ===========================================================================

const HOST_TOKEN = landlockArchToken(process.arch);
const RESOLVED_DEFAULT = resolveLandlockHelperPath();
const SUITE_PKG_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DEFAULT_TAIL =
  HOST_TOKEN === null
    ? ""
    : `vendor/landlock-helper/bin/${HOST_TOKEN}-linux/landlock-helper`;

describe("F. helper-path resolver + static classify", () => {
  it("the corrected Node-arch-to-convention-token mapping pins x64/arm64 and refuses exotic arches (load-bearing - Node does NOT report uname -m tokens)", () => {
    expect(landlockArchToken("x64")).toBe("x86_64");
    expect(landlockArchToken("arm64")).toBe("aarch64");
    expect(landlockArchToken("ia32")).toBeNull();
    expect(landlockArchToken("riscv64")).toBeNull();
    expect(landlockArchToken("")).toBeNull();
  });

  it("pure resolution goldens over BOTH tokens with a literal package root (same literals the sibling suite pins for its replica) + null on exotic arch", () => {
    expect(resolveLandlockHelperPath("x64", "/root")).toBe(X86_PATH);
    expect(resolveLandlockHelperPath("arm64", "/root")).toBe(AARCH_PATH);
    expect(resolveLandlockHelperPath("ia32", "/root")).toBeNull();
  });

  it("default arguments resolve against the REAL package root + host architecture (shape assertion only - never the host's provisioning luck)", () => {
    if (HOST_TOKEN === null) {
      expect(RESOLVED_DEFAULT).toBeNull();
      return;
    }
    if (RESOLVED_DEFAULT === null) {
      throw new Error(`mapped host (${HOST_TOKEN}) must resolve a path`);
    }
    expect(RESOLVED_DEFAULT.startsWith(SUITE_PKG_ROOT)).toBe(true);
    expect(RESOLVED_DEFAULT.endsWith(DEFAULT_TAIL)).toBe(true);
  });

  it("ORDER-FIXED classify: unmapped beats a plausible mode, unreadable stat beats exec-bit, any single exec bit suffices", () => {
    const P = "/carriers/landlock-helper";
    expect(
      classifyHelper({ arch: "riscv64", path: null, mode: 0o755 }),
    ).toEqual({
      ok: false,
      reason: "helper-unmapped-arch",
      arch: "riscv64",
    });
    expect(classifyHelper({ arch: "x64", path: P, mode: undefined })).toEqual({
      ok: false,
      reason: "helper-absent",
      path: P,
    });
    expect(classifyHelper({ arch: "x64", path: P, mode: 0o644 })).toEqual({
      ok: false,
      reason: "helper-not-executable",
      path: P,
    });
    expect(classifyHelper({ arch: "x64", path: P, mode: 0o000 })).toEqual({
      ok: false,
      reason: "helper-not-executable",
      path: P,
    });
    for (const mode of [0o100, 0o010, 0o001, 0o755]) {
      expect(classifyHelper({ arch: "x64", path: P, mode })).toEqual({
        ok: true,
        path: P,
      });
    }
  });

  it(`seam-driven ladder over the REAL default path (host: ${HOST_TOKEN ?? `${process.arch} unmapped`}) injected stat seams hold the absent/not-executable/ready ladder - unmapped hosts hold the loud unmapped form instead`, () => {
    const absentConsult = checkLandlockHelper({ statMode: () => undefined });
    const notExecConsult = checkLandlockHelper({ statMode: () => 0o644 });
    const readyConsult = checkLandlockHelper({ statMode: () => 0o755 });
    if (HOST_TOKEN === null) {
      const unmapped = {
        ok: false,
        reason: "helper-unmapped-arch",
        arch: process.arch,
      };
      expect(absentConsult).toEqual(unmapped);
      expect(notExecConsult).toEqual(unmapped);
      expect(readyConsult).toEqual(unmapped);
      return;
    }
    expect(absentConsult).toEqual({
      ok: false,
      reason: "helper-absent",
      path: RESOLVED_DEFAULT,
    });
    expect(notExecConsult).toEqual({
      ok: false,
      reason: "helper-not-executable",
      path: RESOLVED_DEFAULT,
    });
    expect(readyConsult).toEqual({ ok: true, path: RESOLVED_DEFAULT });
  });

  // THE host-conditional real-prebuild row (standing degradation posture):
  // skips WITH SURFACED REASON when the host token is unmapped or the
  // committed prebuild is absent/unusable HERE; the loud-classification
  // assertions above still hold everywhere. Never fails on an unprovisioned
  // host.
  function describeConsultFailure(consult: HelperCheck): string {
    if (consult.ok) return "none";
    if (consult.reason === "helper-unmapped-arch") {
      return `host architecture ${consult.arch} is outside the x86_64/aarch64 convention (no prebuild exists)`;
    }
    return `prebuild unusable at ${consult.path} (${consult.reason})`;
  }
  const REAL_CONSULT = checkLandlockHelper();
  const REAL_SKIP_REASON = describeConsultFailure(REAL_CONSULT);
  const realNote =
    REAL_SKIP_REASON === "none" ? "" : ` [skipped: ${REAL_SKIP_REASON}]`;

  it.skipIf(REAL_SKIP_REASON !== "none")(
    `real default-seam consult on THIS host is ready with the exact conventional path${realNote}`,
    () => {
      expect(REAL_CONSULT).toEqual({ ok: true, path: RESOLVED_DEFAULT });
      if (HOST_TOKEN !== null && RESOLVED_DEFAULT !== null) {
        expect(RESOLVED_DEFAULT.endsWith(DEFAULT_TAIL)).toBe(true);
      }
    },
  );
});

// ===========================================================================
// G. Parity rows against the sibling suite-local replicas
// ===========================================================================
// Maintenance symmetry acknowledged in the banner: if the sibling const
// block ever reshapes (renamed keys, reformatted tuples), the needles here
// follow in the same change (house lockstep idiom). Value drift is caught
// either way by the bidirectional needle trap; only a pure FORM change
// requires needle adaptation.

const SIBLING_SOURCE = readFileSync(
  new URL("./landlock-helper.test.ts", import.meta.url),
  "utf8",
);

const FAULT_KEY_ORDER = [
  "malformedSpec",
  "abiMissingOrBlocked",
  "addRuleFailure",
  "restrictSelfFailure",
  "execveFailure",
  "supervisorTableMalformed",
  "realmCloneFailure",
  "realmMapWriteFailure",
  "childEarlyDeath",
  "realmUnshareFailure",
  "overlayMountFailure",
  "overlayUmountFailure",
] as const;

describe("G. parity binding to the sibling suite-local const block", () => {
  it("fault-code needles (bidirectional drift trap): every production key/value pair occurs verbatim in the sibling source", () => {
    for (const key of FAULT_KEY_ORDER) {
      const needle = `${key}: ${LANDLOCK_FAULT_CODES[key]}`;
      expect(SIBLING_SOURCE.includes(needle), needle).toBe(true);
    }
  });

  it("band needle + convention needles occur in the sibling source, and the production resolver reproduces the sibling group-A golden expectations VERBATIM over the same literal inputs", () => {
    const bandNeedle = `[${LANDLOCK_FAULT_BAND[0]}, ${LANDLOCK_FAULT_BAND[1]}]`;
    expect(SIBLING_SOURCE.includes(bandNeedle)).toBe(true);
    for (const fragment of ["vendor", "landlock-helper", "bin", "-linux"]) {
      expect(SIBLING_SOURCE.includes(fragment)).toBe(true);
    }
    expect(resolveLandlockHelperPath("x64", "/root")).toBe(
      "/root/vendor/landlock-helper/bin/x86_64-linux/landlock-helper",
    );
    expect(resolveLandlockHelperPath("arm64", "/root")).toBe(
      "/root/vendor/landlock-helper/bin/aarch64-linux/landlock-helper",
    );
  });

  it("arch-mapping parity: behavioral equivalence over the four pinned inputs with the sibling expected outputs re-typed locally + the four arch-token literals present in the sibling source", () => {
    const samples: Array<[string, string | null]> = [
      ["x64", "x86_64"],
      ["arm64", "aarch64"],
      ["ia32", null],
      ["riscv64", null],
    ];
    for (const [input, expected] of samples) {
      expect(landlockArchToken(input), input).toBe(expected);
    }
    for (const token of ["x86_64", "aarch64", "x64", "arm64"]) {
      expect(SIBLING_SOURCE.includes(token)).toBe(true);
    }
  });

  it("probe-grammar parity: the production parser's accept/reject verdicts EQUAL the sibling suite's grammar-row sample outcomes over the shared sample set", () => {
    const samples: Array<[string, boolean]> = [
      ["landlock-helper probe abi=8 pin=8 status=ok", true],
      ["landlock-helper probe abi=0 pin=8 status=fail", true],
      ["landlock-helper probe abi=8 pin=8 status=maybe", false],
      ["landlock-helper probe abi=8 pin=8 status=ok extra", false],
      ["fence-helper probe abi=8 pin=8 status=ok", false],
    ];
    for (const [line, accepts] of samples) {
      expect(parseProbeReport(line) !== null, line).toBe(accepts);
    }
  });
});

// ===========================================================================
// H. Mechanical source-guard charter over the module's OWN source
// ===========================================================================

const MODULE_SOURCE = readFileSync(
  new URL("./landlock-ruleset.ts", import.meta.url),
  "utf8",
);

/** Compact comment/literal-aware scan (house partitionForScan precedent,
 * extended with a comment capture for the em-dash-free-prose row) - prose
 * comments elide into `comments`, every string/template literal consumes to
 * its close quote HONORING BACKSLASH ESCAPES (raw interior recorded in
 * `payloads`, escapes intact) and blanks in the residue. Soundness rests on
 * the ZERO-SLASH-IN-RESIDUE pin below - restored EXPLICITLY because this
 * module ships ZERO regex literals, making the idiom safe by construction. */
function partitionForScan(source: string): {
  residue: string;
  payloads: string[];
  comments: string[];
} {
  const payloads: string[] = [];
  const comments: string[] = [];
  let residue = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      comments.push(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      comments.push(source.slice(i, stop));
      i = stop;
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
  return { residue, payloads, comments };
}

const RAW_GLYPH = String.fromCharCode(0x2014);
const SDK_SPECIFIER = ["@earendil-works", "pi-coding-agent"].join("/");
const CAST_TOKEN = ["a", "s"].join("");
const GATE_EDGE_FRAGMENT = "write-gate";

/** Dev-process-marker needles (fragments assembled at runtime - self-match
 * proof): step attribution, planning-doc references, section signs, and
 * date tokens must never leak into a production module. */
const DEV_PROCESS_MARKERS: string[] = [
  "\\bstep" + "\\s+\\d",
  "\\bS0" + "\\d\\b",
  "\\bD#" + "\\d",
  "\u00a7",
  "(?:TASK|PLAN)\\." + "md",
  "\\bskeleton" + "\\b",
  "\\b20" + "\\d{2}-\\d{2}-\\d{2}\\b",
];

const VALUE_EXPORT_NAMES = [
  "LANDLOCK_FAULT_BAND",
  "LANDLOCK_FAULT_CODES",
  "PERMISSION_DENIED_MARKER",
  "buildHelperArgv",
  "checkLandlockHelper",
  "classifyHelper",
  "classifyLandlockExit",
  "composeKernelWritableSet",
  "composeSpawnPlan",
  "landlockArchToken",
  "parseOverlayProbeReport",
  "parseProbeReport",
  "renderCommandLandlockDenial",
  "renderMechanismRefusal",
  "resolveLandlockHelperPath",
];

const TYPE_EXPORT_NAMES = [
  "AssignedFaultClass",
  "ArgvInvalidReason",
  "HelperArgvVerdict",
  "HelperCheck",
  "HelperObservations",
  "HelperStatSeams",
  "LandlockExitVerdict",
  "MechanismFault",
  "OverlayProbeReport",
  "ProbeFaultKind",
  "ProbeReport",
  "RefusalContext",
  "ShellSpec",
  "SpawnPlanVerdict",
  "StaticFaultKind",
];

describe("H. mechanical source-guard charter over landlock-ruleset.ts", () => {
  it("scanner soundness pins: ZERO slash survives the elision (zero regex literals - restored explicitly), zero `as` assertion casts in the residue, NO class declarations, zero SDK specifier", () => {
    const { residue } = partitionForScan(MODULE_SOURCE);
    expect(residue.includes("/"), "zero-slash-in-residue").toBe(false);
    expect(residue.match(new RegExp(`\\b${CAST_TOKEN}\\b`, "g"))).toBeNull();
    expect(residue.match(/\bclass\b/g)).toBeNull();
    expect(MODULE_SOURCE.includes(SDK_SPECIFIER)).toBe(false);
  });

  it("runtime namespace surface pin: Object.keys sorted equals EXACTLY the FIFTEEN value exports (alphabetized)", () => {
    expect(Object.keys(landlockRulesetModule).sort()).toEqual(
      VALUE_EXPORT_NAMES,
    );
  });

  it("declarative export names pin: the fifteen values PLUS the fifteen pinned type/interface names (thirty declarative exports)", () => {
    const declared = [
      ...MODULE_SOURCE.matchAll(
        /^export\s+(?:interface|type|const|function)\s+([A-Za-z_$][\w$]*)/gm,
      ),
    ].map((match) => match[1]);
    expect(declared.length).toBe(30);
    expect([...VALUE_EXPORT_NAMES, ...TYPE_EXPORT_NAMES].sort()).toEqual(
      declared.sort(),
    );
  });

  it("import partition pins (statement-aware, whitespace-normalized - Biome-wrap hazard): value partition EXACTLY the pinned five specifiers; type-only partition EXACTLY the pinned pair IN SOURCE ORDER (the formatter's canonical placement puts each type clause adjacent to its value clause); every clause's names pinned per specifier", () => {
    const normalized = MODULE_SOURCE.replace(/\s+/g, " ");
    const clauses = [
      ...normalized.matchAll(
        /import\s+(type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)"/g,
      ),
    ].map((match) => ({
      typeOnly: match[1] !== undefined,
      names: match[2]
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
      specifier: match[3],
    }));
    expect(
      clauses.filter((clause) => !clause.typeOnly).map((c) => c.specifier),
    ).toEqual([
      "node:fs",
      "node:path",
      "../../constants.ts",
      "../../denial-vocabulary.ts",
      "../../permission-mechanics.ts",
    ]);
    expect(
      clauses.filter((clause) => clause.typeOnly).map((c) => c.specifier),
    ).toEqual([
      "../../permission-mechanics.ts",
      "../../session-execution-state.ts",
    ]);
    const namesOf = (specifier: string, typeOnly: boolean): string[] => {
      const clause = clauses.find(
        (c) => c.specifier === specifier && c.typeOnly === typeOnly,
      );
      return clause === undefined ? [] : clause.names;
    };
    expect(namesOf("node:fs", false)).toEqual(["statSync"]);
    expect(namesOf("node:path", false)).toEqual(["join"]);
    expect(namesOf("../../constants.ts", false)).toEqual(["PIO_PACKAGE_ROOT"]);
    expect(namesOf("../../denial-vocabulary.ts", false)).toEqual([
      "renderPhaseDenial",
      "UNIVERSAL_NO_PERMISSION_DENIAL",
    ]);
    expect(namesOf("../../permission-mechanics.ts", false)).toEqual([
      "materializeEffectiveSet",
    ]);
    expect(namesOf("../../permission-mechanics.ts", true)).toEqual([
      "EffectiveSet",
    ]);
    expect(namesOf("../../session-execution-state.ts", true)).toEqual([
      "ExecutionSnapshot",
    ]);
  });

  it("edge elimination + node: purity ledger: zero write-gate occurrences (the eliminated tools-to-guards predicate edge stays eliminated); the module's node: specifier set is EXACTLY {node:fs, node:path}", () => {
    expect(MODULE_SOURCE.includes(GATE_EDGE_FRAGMENT)).toBe(false);
    const nodeSpecifiers = [
      ...new Set(
        [...MODULE_SOURCE.matchAll(/"node:[a-z]+"/g)].map((m) => m[0]),
      ),
    ].sort();
    expect(nodeSpecifiers).toEqual(['"node:fs"', '"node:path"']);
  });

  it("dev-process-marker hygiene: no plan-step/goal/spec-version/owner-ruling/kickoff identifiers in shipped comments (mechanically scanned per the house pattern set)", () => {
    for (const pattern of DEV_PROCESS_MARKERS) {
      expect(
        MODULE_SOURCE.match(new RegExp(pattern, "gi")),
        `marker slipped through: ${pattern}`,
      ).toBeNull();
    }
  });
});

// ===========================================================================
// I. Per-spawn spawn-plan materializer
// ===========================================================================

const ENV_RESEARCH = `${SLOT_ROOT}/research`; // the shared leaf envelope dir
const LEAF_A_MD = `${ENV_RESEARCH}/leaf-a.md`; // absent-on-host fixture literal
const LEAF_B_MD = `${ENV_RESEARCH}/leaf-b.md`;
const NESTED_ENV = `${ENV_RESEARCH}/sub`; // the nested envelope (deep-leaf home)
const NESTED_LEAF = `${NESTED_ENV}/leaf-deep.md`;
const ELSE_DIR = `${SLOT_ROOT}/else`;
const DIR_DECL = `${ELSE_DIR}/plain-dir`; // directory-shaped declaration token (files-only: a leaf)
const TREE_A = `${SLOT_ROOT}/tree`;
const TREE_AB = `${TREE_A}/b`;
const TREE_ABC = `${TREE_AB}/c`;
const DEV_LEAF = "/dev/carrier-note"; // contrived absolute (defensive row)
const TMP_LEAF = "/tmp/planner-scratch.dat";
const CWD_LEAF = `${WORKSPACE_CWD}/ws-leaf.md`;
const ROOT_LEAF = "/topfile.dat"; // contrived direct-under-root leaf

describe("I. per-spawn spawn-plan materializer (pure planner beside the composer)", () => {
  it("pattern-only frame (every survivor is wildcard-pattern text): ready, NOT engaged, empty mounts, vector IDENTICAL to the shipped composer (with and without class tokens active)", () => {
    const snapshot: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "patt",
        declared: [WILD_ENTRY],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(composeSpawnPlan(snapshot)).toEqual({
      kind: "ready",
      engaged: false,
      mirrorMounts: [],
      kernelVector: ["/dev"],
    });
    const classActive: ExecutionSnapshot = {
      sources: RESEARCH,
      phase: {
        id: "patt-classes",
        declared: [WILD_ENTRY],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    };
    expect(composeSpawnPlan(classActive)).toEqual({
      kind: "ready",
      engaged: false,
      mirrorMounts: [],
      kernelVector: ["/dev", "/tmp", WORKSPACE_CWD],
    });
  });

  it("single leaf: engaged, the leaf ABSENT from the vector, its containing dir PRESENT at the survivor position", () => {
    const snapshot: ExecutionSnapshot = {
      sources: {
        name: "planfix",
        writes: ["research/leaf-a.md"],
        allowProjectWrites: false,
      },
      phase: {
        id: "one",
        declared: [LEAF_A_MD],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    const verdict = composeSpawnPlan(snapshot);
    expect(verdict).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: [ENV_RESEARCH],
      kernelVector: [ENV_RESEARCH, "/dev"],
    });
    if (verdict.kind !== "ready") throw new Error("expected the ready form");
    expect(verdict.kernelVector).not.toContain(LEAF_A_MD);
  });

  it("multiple leaves sharing one directory: ONE deduped mount, ONE deduped envelope (first-occurrence mirroring the composer)", () => {
    const snapshot: ExecutionSnapshot = {
      sources: {
        name: "planfix",
        writes: ["research/leaf-a.md", "research/leaf-b.md"],
        allowProjectWrites: false,
      },
      phase: {
        id: "two",
        declared: [LEAF_A_MD, LEAF_B_MD],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(composeSpawnPlan(snapshot)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: [ENV_RESEARCH],
      kernelVector: [ENV_RESEARCH, "/dev"],
    });
  });

  it("directory-shaped declaration token ENGAGES as a file leaf under the files-only invariant (no on-disk consultation - mount + envelope derive purely from the declared token, whatever its real-world state)", () => {
    const snapshot: ExecutionSnapshot = {
      sources: {
        name: "planfix",
        writes: ["else/plain-dir"],
        allowProjectWrites: false,
      },
      phase: {
        id: "dirdecl",
        declared: [DIR_DECL],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    const verdict = composeSpawnPlan(snapshot);
    expect(verdict).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: [ELSE_DIR],
      kernelVector: [ELSE_DIR, "/dev"],
    });
    if (verdict.kind !== "ready") throw new Error("expected the ready form");
    expect(verdict.kernelVector).not.toContain(DIR_DECL);
  });

  it("mixed leaf + directory-shaped token + pattern window composes to the exact pinned vector (files-only: every strictly-concrete declaration engages as a leaf, the pattern text drops at the concrete filter; order-sensitive golden - envelopes sit IN PLACE at their survivor slots, before the class tokens)", () => {
    const mixSources = {
      name: "planfix-mix",
      writes: ["research/leaf-a.md", "else/plain-dir", "research/*.md"],
      allowProjectWrites: false,
    };
    const snapshot: ExecutionSnapshot = {
      sources: mixSources,
      phase: {
        id: "mix",
        declared: [LEAF_A_MD, DIR_DECL, WILD_ENTRY],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(composeSpawnPlan(snapshot)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: [ENV_RESEARCH, ELSE_DIR],
      kernelVector: [ENV_RESEARCH, ELSE_DIR, "/dev"],
    });
    const classActive: ExecutionSnapshot = {
      sources: { ...mixSources, allowProjectWrites: true },
      phase: {
        id: "mix-classes",
        declared: [LEAF_A_MD, DIR_DECL, WILD_ENTRY],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    };
    expect(composeSpawnPlan(classActive)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: [ENV_RESEARCH, ELSE_DIR],
      kernelVector: [ENV_RESEARCH, ELSE_DIR, "/dev", "/tmp", WORKSPACE_CWD],
    });
  });

  it("survivor-order placement over mixed declarations (the first-declared token's envelope leads, later envelopes follow in place, class additions trail)", () => {
    const snapshot: ExecutionSnapshot = {
      sources: {
        name: "planfix-order",
        writes: ["else/plain-dir", "research/leaf-a.md"],
        allowProjectWrites: true,
      },
      phase: {
        id: "order",
        declared: [DIR_DECL, LEAF_A_MD],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: PATHS,
    };
    expect(composeSpawnPlan(snapshot)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: [ELSE_DIR, ENV_RESEARCH],
      kernelVector: [ELSE_DIR, ENV_RESEARCH, "/dev", "/tmp", WORKSPACE_CWD],
    });
  });

  it("camp partition over the FULL WINDOWS table (planner vs composer lockstep without any filesystem reading): windows with no strictly-concrete survivor resolve ready-not-engaged with the vector element-for-equal to composeKernelWritableSet; windows with one resolve ready-and-engaged over their deduped envelope mounts; the contrived literal-/tmp window refuses root-mount TYPED (the files-only posture receipt at suite level)", () => {
    const notEngaged: readonly number[] = [0, 1, 2, 3, 6, 8, 9, 10, 13];
    for (const index of notEngaged) {
      const row = WINDOWS[index]!;
      const verdict = composeSpawnPlan(row.snapshot);
      expect(verdict.kind, row.name).toBe("ready");
      if (verdict.kind !== "ready") throw new Error("unreachable");
      expect(verdict.engaged, row.name).toBe(false);
      expect(verdict.mirrorMounts, row.name).toEqual([]);
      expect(verdict.kernelVector, row.name).toEqual(
        composeKernelWritableSet(row.snapshot),
      );
    }
    expect(composeSpawnPlan(WINDOWS[4]!.snapshot)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: [ENV_RESEARCH],
      kernelVector: [ENV_RESEARCH, "/dev"],
    });
    expect(composeSpawnPlan(WINDOWS[5]!.snapshot)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: [ENV_RESEARCH],
      kernelVector: [ENV_RESEARCH, "/dev", "/tmp"],
    });
    expect(composeSpawnPlan(WINDOWS[7]!.snapshot)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: [ENV_RESEARCH],
      kernelVector: [ENV_RESEARCH, "/dev", "/tmp", WORKSPACE_CWD],
    });
    // The degenerate-collision window declares the literal /tmp: its
    // containing dir IS the real root - the root-mount refusal arm settles
    // the typed form while the composer still carries the raw entry (the
    // two surfaces diverge exactly where the overlay cannot be mounted).
    expect(composeSpawnPlan(WINDOWS[11]!.snapshot)).toEqual({
      kind: "root-mount",
    });
  });

  it("nested mounts refuse TYPED with the DETERMINISTIC first-hit pair (inner = the deeper mount point, outer = its covering planned ancestor)", () => {
    const snapshot: ExecutionSnapshot = {
      sources: {
        name: "planfix-nest",
        writes: ["research/leaf-a.md", "research/sub/leaf-deep.md"],
        allowProjectWrites: false,
      },
      phase: {
        id: "nest",
        declared: [LEAF_A_MD, NESTED_LEAF],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(composeSpawnPlan(snapshot)).toEqual({
      kind: "nested-mirror",
      inner: NESTED_ENV,
      outer: ENV_RESEARCH,
    });
  });

  it("multi-candidate matrix: the FIRST scanning hit wins (a deep chain reports its shallowest enclosing pair first; the candidate order follows the declaration order)", () => {
    const treeSources = {
      name: "planfix-tree",
      writes: ["tree/x.md", "tree/b/y.md", "tree/b/c/z.md"],
      allowProjectWrites: false,
    };
    const forward: ExecutionSnapshot = {
      sources: treeSources,
      phase: {
        id: "chain-f",
        declared: [`${TREE_A}/x.md`, `${TREE_AB}/y.md`, `${TREE_ABC}/z.md`],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(composeSpawnPlan(forward)).toEqual({
      kind: "nested-mirror",
      inner: TREE_AB,
      outer: TREE_A,
    });
    const reversed: ExecutionSnapshot = {
      sources: treeSources,
      phase: {
        id: "chain-r",
        declared: [`${TREE_ABC}/z.md`, `${TREE_AB}/y.md`, `${TREE_A}/x.md`],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    expect(composeSpawnPlan(reversed)).toEqual({
      kind: "nested-mirror",
      inner: TREE_ABC,
      outer: TREE_AB,
    });
  });

  it("sibling-prefix pair (/a/b vs /ab) is NOT nested: the boundary prefix demands the separator (defensive plain-literal row)", () => {
    const snapshot: ExecutionSnapshot = {
      sources: {
        name: "rootfix",
        writes: ["a/b/probe.md", "ab/probe.md"],
        allowProjectWrites: false,
      },
      phase: {
        id: "sib",
        declared: ["/a/b/probe.md", "/ab/probe.md"],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: { projectSlotRoot: "", workspaceCwd: WORKSPACE_CWD },
    };
    expect(composeSpawnPlan(snapshot)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: ["/a/b", "/ab"],
      kernelVector: ["/a/b", "/ab", "/dev"],
    });
  });

  it("direct-under-root leaf: the root-mount REFUSAL ARM (defensive plain-literal row - unreachable through the resolved-absolute contract; refuses TYPED rather than planning an overlay over the real root)", () => {
    const snapshot: ExecutionSnapshot = {
      sources: {
        name: "rootfix",
        writes: ["topfile.dat"],
        allowProjectWrites: false,
      },
      phase: {
        id: "rooty",
        declared: [ROOT_LEAF],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: { projectSlotRoot: "", workspaceCwd: WORKSPACE_CWD },
    };
    expect(composeSpawnPlan(snapshot)).toEqual({ kind: "root-mount" });
  });

  it("root check BEATS the nested scan: a mount set holding / plus a nested pair resolves root-mount, never the spurious nested pair (fixed cheap-first order)", () => {
    const snapshot: ExecutionSnapshot = {
      sources: {
        name: "rootfix",
        writes: ["solo.md", "r1/a.md", "r1/r2/b.md"],
        allowProjectWrites: false,
      },
      phase: {
        id: "root-beats-nested",
        declared: ["/solo.md", "/r1/a.md", "/r1/r2/b.md"],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: { projectSlotRoot: "", workspaceCwd: WORKSPACE_CWD },
    };
    expect(composeSpawnPlan(snapshot)).toEqual({
      kind: "root-mount",
    });
  });

  it("the /dev floor holds on EVERY ready plan and engaged === the non-emptyness of the mirror mounts (asserted across the whole WINDOWS table over the pure planner, engaged shapes included; the depth-0/span-only windows degrade to ready-not-engaged [/dev])", () => {
    for (const row of WINDOWS) {
      const verdict = composeSpawnPlan(row.snapshot);
      if (verdict.kind !== "ready") continue;
      expect(verdict.kernelVector, row.name).toContain("/dev");
      expect(verdict.engaged, row.name).toBe(verdict.mirrorMounts.length > 0);
    }
    for (const index of [0, 1, 2]) {
      expect(composeSpawnPlan(WINDOWS[index].snapshot)).toEqual({
        kind: "ready",
        engaged: false,
        mirrorMounts: [],
        kernelVector: ["/dev"],
      });
    }
  });

  it("envelope-vs-class dedupe collisions: a SINGLE occurrence, and the envelope position WINS when earlier (three contrived corners: /dev, /tmp under scratch, workspaceCwd under agreed flags)", () => {
    const devLeaf: ExecutionSnapshot = {
      sources: {
        name: "rootfix",
        writes: ["dev/carrier-note"],
        allowProjectWrites: false,
      },
      phase: {
        id: "coll-dev",
        declared: [DEV_LEAF],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: { projectSlotRoot: "", workspaceCwd: WORKSPACE_CWD },
    };
    expect(composeSpawnPlan(devLeaf)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: ["/dev"],
      kernelVector: ["/dev"],
    });
    const tmpLeaf: ExecutionSnapshot = {
      sources: {
        name: "rootfix",
        writes: ["tmp/planner-scratch.dat"],
        allowProjectWrites: false,
      },
      phase: {
        id: "coll-tmp",
        declared: [TMP_LEAF],
        allowProjectWrites: false,
        tmpDirAllowed: true,
      },
      paths: { projectSlotRoot: "", workspaceCwd: WORKSPACE_CWD },
    };
    expect(composeSpawnPlan(tmpLeaf)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: ["/tmp"],
      kernelVector: ["/tmp", "/dev"],
    });
    const cwdLeaf: ExecutionSnapshot = {
      sources: {
        name: "rootfix",
        writes: ["workspace/proj-x/ws-leaf.md"],
        allowProjectWrites: true,
      },
      phase: {
        id: "coll-cwd",
        declared: [CWD_LEAF],
        allowProjectWrites: true,
        tmpDirAllowed: false,
      },
      paths: { projectSlotRoot: "", workspaceCwd: WORKSPACE_CWD },
    };
    expect(composeSpawnPlan(cwdLeaf)).toEqual({
      kind: "ready",
      engaged: true,
      mirrorMounts: [WORKSPACE_CWD],
      kernelVector: [WORKSPACE_CWD, "/dev"],
    });
  });

  it("freshness: two calls return DISTINCT instances with equal contents (per-spawn fresh materialize doctrine - no memoization anywhere; the pure planner rebuilds every array on every invocation)", () => {
    const snapshot: ExecutionSnapshot = {
      sources: {
        name: "planfix-fresh",
        writes: ["research/leaf-a.md", "else/plain-dir"],
        allowProjectWrites: false,
      },
      phase: {
        id: "fresh",
        declared: [LEAF_A_MD, DIR_DECL],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: PATHS,
    };
    const first = composeSpawnPlan(snapshot);
    const second = composeSpawnPlan(snapshot);
    expect(second).toEqual(first);
    if (first.kind !== "ready" || second.kind !== "ready") {
      throw new Error("expected the ready form");
    }
    expect(second).not.toBe(first);
    expect(second.kernelVector).not.toBe(first.kernelVector);
    expect(second.mirrorMounts).not.toBe(first.mirrorMounts);
  });

  it("hostile inputs RESOLVE to result forms (degenerate anchors, relative survivors, empty declarations, null-source-with-phase, phase-null, degenerate workspaceCwd): no row observes a throw - the pure planner carries no seams at all", () => {
    const hostile: readonly ExecutionSnapshot[] = [
      {
        sources: RESEARCH,
        phase: {
          id: "hostile-degen",
          declared: [KEPT_A],
          allowProjectWrites: true,
          tmpDirAllowed: true,
        },
        paths: { projectSlotRoot: "", workspaceCwd: "" },
      },
      WINDOWS[13].snapshot, // relative survivor (defensive plain-literal row)
      {
        sources: RESEARCH,
        phase: {
          id: "hostile-empty",
          declared: [],
          allowProjectWrites: true,
          tmpDirAllowed: true,
        },
        paths: PATHS,
      },
      WINDOWS[10].snapshot, // null sources + declaring phase
      WINDOWS[0].snapshot, // phase null (depth 0)
      WINDOWS[12].snapshot, // degenerate workspaceCwd = /dev
    ];
    for (const snapshot of hostile) {
      let verdict: SpawnPlanVerdict | undefined;
      expect(() => {
        verdict = composeSpawnPlan(snapshot);
      }).not.toThrow();
      if (verdict === undefined) throw new Error("plan never ran");
      expect(["ready", "nested-mirror", "root-mount"]).toContain(verdict.kind);
    }
  });
});
