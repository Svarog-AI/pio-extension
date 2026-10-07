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
- Amendment (2026-10-07): the SUPERVISOR MODE (per-spawn private user+mount
  realm over caller-declared mirror mounts) and the COMBINED APPLICABILITY
  PROBE ARM (`--overlay-probe`) landed under the same source file, script,
  bin layout, and build discipline; their protocol home is this document
  (dispatch ladder, supervisor/combined-arm sections, fault rows 105-111,
  amendment record). Apply mode and the existing probe arm stay
  behavior-and-protocol-byte-stable; the 2026-10-04 measured entry stands as
  HISTORY for the apply/probe surface.

## Argv protocol

Dispatch routes on the EXACT first token (ladder below). Every FAULT exits
with a distinct classified code BEFORE any `execve`; a successful apply hands
the exit code to the COMMAND (`execve` replaces the process). Apply mode is
SILENT on all fault paths: stdout AND stderr carry EXACTLY ZERO bytes - the
classified exit code is the entire channel. Typed refusal rendering lives in
the TS layer (`src/tools/bash/`). SUPERVISOR mode obeys the SAME silence law
on EVERY fault path; the TWO PROBE ARMS are the documented line-emitting
exceptions (exactly ONE pinned stdout line each in BOTH outcomes, a short
stderr diagnostic on FAILURE only).

### Dispatch ladder

| first token | arm |
|-------------|-----|
| `--probe` | applicability probe (UNCHANGED; exactly one token total) |
| `--overlay-probe ABS_ROOT` | combined applicability probe (realm establishment over a minted throwaway triple; see the combined-arm section below) |
| `--mount LOWER UPPER WORK [...] -- CMD_ARGV...` | realm-established supervisor mode (see the supervisor section below) |
| anything else | apply mode (UNCHANGED parser; its discipline stands - the zero-churn proof) |

An unknown first token therefore reaches the apply-mode parser and is
refused there by ITS grammar (100) - the ladder adds no new refusal surface
of its own.

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

### Apply mode (fallthrough; any first token outside the dispatch ladder)

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

## Supervisor mode (realm-established; `--mount` lead)

```
landlock-helper --mount LOWER UPPER WORK [--mount LOWER UPPER WORK ...] -- CMD_ARGV...
```

Lead grammar (SILENT parse/validate - ANY violation exits 105 STRICTLY
BEFORE any system state change; the silence law holds across BOTH fault-
emitting modes):

- Lead tokens before the FIRST `--`: `--mount LOWER UPPER WORK` TRIPLES ONLY.
  Any other leading token (including `--write`) => 105. A dangling/
incomplete triple => 105.
- Each value must be NON-EMPTY, ABSOLUTE, and NOT exactly `/` (root-component
  rejection at carrier level - twin of the planner's root-mount refusal).
- At least ONE complete triple required; the `--` separator is REQUIRED with
  at least ONE child token after it; missing separator / empty table /
  missing child => 105.
- IDENTICAL triples dedupe silently (first occurrence kept, order preserved -
  the `--write` dedupe rule mirrored). DISTINCT overlapping/nested triples are
  NOT grammar faults: the kernel refuses what it refuses at attach time
  (typed 110 fail-closed); the PLANNER refuses true nesting earlier at the
  spawn site (defense in depth, not grammar).
- Everything after the FIRST `--` passes through VERBATIM as the command
  invocation (the carrier never rewrites tail bytes).

Sequence: STEP (a) identity capture (the supervisor's OWN uid/gid read NOW,
while still holding outer-world credentials - the map CONTENT derives from
these captured values only) -> `pipe()` + `clone(CLONE_NEWUSER | SIGCHLD)`
over a STATIC 256 KiB stack (=> 106) -> parent-only SIGPIPE-ignore
refinement (below) -> HARDENED MAP WRITES (below) -> CONTINUE-VERDICT write
(=> 108) -> `waitpid` propagation (below). The in-realm legs (unshare /
mount / execve) run in the cloned vehicle behind the verdict gate. Inherited
verbatim, as in apply mode: cwd, environment, signals (DEFAULT dispositions
- the carrier installs no handlers AND calls no setpgid ANYWHERE); the
group-kill lineage now SPANS supervisor -> realm child -> carrier -> shell
-> command with process-group LEADERSHIP PERSISTING across the whole
fork/exec chain (fork preserves pgid) - killing the top process terminates
the whole realm kernel-side, with the private mount namespace released at
the last process in it. On success the command's streams are PRISTINE (the
carrier emitted nothing beforehand) and its exit code propagates
UNTRANSFORMED (step h below): normal exits VERBATIM, signal deaths
forwarded as the SAME signal. TRANSPARENCY DOCTRINE continues through the
full chain - band pass-through is UNCHANGED: a coincidental in-band exit
(carrier-classed or command-origin) behind the FULL CHAIN is OPAQUE to the
carrier and reads conservatively as a machinery fault at the TS settlement
(worst case a mislabeled cause; enforcement was active throughout) -
documented continuation, not new doctrine.

