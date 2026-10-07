import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Hermetic syscall suite for the vendored Landlock fence helper.
 *
 * Posture (same as sandbox/launcher.test.ts driving real bwrap): drives the
 * REAL prebuilt binary against the REAL kernel. "Hermetic" here means no
 * network, no SDK, no $HOME access, mkdtemp-isolated targets. The
 * module-scope capability gate runs ONE --probe on the provisioned host;
 * positive-enforcement rows skip WITH SURFACED REASON on unprovisioned
 * hosts, while the classification rows STILL HOLD there. Every skip title
 * carries its reason; every row asserts EXACT bytes/codes (no soft matches);
 * a wall-clock guard makes hangs FAIL loudly, never skip.
 */

/** Pio package root - one level above src/ (mirrors the constants.ts
 * construction; the suite-local derivation is intentional - the production
 * resolver in the TS layer binds to this replica through parity rows). */
const PKG_ROOT = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);

/** Suite-local replica const block (lockstep home - the production resolver's
 * parity rows assert its constants match these replicas). EVERY exit-code
 * assertion in this file references this block; raw band literals occur
 * nowhere else in the file (mechanical audit). The supervisor-family keys
 * (the realm-established supervisor mode + the combined applicability probe
 * arm) carry PINNED camelCase names matching the vendor protocol's class
 * names - the production fault-vocabulary bridge reuses them byte-exact
 * (single-source continuity, no renaming at the bridge). */
const FAULT_CODES = {
  malformedSpec: 100,
  abiMissingOrBlocked: 101,
  addRuleFailure: 102,
  restrictSelfFailure: 103,
  execveFailure: 104,
  supervisorTableMalformed: 105,
  realmCloneFailure: 106,
  realmMapWriteFailure: 107,
  childEarlyDeath: 108,
  realmUnshareFailure: 109,
  overlayMountFailure: 110,
  overlayUmountFailure: 111,
};

/** Reserved fault band - codes are issued only pre-execve, by construction.
 * The current assignment uses 100-111; 112-199 stay reserved. */
const FAULT_BAND: readonly [number, number] = [100, 199];

/** Probe report line - exact form, ASCII, LF-terminated, exactly one line in
 * both outcomes. Byte-equivalent form documented in the vendor README. */
const PROBE_LINE_RE =
  /^landlock-helper probe abi=(\d+) pin=(\d+) status=(ok|fail)$/;

/** Path convention: vendor/landlock-helper/bin/<arch>-linux/landlock-helper
 * under the package root. The convention's arch tokens are the uname -m
 * values (x86_64 / aarch64); Node's process.arch names (x64 / arm64) are
 * MAPPED onto them by archTokenFor below. Pure - no fs. */
function helperPathFor(pkgRoot: string, arch: string): string {
  return path.join(
    pkgRoot,
    "vendor",
    "landlock-helper",
    "bin",
    `${arch}-linux`,
    "landlock-helper",
  );
}

/** Map Node's process.arch onto the convention's uname -m arch tokens.
 * (The spec's parenthetical claimed the two coincide directly - measured
 * correction: Node reports x64 / arm64, so the mapping is load-bearing;
 * the convention strings themselves are unchanged.) */
function archTokenFor(nodeArch: string): string | null {
  if (nodeArch === "x64") return "x86_64";
  if (nodeArch === "arm64") return "aarch64";
  return null;
}

interface ProbeLine {
  readonly abi: number;
  readonly pin: number;
  /** Discriminant-narrowed from the regex capture - never a raw cast. */
  readonly status: "ok" | "fail";
}

function parseProbeLine(text: string): ProbeLine | null {
  const m = PROBE_LINE_RE.exec(text);
  if (m === null) return null;
  const status: "ok" | "fail" = m[3] === "fail" ? "fail" : "ok";
  return { abi: Number(m[1]), pin: Number(m[2]), status };
}

interface SpawnRecord {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Timeout or signal death - rows assert this false LOUDLY (a hang FAILS
   * the row, it never skips). */
  readonly abnormal: boolean;
}

function recordSpawn(
  file: string,
  args: readonly string[],
  timeoutMs: number,
): SpawnRecord {
  const r = spawnSync(file, args, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: timeoutMs,
  });
  return {
    status: r.status,
    stdout: typeof r.stdout === "string" ? r.stdout : "",
    stderr: typeof r.stderr === "string" ? r.stderr : "",
    abnormal: r.error !== undefined || r.signal !== null,
  };
}

const HELPER_TIMEOUT_MS = 10_000;
const REGEN_TIMEOUT_MS = 120_000;

/** Helper path resolved for THIS host's architecture (convention above).
 * Null arch token (exotic host) => empty path => the fail-closed reason
 * below, never a silent fallback. */
const HOST_ARCH = archTokenFor(process.arch);
const HELPER = HOST_ARCH === null ? "" : helperPathFor(PKG_ROOT, HOST_ARCH);
const REGEN_SCRIPT = path.join(
  PKG_ROOT,
  "vendor",
  "landlock-helper",
  "regenerate.sh",
);

/** Absolute program constants - the helper performs NO PATH lookup; program
 * absoluteness is normally the TS assembler's contract, exercised here
 * directly. */
const SH = "/bin/sh";
const PY = "/usr/bin/python3";
const HEAD = "/usr/bin/head";

/** python3 interpreter detection (the program-opening-a-path golden needs
 * it; absent => that sub-row skips WITH SURFACED REASON while the shell-
 * crossing row still holds). */
const pythonPresent = recordSpawn(PY, ["--version"], 5_000).status === 0;

/* ------------------- capability gate (once, at collection) --------------- */

interface CapabilityReport {
  readonly helperExists: boolean;
  readonly discoveredAbi: number;
  readonly pinnedAbi: number;
  readonly usable: boolean;
  /** Surfaced skip reason ("none" when usable). */
  readonly reason: string;
}

function probeCapability(): CapabilityReport {
  if (HOST_ARCH === null) {
    return {
      helperExists: false,
      discoveredAbi: 0,
      pinnedAbi: 0,
      usable: false,
      reason: `host architecture ${process.arch} is outside the x86_64/aarch64 convention (no prebuild exists)`,
    };
  }
  if (!existsSync(HELPER)) {
    return {
      helperExists: false,
      discoveredAbi: 0,
      pinnedAbi: 0,
      usable: false,
      reason: `prebuild absent at ${HELPER} (the TS-side fail-closed classifier owns the absent-binary case - never a silent fallback)`,
    };
  }
  const r = recordSpawn(HELPER, ["--probe"], HELPER_TIMEOUT_MS);
  const line = r.stdout.endsWith("\n") ? r.stdout.slice(0, -1) : r.stdout;
  const p = parseProbeLine(line);
  if (r.abnormal || r.status !== 0 || p === null) {
    return {
      helperExists: true,
      discoveredAbi: 0,
      pinnedAbi: 0,
      usable: false,
      reason: `--probe unusable (exit=${String(r.status)}, stdout=${JSON.stringify(r.stdout)})`,
    };
  }
  // Strict status mapping encodes identity: ok <=> exit 0 <=> discovered == pin
  const usable = p.status === "ok" && p.abi === p.pin;
  return {
    helperExists: true,
    discoveredAbi: p.abi,
    pinnedAbi: p.pin,
    usable,
    reason: usable
      ? "none"
      : `probe refused: discovered=${p.abi} pin=${p.pin} status=${p.status}`,
  };
}

const CAP = probeCapability();
if (CAP.usable) {
  console.log(
    `[landlock-helper suite] Landlock usable: abi=${CAP.discoveredAbi} pin=${CAP.pinnedAbi}`,
  );
} else {
  console.warn(
    `[landlock-helper suite] enforcement rows will skip - ${CAP.reason}`,
  );
}

/** Title suffix so every skip carries its reason ("" when the row runs). */
const skipNote = (reason: string): string =>
  reason === "none" ? "" : ` [skipped: ${reason}]`;

/** Measured host ABI (remeasurement 2026-10-04: kernel
 * 7.0.0-34-generic, x86_64, Ubuntu 24.04 HWE - version discovery returned 8).
 * The ABI-report row pins the MEASURED value: if the host's kernel differs,
 * re-measure, update this constant, and record the measurement alongside it;
 * divergence from the pinned values surfaces with evidence, never a silent
 * adaptation. */
const MEASURED_HOST_ABI = 8;

/* ------------------------------ scratch layout --------------------------- */

const scratch = mkdtempSync(path.join(os.tmpdir(), "llh-suite-"));
const frame = path.join(scratch, "frame");
const outside = path.join(scratch, "outside");
mkdirSync(frame);
mkdirSync(outside);
// Grant-scope hygiene: the frames grant mkdtemp dirs ONLY - no /dev targets
// anywhere in fenced commands (measured: /dev writes deny unless granted;
// the /dev allowance is owned by the TS-side materializer).
symlinkSync(outside, path.join(frame, "xlink")); // link-crossing shape (pre-spawn)
writeFileSync(path.join(outside, "data.txt"), "datum\n"); // reads-unaffected target
writeFileSync(path.join(outside, "victim"), "x\n"); // out-of-frame rm target
writeFileSync(path.join(scratch, "regular-file"), "x\n"); // F_ADD_RULE spec path

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function runFenced(args: readonly string[]): SpawnRecord {
  return recordSpawn(HELPER, args, HELPER_TIMEOUT_MS);
}

/** Any signal-death or timeout on a row demands captured evidence
 * (strace/core) before goldens are trusted - asserted so the failure is loud. */
function assertSound(res: SpawnRecord): void {
  expect(
    res.abnormal,
    "signal-death/timeout: capture evidence (strace/core) before pinning goldens - do not tune the golden to hide it",
  ).toBe(false);
}

/* ---------- A. Protocol & classification - ALWAYS HOLD (kernel-independent) ---------- */

describe("landlock-helper suite-local const block (A)", () => {
  it("the twelve fault codes are pairwise distinct, inside the reserved band, and none zero", () => {
    const codes = Object.values(FAULT_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toBeGreaterThanOrEqual(FAULT_BAND[0]);
      expect(code).toBeLessThanOrEqual(FAULT_BAND[1]);
      expect(code).not.toBe(0);
    }
  });

  it("the probe-line grammar accepts the pinned form and rejects off-form bytes", () => {
    expect(
      PROBE_LINE_RE.test("landlock-helper probe abi=8 pin=8 status=ok"),
    ).toBe(true);
    expect(
      PROBE_LINE_RE.test("landlock-helper probe abi=0 pin=8 status=fail"),
    ).toBe(true);
    expect(
      PROBE_LINE_RE.test("landlock-helper probe abi=8 pin=8 status=maybe"),
    ).toBe(false);
    expect(
      PROBE_LINE_RE.test("landlock-helper probe abi=8 pin=8 status=ok extra"),
    ).toBe(false);
    expect(PROBE_LINE_RE.test("fence-helper probe abi=8 pin=8 status=ok")).toBe(
      false,
    );
  });

  it("the path-convention function resolves the exact expected strings (pure, no fs)", () => {
    expect(helperPathFor("/root", "x86_64")).toBe(
      "/root/vendor/landlock-helper/bin/x86_64-linux/landlock-helper",
    );
    expect(helperPathFor("/root", "aarch64")).toBe(
      "/root/vendor/landlock-helper/bin/aarch64-linux/landlock-helper",
    );
  });

  it("the process.arch-to-convention-token mapping covers x64/arm64 and refuses exotic arches", () => {
    expect(archTokenFor("x64")).toBe("x86_64");
    expect(archTokenFor("arm64")).toBe("aarch64");
    expect(archTokenFor("ia32")).toBe(null);
    expect(archTokenFor("riscv64")).toBe(null);
  });
});

