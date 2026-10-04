# landlock-helper - vendored fence carrier for the command-write fence

The self-authored Landlock helper that every phase-invoked `bash` tool call
spawns around its command process tree: it builds a fresh per-spawn Landlock
ruleset from a directory allowlist, applies it to itself, then `execve`s the
command. Off-permission writes die at attempt time (kernel-side EACCES,
nothing lands); on-permission writes complete plainly. The ruleset
materializer and the fenced bash tooling under `src/tools/bash/` consume this
artifact verbatim.

## Provenance

- Self-authored (2026-10-04), MIT-aligned with the repository. Vendored here
  as source + developer-only regeneration tooling + committed static
  prebuilds.
- WHY VENDORED + STATIC + SELF-AUTHORED CONSTANTS: the helper sits on the
  security boundary. Behavioral proof governs - every ABI fact below was
  MEASURED behaviorally on the provisioned host (side-effect-confirmed
  syscalls, exhaustive rejection batteries, register-hygiene controlled
  comparisons) and cross-checked against the running kernel's own published
  userspace API header, which AGREES with measured behavior on this host but
  is still not trusted by policy: the C hand-defines syscall numbers (per-arch
  guarded), struct layouts, bit values, and the discovery flag, carries
  `_Static_assert` mirrors, and includes NO Landlock kernel header - only a
  minimal portable libc header set. No third-party runtime bytes, no new
  required host binary (`cc`/`gcc` is dev-time-only, for regeneration).
- The committed prebuilt binary is what runs. Byte-reproducibility across
  rebuilds is NOT claimed; behavioral parity via the `--probe` line is the bar.

## Argv protocol

Two modes. Every FAULT exits with a distinct classified code BEFORE any
`execve`; a successful apply hands the exit code to the COMMAND (`execve`
replaces the process). Apply mode is SILENT on all fault paths: stdout AND
stderr carry EXACTLY ZERO bytes - the classified exit code is the entire
channel. Typed refusal rendering lives in the TS layer (`src/tools/bash/`).

### Probe mode (exact form)

```
landlock-helper --probe
```

ONE token only; ANY additional token => exit 100 (silent, like every
malformed-spec fault). Sequence: VERSION discovery (return-value channel,
precedes `prctl` - the query needs no NO_NEW_PRIVS) ->
`prctl(PR_SET_NO_NEW_PRIVS, 1)` -> create a trivial ruleset (mutation word,
ZERO added rules) -> `restrict_self(flags=0)` -> print the report -> `_exit`.
This is the THROWAWAY applicability check - never applied to the long-lived
agent process; the ratchet is one-way. Exactly ONE stdout line, ASCII,
LF-terminated, in BOTH outcomes (stderr carries a short human diagnostic on
failure only):

```
landlock-helper probe abi=<DISCOVERED_MAX|0> pin=<PINNED_ABI> status=<ok|fail>
```

`status=ok` <=> exit 0 (discovered == pin - EXACT IDENTITY - and the full
sequence completed); `status=fail` <=> exit 101 (includes the above-pin
identity refusal). Zero other stdout bytes.

### Apply mode (default; any invocation without `--probe`)

```
landlock-helper --write ABS_PATH [--write ABS_PATH ...] -- CMD_ARGV...
```

Grammar:

- Tokens before the FIRST `--` are scanned as `--write` PAIRS ONLY (any other
  leading token => 100). At least one pair is required.
- Each value must be non-empty and ABSOLUTE (first char `/`). A `--write`
  left without a value just before `--` (or at end) => 100.
- The `--` separator is REQUIRED. At least ONE argument follows it (the
  program). The helper performs NO path resolution or PATH lookup - PROGRAM
  ABSOLUTENESS IS THE TS ASSEMBLER'S CONTRACT.
- Duplicate `--write` paths deduplicate silently (first occurrence kept, order
  preserved). Everything after the FIRST `--` passes through VERBATIM
  (terminator discipline - `--write`-looking tokens after it belong to the
  command).

Sequence: parse/validate (silent 100) -> `prctl(PR_SET_NO_NEW_PRIVS, 1)`
(=> 101) -> `landlock_create_ruleset` (native attr; slot 0 = mutation word)
(=> 101) -> per unique spec path: `open(path, O_PATH|O_CLOEXEC|O_DIRECTORY)`
then the typed `landlock_add_rule` then `close` (=> 102) ->
`landlock_restrict_self(rs_fd, flags=0)` (=> 103) -> close ruleset fd ->
`execve(argv0, argv, environ)` (=> 104). REGISTER DISCIPLINE: every Landlock
call is issued with exactly six arguments, unused trailing slots explicitly
zeroed (measured false-failure hazard - see ABI & pin policy).