NO SELF-TEARDOWN in production: the dying realm releases its mounts
automatically (the dying namespace sits inside the dying realm, which dies
with the lineage); session-side scratch removal is the finally-walk owned
by the Step 15 spawn site.

COMPOSED CHAIN (production shape): the production tail IS the EXISTING
apply-mode carrier invocation (`--write ... -- <program>`), so Landlock
applies INSIDE the realm over the OVERLAID WORLD - realm -> private mount
namespace -> mirror mounts -> Landlock -> shell. WHOLE-TREE INHERITANCE NOW
INCLUDES the private user+mount namespace property alongside the ratchet and
the mutation-only restriction: every descendant (shell, children,
grandchildren) rides the same restricted view.

PARALLEL-MINT ISOLATION (normative): every spawn composes its OWN scratch
triple under a UNIQUE nonce subdirectory, so two concurrent tool calls get
TWO DISTINCT `<nonce>/{upper,work}` DIRS EVEN WHEN BOTH TARGET THE IDENTICAL
declaring-dir set. The ONLY shared components are the persistent hidden
parent and the real LOWER ITSELF, referenced by both realms' mirror mounts
(same-lower double mounting is legal for concurrent spawns over one
declaring dir: mount tables are PRIVATE per lineage, workdir content locks
per instance). Everything else - nonce root, upper, work, realm, ruleset,
pgid, walk/judge/commit, discard line, and finally-walk cleanup - is FULLY
DISJOINT with ZERO inter-frame coordination. Concurrent bash tool calls
within one turn are NORMAL production behavior (owner-confirmed), not a
corner case.

## Realm-establishment mechanics (shared by both arms)

One shared establishment sequence runs ONCE per invocation; the two arms
differ only in EMISSION (arms emit; production is silent) and in the
POST-MOUNT continuation (production: `execve`; arm: verify / umount / remove
/ ok line).

1. **(a) Identity capture.** The supervisor's own uid/gid are read BEFORE the
   clone (an identity read taken inside an unmapped userns reports the
   overflow uid and violates the single-line rule).
2. **(b) `pipe()` + `clone(CLONE_NEWUSER | SIGCHLD)`** over the static 256
   KiB stack (no heap anywhere in the carrier); failure => 106. The
   ONE-BYTE VERDICT CHANNEL is this pipe: the vehicle BLOCKS on the read end
   before doing anything; `'c'` proceeds, `'d'`/EOF/error aborts WITHOUT
   establishing (partial maps NEVER continue - fail-closed by construction;
   the abort emits nothing - the emitter partition owes none here).
3. **SIGPIPE-disposition refinement (PARENT ONLY).** Strictly AFTER clone and
   BEFORE the first verdict-channel write, the parent sets SIGPIPE to
   ignore - a DISPOSITION change. Without it a vanished child at the verdict
   write would terminate the parent with SIGPIPE before the committed 108
   classification could run. The vehicle was cloned BEFORE the change and
   KEEPS DEFAULT SIGPIPE (restricted-lineage pipeline semantics
   unperturbed). Documented residual corner (character-identical to the
   SIGSTOP residual): a lineage dying by SIGPIPE surfaces at the parent as
   the dead-code backstop numeric exit because the self-raised SIGPIPE is
   ignored here. SDK kill vectors (TERM/KILL) are unaffected.
4. **(d) HARDENED MAP WRITES**, IN ORDER, SINGLE LINE each, content derived
   from step (a) ONLY: `setgroups` = `deny` FIRST (owner ruling - inner-root
   declined), then `uid_map` = the single line
   `<captured-uid> <captured-uid> 1`, then `gid_map` = the single line
   `<captured-gid> <captured-gid> 1` (runtime-derived - NO hardcoded
   literals). Non-ENOENT open/write failure => 107; the ENOENT signature
   (child VANISHED) => 108; on any non-108 failure a best-effort `'d'` deny
   verdict is written (errors deliberately ignored). ZOMBIE PHYSICS
   (measured 2026-10-07 on the provisioned stripped host; derivation
   artifacts were session-local and intentionally never committed): map
   targets of a KILLED-BUT-UNREAPED (zombie) child fault EPERM (errno 13)
   at `open()` on all three of setgroups/uid_map/gid_map - so pre-map
   targeted kills classify 107 (the non-ENOENT rung); after reaping they
   fault ENOENT (errno 2) - the 108 signature, which also covers the
   verdict-write EPIPE corner.