describe("landlock-helper malformed-spec matrix (A)", () => {
  const note = skipNote(CAP.helperExists ? "none" : CAP.reason);
  const badShapes: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["missing -- separator", ["--write", frame]],
    ["zero --write pairs", ["--", SH, "-c", "true"]],
    ["relative --write path", ["--write", "rel/path", "--", SH, "-c", "true"]],
    ["empty --write value", ["--write", "", "--", SH, "-c", "true"]],
    [
      "dangling --write just before --",
      ["--write", frame, "--write", "--", SH, "-c", "true"],
    ],
    ["unknown leading flag", ["--fence", frame, "--", SH, "-c", "true"]],
    ["--probe plus any extra token", ["--probe", "extra"]],
  ];
  for (const [shape, args] of badShapes) {
    it.skipIf(!CAP.helperExists)(`${shape} => silent refusal${note}`, () => {
      const res = runFenced(args);
      assertSound(res);
      expect(res.status).toBe(FAULT_CODES.malformedSpec);
      expect(res.stdout).toBe("");
      expect(res.stderr).toBe("");
    });
  }
});

/* ----------------------- B. Enforcement goldens (real kernel) ----------------------- */

describe("landlock-helper enforcement goldens (B)", () => {
  const note = skipNote(CAP.usable ? "none" : CAP.reason);

  it.skipIf(!CAP.usable)(
    `off-list PLAIN write denies: exit 2, measured marker, nothing lands${note}`,
    () => {
      const target = path.join(outside, "off.txt");
      const res = runFenced([
        "--write",
        frame,
        "--",
        SH,
        "-c",
        `echo hi > ${target}`,
      ]);
      assertSound(res);
      expect(res.status).toBe(2);
      // Dash prefixes its diagnostic with its argv[0] - under the helper's
      // absoluteness contract that is the absolute program path (the plain
      // bare-"sh" form appears verbatim in the nested-lineage row below, where
      // the inner shell is spawned through PATH). The denial-CLASS bytes
      // (cannot create <path>: Permission denied) are identical in both forms.
      expect(res.stderr).toBe(
        `${SH}: 1: cannot create ${target}: Permission denied\n`,
      );
      expect(res.stdout).toBe("");
      expect(existsSync(target)).toBe(false);
    },
  );

  it.skipIf(!CAP.usable)(
    `off-list LINK-CROSSING (shell redirect) denies: marker names the link path, nothing lands${note}`,
    () => {
      const target = path.join(frame, "xlink", "sx.txt");
      const res = runFenced([
        "--write",
        frame,
        "--",
        SH,
        "-c",
        `echo sx > ${target}`,
      ]);
      assertSound(res);
      expect(res.status).toBe(2);
      expect(res.stderr).toBe(
        `${SH}: 1: cannot create ${target}: Permission denied\n`,
      );
      expect(existsSync(path.join(outside, "sx.txt"))).toBe(false);
    },
  );

  const pyReason = CAP.usable
    ? pythonPresent
      ? "none"
      : "python3 interpreter absent on this host"
    : CAP.reason;
  const pySkip = pyReason !== "none";
  it.skipIf(pySkip)(
    `off-list LINK-CROSSING (program opening a path) denies: Errno 13 traceback, nothing lands${skipNote(pyReason)}`,
    () => {
      const target = path.join(frame, "xlink", "cross.txt");
      const res = runFenced([
        "--write",
        frame,
        "--",
        PY,
        "-c",
        `open('${target}','w')`,
      ]);
      assertSound(res);
      expect(res.status).toBe(1);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("[Errno 13] Permission denied");
      expect(res.stderr).toContain(target);
      expect(existsSync(path.join(outside, "cross.txt"))).toBe(false);
    },
  );

  it.skipIf(!CAP.usable)(
    `on-list completion: declared target written, transcript clean${note}`,
    () => {
      const target = path.join(frame, "on.txt");
      const res = runFenced([
        "--write",
        frame,
        "--",
        SH,
        "-c",
        `echo hi > ${target} && echo wrote-ok`,
      ]);
      assertSound(res);
      expect(res.status).toBe(0);
      expect(readFileSync(target, "utf8")).toBe("hi\n");
      expect(res.stdout).toBe("wrote-ok\n");
      const combined = res.stdout + res.stderr;
      expect(combined).not.toContain("Permission denied");
      expect(combined).not.toContain("cannot create");
    },
  );

  it.skipIf(!CAP.usable)(
    `NESTED lineage denies (whole-tree inheritance): inner marker verbatim, nothing lands${note}`,
    () => {
      const target = path.join(outside, "nested.txt");
      const res = runFenced([
        "--write",
        frame,
        "--",
        SH,
        "-c",
        `sh -c "echo x > ${target}"`,
      ]);
      assertSound(res);
      expect(res.status).toBe(2);
      // Inner shell spawned through PATH carries argv[0]="sh", so the plain
      // marker form appears VERBATIM here.
      expect(res.stderr).toBe(
        `sh: 1: cannot create ${target}: Permission denied\n`,
      );
      expect(existsSync(target)).toBe(false);
    },
  );

  it.skipIf(!CAP.usable)(
    `reads UNMEDIATED under the mutation-only fence${note}`,
    () => {
      const data = path.join(outside, "data.txt");
      const res = runFenced(["--write", frame, "--", HEAD, "-c", "3", data]);
      assertSound(res);
      expect(res.status).toBe(0);
      expect(res.stdout).toBe("dat");
    },
  );

  it.skipIf(!CAP.usable)(
    `vocabulary spot-check: in-frame mkdir succeeds${note}`,
    () => {
      const dir = path.join(frame, "newdir");
      const res = runFenced(["--write", frame, "--", SH, "-c", `mkdir ${dir}`]);
      assertSound(res);
      expect(res.status).toBe(0);
      expect(statSync(dir).isDirectory()).toBe(true);
    },
  );

  it.skipIf(!CAP.usable)(
    `vocabulary spot-check: out-of-frame rm denies, victim survives${note}`,
    () => {
      const victim = path.join(outside, "victim");
      const res = runFenced([
        "--write",
        frame,
        "--",
        SH,
        "-c",
        `rm -f ${victim}`,
      ]);
      assertSound(res);
      expect(res.status).toBe(1);
      // GNU coreutils rm single-quotes the operand in its diagnostic (measured
      // byte-for-byte here - dash-family shells do not; both are userland
      // rendering, the denial class + exit semantics are the kernel's).
      expect(res.stderr).toBe(
        `rm: cannot remove '${victim}': Permission denied\n`,
      );
      expect(existsSync(victim)).toBe(true);
    },
  );

  it.skipIf(!CAP.usable)(
    `stream purity + exit pass-through: stdout exact, exit 7${note}`,
    () => {
      const res = runFenced([
        "--write",
        frame,
        "--",
        SH,
        "-c",
        "printf stream-ok; exit 7",
      ]);
      assertSound(res);
      expect(res.status).toBe(7);
      expect(res.stdout).toBe("stream-ok");
      expect(res.stderr).toBe("");
    },
  );
});

/* --------------------- C. Degradation & remaining fault classes --------------------- */

describe("landlock-helper degradation & remaining fault classes (C)", () => {
  // Still-holding ABI-class-fault row: applies only when the binary exists
  // and the probe refused for missing/below-pin/kernel-blocked reasons.
  // Usable hosts and the above-pin identity refusal are documented residuals
  // - each skips WITH SURFACED REASON, never papered over.
  let abiRowRuns = false;
  let abiRowReason = "none";
  if (!CAP.helperExists) {
    abiRowReason = CAP.reason;
  } else if (CAP.usable) {
    abiRowReason =
      "host already Landlock-usable - the ABI-class residual applies to probe-refused hosts only";
  } else if (CAP.discoveredAbi > CAP.pinnedAbi) {
    abiRowReason = `above-pin identity refusal (discovered=${CAP.discoveredAbi} > pin=${CAP.pinnedAbi}) - documented residual: apply mode is discovery-free and machinery may still succeed on an unmeasured newer series`;
  } else {
    abiRowRuns = true;
  }

  it.skipIf(!abiRowRuns)(
    `valid-spec apply exits ${FAULT_CODES.abiMissingOrBlocked} on missing/below-pin-blocked hosts (silent)${skipNote(abiRowReason)}`,
    () => {
      const res = runFenced(["--write", frame, "--", SH, "-c", "true"]);
      assertSound(res);
      expect(res.status).toBe(FAULT_CODES.abiMissingOrBlocked);
      expect(res.stdout).toBe("");
      expect(res.stderr).toBe("");
    },
  );

  const eNote = skipNote(CAP.usable ? "none" : CAP.reason);
  it.skipIf(!CAP.usable)(
    `execve failure post-restriction exits ${FAULT_CODES.execveFailure} (silent)${eNote}`,
    () => {
      const res = runFenced([
        "--write",
        frame,
        "--",
        "/nonexistent-shell-xyz",
        "-c",
        "x",
      ]);
      assertSound(res);
      expect(res.status).toBe(FAULT_CODES.execveFailure);
      expect(res.stdout).toBe("");
      expect(res.stderr).toBe("");
    },
  );

  it.skipIf(!CAP.usable)(
    `add-rule failure on a regular-file spec path exits ${FAULT_CODES.addRuleFailure} (silent)${eNote}`,
    () => {
      const regFile = path.join(scratch, "regular-file");
      const res = runFenced(["--write", regFile, "--", SH, "-c", "true"]);
      assertSound(res);
      expect(res.status).toBe(FAULT_CODES.addRuleFailure);
      expect(res.stdout).toBe("");
      expect(res.stderr).toBe("");
    },
  );

  // F_RESTRICT has NO induced row: restrict_self failure is not inducible
  // hermetically on a healthy kernel. Its presence/distinctness rides the
  // A-group band-integrity row (pairwise-distinct over all five codes); its
  // defensiveness is documented in the vendor README.
});

/* ----------------------------- D. Probe protocol ----------------------------- */

describe("landlock-helper probe protocol (D)", () => {
  const dNote = skipNote(CAP.helperExists ? "none" : CAP.reason);

  it.skipIf(!CAP.helperExists)(
    `report line is exactly the pinned single-line format in BOTH outcomes${dNote}`,
    () => {
      const res = runFenced(["--probe"]);
      assertSound(res);
      expect(res.stdout.endsWith("\n")).toBe(true);
      const line = res.stdout.slice(0, -1);
      expect(line.includes("\n")).toBe(false);
      const p = parseProbeLine(line);
      expect(p).not.toBeNull();
      expect(p?.abi ?? 0).toBeGreaterThan(0);
      expect(p?.pin ?? 0).toBeGreaterThan(0);
      if (res.status === 0) {
        expect(p?.status).toBe("ok");
        expect(res.stderr).toBe("");
      } else {
        expect(res.status).toBe(FAULT_CODES.abiMissingOrBlocked);
        expect(p?.status).toBe("fail");
      }
    },
  );

  const uNote = skipNote(CAP.usable ? "none" : CAP.reason);
  it.skipIf(!CAP.usable)(
    `ABI report pins the MEASURED host ABI (${MEASURED_HOST_ABI})${uNote}`,
    () => {
      const res = runFenced(["--probe"]);
      assertSound(res);
      const p = parseProbeLine(res.stdout.slice(0, -1));
      expect(p?.abi).toBe(MEASURED_HOST_ABI);
      expect(p?.pin).toBe(MEASURED_HOST_ABI);
    },
  );
});