Inherited verbatim: cwd, environment, signals (DEFAULT dispositions - the
helper installs no handlers; group-kill semantics are the spawner's
concern). The helper chdirs nowhere and mutates no env. Stream purity: on
success the command's stdout/stderr are PRISTINE (the helper emitted nothing
beforehand); the exit code is the command's.

## Fault-code table

Reserved band 100-199; the current assignment uses the low half. Every fault
exits with a DISTINCT code before any execve.

| code | class | trigger |
|------|-------|---------|
| 100 | `malformed-spec` | argv-grammar violation (either mode) |
| 101 | `abi-missing-or-blocked` | `prctl(NO_NEW_PRIVS)` blocked, or `landlock_create_ruleset` failed (unsupported kernel, ABI identity mismatch - discovered != pin in EITHER direction - seccomp block, ...) |
| 102 | `add-rule-failure` | spec-path open failed or `landlock_add_rule` failed (not a directory, vanished, capability gap, ...) |
| 103 | `restrict-self-failure` | `landlock_restrict_self` failed |
| 104 | `execve-failure` | `execve` of the passed-through argv failed after restriction |

Band discipline: codes are 100-104; 105-199 stay reserved. Once `execve`
succeeds the helper is gone, so a band code can ONLY mean machinery fault -
that is the disambiguation, BY CONSTRUCTION. DOCUMENTED RESIDUAL CORNER: a
user command that completes (fully fenced) with an exit code inside the band
is interpreted by the TS consumer conservatively as a machinery fault
(enforcement was active throughout; only the refusal text could mislabel the
cause). Interpretive authority over the band resides in the TS consumer (the
fault-vocabulary module); TOCTOU/spawn-site authority sits at the spawn site -
the probe is a fast-path gate, never a standing permission.

## ABI & pin policy

### Host-class descriptor