5. **(e) CONTINUE-VERDICT.** Write `'c'`; failure (a vanishing child between
   the maps and the verdict) => 108; close the write end.
6. **(f)-(g) IN-REALM (vehicle).** `unshare(CLONE_NEWNS)` (=> 109); per
   table entry IN ORDER the overlay ATTACH with MOUNT POINT = LOWERDIR via
   raw `mount(2)` under the six-arg register discipline (=> 110); then the
   continuation: production `execve`s the tail VERBATIM (returning => 104
   REUSE - same class and meaning as apply mode, now reached THROUGH the
   chain); arm: IN-FLIGHT VERIFY while mounted (seed readable through the
   merged view with EXACT bytes; a new file created THROUGH THE MERGED VIEW
   present in the UPPER with EXACT bytes - CoW evidence while mounted; =>
   110) -> `umount(2)` as raw `SYS_umount2` with flags 0 (=> 111, ARM ONLY -
   the production supervisor NEVER tears down) -> SWALLOW-ALL removal of the
   minted tree (never faults) -> ok report line -> `_exit(0)`.
7. **(h) `waitpid` PROPAGATION** - untransformed in observational class:
   normal exit => `_exit(WEXITSTATUS)` VERBATIM; signal death => self-raise
   the SAME signal under inherited DEFAULT dispositions (no handlers
   installed anywhere in the carrier); dead-code `_exit(255)` backstop.
   WIFSTOPPED is invisible to a plain waitpid - NO stop-loop code; the
   external-SIGSTOP residual is identical to the shipped apply-mode posture
   (documented, not handled).

## Combined applicability probe arm (`--overlay-probe`)

Exact form:

```
landlock-helper --overlay-probe ABS_ROOT
```

Arm grammar (SILENT 105 - existence IS grammar, checked before any system
state change): exactly ONE value; NON-EMPTY, ABSOLUTE, EXISTING DIRECTORY
(checked by `open(O_RDONLY|O_DIRECTORY|O_CLOEXEC)`).

The arm mints a tiny HIDDEN subtree `<ABS_ROOT>/.llh-overlay-probe/{lower,
upper,work}` plus a fixed-byte SEED (`llh-overlay-probe-seed\n`, 23 bytes,
in lower), runs the committed establishment over the seeded triple (mount
point = lowerdir), VERIFIES IN FLIGHT, UMOUNTS, REMOVES the minted tree
SWALLOW-ALL, and emits the report. It isolates ITS OWN disposable process
pair only - nothing long-lived is ever mounted (the standing ratchet doctrine
extends: the agent/session process stays unrestricted AND unmounted).

Report: EXACTLY ONE stdout line in BOTH outcomes, zero other stdout bytes;
a FAILURE adds ONE short stderr diagnostic. Protocol constants:

```
landlock-helper overlay realm=<ok|fail> status=<ok|fail>
landlock-helper overlay: failed at <stage> (errno=N)
```