/* ------------------------------- E. Regeneration ------------------------------- */

let ccBin: string | null = null;
for (const candidate of ["cc", "gcc"]) {
  const v = recordSpawn(candidate, ["--version"], 5_000);
  if (v.status === 0) {
    ccBin = candidate;
    break;
  }
}
const ccAvailable = ccBin !== null;

describe("landlock-helper regeneration (E)", () => {
  const eReason = !ccAvailable
    ? "no cc/gcc compiler found on this host"
    : CAP.usable
      ? "none"
      : `Landlock unusable here - the script's own probe-smoke gate refuses: ${CAP.reason}`;
  const eSkip = eReason !== "none";
  const eNote = skipNote(eReason);

  it.skipIf(eSkip)(
    `regenerate.sh rebuilds from checked-in source; tmp binary probes green${eNote}`,
    () => {
      const tmpOut = path.join(scratch, "regen-bin", "landlock-helper-tmp");
      const built = recordSpawn(
        "bash",
        [REGEN_SCRIPT, tmpOut],
        REGEN_TIMEOUT_MS,
      );
      expect(
        built.abnormal,
        "regeneration hung past the wall-clock guard",
      ).toBe(false);
      expect(built.status, built.stderr).toBe(0);
      expect(existsSync(tmpOut)).toBe(true);
      expect(statSync(tmpOut).mode & 0o111).toBeGreaterThan(0);
      const probe = recordSpawn(tmpOut, ["--probe"], HELPER_TIMEOUT_MS);
      expect(probe.status).toBe(0);
      // Behavioral parity with the committed prebuild: same line FORMAT and
      // green outcome - explicitly NOT byte parity (byte-reproducibility is
      // not claimed; the probe line is the bar).
      const p = parseProbeLine(probe.stdout.slice(0, -1));
      if (p === null || p.status !== "ok") {
        throw new Error(
          `tmp rebuild probe line off-contract: ${JSON.stringify(probe.stdout)}`,
        );
      }
      expect(p.abi).toBe(p.pin);
    },
  );
});

/* ========================================================================
 * F/G/H - supervisor mode & combined applicability probe arm
 *
 * Appended after group E (letter convention continues). Posture carried
 * from A-E: real binary, real kernel; mkdtemp isolation; skipNote on every
 * dependent row; exact-byte/code assertions; assertSound hang guard with
 * the sanctioned signal-golden exception. F holds pure protocol &
 * classification content; G is the supervisor-family malformed battery
 * (helper-presence gated); H is the real-syscall golden set
 * (combined-latch gated - skips WITH surfaced reason on deficient hosts).
 * ======================================================================== */

/** Overlay report line - exact form, ASCII, LF-terminated, exactly one line
 * in BOTH outcomes (protocol constants; the vendor README quotes them).
 * Parallel to the probe line WITHOUT abi/pin fields - the mechanic has no
 * kernel-series identity gate; the realm field carries the
 * realm-establishment applicability. */
const OVERLAY_LINE_RE =
  /^landlock-helper overlay realm=(ok|fail) status=(ok|fail)$/;

interface OverlayLine {
  readonly realm: "ok" | "fail";
  readonly status: "ok" | "fail";
}

/** TOTAL manual parser beside parseProbeLine (discriminant-narrowed - never
 * a raw cast). Accepts ALL four syntactic cells including the
 * documented-unreachable one - reachability is the consumer's concern,
 * totality here. */
function parseOverlayLine(text: string): OverlayLine | null {
  const m = OVERLAY_LINE_RE.exec(text);
  if (m === null) return null;
  const realm: "ok" | "fail" = m[1] === "fail" ? "fail" : "ok";
  const status: "ok" | "fail" = m[2] === "fail" ? "fail" : "ok";
  return { realm, status };
}

/** Stderr diagnostic form (COMBINED-ARM FAILURE ONLY), mirroring the
 * probe-diagnostic shape over the eight-stage vocabulary. */
const OVERLAY_STAGES: ReadonlyArray<string> = [
  "setup",
  "realm-clone",
  "realm-map",
  "child-early-death",
  "unshare",
  "mount",
  "verify",
  "umount",
];
const OVERLAY_DIAG_RE =
  /^landlock-helper overlay: failed at (setup|realm-clone|realm-map|child-early-death|unshare|mount|verify|umount) \(errno=\d+\)\n$/;

/* ----------------- combined capability latch (once, at collection) -------------
 *
 * MODULE-SCOPE COMBINED CAPABILITY LATCH: one --overlay-probe run over a
 * fresh mkdtemp root at collection, shaped on probeCapability. Doubles as
 * the first live exercise of the arm (and of parseOverlayLine). usable <=>
 * parsed ok cell AND exit 0; the reason echoes the observed line/exit.
 * Deficient hosts degrade honestly - every dependent row skips WITH the
 * surfaced reason (identical doctrine to the Landlock latch). */
const overlayRoot = mkdtempSync(path.join(os.tmpdir(), "llh-overlay-latch-"));

interface OverlayCapabilityReport {
  readonly usable: boolean;
  /** Surfaced skip reason ("none" when usable). */
  readonly reason: string;
}

function probeOverlayCapability(root: string): OverlayCapabilityReport {
  if (!CAP.helperExists) {
    return { usable: false, reason: CAP.reason };
  }
  const r = recordSpawn(HELPER, ["--overlay-probe", root], HELPER_TIMEOUT_MS);
  if (r.abnormal) {
    return {
      usable: false,
      reason:
        "--overlay-probe abnormal (signal death or timeout - capture evidence before trusting it)",
    };
  }
  const line = r.stdout.endsWith("\n") ? r.stdout.slice(0, -1) : r.stdout;
  const p = parseOverlayLine(line);
  const usable =
    p !== null && p.realm === "ok" && p.status === "ok" && r.status === 0;
  return {
    usable,
    reason: usable
      ? "none"
      : `--overlay-probe refused (exit=${String(r.status)}, stdout=${JSON.stringify(line)})`,
  };
}

const OV = probeOverlayCapability(overlayRoot);
if (OV.usable) {
  console.log(
    "[landlock-helper suite] overlay-realm usable: combined arm green",
  );
} else {
  console.warn(
    `[landlock-helper suite] combined-arm rows will skip - ${OV.reason}`,
  );
}

afterAll(() => {
  rmSync(overlayRoot, { recursive: true, force: true });
});

const ovNote = skipNote(OV.usable ? "none" : OV.reason);

/* ------------------------- H-group spawn & /proc helpers -------------------- */

/** Local close-outcome record with SIGNAL visibility (the H-group death-
 * class goldens need it; the shared SpawnRecord deliberately stays
 * untouched). */
interface CloseOutcome {
  readonly code: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Await the process close, collecting both streams (chunks decoded as
 * utf8). The node-level timeout option stays distinguishable from the
 * forwarded-signal goldens: callers pass killSignal SIGKILL so a wall-
 * clock guard kill can never masquerade as a forwarded-SIGTERM golden. */
function awaitClose(proc: ChildProcess): Promise<CloseOutcome> {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d: Buffer | string) => {
      out += typeof d === "string" ? d : d.toString("utf8");
    });
    proc.stderr?.on("data", (d: Buffer | string) => {
      err += typeof d === "string" ? d : d.toString("utf8");
    });
    proc.on("close", (code, sig) => {
      resolve({ code, signal: sig, stdout: out, stderr: err });
    });
  });
}

/** Close await raced against a HARD CAP (H12 only). Physics of record
 * (measured 2026-10-07 on the provisioned host, under vitest load): a
 * rare host-side close-delivery stall has been observed where the
 * CARRIER process tree provably exits promptly while node's 'close'
 * event lags (socketpair teardown / scheduler jitter). One such attempt
 * must never be allowed to burn the row's vitest wall budget, so the
 * await is capped; on a cap trip the caller proves the NO-HANG receipt
 * by LINEAGE FORENSICS (nudge-kill + settle) instead of promptness. */
function awaitCloseCapped(
  proc: ChildProcess,
  capMs: number,
): Promise<CloseOutcome & { readonly stalled: boolean }> {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result: CloseOutcome & { stalled: boolean }): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };
    timer = setTimeout(() => {
      finish({
        code: null,
        signal: null,
        stdout: "",
        stderr: "",
        stalled: true,
      });
    }, capMs);
    proc.stdout?.on("data", (d: Buffer | string) => {
      out += typeof d === "string" ? d : d.toString("utf8");
    });
    proc.stderr?.on("data", (d: Buffer | string) => {
      err += typeof d === "string" ? d : d.toString("utf8");
    });
    proc.on("close", (code, sig) => {
      finish({ code, signal: sig, stdout: out, stderr: err, stalled: false });
    });
  });
}

const sleepMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Numeric pids currently present under /proc (no full-parsing churn). */
function liveProcPids(): number[] {
  return readdirSync("/proc")
    .filter((n) => /^\d+$/.test(n))
    .map(Number);
}

/** Max pid currently present - bounds the fresh-pid scan range.
 * (No full-/proc storms.) */
function maxPidSnapshot(): number {
  let max = 0;
  for (const p of liveProcPids()) {
    if (p > max) max = p;
  }
  return max;
}

/** state + ppid from /proc/<pid>/stat. The comm field may contain
 * whitespace and parens - anchor on the LAST ")" and read the remainder
 * (state = index 0, ppid = index 1). Null when the entry vanished. */
function procTriple(pid: number): { state: string; ppid: number } | null {
  try {
    const line = readFileSync(`/proc/${pid}/stat`, "utf8");
    const anchor = line.lastIndexOf(")");
    if (anchor < 0) return null;
    const rest = line
      .slice(anchor + 1)
      .trim()
      .split(/\s+/);
    return { state: rest[0], ppid: Number(rest[1]) };
  } catch {
    return null; // vanished mid-scan - the scan loops handle churn
  }
}

/** Direct children of helperPid still present (live OR zombie). */
function descendantsOf(
  helperPid: number,
): Array<{ pid: number; state: string }> {
  const out: Array<{ pid: number; state: string }> = [];
  for (const p of liveProcPids()) {
    const t = procTriple(p);
    if (t !== null && t.ppid === helperPid) {
      out.push({ pid: p, state: t.state });
    }
  }
  return out;
}

/** Settle receipt: no residual direct children (live or zombie) within the
 * brief settle window - orphaned realm children reparented to init are
 * reaped, zombie-free. */
async function settleClean(pid: number): Promise<boolean> {
  for (let round = 0; round < 10; round++) {
    if (descendantsOf(pid).length === 0) return true;
    await sleepMs(150);
  }
  return descendantsOf(pid).length === 0;
}