All host-class-varying ABI values live in ONE `struct ll_abi_class` row per
admitted class in the C source, and NOWHERE else; call sites reference the
active instance exclusively (zero raw ABI literals at any call site).
Protocol constants (fault codes, argv grammar, probe-line format) are
host-invariant and sit OUTSIDE the descriptor - host adaptation must never
touch them. EXTENDING TO A NEW CLASS = one new table row (with a
measurement-evidence pointer) + one `#elif` arm; nothing else moves. A
compile-time-selected union of named attr structs (chosen in the same `#if`
block, asserted against the descriptor's `*_bytes` fields) is the documented
escape valve for a future class needing different field arrangements -
documented capability, not present code.

### Admitted class (support contract, pinned 2026-10-04)

Admitted kernel class = {x86_64, ABI 8}. Every OTHER class receives the
universal typed-refusal path (the 101 family); growth to a new class happens
ONLY via an explicit measure-and-pin pass on real hardware. Distro userspace
rendering variance is annotation-only: the guarantee rests on kernel
hook-time denial + exit semantics, not on shell error-message text.

### Discovery and the exact-identity lock

Version discovery is delivered AS THE SYSCALL RETURN VALUE of a
`LANDLOCK_CREATE_RULESET_VERSION` create-flag call (one call, no fd, no
ioctl constants carried): `r = create(NULL, 0, FLAG); abi = r > 0 ? (int)r : 0`.
Buffer forms return EINVAL on the measured kernel series. `PINNED_ABI` is an
EXACT-IDENTITY lock: the probe's verdict is strict - `status=ok` <=>
discovered == pin. BOTH directions refuse (fault 101, typed refusal):
discovered < pin (older kernel, capability gap) AND discovered > pin (a newer
series whose struct/vocabulary drift this artifact family has NOT measured).
Rationale: admitting above-pin hosts would rest on UNMEASURED
forward-compatibility claims - inferences do not cross the security boundary.
Whitelist = {8}; growing it in EITHER direction is a deliberate measure-and-
pin act, never a runtime branch (below-pin: lower and record when measuring;
above-pin: a dedicated measurement pass on real hardware first - the pin is
never raised ad hoc). No runtime downgrade; no runtime upgrade. Since
the shipped spawn path forks the probe per invocation BEFORE the real spawn,
every fenced spawn pays for a live identity proof against the RUNNING kernel.
DOCUMENTED RESIDUAL: a DIRECT apply-mode invocation on an above-pin kernel
bypasses the identity gate and leans on its classified fault channel
(machinery rejection => 101/102); acceptable because every SHIPPED spawn path
includes the probe gate.

### x86_64 measured-number record

Syscall numbers: create_ruleset = 444, add_rule = 445, restrict_self = 446.
The installed glibc unistd table agrees; in this world's table 460 is
`lsm_set_self_attr` - a categorically different facility. Behavioral proofs:
444 performs the version query and creates
ruleset fds; 446 `(rs, 0)` applied live enforcement (subsequent off-list
write EACCES, nothing lands). Add_rule convention:
`add_rule(ruleset_fd, RULE_TYPE, attr_ptr)` - the type is an EXPLICIT second
argument (`PATH_BENEATH = 1`, matching the live header enum) and there is NO
size argument (the kernel derives the size from the type). An exhaustive
rejection battery (classic layouts x sizes x flags x fd kinds x dirty
registers) returned EINVAL for every classic shape; only the typed packed
form returned 0. Restrict takes a FLAGS argument in this series (audit
`LOG_*` + `TSYNC` family); the helper passes 0 (default audit behavior).

Layouts: native ruleset attr = 24 bytes `{handled_fs, handled_net, scoped}`
(create is lenient for smaller sizes on this ABI class, so determinism wins:
always the native size, only slot 0 non-zero); path-beneath attr = 12-byte
PACKED `{uint64 allowed_access; int32 parent_fd}`. Both sizes are carried by
the descriptor's byte fields; the C's `_Static_assert`s anchor on the shared
literals (GCC does not permit struct-member access in constant expressions).

ENODATA traps (errno 42), recorded for extenders: an ALL-ZERO handled-access
word is rejected at create, and an EMPTY per-rule `allowed_access` is rejected
at add_rule. The mutation word therefore always appears non-empty in BOTH the
ruleset-handled word and every per-rule word (non-optional by construction).

Mutation word: bit 1 plus bits 4-14 - the full fs-mutation vocabulary
(`WRITE_FILE`, `REMOVE_DIR`, `REMOVE_FILE`, `MAKE_CHAR`, `MAKE_DIR`,
`MAKE_REG`, `MAKE_SOCK`, `MAKE_FIFO`, `MAKE_BLOCK`, `MAKE_SYM`, `REFER`,
`TRUNCATE`) MINUS the three read/execute bits (`EXECUTE`, `READ_FILE`,
`READ_DIR`). Pinned literal mask: `0x7FF2` (asserted in the C, mirrored
lockstep by the suite). The live kernel additionally defines
`IOCTL_DEV` at bit 15, which stays OUTSIDE the word by design. Consequence
(measured): reads and executes are UNMEDIATED while mutation is fenced to the
granted directories. No separate bit exists for append (rides `WRITE_FILE`)
or rename-class operations (escapes ride `REFER`). NOTE (live-header
behavior, honored by construction): `REFER` is denied by default unless its
bit is set in the RULESET-HANDLED word - it appears in BOTH words.

Register discipline (BINDING mechanical rule): every Landlock call issues
EXACTLY six arguments with explicit trailing zeros. Leftover vararg garbage in
unused trailing register slots produced MEASURED false failures (create with
dirty registers flipped to EBUSY; success with zeros).

prctl ordering: `PR_SET_NO_NEW_PRIVS` FIRST, always - measured note: create
succeeds WITHOUT prior NO_NEW_PRIVS on this kernel; the prctl-first ordering
is kept anyway (portability is cheap; keep the strict order).

### aarch64 guard + measure-and-pin procedure

aarch64 is UNMEASURABLE on the x86_64 provisioned host. Non-x86_64 builds are
a LOUD COMPILE-TIME `#error` in the source (message points at this procedure),
backed by a pre-CC NAMED REFUSAL in `regenerate.sh` (no partial artifacts).
Best-known unverified constants were EVALUATED AND DECLINED: committing
unmeasured security-boundary constants is precisely the failure mode this
guard prevents; aarch64 ABSENCE is already fail-closed-covered by the
TS-side classifier, so the guard costs nothing at runtime now. To admit aarch64 (or
any new class): (1) build and run the canonical probes on REAL target hardware
(discovery, syscall identities, attr shapes/sizes, add_rule convention,
register hygiene, denial class + markers, ENODATA traps); (2) record the
evidence here, in the Measured ABI/pin record section; (3) add the class row
+ `#elif` arm + per-row asserts; (4) lift the script refusal for that arch;
(5) regenerate the prebuild and let the suite re-prove it. Until then the
absent prebuild is a NORMATIVE condition the classifier owns - never a silent
fallback.

Re-pin flow for another host class: measure on the target host, then lower or
document per the exact-identity lock (below-pin: lower and record while
measuring; above-pin: a dedicated measurement pass on real hardware first),
regenerate, and re-probe until the probe line reads
`status=ok` with `abi=discovered pin=final`.

## Arch convention

Prebuilds live at `vendor/landlock-helper/bin/<arch>-linux/landlock-helper`
under the package root. `<arch>` uses the uname -m tokens: `x86_64`,
`aarch64`. Node's `process.arch` names differ (`x64`, `arm64`) and are mapped
onto the uname -m tokens before resolution (suite-local replica today; the
production resolver + parity rows live in the TS layer). Committed:
`x86_64-linux` only. `aarch64` absence is deferred and is covered fail-closed
by the TS-side classifier (loud typed refusal, never an unsandboxed run);
building/committing the aarch64 prebuild is the future fleet-widening pass
described above. Dual compile/script guard: the `#error` (source) + the named refusal
(script) make no unmeasured-constant path exist.

## Measured ABI/pin record

FILLED AT BUILD TIME:

- Date: 2026-10-04 (UTC)
- Kernel: `7.0.0-34-generic` (x86_64), Ubuntu 24.04 HWE
- Toolchain: gcc/cc 13.3.0, `-O2 -Wall -Wextra -Werror -static`
- Discovered max ABI (return-value channel): **8**
- Initial compiled pin (ceiling): 8 -> discovered == 8 -> FINAL PIN **8**
  (no lowering; raising was never a candidate - discovery did not exceed the
  compiled ceiling)
- Probe line at delivery: `landlock-helper probe abi=8 pin=8 status=ok` (exit 0)
- Confirmation note: before any code was written, a re-measurement pass
  against this host reproduced every constant in this record (syscall
  identities, typed add_rule shape, layout sizes, ENODATA traps, denial class
  EACCES with marker goldens, nested-lineage and symlink-crossing denials
  clean with NOTHING landed, reads/executes unmediated). Any divergence from a
  recorded constant stops the build here until the record is amended. Per-bit
  positions were cross-checked against the running kernel's own published
  userspace API header (agrees; naming only).

## Regeneration procedure

Requirements: Linux x86_64 (aarch64 refused loud until measured - see above),
`cc`/`gcc` available (dev-time only), and a USABLE host Landlock with
exact-identity match to the compiled pin - the post-build smoke runs the
rebuilt binary's `--probe` and REFUSES LOUDLY (named diagnostic, nonzero exit)
when it cannot go green; the prebuild is meaningless elsewhere and never ships
silently.

Commands (from this directory):

```
./regenerate.sh                  # in-place rebuild of bin/<arch>-linux/landlock-helper + smoke
./regenerate.sh /tmp/out         # tmp-output override (tests use this - they never overwrite the committed binary in place)
CC=gcc ./regenerate.sh           # explicit compiler
```

Idempotent; no network; no fetches; no timestamp-dependent inputs. The
rebuilt binary's `--probe` line must equal the pinned-format line with
`status=ok` (behavioral parity - byte parity is NOT claimed).

## Safety notes

- RATCHET ONE-WAY AND SELF-SCOPING: `PR_SET_NO_NEW_PRIVS` +
  `landlock_restrict_self` can only shrink rights, once, for this process and
  its descendants. The agent/session process STAYS UNRESTRICTED; fenced
  commands are short leaves born inside one stable frame.
- WHOLE-PROCESS-TREE INHERITANCE: the helper restricts self BEFORE `execve`,
  so the entire command lineage (shell, children, grandchildren) rides the
  frame - measured via nested-lineage denials.
- MUTATION-ONLY ENFORCEMENT SCOPE: reads and executes are unmediated by design
  (the guarantee covers writes; the measured suite pins this). Writes to
  `/dev` (incl. `>/dev/null` redirects) ARE denied under the fence unless
  `/dev` is granted - the TS-side materializer mandates the `/dev` allowance;
  this suite's frames grant mkdtemp dirs only.
- PROBE AS THROWAWAY FORK: the probe restricts ITS OWN disposable process over
  a trivial zero-rule ruleset and exits; it is never applied to anything
  long-lived, and a restricted probe writing its report to a Landlock-regulated
  regular file may see that write refused AFTER the restriction took effect -
  the EXIT CODE stays authoritative (consumers drive piped/TTY stdout, where
  this corner does not occur).
- FAULT-BAND COLLISION with genuine command exits (e.g. a panic exiting 101)
  is documented above: conservative interpretation, enforcement was active
  throughout; the refusal TEXT could be the only thing that errs.
- F_RESTRICT defensiveness: `landlock_restrict_self` failure is not inducible
  hermetically on a healthy kernel; its presence/distinctness rides the
  band-integrity assertions in the suite, and its existence keeps the 103
  class loud rather than silent if a future kernel/hardware combination ever
  exercises it.