`<stage>` in {setup, realm-clone, realm-map, child-early-death, unshare,
mount, verify, umount}; `(errno=N)` carries the errno observed at the
failing operation. Truth table over the FOUR SYNTACTIC CELLS:
`(status=ok, realm=ok)` - the full sequence completed (exit 0; the ONLY ok
cell); `(status=fail, realm=fail)` - the FIRST failing stage is a VEHICLE
stage (realm-clone / realm-map / child-early-death / unshare);
`(status=fail, realm=ok)` - the first failing stage is a NON-VEHICLE leg
(setup / mount / verify / umount); `(status=ok, realm=fail)` - UNREACHABLE
by construction, DOCUMENTED and NOT parser-rejected (the parser stays TOTAL
over the syntactic cells; reachability is the TS consumer's concern). AT
MOST ONE report line plus at most one diagnostic per execution
(continue-verdict partition: setup faults emit at the top level, vehicle
faults in the parent, unshare/mount/verify/umount and the ok cell in the
child). `exit 0` <=> `realm=ok status=ok`.

## Threat-model cross-reference (named claims -> constraining implementation lines)

This subsection records how the threat-model claims of record (the Step 13
vehicle evidence ledger) constrain the carrier's implementation lines; a
change to a constraining line reopens the claim and requires the Step 13
gate re-run.

- **LC#1 - UNRESTRICTED-WINDOW BOUND.** Enforced by the ESTABLISHMENT
  SEQUENCE ORDERING (mechanics section above): EVERY PRIVILEGED SYSCALL
  (`clone`, the three map writes, `unshare`, `mount`) PRECEDES the child
  `execve`, and the window contains ONLY trusted carrier code over
  GRAMMAR-VALIDATED argv (supervisor-family grammar faults issue strictly
  before any system state change). The command is BORN RESTRICTED: the
  inner apply-mode carrier performs `prctl(NO_NEW_PRIVS)` + Landlock INSIDE
  the realm strictly BEFORE the shell `execve`. A sequence REORDER breaks
  the constraint and fails review.
- **LC#2 - MAPPING-POLICY SURFACE.** Constrains the MAP-CONTENT LINES
  EXACTLY: single-identity caller-uid/gid, RUNTIME-DERIVED from the
  step-(a) identity capture (no hardcoded literals), SINGLE-LINE maps,
  SETGROUPS DENIED FIRST, INNER-ROOT DECLINED (policy basis: root-owned CoW
  residue in the outer world + ownership confusion). Inner full capabilities
  govern ONLY realm-owned objects - the sole gained authority is mounting
  inside the private mount namespace, with writable access confined to the
  CoW upper over the declaring folders. ANY mapping-shape deviation
  (multi-line maps, group maps, root maps) reopens the class and requires
  the Step 13 gate re-run.
- **BLAST RADIUS / LIFETIME.** The CoW upper is the ONLY writable real-world
  surface the realm reaches; the realm DIES WITH the spawn lineage (nothing
  persists; there is no cleanup channel after death - session-side removal
  is the Step 15 finally-walk).
- **SUPPLY CHAIN UNCHANGED.** Same source file, same regeneration script,
  same bin layout, same ro-bind delivery - no third-party bytes, no new
  required host binary.

## Fault-code table

Reserved band 100-199; the current assignment occupies 100-111. Every fault
exits with a DISTINCT code before any execve.

| code | class | trigger |
|------|-------|---------|
| 100 | `malformed-spec` | argv-grammar violation (either mode) |
| 101 | `abi-missing-or-blocked` | `prctl(NO_NEW_PRIVS)` blocked, or `landlock_create_ruleset` failed (unsupported kernel, ABI identity mismatch - discovered != pin in EITHER direction - seccomp block, ...) |
| 102 | `add-rule-failure` | spec-path open failed or `landlock_add_rule` failed (not a directory, vanished, capability gap, ...) |
| 103 | `restrict-self-failure` | `landlock_restrict_self` failed |
| 104 | `execve-failure` | `execve` of the passed-through argv failed after restriction |
| 105 | `supervisor-table-malformed` | supervisor-family argv violation: mirror-table grammar (unknown leading token incl. `--write`, dangling/incomplete triple, empty/relative/root component, missing table/separator/child) OR combined-arm arity/path (absent/non-directory root) - STRICTLY pre-state-change, SILENT in both fault modes |
| 106 | `realm-clone-failure` | vehicle `clone(CLONE_NEWUSER \| SIGCHLD)` (or the verdict pipe) failed - issued before any in-realm work |
| 107 | `realm-map-write-failure` | parent-side map open/write failure, NON-ENOENT (EPERM on zombie-target opens rides here per the zombie-physics record) - parent-side window pre-any-in-realm-work |
| 108 | `child-early-death` | ENOENT signature at the map targets (child vanished) OR the continue-verdict write failed - the pre-map/post-reap/EPIPE corners |
| 109 | `realm-unshare-failure` | in-realm `unshare(CLONE_NEWNS)` failed - post-realm pre-shell |
| 110 | `overlay-mount-failure` | setup / attach / in-flight verification umbrella - before the shell exec (carries the kernel overlap-refusal classes: absent/non-directory components, workdir nested under a declaring directory, self-overlapping components) |
| 111 | `overlay-umount-failure` | COMBINED ARM ONLY - the production supervisor never tears down |

Band discipline: codes are 100-111; 112-199 stay reserved. Once `execve`
succeeds the helper is gone, so a band code can ONLY mean machinery fault -
that is the disambiguation, BY CONSTRUCTION. The seven supervisor-family
codes (105-111) are ALL issued strictly pre-execve as well, so the
disambiguation invariant HOLDS across the whole band; 104 is REUSED at the
execve boundary itself, now reached THROUGH the establishment chain (same
class, same meaning). DOCUMENTED RESIDUAL CORNER: a
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
(script) make no unmeasured-constant path exist. The supervisor family adds NO
architecture-specific surface: the raw syscall forms (`mount` / `umount2` /
`mkdir`) and the userns/unshare mechanics ride the SAME per-arch admission
guard - x86_64 remains the only MEASURED class; aarch64 stays loud-refused
until the measure-and-pin pass runs the FULL arm battery (probe line +
combined arm + supervisor fault ladder) on real target hardware.

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

AMENDED AT SUPERVISOR-FAMILY LAND (2026-10-07, UTC):

- Date: 2026-10-07 (UTC). Kernel: `7.0.0-34-generic` (x86_64), Ubuntu 24.04
  HWE. Toolchain: gcc/cc 13.3.0, `-O2 -Wall -Wextra -Werror -static` (flags
  UNCHANGED).
- Basis of record (rulings and supersede): the QUALITY-GATE RULINGS that
  pulled the overlay-preview rung forward as the enforcement family for
  declaration-channel file writes (file-leaf declarations work in BOTH
  existence states; FILE-EXACTNESS - sibling exposure DECLINED); the OWNER
  RULING of 2026-10-07 kickoff (DIRECTION 1 - the carrier establishes its
  OWN per-spawn private user+mount realm, self-created vehicle; NO LAUNCHER
  CHANGE); the FORMAL SUPERSEDE of the round-4 plain-`CLONE_NEWNS`-
  without-escalation form, which is thereby superseded (evidence base: the
  embedded Vehicle Evidence Ledger, the owner ruling, and the fresh pass -
  readable as HISTORY only, never as a live statement); and the S13
  fresh-pass GO RESULTS (GREEN END-TO-END in BOTH production contexts -
  bare stripped tree AND launched topology - under the hardened map order;
  every ledger data point nominal; deciding evidence in the Step 13
  measurement ledger).
- Pre-amendment baseline re-proof: the committed prebuild's `--probe` line
  stayed BYTE-STABLE (`landlock-helper probe abi=8 pin=8 status=ok`, exit
  0) and the apply-mode parity rows held before the amendment landed.
- Establishment mechanic measured GREEN: clone/userns + hardened maps +
  verdict channel + `unshare(CLONE_NEWNS)` + overlay attach (mount point =
  lowerdir) + in-flight verify (seed EXACT bytes through the merged view;
  CoW file `cow.txt` = `llh-overlay-probe-cow\n`, 22 bytes, created THROUGH
  THE MERGED VIEW and asserted in the upper WHILE MOUNTED) + umount +
  cleanup receipt (combined arm `realm=ok status=ok`, exit 0, minted
  subtree removed).
- Failure ladder measured: silent 105 grammar battery (18 malformed shapes,
  both fault modes); 108 via the targeted early-child kill race (zombie-
  physics corners per the citation in the mechanics section); 110 induced
  (absent lowerdir; non-directory upperdir; workdir nested under another
  mirror's declaring directory; the arm SETUP fault over a non-writable
  root with the `errno=13` diagnostic golden); 106 / 109 / 111 untargetable
  hermetically on a healthy kernel (presence/distinctness ride the band-
  integrity assertions - the 103 treatment, verbatim precedent).
- Overlap physics (this kernel): cross-pair containment where the
  overlapped component is a WORKDIR located under another mirror's declaring
  directory is REFUSED at attach (typed 110); plain lower-containment
  STACKING and shared uppers/workdirs are LEGAL on this kernel (private
  mount tables) - the planner's true-nesting refusal at the spawn site
  remains the production backstop (defense in depth, not grammar).
- Residue data point: the mode-000 kernel-managed workdir metadata dir left
  after a realm death WITHOUT umount (owner-rmdirable, readdir-unlistable;
  ABSENT after a clean umount) - recorded for the session-side cleanup
  contract (see Safety notes).
- Raw-form mechanical equivalences (host glibc x86_64): plain unmount issues
  as `SYS_umount2` with flags 0 (plain umount == umount2 flags 0 - the libc
  umount prototype lives outside the sanctioned header set); `mkdir(2)`
  likewise via `SYS_mkdir` (declared include set stays portable-libc-only).
  The six-arg trailing-zero register discipline EXTENDS to both raw forms.

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
`status=ok` (behavioral parity - byte parity is NOT claimed). The post-build
smoke bar REMAINS the `--probe` line; supervisor-family functional parity of
a tmp rebuild is asserted by the suite's tmp-rebuild row (`--probe` line
green AND the combined arm green over a fresh mkdtemp root - byte parity NOT
claimed, per the standing bar).

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
- REALM ISOLATION IS PER-SPAWN AND THROWAWAY: the user+mount realm exists
  only for the direct vehicle process and dies with it; the supervisor and
  the agent/session process never ENTER it. Maps are single-line same-uid/gid
  with `setgroups` DENIED and inner-root declined (no privilege-growth path);
  the vehicle aborts WITHOUT establishing on any non-`'c'` verdict
  (fail-closed by construction).