/* Teardown helpers (H-group ONLY).
 *
 * Physics of record (measured 2026-10-07 on the provisioned host, kernel
 * 7.0.0-34-generic): when a realm dies WITHOUT umounting (the production
 * NO-self-teardown posture), the overlayfs workdir retains a KERNEL-
 * MANAGED mode-000 metadata subdirectory (owner = the mapped caller uid,
 * EMPTY after a nominal run). A plain readdir-descent (e.g. rmSync
 * recursive) faults EACCES trying to LIST it, although the owner CAN
 * rmdir it directly. Clean umount (the combined-arm path) leaves NO such
 * residue. The session-side walk owes the same tolerance at Step 15.
 * Best-effort by construction: row receipts are asserted BEFORE teardown,
 * so a residue here can never mask a row outcome. */
function purgeDirEntries(dir: string): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    // Owner-unreadable metadata dir: every entry in these trees is owned
    // by the session uid - make it visible to the owner and retry once.
    try {
      chmodSync(dir, 0o700);
      names = readdirSync(dir);
    } catch {
      names = []; // genuinely unreadable: leave the leaf, best-effort
    }
  }
  for (const n of names) {
    const q = path.join(dir, n);
    try {
      const s = statSync(q, { throwIfNoEntry: false });
      if (s?.isDirectory()) {
        purgeDirEntries(q);
        try {
          rmdirSync(q);
        } catch {
          try {
            chmodSync(q, 0o700);
            rmdirSync(q);
          } catch {
            // best-effort - mkdtemp residue under /tmp is tolerated
          }
        }
      } else {
        rmSync(q, { force: true });
      }
    } catch {
      // swallow-all teardown (see above)
    }
  }
}

/** Best-effort recursive removal tolerant of the mode-000 workdir
 * metadata dir (see the physics note above). */
function purgeTree(p: string): void {
  purgeDirEntries(p);
  try {
    rmdirSync(p);
  } catch {
    try {
      chmodSync(p, 0o700);
      rmdirSync(p);
    } catch {
      // best-effort - mkdtemp residue under /tmp is tolerated
    }
  }
}

describe("landlock-helper supervisor & combined-arm protocol (F)", () => {
  it("the overlay-line grammar accepts the pinned cells and rejects off-form bytes", () => {
    // All four syntactic cells accepted - the parser stays TOTAL over the
    // cells (the documented-unreachable one included).
    expect(
      OVERLAY_LINE_RE.test("landlock-helper overlay realm=ok status=ok"),
    ).toBe(true);
    expect(
      OVERLAY_LINE_RE.test("landlock-helper overlay realm=fail status=fail"),
    ).toBe(true);
    expect(
      OVERLAY_LINE_RE.test("landlock-helper overlay realm=ok status=fail"),
    ).toBe(true);
    expect(
      OVERLAY_LINE_RE.test("landlock-helper overlay realm=fail status=ok"),
    ).toBe(true);
    expect(
      OVERLAY_LINE_RE.test("other-helper overlay realm=ok status=ok"),
    ).toBe(false);
    expect(OVERLAY_LINE_RE.test("landlock-helper overlay realm=ok")).toBe(
      false,
    );
    expect(
      OVERLAY_LINE_RE.test("landlock-helper overlay status=ok realm=ok"),
    ).toBe(false);
    expect(
      OVERLAY_LINE_RE.test("landlock-helper overlay realm=maybe status=ok"),
    ).toBe(false);
    expect(
      OVERLAY_LINE_RE.test("landlock-helper overlay realm=ok status=ok extra"),
    ).toBe(false);
    expect(
      OVERLAY_LINE_RE.test(
        "landlock-helper overlay realm=ok status=ok\nsecond\n",
      ),
    ).toBe(false);
  });

  it("the overlay-line parser narrows every cell to its typed shape and rejects the off-form set", () => {
    expect(
      parseOverlayLine("landlock-helper overlay realm=ok status=ok"),
    ).toEqual({
      realm: "ok",
      status: "ok",
    });
    expect(
      parseOverlayLine("landlock-helper overlay realm=fail status=fail"),
    ).toEqual({ realm: "fail", status: "fail" });
    expect(
      parseOverlayLine("landlock-helper overlay realm=ok status=fail"),
    ).toEqual({
      realm: "ok",
      status: "fail",
    });
    // The documented-unreachable cell parses too - totality over the
    // syntactic cells; reachability is the consumer's concern.
    expect(
      parseOverlayLine("landlock-helper overlay realm=fail status=ok"),
    ).toEqual({ realm: "fail", status: "ok" });
    expect(
      parseOverlayLine("other-helper overlay realm=ok status=ok"),
    ).toBeNull();
    expect(parseOverlayLine("landlock-helper overlay realm=ok")).toBeNull();
    expect(
      parseOverlayLine("landlock-helper overlay status=ok realm=ok"),
    ).toBeNull();
    expect(
      parseOverlayLine("landlock-helper overlay realm=maybe status=ok"),
    ).toBeNull();
    expect(
      parseOverlayLine("landlock-helper overlay realm=ok status=ok extra"),
    ).toBeNull();
    expect(
      parseOverlayLine("landlock-helper overlay realm=ok status=ok\nsecond\n"),
    ).toBeNull();
  });

  it("the stderr diagnostic form accepts every stage word and rejects the off-form set", () => {
    for (const stage of OVERLAY_STAGES) {
      expect(
        OVERLAY_DIAG_RE.test(
          `landlock-helper overlay: failed at ${stage} (errno=13)\n`,
        ),
        `stage ${stage} must match the diagnostic form`,
      ).toBe(true);
    }
    expect(
      OVERLAY_DIAG_RE.test(
        "landlock-helper overlay: failed at bogus (errno=13)\n",
      ),
    ).toBe(false);
    expect(
      OVERLAY_DIAG_RE.test(
        "landlock-helper overlay: failed at mount (errno=)\n",
      ),
    ).toBe(false);
    expect(
      OVERLAY_DIAG_RE.test(
        "landlock-helper overlay: failed at mount (errno=13) junk\n",
      ),
    ).toBe(false);
  });
});

/* ------------------- G. Supervisor-family malformed battery ------------------- */

describe("landlock-helper supervisor-family malformed battery (G)", () => {
  const gSkip = !CAP.helperExists;
  const note = skipNote(CAP.helperExists ? "none" : CAP.reason);
  // Absolute mkdtemp-derived path values where a value is needed - existence
  // irrelevant: validation precedes ANY syscall.
  const GL = path.join(frame, "glower");
  const GU = path.join(outside, "gupper");
  const GW = path.join(scratch, "gwork");

  const shapes: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["zero triples", ["--mount", "--", SH, "-c", "true"]],
    [
      "dangling triple with two values before --",
      ["--mount", GL, GU, "--", SH, "-c", "true"],
    ],
    ["dangling triple with one value", ["--mount", GL, "--", SH, "-c", "true"]],
    [
      "relative lower",
      ["--mount", "rel/lower", GU, GW, "--", SH, "-c", "true"],
    ],
    [
      "relative upper",
      ["--mount", GL, "rel/upper", GW, "--", SH, "-c", "true"],
    ],
    ["relative work", ["--mount", GL, GU, "rel/work", "--", SH, "-c", "true"]],
    [
      "empty value inside a triple",
      ["--mount", GL, "", GW, "--", SH, "-c", "true"],
    ],
    ["root lowerdir /", ["--mount", "/", GU, GW, "--", SH, "-c", "true"]],
    ["root upperdir /", ["--mount", GL, "/", GW, "--", SH, "-c", "true"]],
    ["root workdir /", ["--mount", GL, GU, "/", "--", SH, "-c", "true"]],
    ["no -- separator at all", ["--mount", GL, GU, GW]],
    [
      "unknown leading flag inside the supervisor section",
      ["--mount", GL, GU, GW, "--bogus", "--", SH, "-c", "true"],
    ],
    [
      "--write inside the supervisor section (cross-mode isolation)",
      ["--mount", GL, GU, GW, "--write", frame, "--", SH, "-c", "true"],
    ],
    ["valid table but no child token after --", ["--mount", GL, GU, GW, "--"]],
    ["arm missing value", ["--overlay-probe"]],
    ["arm relative path", ["--overlay-probe", "relative/path"]],
    ["arm extra token", ["--overlay-probe", frame, "extra"]],
    [
      "arm non-existent absolute path (existence is grammar)",
      ["--overlay-probe", path.join(scratch, "absent-subtree")],
    ],
  ];
  for (const [shape, args] of shapes) {
    it.skipIf(gSkip)(`${shape} => silent refusal${note}`, () => {
      const res = runFenced(args);
      assertSound(res);
      expect(res.status).toBe(FAULT_CODES.supervisorTableMalformed);
      expect(res.stdout).toBe("");
      expect(res.stderr).toBe("");
    });
  }

  it.skipIf(gSkip)(
    `apply discipline intact: --mount inside an APPLY lead section stays ${FAULT_CODES.malformedSpec} (fall-through isolation proof)${note}`,
    () => {
      const res = runFenced([
        "--write",
        frame,
        "--mount",
        GL,
        GU,
        GW,
        "--",
        SH,
        "-c",
        "true",
      ]);
      assertSound(res);
      expect(res.status).toBe(FAULT_CODES.malformedSpec);
      expect(res.stdout).toBe("");
      expect(res.stderr).toBe("");
    },
  );
});

/* --------------- H. Real-syscall goldens (combined-latch gated) --------------- */

