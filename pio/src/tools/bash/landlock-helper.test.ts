import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
 * construction; the suite-local derivation is intentional - Step 3 owns the
 * production resolver, whose parity rows bind it to this replica). */
const PKG_ROOT = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);

/** Suite-local replica const block (lockstep home - Step 3 adds parity rows
 * asserting the production constants match these replicas). EVERY exit-code
 * assertion in this file references this block; raw band literals occur
 * nowhere else in the file (mechanical audit). */
const FAULT_CODES = {
  malformedSpec: 100,
  abiMissingOrBlocked: 101,
  addRuleFailure: 102,
  restrictSelfFailure: 103,
  execveFailure: 104,
};

/** Reserved fault band - codes are issued only pre-execve, by construction.
 * v1 assigns the low half; the rest stays reserved. */
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
      reason: `prebuild absent at ${HELPER} (Step 3 fail-closed classifier owns the absent-binary case - never a silent fallback)`,
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

/** Measured host ABI (kickoff remeasurement 2026-10-04: kernel
 * 7.0.0-34-generic, x86_64, Ubuntu 24.04 HWE - version discovery returned 8).
 * The ABI-report row pins the MEASURED value: if the kickoff host differs,
 * re-measure, update this constant, and record the measurement in the step
 * TEST record; a further divergence from the v2 pins is a BLOCKED-with-
 * evidence event, NOT a silent adaptation (owner ruling). */
const MEASURED_HOST_ABI = 8;

/* ------------------------------ scratch layout --------------------------- */

const scratch = mkdtempSync(path.join(os.tmpdir(), "llh-suite-"));
const frame = path.join(scratch, "frame");
const outside = path.join(scratch, "outside");
mkdirSync(frame);
mkdirSync(outside);
// Grant-scope hygiene: the frames grant mkdtemp dirs ONLY - no /dev targets
// anywhere in fenced commands (measured: /dev writes deny unless granted;
// the materializer-owned /dev allowance lands in Step 3).
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

/** Soundness watch item: any signal-death or timeout on a row stops with
 * evidence owed (strace/core) - asserted here so the failure is loud. */
function assertSound(res: SpawnRecord): void {
  expect(
    res.abnormal,
    "signal-death/timeout: capture evidence (strace/core) and surface - soundness watch item",
  ).toBe(false);
}

/* ---------- A. Protocol & classification - ALWAYS HOLD (kernel-independent) ---------- */

describe("landlock-helper suite-local const block (A)", () => {
  it("the five fault codes are pairwise distinct, inside the reserved band, and none zero", () => {
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
      // absoluteness contract that is the absolute program path (the v1-pinned
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
      // Inner shell spawned through PATH carries argv[0]="sh": the v1-pinned
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
  // defensiveness is documented in the vendor README (honesty note carried
  // into the step TEST record).
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