- SCRATCH-TRIPLE OWNERSHIP: the caller (session/TS layer) mints and removes
  the lower/upper/work trees; the carrier NEITHER creates nor removes caller
  paths in production mode (it only mounts OVER them). Arm-mode mint/removal
  is internal to the arm (hidden subtree, swallow-all, never faults).
- KERNEL-MANAGED WORKDIR METADATA (residue data point, measured 2026-10-07):
  when a realm dies WITHOUT umounting (the production NO-self-teardown
  posture), the overlayfs workdir retains a kernel-managed mode-000
  metadata subdirectory owned by the mapped caller uid (EMPTY after a
  nominal run on the measured host). Naive readdir-descent removal faults
  EACCES trying to LIST it although the owner CAN `rmdir` it directly;
  clean umount (the arm path) leaves NO such residue. Session-side cleanup
  owes the same tolerance (make it owner-readable, retry, rmdir-first when
  unreadable-but-empty - best effort, receipts asserted BEFORE teardown).
- ANTI-NESTING (DOCUMENTED, NOT ENFORCED): the helper is a RESTRICTION
  CARRIER, not a launch path - it adds restrictions and spawns nothing
  beyond its own supervisor/vehicle pair, so there is no `pio` recursion in
  the chain. When the vehicle runs IN-BUBBLE it nests a user namespace
  INSIDE the bubble's own namespaces - containment, not recursion (the
  bubble's measured physics stand unaffected). Its interaction with the
  launcher's anti-nesting doctrine is documented, not enforced.