describe("landlock-helper supervisor real-syscall goldens (H)", () => {
  // Combined-latch gated: skip WITH surfaced reason on deficient hosts
  // (degrade-honestly - identical doctrine to the existing rows). Fresh
  // mkdtemp roots per row group; absolute paths everywhere in child commands
  // (no cwd dependence).
  const hSkip = !OV.usable;

  it.skipIf(hSkip)(
    `H1 arm GREEN: exact ok-cell line, exit 0, minted subtree absent, caller root survives${ovNote}`,
    () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h1-"));
      try {
        const res = runFenced(["--overlay-probe", root]);
        assertSound(res);
        expect(res.stdout).toBe("landlock-helper overlay realm=ok status=ok\n");
        expect(res.status).toBe(0);
        expect(res.stderr).toBe("");
        expect(parseOverlayLine(res.stdout.slice(0, -1))).toEqual({
          realm: "ok",
          status: "ok",
        });
        // Cleanup receipt: the arm removes ONLY its minted subtree.
        expect(existsSync(path.join(root, ".llh-overlay-probe"))).toBe(false);
        expect(existsSync(root)).toBe(true);
      } finally {
        purgeTree(root);
      }
    },
  );

  it.skipIf(hSkip)(
    `H2 arm setup denial (read-only caller root) => ${FAULT_CODES.overlayMountFailure} + setup diagnostic${ovNote}`,
    () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h2-"));
      try {
        chmodSync(root, 0o555); // owned by the test uid => mkdir EACCES
        const res = runFenced(["--overlay-probe", root]);
        assertSound(res);
        expect(res.stdout).toBe(
          "landlock-helper overlay realm=ok status=fail\n",
        );
        expect(res.status).toBe(FAULT_CODES.overlayMountFailure);
        const m = OVERLAY_DIAG_RE.exec(res.stderr);
        expect(
          m,
          `diagnostic line: ${JSON.stringify(res.stderr)}`,
        ).not.toBeNull();
        expect(m?.[1]).toBe("setup"); // errno deliberately NOT pinned
      } finally {
        chmodSync(root, 0o755); // restore for teardown
        purgeTree(root);
      }
    },
  );

  it.skipIf(hSkip)(
    `H3 capture golden: writes CoW into the upper, real lower pristine (preemptive-only at carrier level)${ovNote}`,
    () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h3-"));
      const L = path.join(root, "lower");
      const U = path.join(root, "upper");
      const W = path.join(root, "work");
      mkdirSync(L);
      mkdirSync(U);
      mkdirSync(W);
      writeFileSync(path.join(L, "d.md"), "seed\n");
      try {
        const res = runFenced([
          "--mount",
          L,
          U,
          W,
          "--",
          SH,
          "-c",
          `printf appended > ${L}/n.md && printf s >> ${L}/d.md`,
        ]);
        assertSound(res);
        expect(res.status).toBe(0);
        expect(res.stdout).toBe("");
        expect(res.stderr).toBe("");
        // THE core mechanic: nothing landed in the REAL environment.
        expect(readFileSync(path.join(L, "d.md"), "utf8")).toBe("seed\n");
        expect(existsSync(path.join(L, "n.md"))).toBe(false);
        // The UPPER holds the CoW evidence with EXACT bytes.
        expect(readFileSync(path.join(U, "d.md"), "utf8")).toBe("seed\ns");
        expect(readFileSync(path.join(U, "n.md"), "utf8")).toBe("appended");
      } finally {
        purgeTree(root);
      }
    },
  );

  it.skipIf(hSkip)(
    `H3b dedupe control: identical duplicate triple does not double-fault${ovNote}`,
    () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h3b-"));
      const L = path.join(root, "lower");
      const U = path.join(root, "upper");
      const W = path.join(root, "work");
      mkdirSync(L);
      mkdirSync(U);
      mkdirSync(W);
      try {
        const res = runFenced([
          "--mount",
          L,
          U,
          W,
          "--mount",
          L,
          U,
          W,
          "--",
          SH,
          "-c",
          "true",
        ]);
        // Identical-triple silent dedupe prevents a double-attach fault
        // (behavioral proof of the mirrored --write dedupe rule).
        assertSound(res);
        expect(res.status).toBe(0);
        expect(res.stdout).toBe("");
        expect(res.stderr).toBe("");
      } finally {
        purgeTree(root);
      }
    },
  );

  it.skipIf(hSkip)(
    `H4 read-through: reads served from the real lower AT the declared path${ovNote}`,
    () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h4-"));
      const L = path.join(root, "lower");
      const U = path.join(root, "upper");
      const W = path.join(root, "work");
      mkdirSync(L);
      mkdirSync(U);
      mkdirSync(W);
      writeFileSync(path.join(L, "d.md"), "seed\n");
      try {
        const res = runFenced([
          "--mount",
          L,
          U,
          W,
          "--",
          SH,
          "-c",
          `cat ${L}/d.md`,
        ]);
        assertSound(res);
        expect(res.status).toBe(0);
        expect(res.stdout).toBe("seed\n");
        expect(res.stderr).toBe("");
      } finally {
        purgeTree(root);
      }
    },
  );

  it.skipIf(hSkip)(
    `H5 composed dual-mechanic golden: on-list write commits to the upper WHILE the off-frame write dies EACCES in the same run${ovNote}`,
    () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h5-"));
      const L = path.join(root, "lower");
      const U = path.join(root, "upper");
      const W = path.join(root, "work");
      const OFF = path.join(root, "outside");
      mkdirSync(L);
      mkdirSync(U);
      mkdirSync(W);
      mkdirSync(OFF);
      const offTarget = path.join(OFF, "off.txt");
      try {
        // THE production-chain shape: supervisor -> INNER apply-mode carrier
        // -> shell (Landlock applies INSIDE the realm over the overlaid
        // world). EXPECTED physics (LSM-hook-through-overlays envelope
        // semantics): the on-list write THROUGH THE MERGED VIEW commits
        // while the off-frame write dies EACCES - every governed write
        // passes through exactly ONE regime (the kernel polices the open
        // real world at attempt time; the capture polices exactly the
        // declaring folder). IF MEASURED NEGATIVE (on-list write refused):
        // BLOCKING PHYSICS FINDING - record typed and close the step
        // BLOCKED; NO improvised workaround grant, NO alternate geometry.
        const res = runFenced([
          "--mount",
          L,
          U,
          W,
          "--",
          HELPER,
          "--write",
          L,
          "--",
          SH,
          "-c",
          `printf ok > ${L}/m.md && echo marked > ${offTarget}`,
        ]);
        assertSound(res);
        expect(res.status).toBe(2);
        expect(res.stderr).toBe(
          `${SH}: 1: cannot create ${offTarget}: Permission denied\n`,
        );
        expect(res.stdout).toBe(""); // "marked" never printed
        expect(readFileSync(path.join(U, "m.md"), "utf8")).toBe("ok");
        expect(existsSync(path.join(L, "m.md"))).toBe(false); // real lower untouched
        expect(existsSync(offTarget)).toBe(false);
      } finally {
        purgeTree(root);
      }
    },
  );

  it.skipIf(hSkip)(
    `H6 exit propagation (out-of-band): exit 42 VERBATIM, stdout exact${ovNote}`,
    () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h6-"));
      const L = path.join(root, "lower");
      const U = path.join(root, "upper");
      const W = path.join(root, "work");
      mkdirSync(L);
      mkdirSync(U);
      mkdirSync(W);
      try {
        const res = runFenced([
          "--mount",
          L,
          U,
          W,
          "--",
          SH,
          "-c",
          "printf p; exit 42",
        ]);
        assertSound(res);
        expect(res.status).toBe(42);
        expect(res.stdout).toBe("p");
        expect(res.stderr).toBe("");
      } finally {
        purgeTree(root);
      }
    },
  );

  it.skipIf(hSkip)(
    `H7 in-band passthrough: coincidental in-band exit OPAQUE through the FULL CHAIN${ovNote}`,
    () => {
      // The conservative in-band reading is the TS consumer's job - the
      // carrier never interprets; band pass-through is a documented
      // continuation under the extended chain.
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h7-"));
      const L = path.join(root, "lower");
      const U = path.join(root, "upper");
      const W = path.join(root, "work");
      mkdirSync(L);
      mkdirSync(U);
      mkdirSync(W);
      try {
        const res = runFenced([
          "--mount",
          L,
          U,
          W,
          "--",
          SH,
          "-c",
          `exit ${FAULT_CODES.abiMissingOrBlocked}`,
        ]);
        assertSound(res);
        expect(res.status).toBe(FAULT_CODES.abiMissingOrBlocked);
        expect(res.stdout).toBe("");
        expect(res.stderr).toBe("");
      } finally {
        purgeTree(root);
      }
    },
  );

  it.skipIf(hSkip)(
    `H8 signal forwarding: SIGTERM death-class preserved (the forwarded signal IS the golden)${ovNote}`,
    async () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h8-"));
      const L = path.join(root, "lower");
      const U = path.join(root, "upper");
      const W = path.join(root, "work");
      mkdirSync(L);
      mkdirSync(U);
      mkdirSync(W);
      try {
        // assertSound does NOT apply to this row (sanctioned signal-golden
        // exception): the node-level timeout kill uses SIGKILL so the
        // wall-clock guard can never masquerade as the forwarded-SIGTERM
        // golden; soundness rides the row's timeout guards instead.
        const proc = spawn(
          HELPER,
          ["--mount", L, U, W, "--", SH, "-c", "kill -TERM $$"],
          {
            stdio: "pipe",
            timeout: 10_000,
            killSignal: "SIGKILL",
          },
        );
        const res = await awaitClose(proc);
        expect(res.signal).toBe("SIGTERM");
        expect(res.code).toBe(null);
        expect(res.stdout).toBe("");
        expect(res.stderr).toBe("");
      } finally {
        purgeTree(root);
      }
    },
    15_000,
  );

  it.skipIf(hSkip)(
    `H9 execve failure REUSED through the chain exits ${FAULT_CODES.execveFailure} (silent)${ovNote}`,
    () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h9-"));
      const L = path.join(root, "lower");
      const U = path.join(root, "upper");
      const W = path.join(root, "work");
      mkdirSync(L);
      mkdirSync(U);
      mkdirSync(W);
      try {
        const side = path.join(root, "side.txt");
        const res = runFenced([
          "--mount",
          L,
          U,
          W,
          "--",
          "/nonexistent-shell-xyz",
          "-c",
          `printf x > ${side}`,
        ]);
        assertSound(res);
        expect(res.status).toBe(FAULT_CODES.execveFailure);
        expect(res.stdout).toBe("");
        expect(res.stderr).toBe("");
        expect(existsSync(side)).toBe(false); // child side effects ABSENT
      } finally {
        purgeTree(root);
      }
    },
  );

  const h10Shapes: ReadonlyArray<
    readonly [string, (root: string) => { args: string[]; side: string }]
  > = [
    [
      "H10a lowerdir ABSENT (guaranteed-absent literal under a fresh root)",
      (root) => {
        const U = path.join(root, "upper");
        const W = path.join(root, "work");
        mkdirSync(U);
        mkdirSync(W);
        const side = path.join(root, "side.txt");
        const args = [
          "--mount",
          path.join(root, "absent-lower"),
          U,
          W,
          "--",
          SH,
          "-c",
          `printf x > ${side}`,
        ];
        return { args, side };
      },
    ],
    [
      "H10b upperdir pre-created as a REGULAR FILE",
      (root) => {
        const L = path.join(root, "lower");
        const W = path.join(root, "work");
        mkdirSync(L);
        mkdirSync(W);
        writeFileSync(path.join(root, "upper"), "x\n"); // regular FILE
        const side = path.join(root, "side.txt");
        const args = [
          "--mount",
          L,
          path.join(root, "upper"),
          W,
          "--",
          SH,
          "-c",
          `printf x > ${side}`,
        ];
        return { args, side };
      },
    ],
    [
      "H10c workdir nested UNDER the lower subtree (overlap violation)",
      (root) => {
        const L = path.join(root, "lower");
        mkdirSync(L);
        const W = path.join(L, "work"); // nested under the lower
        mkdirSync(W);
        const side = path.join(root, "side.txt");
        const args = [
          "--mount",
          L,
          path.join(root, "upper"),
          W,
          "--",
          SH,
          "-c",
          `printf x > ${side}`,
        ];
        return { args, side };
      },
    ],
    [
      "H10d two DISTINCT OVERLAPPING triples in one table (the second workdir nests UNDER the first lower - measured kernel overlap refusal)",
      (root) => {
        // Physics of record (measured 2026-10-07, kernel 7.0.0-34-generic):
        // this kernel REFUSES cross-pair containment when the overlapped
        // component is a WORKDIR located under another mirror's declaring
        // directory (typed 110 at attach); plain lower-containment STACKING
        // and shared uppers/workdirs are LEGAL on this kernel (private mount
        // tables), so the planner's true-nesting refusal at the spawn site
        // remains the production backstop (defense in depth, not grammar).
        const L1 = path.join(root, "l1");
        const L2 = path.join(root, "l2");
        const U1 = path.join(root, "u1");
        const U2 = path.join(root, "u2");
        const W1 = path.join(root, "w1");
        mkdirSync(L1);
        mkdirSync(L2);
        mkdirSync(U1);
        mkdirSync(U2);
        mkdirSync(W1);
        const side = path.join(root, "side.txt");
        const args = [
          "--mount",
          L1,
          U1,
          W1,
          "--mount",
          L2,
          U2,
          L1, // WORKDIR nested under LOWER1 - the kernel refuses this
          "--",
          SH,
          "-c",
          `printf x > ${side}`,
        ];
        return { args, side };
      },
    ],
  ];
  for (const [shape, fixture] of h10Shapes) {
    it.skipIf(hSkip)(
      `${shape} => ${FAULT_CODES.overlayMountFailure} (silent, no side effects)${ovNote}`,
      () => {
        const root = mkdtempSync(path.join(os.tmpdir(), "llh-h10-"));
        try {
          const { args, side } = fixture(root);
          const res = runFenced(args);
          assertSound(res);
          expect(res.status).toBe(FAULT_CODES.overlayMountFailure);
          expect(res.stdout).toBe("");
          expect(res.stderr).toBe("");
          expect(existsSync(side)).toBe(false); // child side effects ABSENT
        } finally {
          purgeTree(root);
        }
      },
    );
  }

  it.skipIf(hSkip)(
    `H11 group-wide kill: top-process signal death, prompt termination, no residual descendants, lower pristine${ovNote}`,
    async () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "llh-h11-"));
      const L = path.join(root, "lower");
      const U = path.join(root, "upper");
      const W = path.join(root, "work");
      mkdirSync(L);
      mkdirSync(U);
      mkdirSync(W);
      writeFileSync(path.join(L, "h11.md"), "pristine\n");
      try {
        // DETERMINISTIC group-wide kill: spawn the supervisor DETACHED
        // (own process group - pgid leadership persisting across the whole
        // fork/exec chain is exactly what is under test; reproduces a
        // delegate that owns the group).
        const proc = spawn(
          HELPER,
          ["--mount", L, U, W, "--", SH, "-c", "sleep 30"],
          {
            stdio: "pipe",
            detached: true,
            timeout: 10_000,
            killSignal: "SIGKILL",
          },
        );
        const pid = proc.pid;
        if (pid === undefined) {
          throw new Error("spawn did not report a pid (POSIX invariant)");
        }
        // Fixed short delay - safely past the measured establishment span
        // (~9-19 ms worst case); the lineage is established and idle.
        await sleepMs(250);
        const tKill = Date.now();
        process.kill(-pid, "SIGKILL"); // GROUP-wide kill on the own group
        const res = await awaitClose(proc);
        const elapsed = Date.now() - tKill;
        expect(res.signal).toBe("SIGKILL"); // TOP process's signal death
        expect(res.code).toBe(null);
        expect(
          elapsed,
          "no-hang guarantee: bounded-partner liveness settles promptly",
        ).toBeLessThan(2_000);
        expect(
          await settleClean(pid),
          "NO RESIDUAL live descendants (orphans reparented to init are reaped - zombie-free)",
        ).toBe(true);
        // Preemptive-only: the real lower is PRISTINE.
        expect(readFileSync(path.join(L, "h11.md"), "utf8")).toBe("pristine\n");
        expect(readdirSync(L)).toStrictEqual(["h11.md"]);
      } finally {
        purgeTree(root);
      }
    },
    15_000,
  );

  it.skipIf(hSkip)(
    `H12 targeted early-child kill race: bounded budget, receipts always-on${ovNote}`,
    async () => {
      // Physics citation (spec-session measurement, provisioned host,
      // stripped tree, 2026-10-07; re-derivation pointer
      // /tmp/s14-spec-probe.py - never committed): map targets of a
      // killed-but-UNREAPED (zombie) child fault EPERM (errno 13) at
      // open() on all three of setgroups/uid_map/gid_map; after reaping they
      // fault ENOENT (errno 2). Consequence under the committed errno
      // ladder: a pre-map targeted kill classifies 107 (the non-ENOENT rung);
      // the ENOENT=>108 signature applies to the post-reap state and to the
      // verdict-write EPIPE corner. The ladder stands as committed - the
      // classification composes mechanically with host variance.
      const MAX_ATTEMPTS = 200;
      const deadline = Date.now() + 20_000; // self-wall-budgeted
      const CLOSE_CAP_MS = 4_000; // hard per-attempt close-delivery bound
      const dist: Record<string, number> = {};
      let stalledClean = 0; // host-side close stalls forensically cleared
      let hit: { attempt: number; code: number } | null = null;
      let attempts = 0;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (Date.now() >= deadline || hit !== null) break;
        attempts++;
        // Fresh scratch triple PER ATTEMPT: a reused workdir accumulates
        // the kernel-managed mode-000 metadata dir across realm deaths,
        // and that state can wedge later mounts on this kernel (measured
        // 2026-10-07 - see the teardown-physics note below the helpers).
        // Fresh mkdtemp roots remove the variable entirely and match the
        // spec row ("per attempt, spawn a valid supervisor + trivial
        // child"); the max-pid snapshot at spawn bounds the fresh-pid
        // scan, per the spec.
        const root = mkdtempSync(path.join(os.tmpdir(), "llh-h12-"));
        const L = path.join(root, "lower");
        const U = path.join(root, "upper");
        const W = path.join(root, "work");
        mkdirSync(L);
        mkdirSync(U);
        mkdirSync(W);
        try {
          const baseline = maxPidSnapshot(); // bounds the fresh-pid scan
          const proc = spawn(
            HELPER,
            ["--mount", L, U, W, "--", SH, "-c", "true"],
            {
              stdio: "pipe",
              timeout: 8_000,
              killSignal: "SIGKILL",
            },
          );
          const helperPid = proc.pid;
          if (helperPid === undefined) {
            throw new Error("spawn did not report a pid (POSIX invariant)");
          }
          // Tightly scan the fresh-pid range for the realm child
          // (ppid == helper pid).
          let victim = 0;
          let hi = baseline;
          const pollDeadline = Date.now() + 40;
          outer: for (;;) {
            await sleepMs(2);
            if (Date.now() > pollDeadline) break;
            for (const p of liveProcPids()) {
              if (p > hi) hi = p;
              if (p <= baseline) continue;
              const t = procTriple(p);
              if (t !== null && t.ppid === helperPid) {
                victim = p;
                break outer;
              }
            }
          }
          let killed = false;
          if (victim > 0) {
            try {
              process.kill(victim, "SIGKILL");
              killed = true;
            } catch {
              // ESRCH: the child completed between scan and kill - a lost
              // race, not a fault.
            }
          }
          const tKill = Date.now();
          const res = await awaitCloseCapped(proc, CLOSE_CAP_MS);
          const elapsed = Date.now() - tKill;
          if (res.stalled) {
            // Cap tripped (host-side close-delivery stall, not a carrier
            // hang - measured physics above). NO-HANG receipt is re-proven
            // by LINEAGE FORENSICS: nudge-kill the (almost certainly
            // already-gone) process and REQUIRE the NO-RESIDUAL receipt to
            // hold. A genuinely wedged carrier would leave a live lineage.
            try {
              proc.kill("SIGKILL");
            } catch {
              // ESRCH: already gone - exactly the forensic outcome needed.
            }
            const clean = await settleClean(helperPid);
            if (clean) {
              stalledClean += 1;
              dist["stall:lineage-clean"] =
                (dist["stall:lineage-clean"] ?? 0) + 1;
            } else {
              dist["stall:lineage-residual:receipt-broken"] =
                (dist["stall:lineage-residual:receipt-broken"] ?? 0) + 1;
            }
          } else {
            const corner =
              res.code === FAULT_CODES.realmMapWriteFailure ||
              res.code === FAULT_CODES.childEarlyDeath;
            const silent = res.stdout === "" && res.stderr === "";
            const clean = await settleClean(helperPid);
            const baseKey = corner
              ? killed
                ? `hit:${res.code}`
                : `corner-untriggered:${res.code}`
              : res.signal !== null
                ? `signal:${res.signal}`
                : `exit:${res.code}`;
            // Always-on receipts per attempt regardless of outcome:
            // no-hang (prompt), silence on classified corners, no residual.
            const broken = !clean || !silent || elapsed >= 2_000;
            const finalKey = broken ? `${baseKey}:receipt-broken` : baseKey;
            dist[finalKey] = (dist[finalKey] ?? 0) + 1;
            if (corner && killed && silent && elapsed < 2_000 && clean) {
              hit = { attempt, code: res.code }; // committed code for the corner reached
            }
          }
        } finally {
          purgeTree(root);
        }
      }
      // Terminal states: hit => recorded via the distribution below;
      // exhaustion => the row STAYS GREEN with the always-on receipts
      // asserted plus the typed note recording the observed distribution
      // + the physics citation (the deterministic acceptance core is the
      // no-hang/no-residual/zero-unexpected-code receipt on EVERY
      // non-stalled attempt, plus the lineage forensics receipt on every
      // stalled one; a permanent skip would perturb the standing zero-
      // skip-drift count bar - so the note-plus-pass terminal is the
      // specified one either way).
      const brokenKeys = Object.keys(dist).filter((k) =>
        k.endsWith(":receipt-broken"),
      );
      expect(
        brokenKeys.length,
        `no-hang/no-residual/silence receipts held on every attempt (distribution: ${JSON.stringify(dist)})`,
      ).toBe(0);
      console.log(
        `[landlock-helper suite] H12 targeted-kill race: ${attempts} attempts, hit=${hit === null ? "none" : `attempt-${hit.attempt} code-${hit.code}`}, distribution=${JSON.stringify(dist)}${stalledClean > 0 ? `, host-side-close-stalls(lineage-clean)=${stalledClean}` : ""} (physics basis: killed-but-unreaped map targets fault EPERM at open => pre-map kills classify 107; post-reap fault ENOENT => 108 at the verdict-write EPIPE corner; measured 2026-10-07 on the provisioned stripped host)`,
      );
    },
    35_000,
  );

  const h13Reason = !ccAvailable
    ? "no cc/gcc compiler found on this host"
    : !CAP.usable
      ? `Landlock unusable here - the script's own probe-smoke gate refuses: ${CAP.reason}`
      : OV.reason;
  const h13Skip = h13Reason !== "none";
  const h13Note = skipNote(h13Reason);

  it.skipIf(h13Skip)(
    `H13 tmp-rebuild parity: regenerated binary passes BOTH probes green (cleanup receipts hold)${h13Note}`,
    () => {
      const regenRoot = mkdtempSync(path.join(os.tmpdir(), "llh-h13-"));
      const tmpOut = path.join(regenRoot, "landlock-helper-tmp");
      const built = recordSpawn(
        "bash",
        [REGEN_SCRIPT, tmpOut],
        REGEN_TIMEOUT_MS,
      );
      expect(
        built.abnormal,
        "regeneration hung past the wall-clock guard",
      ).toBe(false);
      expect(built.status, built.stderr).toBe(0);
      expect(existsSync(tmpOut)).toBe(true);
      // Functional parity of the NEW mechanic across both probes (byte
      // parity NOT claimed - the established bar).
      const probe = recordSpawn(tmpOut, ["--probe"], HELPER_TIMEOUT_MS);
      expect(probe.status).toBe(0);
      const p = parseProbeLine(probe.stdout.slice(0, -1));
      if (p === null || p.status !== "ok") {
        throw new Error(
          `tmp rebuild probe line off-contract: ${JSON.stringify(probe.stdout)}`,
        );
      }
      expect(p.abi).toBe(p.pin);
      const ovpRoot = mkdtempSync(path.join(os.tmpdir(), "llh-h13v-"));
      try {
        const arm = recordSpawn(
          tmpOut,
          ["--overlay-probe", ovpRoot],
          HELPER_TIMEOUT_MS,
        );
        assertSound(arm);
        expect(arm.stdout).toBe("landlock-helper overlay realm=ok status=ok\n");
        expect(arm.status).toBe(0);
        expect(arm.stderr).toBe("");
        expect(existsSync(path.join(ovpRoot, ".llh-overlay-probe"))).toBe(
          false,
        ); // cleanup receipt
        expect(existsSync(ovpRoot)).toBe(true);
      } finally {
        // Both minted roots torn down (the reggen output dir included -
        // the suite leaves no scratch behind).
        purgeTree(ovpRoot);
        purgeTree(regenRoot);
      }
    },
    150_000,
  );

  // Inducibility ledger (suite comment, not test rows): 106 (clone),
  // 109 (unshare), and 111 (umount - arm-only by construction), and the
  // untargetable 108 map-window are NOT hermetically inducible on a healthy
  // kernel - their presence/distinctness ride the A-group band-integrity
  // row (TWELVE pairwise-distinct) + the vendor README defensiveness note
  // (the 103 treatment, verbatim precedent). 107/108 gain executable
  // coverage where the H12 physics lands them.
});

/* ========================================================================
 * I - production-context (in-bubble) receipts & regression guards
 *
 * Appended after group H (lettering convention continues). The quality-gate
 * rework (revision round 6) landed this family: NO committed test ever ran
 * the SHIPPED carrier inside the production bubble (hermetic positive rows
 * run BARE from vitest; the S13 in-bubble GREEN used throwaway vehicle
 * sources), and the map-target termination defect that shipped green bare
 * was deterministic there. The standing in-bubble rows below ARE the
 * production-context receipts; the source-guard row pins the repair at the
 * site (behavioral black-box pinning of the layout-dependent bug class is
 * unpinnable BY NATURE - the division of labor is the receipt, not a gap).
 * House discipline carried verbatim: real-binary rows, skip-with-surfaced-
 * reason degrade-honest doctrine, mkdtemp isolation, exact-byte assertions,
 * wall-clock guards that make hangs FAIL loudly, stdlib-only includes (this
 * file imports NOTHING from sandbox/ - dependency partition: node:* +
 * relative suite-local derivations only), zero casts,
 * erasableSyntaxOnly-clean. The base-flag vector below is tied to the
 * module-private buildBaseFlags in render.ts BY THE PARITY ROW, which
 * re-derives it FROM THE SOURCE TEXT at execution time (a stale hand-cached
 * quotation trips LOUDLY rather than silently re-testing wrong flags).
 * ======================================================================== */