- HOST VARIANCE (OTHER HOSTS MAY DENY THE VEHICLE PHYSICS): the provisioned
  host permits the self-created-userns vehicle (measured baseline:
  `kernel.unprivileged_userns_clone=1`, `user.max_user_namespaces`
  unexhausted, `kernel.apparmor_restrict_unprivileged_userns=0`); other
  hosts may deny it through that sysctl, userns limits/exhaustion, LSM
  interplay, or an unmapped payload uid (=> `clone` EPERM). Every such
  deficiency surfaces TYPED through the COMBINED APPLICABILITY ARM - failed
  verdicts degrade honestly and retry per invocation; there is NEVER a
  silent ungoverned fallback. A deficient host degrades to the pre-goal
  status quo - i.e. TODAY's typed refusal (the mechanism refuses instead
  of engaging; the interim posture holds).
- UNINDUCIBLE SUPERVISOR-FAMILY CODES (the 103 precedent, restated for the
  extended band): 106 (clone), 109 (unshare), 111 (umount - arm-only by
  construction) and the 108 MAP-WINDOW signature are NOT HERMETICALLY
  INDUCIBLE on a healthy kernel - no healthy-kernel induction path exists
  (while the parent lives it is the only reaper: a windowed zombie faults
  EPERM and classifies 107; the verdict-write EPIPE corner is
  nanosecond-scale and externally untargetable). Presence and pairwise
  distinctness ride the BAND-INTEGRITY ASSERTIONS in the suite (TWELVE
  pairwise-distinct codes); the classes stay loud rather than silent if a
  future kernel/hardware combination ever exercises them. HOST-VARIANCE
  CAVEAT: hosts whose ZOMBIE /proc map targets fault ENOENT (spec-session
  measurement 2026-10-07: killed-but-unreaped => EPERM at open; post-reap
  => ENOENT) classify map-window kills as 108 DIRECTLY - the errno-driven
  classification ladder composes MECHANICALLY with that variance; no code
  change.