/** Binary presence/usability probe with an INJECTABLE name/path (default
 * callers pass "bwrap"; the stub row proves the degrade-honest mechanism
 * WITHOUT needing actual absence on the host - launcher-suite fixture-
 * script precedent): one --version consult under a short wall guard (the
 * cc/python detection idiom mirrored). Usable <=> clean exit 0 without a
 * spawn error. Surfaced reason form ("none" when usable):
 *   <name> version-spawn failed (exit=<status>) [spawn error]
 * (the bracketed marker present iff the spawn itself faulted - absent or
 * non-executable binary). */
interface ToolBinaryProbe {
  readonly usable: boolean;
  /** Surfaced skip reason ("none" when usable). */
  readonly reason: string;
}

function probeToolBinary(name: string): ToolBinaryProbe {
  const v = recordSpawn(name, ["--version"], 5_000);
  if (!v.abnormal && v.status === 0) {
    return { usable: true, reason: "none" };
  }
  return {
    usable: false,
    reason: `${name} version-spawn failed (exit=${String(v.status)})${
      v.abnormal ? " [spawn error]" : ""
    }`,
  };
}

const BWRAP = probeToolBinary("bwrap");
if (BWRAP.usable) {
  console.log("[landlock-helper suite] bwrap usable: version-spawn green");
} else {
  console.warn(
    `[landlock-helper suite] in-bubble rows will skip - ${BWRAP.reason}`,
  );
}

/** In-bubble geometry pins (unit C.3): the COMMITTED prebuild ro-bound at
 * a fixed in-bubble path (the receipt must exercise the committed bytes
 * directly, not a copy); ONE fresh host-side mkdtemp scratch bound rw at
 * /scratch - ALL suite artifacts ride it (NEVER the bubble's private /tmp
 * tmpfs: fresh per bubble, invisible from the host side, so host-visible
 * teardown/post-run assertions would invert the receipt). Do NOT use the
 * host /proc lineage-forensic helpers in the in-bubble rows - bubble
 * pid/user-namespace separation makes host-side ppid mapping unreliable
 * there; the in-bubble rows assert BYTE CHANNELS + host-visible scratch
 * state ONLY. */
const BUBBLE_HELPER_PATH = "/llh-helper";
const BUBBLE_SCRATCH_MOUNT = "/scratch";

/** Minimum ro-bind set (verbatim - the kickoff recipe's bindings). */
const BUBBLE_RO_BIND_TARGETS: ReadonlyArray<string> = [
  "/usr",
  "/bin",
  "/lib",
  "/lib64",
  "/etc",
];

/** Local replica of the CURRENT 14-token base-flag vector with process-
 * derived placeholders for the identity pair. buildBaseFlags is module-
 * PRIVATE in render.ts (OUTSIDE this step's footprint - byte-diff empty);
 * the parity row keeps this replica live-tied to the source text. */
const BASE_FLAGS_REPLICA_TEMPLATE: readonly string[] = [
  "--unshare-all",
  "--uid",
  "<UID>",
  "--gid",
  "<GID>",
  "--share-net",
  "--die-with-parent",
  "--dev",
  "/dev",
  "--proc",
  "/proc",
  "--tmpfs",
  "/tmp",
];

/** Derive the CONCRETE base-flag vector FROM THE SOURCE TEXT of render.ts
 * AT EXECUTION TIME (the live tie): extract the buildBaseFlags body,
 * pull the string literals in declaration order plus the two identity-
 * marker positions, substitute process.getuid() / process.getgid().
 * Throws loud on any drift (missing function, unresolvable body window)
 * - extraction failure is a FAILED parity row, never a silent wrong-flag
 * re-test. Bubble invocations consume THIS derivation, never a quotation. */
function deriveBaseFlagsFromSource(): string[] {
  const src = readFileSync(
    path.join(PKG_ROOT, "src", "sandbox", "render.ts"),
    "utf8",
  );
  const declAt = src.indexOf("function buildBaseFlags(");
  if (declAt < 0) {
    throw new Error(
      "parity derivation: buildBaseFlags declaration not found in render.ts",
    );
  }
  const bodyStart = src.indexOf("{", declAt);
  const bodyEnd = src.indexOf("\n}", bodyStart);
  if (bodyStart < 0 || bodyEnd < 0) {
    throw new Error(
      "parity derivation: buildBaseFlags body window unresolvable in render.ts",
    );
  }
  const body = src.slice(bodyStart, bodyEnd);
  const id = suiteIdentity();
  const TOKEN_RE = /"([^"\n]*)"|String\(identity\.(uid|gid)\)/g;
  const tokens: string[] = [];
  for (;;) {
    const m = TOKEN_RE.exec(body);
    if (m === null) break;
    if (m[1] !== undefined) {
      tokens.push(m[1]); // plain literal (no escapes in the current source)
    } else if (m[2] === "uid") {
      tokens.push(String(id.uid));
    } else {
      tokens.push(String(id.gid));
    }
  }
  return tokens;
}

/** Reaped-child detail line (COMBINED-ARM ONLY; the map-stage fault path
 * folds the MEASURED outcome at its own pinned diagnostic position -
 * AFTER the stage diagnostic line, BEFORE the stdout report line). Single
 * alternation over exit|signal; LF-terminated. */
const REAPED_DETAIL_LINE_RE =
  /^landlock-helper overlay: reaped child: (?:exit|signal)=\d+\n$/;

/** Suite process identity (a verbatim replica of render.ts's OWN guarded
 * access - the platform-optional API surface checked explicitly; the suite
 * runs on POSIX hosts by construction, so a failure here is a LOUD test
 * error, never a silent skip). */
function suiteIdentity(): { readonly uid: number; readonly gid: number } {
  const uidOf = process.getuid;
  const gidOf = process.getgid;
  if (typeof uidOf !== "function" || typeof gidOf !== "function") {
    throw new Error(
      "process identity APIs unavailable (getuid/getgid) — POSIX host required",
    );
  }
  const uid = uidOf();
  const gid = gidOf();
  if (uid === undefined || gid === undefined) {
    throw new Error(
      "process identity unresolved (getuid/getgid returned undefined) — POSIX host required",
    );
  }
  return { uid, gid };
}

describe("landlock-helper production-context (in-bubble) receipts & regression guards (I)", () => {
  /* Composed skip gate for the bubble rows (doctrine-identical to the
   * Landlock rows): the bare combined arm must be green first (OV), then
   * the bwrap probe must report usable; the operative reason surfaces. */
  const iReason = !OV.usable
    ? OV.reason
    : !BWRAP.usable
      ? BWRAP.reason
      : "none";
  const iSkip = iReason !== "none";
  const iNote = skipNote(iReason);

  /** One bwrap invocation argv: the DERIVED base flags (never a hand-
   * cached quotation), the minimum ro-bind set verbatim, the COMMITTED
   * prebuild at its fixed in-bubble path, ONE host-side scratch rw at
   * /scratch, then the payload tail after `--`. */
  function bubbleArgs(
    scratchHostRoot: string,
    payloadTail: readonly string[],
  ): string[] {
    return [
      ...deriveBaseFlagsFromSource(),
      ...BUBBLE_RO_BIND_TARGETS.flatMap((t) => ["--ro-bind", t, t]),
      "--ro-bind",
      HELPER,
      BUBBLE_HELPER_PATH,
      "--bind",
      scratchHostRoot,
      BUBBLE_SCRATCH_MOUNT,
      "--",
      ...payloadTail,
    ];
  }

  it("the in-bubble base-flag replica ties to the render.ts source at execution time (parity row - unconditional)", () => {
    const derived = deriveBaseFlagsFromSource();
    const id = suiteIdentity();
    const concretized = BASE_FLAGS_REPLICA_TEMPLATE.map((token) => {
      if (token === "<UID>") return String(id.uid);
      if (token === "<GID>") return String(id.gid);
      return token;
    });
    expect(
      derived,
      "drift between the suite replica and the buildBaseFlags source: re-pin BOTH sides in the same commit (a stale hand-cached quotation is a false receipt by construction)",
    ).toStrictEqual(concretized);
  });

  it("the bwrap presence probe degrades honestly with the pinned surfaced-reason form (stubbed absence - unconditional)", () => {
    const STUB_NAME = "/usr/bin/llh-definitely-absent-stub";
    const probe = probeToolBinary(STUB_NAME);
    expect(probe.usable).toBe(false);
    expect(probe.reason).toBe(
      `${STUB_NAME} version-spawn failed (exit=null) [spawn error]`,
    );
  });

  it("the reaped-child detail line form-golden accepts both pinned forms and rejects off-form bytes (unconditional)", () => {
    // Accepted: both measured variants, single- and multi-digit.
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay: reaped child: exit=0\n",
      ),
    ).toBe(true);
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay: reaped child: exit=255\n",
      ),
    ).toBe(true);
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay: reaped child: signal=9\n",
      ),
    ).toBe(true);
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay: reaped child: signal=137\n",
      ),
    ).toBe(true);
    // Rejected: trailing junk, extra line, missing colon / decimal,
    // prefix or word drift, internal whitespace, wrong prefix entirely.
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay: reaped child: exit=1 junk\n",
      ),
    ).toBe(false);
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay: reaped child: exit=1\nsecond\n",
      ),
    ).toBe(false);
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay reaped child: exit=1\n",
      ),
    ).toBe(false);
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay: reaped child: exit=1 \n",
      ),
    ).toBe(false);
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay: reaped child: exit=\n",
      ),
    ).toBe(false);
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay: reaped child: exited=1\n",
      ),
    ).toBe(false);
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "Landlock-helper overlay: reaped child: exit=1\n",
      ),
    ).toBe(false);
    expect(
      REAPED_DETAIL_LINE_RE.test(
        "landlock-helper overlay: failed at realm-map (errno=32)\n",
      ),
    ).toBe(false);
  });

  it("the carrier source-guard pins the proc_target termination at the site with the invariant marker and a mechanically bounded audit scope (unconditional)", () => {
    const src = readFileSync(
      path.join(PKG_ROOT, "vendor", "landlock-helper", "landlock-helper.c"),
      "utf8",
    );
    // (iv) exactly ONE append_decimal(pidbuf fill site exists - the
    // audit scope stays mechanically bounded.
    let fillSites = 0;
    let at = 0;
    for (;;) {
      const found = src.indexOf("append_decimal(pidbuf", at);
      if (found < 0) break;
      fillSites += 1;
      at = found + 1;
    }
    expect(fillSites).toBe(1);
    // (iii) the append_decimal DOC BLOCK (the comment directly above its
    // definition) carries the TERMINATION INVARIANT marker.
    const fnAt = src.indexOf("static size_t append_decimal(");
    expect(fnAt, "append_decimal definition not found").toBeGreaterThanOrEqual(
      0,
    );
    const docOpen = src.lastIndexOf("/*", fnAt);
    expect(docOpen, "doc comment open not found").toBeGreaterThanOrEqual(0);
    const docBlock = src.slice(docOpen, fnAt);
    expect(
      docBlock.includes("TERMINATION INVARIANT"),
      "the TERMINATION INVARIANT marker must stand in the append_decimal doc block",
    ).toBe(true);
    // (i)+(ii) the proc_target body window (definition -> next top-level
    // static symbol marker): the whitespace-normalized terminator
    // statement occurs STRICTLY after the append_decimal(pidbuf fill and
    // STRICTLY before the FIRST strlen( in the window.
    const winStart = src.indexOf("static long proc_target(");
    expect(winStart, "proc_target definition not found").toBeGreaterThanOrEqual(
      0,
    );
    const winEnd = src.indexOf("\nstatic ", winStart);
    expect(
      winEnd,
      "next top-level static marker not found after proc_target",
    ).toBeGreaterThan(winStart);
    const window = src.slice(winStart, winEnd);
    const norm = window.replace(/\s+/g, " ");
    const stmtIdx = norm.indexOf(`pidbuf[pn] = '\\0';`);
    const fillIdx = norm.indexOf("append_decimal(pidbuf");
    const strlenIdx = norm.indexOf("strlen(");
    expect(
      fillIdx >= 0 &&
        strlenIdx > fillIdx &&
        stmtIdx > fillIdx &&
        stmtIdx < strlenIdx,
      `termination ordering violated in the proc_target window (fill=@${fillIdx}, statement=@${stmtIdx}, first strlen=@${strlenIdx})`,
    ).toBe(true);
    // (v)+(vi) the REAP ASSEMBLY SITE (the unit-B combined-arm emission
    // fold) is pinned under the SAME invariant: exactly two length-driven
    // fill sites (exit=/signal= branches), the writer-terminator STRICTLY
    // after the last fill and the LF write and BEFORE the sink handoff,
    // the assembly window strlen-free, and no strlen sizing of the buffer
    // anywhere in the source (the sink consumes the writer-terminated
    // payload via the handoff pointer only - explicit-assembly safe form 2,
    // like map_line's explicit trailing NUL).
    const rWinStart = src.indexOf("char reap_line[");
    expect(rWinStart, "reap_line declaration not found").toBeGreaterThanOrEqual(
      0,
    );
    const rWinEnd = src.indexOf("reap_detail = reap_line;", rWinStart);
    expect(
      rWinEnd,
      "sink handoff assignment not found after the reap_line declaration",
    ).toBeGreaterThan(rWinStart);
    const rWindow = src.slice(rWinStart, rWinEnd);
    const rNorm = rWindow.replace(/\s+/g, " ");
    let rFills = 0;
    let rAt = 0;
    for (;;) {
      const found = rWindow.indexOf("append_decimal(reap_line", rAt);
      if (found < 0) break;
      rFills += 1;
      rAt = found + 1;
    }
    expect(rFills, "exactly TWO reap-fill sites bound the audit scope").toBe(2);
    const rFillLast = rNorm.lastIndexOf("append_decimal(reap_line");
    const rLfIdx = rNorm.indexOf(`reap_line[rn++] = '\\n';`);
    const rTermIdx = rNorm.indexOf(`reap_line[rn] = '\\0';`);
    expect(
      rFillLast >= 0 &&
        rLfIdx > rFillLast &&
        rTermIdx > rLfIdx &&
        !rNorm.includes("strlen("),
      `reap-site termination violated (lastFill=@${rFillLast}, LF=@${rLfIdx}, terminator=@${rTermIdx}; window strlen-free: ${!rNorm.includes("strlen(")})`,
    ).toBe(true);
    expect(src.includes("strlen(reap_line")).toBe(false);
  });

  it.skipIf(iSkip)(
    `I1 committed prebuild in the standard bubble: combined-probe positive chain GREEN x3 (byte channels + host-visible scratch receipts)${iNote}`,
    () => {
      const scratchRoot = mkdtempSync(path.join(os.tmpdir(), "llh-i1-"));
      try {
        for (let run = 1; run <= 3; run++) {
          const rootHost = path.join(scratchRoot, `root${run}`);
          mkdirSync(rootHost); // grammar: the probe root must EXIST
          const r = recordSpawn(
            "bwrap",
            bubbleArgs(scratchRoot, [
              BUBBLE_HELPER_PATH,
              "--overlay-probe",
              `${BUBBLE_SCRATCH_MOUNT}/root${run}`,
            ]),
            HELPER_TIMEOUT_MS,
          );
          assertSound(r);
          expect(
            r.stdout,
            `run ${run}: the ok-cell report line EXACTLY (one stdout line, zero others)`,
          ).toBe("landlock-helper overlay realm=ok status=ok\n");
          expect(
            r.stderr,
            `run ${run}: stderr EXACTLY empty (success path stays silent - the reap fold emits only on the map-stage fault path)`,
          ).toBe("");
          expect(r.status, `run ${run}: exit 0`).toBe(0);
          // Host-visible receipts through the scratch mapping: the minted
          // subtree cleaned in-bubble; the caller root survives.
          expect(
            existsSync(path.join(rootHost, ".llh-overlay-probe")),
            `run ${run}: minted subtree must be removed in-bubble (host-visible via the scratch bind)`,
          ).toBe(false);
          expect(existsSync(rootHost), `run ${run}: caller root survives`).toBe(
            true,
          );
        }
      } finally {
        rmSync(scratchRoot, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it.skipIf(iSkip)(
    `I2 committed prebuild in the standard bubble: supervisor-mode positive chain GREEN (establishment in the production layout - the silence law across the full chain)${iNote}`,
    () => {
      const scratchRoot = mkdtempSync(path.join(os.tmpdir(), "llh-i2-"));
      const L = path.join(scratchRoot, "lower");
      const U = path.join(scratchRoot, "upper");
      const W = path.join(scratchRoot, "work");
      mkdirSync(L);
      mkdirSync(U);
      mkdirSync(W);
      try {
        const r = recordSpawn(
          "bwrap",
          bubbleArgs(scratchRoot, [
            BUBBLE_HELPER_PATH,
            "--mount",
            `${BUBBLE_SCRATCH_MOUNT}/lower`,
            `${BUBBLE_SCRATCH_MOUNT}/upper`,
            `${BUBBLE_SCRATCH_MOUNT}/work`,
            "--",
            SH,
            "-c",
            "true",
          ]),
          HELPER_TIMEOUT_MS,
        );
        assertSound(r);
        // Minimal green-establishment receipt over the FULL establishment
        // chain (clone -> hardened maps -> verdict -> realm continuation
        // -> shell execve): exit 0 with EXACTLY-empty stdout AND stderr -
        // the silence law pinned IN production context. Deeper capture-
        // mechanic legs are deliberately NOT added here (the bare H-group
        // rows pin them; this row tests ESTABLISHMENT IN THE PRODUCTION
        // LAYOUT - precisely what the D1 defect broke).
        expect(
          r.status,
          `supervisor in-bubble exit 0 (stderr=${JSON.stringify(r.stderr)})`,
        ).toBe(0);
        expect(r.stdout, "production arm success emits NOTHING on stdout").toBe(
          "",
        );
        expect(r.stderr, "production arm success emits NOTHING on stderr").toBe(
          "",
        );
      } finally {
        // Tolerant teardown: after a realm death WITHOUT umount (the
        // production no-self-teardown posture) the workdir may retain the
        // kernel-managed mode-000 metadata dir - purgeTree owns the
        // retry ladder (H-group physics note).
        purgeTree(scratchRoot);
      }
    },
    30_000,
  );

  // Inducibility ledger update (suite comment, not a forced row): forcing
  // a reliable BEHAVIORAL map-stage fault that YIELDS a reaped child is a
  // host-variance race - in most induced corners the child is alive at
  // reap time (blocked in its verdict read), so the WNOHANG corner
  // resolves conservatively (NO detail line emitted). The H12 targeted-
  // kill corner is the closest inducer and its outcome distribution is
  // variance-classified. The reaped line's PRESENCE therefore rides its
  // FORM row above + the diff-bound emission site in the carrier source,
  // following the standing ledger precedent for non-inducible corners
  // (106/109/111).
});
