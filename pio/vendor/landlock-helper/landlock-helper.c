/* landlock-helper - vendored fence carrier for the pio command-write fence.
 *
 * Provenance: self-authored (2026-10-04), MIT-aligned with the repository.
 * The protocol home is README.md in this directory (argv grammar,
 * fault-code table, ABI pin policy, measured record). Regenerate via
 * regenerate.sh (static link, -O2 -Wall -Wextra -Werror). No third-party
 * bytes, no kernel headers, no network at build time.
 * Amendment (2026-10-07): the SUPERVISOR MODE (per-spawn private user+mount
 * realm over caller-declared mirror mounts) and the COMBINED APPLICABILITY
 * PROBE ARM (--overlay-probe) landed under the same source file, script,
 * bin layout, and build discipline; their protocol home is the README
 * amendment record of the same date. Apply mode and the existing probe arm
 * stay behavior-and-protocol-byte-stable.
 *
 * Silence: APPLY mode and SUPERVISOR mode emit ZERO bytes on stdout AND
 * stderr on EVERY fault path - the classified exit code is the entire
 * channel; typed refusal rendering lives in the TS side. The two PROBE ARMS
 * (the existing --probe applicability arm and the --overlay-probe combined
 * arm) are the documented line-emitting exception: exactly ONE pinned
 * stdout line in BOTH outcomes, zero other stdout bytes, plus a short
 * stderr diagnostic on FAILURE only. The exit code is authoritative in all
 * cases.
 *
 * ABI pin: EXACT-IDENTITY lock at 8 (measured 2026-10-04 on kernel
 * 7.0.0-34-generic - see README "Measured ABI/pin record"). REGISTER
 * DISCIPLINE: every Landlock call issues exactly six arguments with explicit
 * trailing zeros - leftover vararg garbage produced MEASURED false failures;
 * the discipline extends to the raw syscall() forms the supervisor mode
 * uses (mount/umount carry explicit trailing zeros in the unused variadic
 * slots).
 */
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <sched.h>
#include <signal.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

/*
 * fs-access bit positions - SELF-AUTHORED values; the per-bit symbolic
 * names were cross-checked against the live uapi header at implementation
 * (naming only - behavioral proof governs; no kernel header included).
 * The positions + the composed mask are the binding surface. EXECUTE
 * (bit 0), READ_FILE (2) and READ_DIR (3) are deliberately EXCLUDED:
 * reads and executes stay unmediated under the mutation-only fence.
 * IOCTL_DEV (bit 15) stays outside the word by design. Append rides
 * WRITE_FILE; rename/move/link/symlink escapes ride REFER. This block is
 * the named decomposition of the descriptor's mask FIELD - the record's
 * value remains the runtime authority (call sites consume ACTIVE
 * exclusively); the mask assert below binds the composition to the
 * pinned literal.
 */
#define LL_FS_WRITE_FILE (1UL << 1)
#define LL_FS_REMOVE_DIR (1UL << 4)
#define LL_FS_REMOVE_FILE (1UL << 5)
#define LL_FS_MAKE_CHAR (1UL << 6)
#define LL_FS_MAKE_DIR (1UL << 7)
#define LL_FS_MAKE_REG (1UL << 8)
#define LL_FS_MAKE_SOCK (1UL << 9)
#define LL_FS_MAKE_FIFO (1UL << 10)
#define LL_FS_MAKE_BLOCK (1UL << 11)
#define LL_FS_MAKE_SYM (1UL << 12)
#define LL_FS_REFER (1UL << 13)
#define LL_FS_TRUNCATE (1UL << 14)

/* The mutation word: the full fs-mutation vocabulary minus the three
 * read/execute bits - bit 1 plus bits 4-14. */
#define LL_MUTATION_WORD                                                                    \
  (LL_FS_WRITE_FILE | LL_FS_REMOVE_DIR | LL_FS_REMOVE_FILE | LL_FS_MAKE_CHAR | LL_FS_MAKE_DIR \
   | LL_FS_MAKE_REG | LL_FS_MAKE_SOCK | LL_FS_MAKE_FIFO | LL_FS_MAKE_BLOCK | LL_FS_MAKE_SYM  \
   | LL_FS_REFER | LL_FS_TRUNCATE)

/*
 * Host-class descriptor - THE single extension point.
 *
 * All host-class-varying ABI values live in ONE row per admitted class and
 * NOWHERE else; call sites reference the active instance exclusively (zero
 * raw ABI literals at any call site). Protocol constants (fault codes below,
 * argv grammar, probe-line format) are host-invariant and stay OUTSIDE the
 * descriptor - host adaptation must never touch them. EXTENDING TO A NEW
 * CLASS = one new table row (measurement-evidence pointer) + one #elif arm -
 * nothing else moves. Layout-generation escape valve (only if a FUTURE
 * measured class needs different field ARRANGEMENTS): a compile-time-
 * selected union of named attr structs chosen in the same #if block, with
 * the descriptor's *_bytes fields asserting agreement. Current admission:
 * single layout generation - the union is documented capability, not present
 * code.
 *
 * Width note: every admitted host class is LP64 (x86_64 today; aarch64 is
 * LP64 when it is measured), so `unsigned long` is the 64-bit word and `int`
 * the 32-bit word throughout - which keeps the helper's libc header set
 * minimal without <stdint.h>.
 */
struct ll_abi_class {
  int create_nr;             /* landlock_create_ruleset syscall number   */
  int addrule_nr;            /* landlock_add_rule syscall number         */
  int restrict_nr;           /* landlock_restrict_self syscall number    */
  unsigned int version_flag; /* CREATE_RULESET_VERSION discovery flag    */
  int rule_type_path_beneath; /* add_rule PATH_BENEATH rule type argument */
  unsigned int pinned_abi;   /* exact-identity ABI lock (probe gate)     */
  unsigned long mutation_mask; /* handled+allowed fs-mutation word       */
  size_t ruleset_attr_bytes; /* native ruleset attr size                 */
  size_t path_beneath_bytes; /* packed path-beneath attr size            */
};

/* x86_64 class - every value measured 2026-10-04 on kernel
 * 7.0.0-34-generic; the full measurement evidence (behavioral proofs,
 * rejection batteries, the neighboring-table attribution note) lives in
 * the README "Measured ABI/pin record". Roles: the three Landlock syscall
 * numbers (create / add_rule / restrict_self), the CREATE_RULESET_VERSION
 * discovery flag, the PATH_BENEATH rule-type argument, the exact-identity
 * pin (version discovery delivers the max ABI as the SYSCALL RETURN VALUE
 * - measured 8 here), the mutation word (named decomposition above), and
 * the two native attr sizes. Per-bit positions cross-checked against the
 * live uapi header at implementation (naming only - behavioral proof
 * governs).
 */
static const struct ll_abi_class X86_64_CLASS = {
  444, 445, 446, 1U << 0, 1, 8, LL_MUTATION_WORD, 24, 12
};

#if defined(__x86_64__)
static const struct ll_abi_class ACTIVE = X86_64_CLASS;
#elif defined(__aarch64__)
#error "landlock-helper: aarch64 host class unmeasured - run the README measure-and-pin procedure before admitting it"
#else
#error "landlock-helper: unsupported architecture"
#endif

/* Self-authored attribute layouts (no kernel headers by policy). Size
 * authority rests with the descriptor's byte fields; the asserts below
 * cross-check agreement. Ruleset word order matters: slot 0 carries the
 * mutation word, all other slots zero.
 */
struct ll_ruleset_attr {
  unsigned long handled_fs; /* slot 0 = mutation word                     */
  unsigned long handled_net; /* zero                                      */
  unsigned long scoped;     /* zero (this series' ABI 6+ scope word)      */
};

struct ll_path_beneath {
  unsigned long allowed_access; /* SAME mutation word - non-empty: ENODATA otherwise */
  int parent_fd;                /* O_PATH|O_CLOEXEC|O_DIRECTORY dir fd              */
} __attribute__((packed));

/* Mutation word = bit 1 plus bits 4-14 (binding regardless of per-bit
 * naming). Refer note (live-header behavior, honored by construction):
 * REFER is denied by default unless its bit is set in the RULESET-HANDLED
 * word - the same word therefore appears in BOTH places.
 *
 * The three layout/mask pins anchor on the shared LITERALS themselves: GCC
 * refuses to treat members of a static-storage struct as constant
 * expressions, so the row above and these asserts must move together if
 * the admitted class ever changes (escape-valve territory).
 */
_Static_assert(LL_MUTATION_WORD == 0x7FF2UL,
               "mutation word must stay the pinned literal (bit 1 plus bits 4-14)");
_Static_assert(sizeof(struct ll_ruleset_attr) == 24,
               "ruleset attr must be the native three-word layout");
_Static_assert(sizeof(struct ll_path_beneath) == 12,
               "path-beneath attr must be the packed two-word layout");

/*
 * Protocol fault codes - HOST-INVARIANT (outside the descriptor); mirrored
 * lockstep by the suite const block. Band 100-199 reserved; the current
 * assignment uses 100-111 (112-199 stay reserved). Every apply-mode fault exits BEFORE any
 * execve; once execve succeeds the helper is gone, so band codes can only
 * be machinery faults. Documented residual corner: a fully fenced command
 * that completes with an exit code inside the band is interpreted by the TS
 * consumer conservatively as a machinery fault (enforcement was active
 * throughout; only the refusal text could mislabel the cause).
 */
enum {
  FAULT_MALFORMED_SPEC = 100,        /* argv-grammar violation (either mode) */
  FAULT_ABI_MISSING_OR_BLOCKED = 101, /* prctl blocked or create failed, or
                                       * probe identity mismatch (either
                                       * direction vs the pin)               */
  FAULT_ADD_RULE_FAILURE = 102,      /* spec-path open or add_rule failed    */
  FAULT_RESTRICT_SELF_FAILURE = 103, /* restrict_self failed                 */
  FAULT_EXECVE_FAILURE = 104,        /* execve failed after restriction      */
  /* Supervisor family (realm-established supervisor mode + the combined
   * applicability probe arm). Disambiguation invariant HOLDS: every code
   * issues STRICTLY PRE-EXECVE of the command - 105/106 pre-fork; 107/108
   * parent-side window pre-any-in-realm-work; 109 post-realm pre-shell;
   * 110 before the shell exec; 111 throwaway arm only; 104 REUSED at the
   * execve boundary itself, now reached THROUGH the chain.
   */
  FAULT_SUPERVISOR_TABLE_MALFORMED = 105, /* supervisor-family argv
                                           * violation: mirror-table grammar
                                           * or combined-arm arity/path      */
  FAULT_REALM_CLONE_FAILURE = 106,       /* vehicle clone(CLONE_NEWUSER)
                                          * failed                          */
  FAULT_REALM_MAP_WRITE_FAILURE = 107,   /* parent-side map open/write
                                          * failure, NON-ENOENT             */
  FAULT_CHILD_EARLY_DEATH = 108,         /* ENOENT signature at the map
                                          * targets (child vanished) OR the
                                          * continue-verdict write failed   */
  FAULT_REALM_UNSHARE_FAILURE = 109,     /* in-realm unshare(CLONE_NEWNS)
                                          * failed                          */
  FAULT_OVERLAY_MOUNT_FAILURE = 110,     /* setup / attach / in-flight
                                          * verification umbrella           */
  FAULT_OVERLAY_UMOUNT_FAILURE = 111     /* COMBINED ARM ONLY - the
                                          * production supervisor never
                                          * tears down                      */
};

/* Single fault sink: does NOTHING ELSE. Silence in apply mode is law - no
 * prints here, ever. Noreturn by construction (exit() terminates the
 * process) - callers may rely on that for control flow. */
static void die(int code) __attribute__((noreturn));

static void die(int code)
{
  exit(code);
}

/* Append a decimal integer to a fixed buffer; returns the new length. No
 * heap, no stdio formatting.
 *
 * TERMINATION INVARIANT: a filled decimal-format region is either
 * length-driven end-to-end or explicitly terminated by its writer; a
 * consumer may size or copy such a region under exactly one of those
 * two safe forms (never strlen over an unterminated fill). */
static size_t append_decimal(char *buf, size_t len, long v)
{
  char tmp[16];
  int n = 0;
  if (v == 0) {
    buf[len++] = '0';
  } else {
    if (v < 0) {
      buf[len++] = '-';
      v = -v;
    }
    while (v > 0) {
      tmp[n++] = (char)('0' + (v % 10));
      v /= 10;
    }
    while (n > 0)
      buf[len++] = tmp[--n];
  }
  return len;
}

/* Emit THE probe report line: exactly one ASCII LF-terminated line via a
 * SINGLE write() into a small fixed buffer. The format is a protocol
 * constant (host-invariant, mirrored lockstep by the suite):
 *   landlock-helper probe abi=<DISCOVERED_MAX|0> pin=<PINNED_ABI> status=<ok|fail>
 */
static void emit_probe_line(int abi, int ok)
{
  char line[80];
  static const char head[] = "landlock-helper probe abi=";
  static const char mid[] = " pin=";
  static const char tail[] = " status=";
  size_t n = sizeof(head) - 1;
  memcpy(line, head, n);
  n = append_decimal(line, n, abi);
  memcpy(line + n, mid, sizeof(mid) - 1);
  n += sizeof(mid) - 1;
  n = append_decimal(line, n, (long)ACTIVE.pinned_abi);
  memcpy(line + n, tail, sizeof(tail) - 1);
  n += sizeof(tail) - 1;
  if (ok) {
    memcpy(line + n, "ok", 2);
    n += 2;
  } else {
    memcpy(line + n, "fail", 4);
    n += 4;
  }
  line[n++] = '\n';
  ssize_t w = write(STDOUT_FILENO, line, n);
  (void)w;
}

/* Short human stderr diagnostic (PROBE FAILURE ONLY). */
static void probe_diag(const char *stage)
{
  char msg[96];
  static const char pre[] = "landlock-helper probe: failed at ";
  static const char mid[] = " (errno=";
  static const char post[] = ")\n";
  size_t n = sizeof(pre) - 1;
  memcpy(msg, pre, n);
  n += strlen(stage);
  memcpy(msg + n, stage, strlen(stage));
  n += sizeof(mid) - 1;
  n = append_decimal(msg, n, (long)errno);
  memcpy(msg + n, post, sizeof(post) - 1);
  n += sizeof(post) - 1;
  ssize_t w = write(STDERR_FILENO, msg, n);
  (void)w;
}

/* --probe: the throwaway applicability check over a TRIVIAL ruleset (ZERO
 * added rules). NEVER applied to the long-lived agent process - the ratchet
 * is one-way. Sequence: VERSION discovery (return-value channel, precedes
 * prctl - the query needs no NO_NEW_PRIVS) -> prctl -> create -> restrict ->
 * report -> _exit. The identity gate compares discovery against the pin by
 * STRICT EQUALITY (exact-identity lock): both below-pin AND above-pin
 * refuse (status=fail, exit 101) - a newer series whose struct/vocabulary
 * drift is unmeasured by this artifact family.
 */
static int run_probe(void)
{
  long disc = syscall(ACTIVE.create_nr, NULL, 0UL, ACTIVE.version_flag, 0UL, 0UL, 0UL);
  int abi = disc > 0 ? (int)disc : 0;

  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
    probe_diag("prctl(NO_NEW_PRIVS)");
    emit_probe_line(abi, 0);
    _exit(FAULT_ABI_MISSING_OR_BLOCKED);
  }

  struct ll_ruleset_attr attr = {ACTIVE.mutation_mask, 0UL, 0UL};
  int rs =
      (int)syscall(ACTIVE.create_nr, &attr, (long)ACTIVE.ruleset_attr_bytes, 0UL, 0UL, 0UL, 0UL);
  if (rs < 0) {
    probe_diag("create_ruleset");
    emit_probe_line(abi, 0);
    _exit(FAULT_ABI_MISSING_OR_BLOCKED);
  }

  long rr = syscall(ACTIVE.restrict_nr, rs, 0UL, 0UL, 0UL, 0UL, 0UL);
  if (rr != 0) {
    probe_diag("restrict_self");
    emit_probe_line(abi, 0);
    _exit(FAULT_ABI_MISSING_OR_BLOCKED);
  }

  int ok = abi == (int)ACTIVE.pinned_abi; /* STRICT equality - identity gate */
  emit_probe_line(abi, ok);
  _exit(ok ? 0 : FAULT_ABI_MISSING_OR_BLOCKED);
}

/* Apply mode: parse/validate the spec SILENTLY (any violation exits 100
 * before any system state changes) -> prctl -> create -> per unique path:
 * open(O_PATH|O_CLOEXEC|O_DIRECTORY) + typed add_rule (the rule TYPE is an
 * explicit second argument; there is NO size argument - the kernel derives
 * it from the type) + close -> restrict_self(flags=0) -> close ruleset fd
 * -> execve(argv0, argv, environ). Inherited verbatim: cwd, environment,
 * signals (default dispositions - no handlers installed). The helper chdirs
 * nowhere and mutates no env; it performs NO path resolution or PATH lookup
 * (program absoluteness is the TS assembler's contract). Duplicate --write
 * paths deduplicate silently (first occurrence kept, order preserved).
 * Everything after the FIRST -- passes through VERBATIM.
 */
static int run_apply(int argc, char **argv)
{
  char *paths[argc]; /* stack array - at most one entry per argv token */
  int npaths = 0;
  int sep = -1;
  int i = 1;
  for (; i < argc; i++) {
    const char *tok = argv[i];
    if (strcmp(tok, "--") == 0) {
      sep = i;
      break;
    }
    if (strcmp(tok, "--write") == 0) {
      /* A dangling --write (no value just before -- / end) is malformed. */
      if (i + 1 >= argc || strcmp(argv[i + 1], "--") == 0)
        die(FAULT_MALFORMED_SPEC);
      const char *value = argv[i + 1];
      /* Non-empty and ABSOLUTE (first char '/'); empty fails the same way. */
      if (value[0] != '/')
        die(FAULT_MALFORMED_SPEC);
      int dup = 0;
      for (int k = 0; k < npaths; k++)
        if (strcmp(paths[k], value) == 0) {
          dup = 1;
          break;
        }
      if (!dup)
        paths[npaths++] = (char *)value;
      i++;
    } else {
      die(FAULT_MALFORMED_SPEC); /* unknown leading token */
    }
  }
  if (sep < 0 || npaths < 1 || sep + 1 >= argc)
    die(FAULT_MALFORMED_SPEC); /* missing separator / grants / program */

  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0)
    die(FAULT_ABI_MISSING_OR_BLOCKED);

  struct ll_ruleset_attr attr = {ACTIVE.mutation_mask, 0UL, 0UL};
  int rs =
      (int)syscall(ACTIVE.create_nr, &attr, (long)ACTIVE.ruleset_attr_bytes, 0UL, 0UL, 0UL, 0UL);
  if (rs < 0)
    die(FAULT_ABI_MISSING_OR_BLOCKED);

  for (int k = 0; k < npaths; k++) {
    int dirfd = open(paths[k], O_PATH | O_CLOEXEC | O_DIRECTORY);
    if (dirfd < 0)
      die(FAULT_ADD_RULE_FAILURE);
    struct ll_path_beneath pb = {ACTIVE.mutation_mask, dirfd};
    long ar = syscall(ACTIVE.addrule_nr, rs, ACTIVE.rule_type_path_beneath, &pb, 0UL, 0UL, 0UL);
    if (ar != 0)
      die(FAULT_ADD_RULE_FAILURE);
    (void)close(dirfd);
  }

  long rr = syscall(ACTIVE.restrict_nr, rs, 0UL, 0UL, 0UL, 0UL, 0UL);
  if (rr != 0)
    die(FAULT_RESTRICT_SELF_FAILURE);
  (void)close(rs);

  /* C runtimes guarantee argv is NUL-terminated - passthrough as-is. */
  execve(argv[sep + 1], &argv[sep + 1], environ);
  die(FAULT_EXECVE_FAILURE); /* execve returns only on failure */
}

/* ==========================================================================
 * Supervisor mode - the realm-established composition (2026-10-07).
 *
 * Roles: the TOP-LEVEL carrier process (spawned by the delegate) is the
 * SUPERVISOR PARENT - it NEVER enters a realm (structurally safe for the
 * identity-capture norm); its direct child (born with CLONE_NEWUSER)
 * CONTINUES IN-REALM. Composed production chain: realm -> private mntns ->
 * mirror mounts -> the tail (which in production IS the existing apply-mode
 * carrier invocation) -> shell. THE MINT STAYS SESSION-SIDE: the caller
 * provides existing absolute triples; the carrier never creates scratch
 * files. The production supervisor performs NO teardown: the dying realm
 * releases its mounts automatically. Band pass-through doctrine
 * (continuation, not new): carrier codes AND any coincidental in-band
 * command exit propagate identically through the FULL chain - the uniform
 * conservative in-band reading at the TS settlement is unchanged.
 * ========================================================================= */

/* One mirror-mount table entry: LOWERDIR is the caller-declared directory
 * and ALSO the mount point (the merged view appears in situ AT the declared
 * path); UPPER/WORK are the session-minted scratch pair living OUTSIDE the
 * lower subtree. */
struct mirror_triple {
  const char *lower;
  const char *upper;
  const char *work;
};

/* Continuation context handed to the clone stack (read-only once the
 * establishment begins). Shared by the production chain and the combined
 * arm; the arm fields are NULL there. verdict_read is assigned by the
 * parent strictly BEFORE the clone, so the child always observes it. */
struct realm_ctx {
  int emit; /* 0 = production (silence law), 1 = combined arm  */
  int verdict_read; /* child read end of the one-byte channel  */
  int ntriples;
  const struct mirror_triple *table; /* caller-frame storage, stable    */
  char **child_argv; /* production: verbatim tail after FIRST --; */
                     /* arm: NULL                              */
  char *probe_root; /* arm: minted subtree root (.llh-overlay-probe) */
                    /* production: NULL                          */
};

/* Fixed static clone stack - the 256 KiB sizing convention sized
 * generously; the STACK-TOP argument idiom (clone requires the top of the
 * region). One active supervision per process lifetime. */
#define REALM_STACK_BYTES (256 * 1024)
static char realm_stack[REALM_STACK_BYTES];

/* Overlay data string buffer: three PATH_MAX-bounded paths plus labels and
 * separators. Truncation is unreachable for well-formed argv; the check is
 * belt-and-braces and fails conservatively with the same code as the
 * kernel's own length refusal (still strictly pre-execve). */
#define MOUNT_DATA_BYTES (3 * 4096 + 64)

/* Fixed-buffer string assembly - NO stdio formatting (house doctrine).
 * Each helper copies pieces verbatim into a caller-owned buffer, NUL-
 * terminates on success, and returns -1 on truncation (the caller routes
 * it to the conservative fault; truncation is unreachable for well-formed
 * inputs). */

/* out <- dir + "/" + name. */
static long join_name(char *out, size_t cap, const char *dir, const char *name)
{
  const char *parts[3] = {dir, "/", name};
  size_t total = 0;
  for (int i = 0; i < 3; i++)
    total += strlen(parts[i]);
  if (total + 1 > cap)
    return -1;
  size_t n = 0;
  for (int i = 0; i < 3; i++) {
    size_t l = strlen(parts[i]);
    memcpy(out + n, parts[i], l);
    n += l;
  }
  out[n] = '\0';
  return (long)n;
}

/* out <- "<id> <id> 1\n" (SINGLE-LINE map content - the man-page single-
 * line / same-effective-uid rule). */
static long map_line(char *out, size_t cap, unsigned long id)
{
  char tmp[64];
  size_t n = append_decimal(tmp, 0, (long)id);
  if (n + 1 >= sizeof tmp)
    return -1;
  size_t need = n + 1 + n + 1 + 3 + 1; /* digits sp digits sp " 1\n" NUL */
  if (need >= cap)
    return -1;
  memcpy(out, tmp, n);
  out[n] = ' ';
  memcpy(out + n + 1, tmp, n);
  memcpy(out + n + 1 + n, " 1\n", 3);
  out[n + 1 + n + 3] = '\0';
  return (long)(n + 1 + n + 3);
}

/* out <- "/proc/<pid>/<field>". */
static long proc_target(char *out, size_t cap, pid_t child, const char *field)
{
  char pidbuf[16];
  size_t pn = append_decimal(pidbuf, 0, (long)child);
  if (pn + 1 >= sizeof pidbuf)
    return -1;
  pidbuf[pn] = '\0';
  const char *parts[4] = {"/proc/", pidbuf, "/", field};
  size_t total = 0;
  for (int i = 0; i < 4; i++)
    total += strlen(parts[i]);
  if (total + 1 > cap)
    return -1;
  size_t n = 0;
  for (int i = 0; i < 4; i++) {
    size_t l = strlen(parts[i]);
    memcpy(out + n, parts[i], l);
    n += l;
  }
  out[n] = '\0';
  return (long)n;
}

/* out <- "lowerdir=<L>,upperdir=<U>,workdir=<W>" (overlay data string).
 * Truncation fails conservatively - equivalent to the kernel's own length
 * refusal. */
static long mount_data(char *out, size_t cap, const struct mirror_triple *t)
{
  static const char labels[3][10] = {"lowerdir=", "upperdir=", "workdir="};
  const char *paths[3] = {t->lower, t->upper, t->work};
  size_t total = 0;
  for (int i = 0; i < 3; i++)
    total += strlen(labels[i]) + strlen(paths[i]);
  total += 2; /* two commas */
  if (total + 1 > cap)
    return -1;
  size_t n = 0;
  for (int i = 0; i < 3; i++) {
    size_t ll = strlen(labels[i]);
    memcpy(out + n, labels[i], ll);
    n += ll;
    size_t l = strlen(paths[i]);
    memcpy(out + n, paths[i], l);
    n += l;
    if (i < 2)
      out[n++] = ',';
  }
  out[n] = '\0';
  return (long)n;
}

/* Combined-arm fixed bytes - PROTOCOL CONSTANTS (quoted in the README):
 * seed 23 bytes at lower/seed.txt; CoW file cow.txt 22 bytes created THROUGH
 * THE MERGED VIEW and asserted present in the upper while mounted. Tree name
 * .llh-overlay-probe/{lower,upper,work} is the protocol-constant mint. */
#define OVERLAY_TREE_NAME ".llh-overlay-probe"
static const char OVERLAY_SEED[] = "llh-overlay-probe-seed\n";
static const char OVERLAY_COW[] = "llh-overlay-probe-cow\n";

/* mkdir(2) via the raw syscall form (the libc prototype lives in
 * <sys/stat.h> - outside this artifact's portable header set); explicit
 * trailing zeros per the register discipline. Returns the syscall result. */
static long make_dir(const char *path)
{
  return syscall(SYS_mkdir, path, 0700, 0UL, 0UL, 0UL, 0UL);
}

/* Short human stderr diagnostic (COMBINED-ARM FAILURE ONLY): the pinned
 * form over the eight-stage vocabulary, assembled sequentially (advance-
 * then-copy per segment - the exact-bytes bar is pinned by the H2 row):
 *   landlock-helper overlay: failed at <stage> (errno=N)\n */
static void overlay_diag(const char *stage)
{
  char msg[96];
  static const char pre[] = "landlock-helper overlay: failed at ";
  static const char mid[] = " (errno=";
  static const char post[] = ")\n";
  size_t n = 0;
  memcpy(msg + n, pre, sizeof(pre) - 1);
  n += sizeof(pre) - 1;
  memcpy(msg + n, stage, strlen(stage));
  n += strlen(stage);
  memcpy(msg + n, mid, sizeof(mid) - 1);
  n += sizeof(mid) - 1;
  n = append_decimal(msg, n, (long)errno);
  memcpy(msg + n, post, sizeof(post) - 1);
  n += sizeof(post) - 1;
  ssize_t w = write(STDERR_FILENO, msg, n);
  (void)w;
}

/* Emit THE combined-arm report line: exactly one ASCII LF-terminated line
 * via a SINGLE write() into a small fixed buffer. Protocol constant:
 *   landlock-helper overlay realm=<ok|fail> status=<ok|fail>
 * (parallel to the probe line WITHOUT abi/pin fields - the mechanic has no
 * kernel-series identity gate; the realm field carries the realm-
 * establishment applicability.) */
static void emit_overlay_line(int realm_ok, int status_ok)
{
  char line[64];
  static const char head[] = "landlock-helper overlay realm=";
  static const char mid[] = " status=";
  size_t n = sizeof(head) - 1;
  memcpy(line, head, n);
  if (realm_ok) {
    memcpy(line + n, "ok", 2);
    n += 2;
  } else {
    memcpy(line + n, "fail", 4);
    n += 4;
  }
  memcpy(line + n, mid, sizeof(mid) - 1);
  n += sizeof(mid) - 1;
  if (status_ok) {
    memcpy(line + n, "ok", 2);
    n += 2;
  } else {
    memcpy(line + n, "fail", 4);
    n += 4;
  }
  line[n++] = '\n';
  ssize_t w = write(STDOUT_FILENO, line, n);
  (void)w;
}

/* Arm fault exit: one pinned report line + one short stderr diagnostic,
 * then the classified exit. At most ONE emitter per execution BY
 * CONSTRUCTION: the continue-verdict handoff PARTITIONS the emitters
 * (parent-side stages emit before the verdict; child-side stages emit in
 * the child after it) - no execution path crosses the partition twice.
 * Vehicle stages carry realm=fail; the non-vehicle legs (setup/mount/
 * verify/umount) carry realm=ok. Noreturn. reap_detail (NULL at every
 * pre-existing site): when non-NULL, ONE reaped-child detail line is
 * emitted BETWEEN the stage diagnostic and the report line (the measured
 * corner only - see the map-stage fault site in establish_and_wait). */
static void overlay_fault(const char *stage, int code, int realm_ok,
                          const char *reap_detail) __attribute__((noreturn));

static void overlay_fault(const char *stage, int code, int realm_ok,
                          const char *reap_detail)
{
  overlay_diag(stage);
  if (reap_detail != NULL) {
    ssize_t rw = write(STDERR_FILENO, reap_detail, strlen(reap_detail));
    (void)rw;
  }
  emit_overlay_line(realm_ok, 0);
  _exit(code);
}

/* Fault exit honoring the active mode's channel: production => the silent
 * classified exit (silence law across BOTH fault-emitting modes - the code
 * is the entire channel; the reap detail is never rendered here); combined
 * arm => overlay_fault. Noreturn. */
static void est_fault(const struct realm_ctx *c, const char *stage, int code,
                      int realm_ok, const char *reap_detail)
    __attribute__((noreturn));

static void est_fault(const struct realm_ctx *c, const char *stage, int code,
                      int realm_ok, const char *reap_detail)
{
  if (c->emit != 0)
    overlay_fault(stage, code, realm_ok, reap_detail);
  _exit(code);
}

/* Parent-side single-field map write against /proc/<child>/<field>, SINGLE
 * LINE content. The committed errno ladder: ENOENT => 108 (the child
 * vanished - early-death signature, distinct from permission faults by
 * construction); ANY OTHER open/write fault => 107. Errno is captured
 * BEFORE the close so the classification rides the operation that faulted.
 * Returns 0 nominal. */
static int map_write_field(pid_t child, const char *field, const char *bytes)
{
  char target[64];
  long l = proc_target(target, sizeof target, child, field);
  if (l < 0)
    return FAULT_REALM_MAP_WRITE_FAILURE; /* unreachable - guarded corner */
  int fd = open(target, O_WRONLY);
  if (fd < 0)
    return errno == ENOENT ? FAULT_CHILD_EARLY_DEATH : FAULT_REALM_MAP_WRITE_FAILURE;
  ssize_t w = write(fd, bytes, strlen(bytes));
  int saved = errno;
  (void)close(fd);
  if (w != (ssize_t)strlen(bytes))
    return saved == ENOENT ? FAULT_CHILD_EARLY_DEATH : FAULT_REALM_MAP_WRITE_FAILURE;
  return 0;
}

/* Exact-byte consult: true iff the file holds EXACTLY the expected bytes
 * (combined-arm verify stages only). */
static int file_holds_exact(const char *path, const char *expect)
{
  size_t want = strlen(expect);
  int fd = open(path, O_RDONLY);
  if (fd < 0)
    return 0;
  char buf[64];
  ssize_t n = read(fd, buf, sizeof buf);
  (void)close(fd);
  return n == (ssize_t)want && memcmp(buf, expect, want) == 0;
}

/* BEST-EFFORT recursive deletion (arm cleanup ONLY): dirent descent -
 * files/devices unlink (whiteout char devices are unlink-safe), directories
 * recurse-then-rmdir. EVERY error is swallowed BY DESIGN: cleanup can never
 * change the report status or the exit - the classification is settled
 * upstream of this walk. */
static void remove_tree(const char *path)
{
  DIR *d = opendir(path);
  if (d != NULL) {
    struct dirent *e;
    while ((e = readdir(d)) != NULL) {
      if (strcmp(e->d_name, ".") == 0 || strcmp(e->d_name, "..") == 0)
        continue;
      char sub[4400]; /* PATH_MAX prefix + NAME_MAX + separator + NUL */
      long j = join_name(sub, sizeof sub, path, e->d_name);
      if (j < 0) {
        (void)closedir(d);
        break; /* unreachable - swallow-all regardless */
      }
      remove_tree(sub);
    }
    (void)closedir(d);
  }
  (void)unlink(path); /* file/device (incl. whiteouts) */
  (void)rmdir(path);  /* directory once children are gone */
}

/* The realm continuation (runs in the cloned CLONE_NEWUSER child). Blocks
 * on the ONE-BYTE verdict read BEFORE anything else ('c' => proceed;
 * 'd'/EOF/error => ABORT WITHOUT ESTABLISHING - partial maps NEVER
 * continue, fail-closed by construction; the abort emits nothing - the
 * emitter partition owes none here). Then: unshare(CLONE_NEWNS) (=> 109);
 * per table entry IN ORDER, overlay attach with MOUNT POINT = LOWERDIR
 * (=> 110); production: execve the tail VERBATIM (returning => 104 REUSE);
 * combined arm: in-flight verify (=> 110) -> umount (=> 111) -> best-effort
 * removal of the minted tree (never faults) -> ok line -> 0. */
static int realm_child(void *arg)
{
  const struct realm_ctx *c = arg;
  unsigned char verdict = 0;
  ssize_t r = read(c->verdict_read, &verdict, 1);
  if (r < 0 || r == 0 || verdict != 'c')
    _exit(1); /* abort WITHOUT establishing */
  (void)close(c->verdict_read);

  if (unshare(CLONE_NEWNS) != 0)
    est_fault(c, "unshare", FAULT_REALM_UNSHARE_FAILURE, 0, NULL);

  for (int i = 0; i < c->ntriples; i++) {
    const struct mirror_triple *t = &c->table[i];
    char data[MOUNT_DATA_BYTES];
    long dl = mount_data(data, sizeof data, t);
    if (dl < 0)
      est_fault(c, "mount", FAULT_OVERLAY_MOUNT_FAILURE, 1, NULL);
    long m = syscall(SYS_mount, t->lower, t->lower, "overlay", 0UL, data, 0UL);
    if (m != 0)
      est_fault(c, "mount", FAULT_OVERLAY_MOUNT_FAILURE, 1, NULL);
  }

  if (c->child_argv != NULL) {
    /* Production chain: the tail passes through VERBATIM (the carrier
     * never rewrites tail bytes). Returning here means the execve FAILED
     * => 104 REUSE - same class and meaning as apply mode, now reached
     * THROUGH the chain. */
    execve(c->child_argv[0], c->child_argv, environ);
    _exit(FAULT_EXECVE_FAILURE);
  }

  /* Combined-arm continuation (throwaway). IN-FLIGHT VERIFY WHILE MOUNTED:
   * (i) the seed readable through the merged view with EXACT bytes; (ii) a
   * new file created THROUGH THE MERGED VIEW present in the UPPER with
   * exact bytes (CoW evidence while mounted). */
  char seed_at[4352];
  long sl = join_name(seed_at, sizeof seed_at, c->table[0].lower, "seed.txt");
  if (sl < 0 || !file_holds_exact(seed_at, OVERLAY_SEED))
    est_fault(c, "verify", FAULT_OVERLAY_MOUNT_FAILURE, 1, NULL);
  char cow_view[4352];
  sl = join_name(cow_view, sizeof cow_view, c->table[0].lower, "cow.txt");
  if (sl < 0)
    est_fault(c, "verify", FAULT_OVERLAY_MOUNT_FAILURE, 1, NULL);
  int cf = open(cow_view, O_WRONLY | O_CREAT | O_TRUNC, 0600);
  if (cf < 0)
    est_fault(c, "verify", FAULT_OVERLAY_MOUNT_FAILURE, 1, NULL);
  ssize_t cw = write(cf, OVERLAY_COW, sizeof(OVERLAY_COW) - 1);
  (void)close(cf);
  if (cw != (ssize_t)(sizeof(OVERLAY_COW) - 1))
    est_fault(c, "verify", FAULT_OVERLAY_MOUNT_FAILURE, 1, NULL);
  char cow_upper[4352];
  sl = join_name(cow_upper, sizeof cow_upper, c->table[0].upper, "cow.txt");
  if (sl < 0 || !file_holds_exact(cow_upper, OVERLAY_COW))
    est_fault(c, "verify", FAULT_OVERLAY_MOUNT_FAILURE, 1, NULL);

  long u = syscall(SYS_umount2, c->table[0].lower, 0UL, 0UL, 0UL, 0UL, 0UL);
  if (u != 0)
    est_fault(c, "umount", FAULT_OVERLAY_UMOUNT_FAILURE, 1, NULL);

  remove_tree(c->probe_root); /* swallow-all; never changes the outcome */
  emit_overlay_line(1, 1);
  _exit(0);
}

/* Establish the realm per the committed sequence and wait for the direct
 * child, propagating its outcome UNTRANSFORMED in observational class:
 * normal exit => _exit(WEXITSTATUS) VERBATIM; signal death => self-raise
 * the SAME signal (DEFAULT dispositions inherited - no handlers installed
 * anywhere in the carrier); dead-code _exit(255) backstop. WIFSTOPPED is
 * invisible to a plain waitpid - NO stop-loop code; the external-SIGSTOP
 * residual is identical to the shipped apply-mode posture (documented, not
 * handled). Noreturn. */
static void establish_and_wait(struct realm_ctx *c, unsigned long cap_uid,
                               unsigned long cap_gid)
    __attribute__((noreturn));

static void establish_and_wait(struct realm_ctx *c, unsigned long cap_uid,
                               unsigned long cap_gid)
{
  /* (b) pipe + clone(CLONE_NEWUSER). Failure => 106. */
  int pipefd[2];
  if (pipe(pipefd) != 0)
    est_fault(c, "realm-clone", FAULT_REALM_CLONE_FAILURE, 0, NULL);
  c->verdict_read = pipefd[0];
  pid_t child = clone(realm_child, realm_stack + REALM_STACK_BYTES,
                      CLONE_NEWUSER | SIGCHLD, c);
  if (child < 0)
    est_fault(c, "realm-clone", FAULT_REALM_CLONE_FAILURE, 0, NULL);

  /* SIGPIPE-disposition refinement (PARENT ONLY): a DISPOSITION change,
   * strictly AFTER clone and BEFORE the first verdict-channel write -
   * without it a vanished child at the verdict write would terminate the
   * parent with SIGPIPE before the committed 108 classification could run.
   * The child was cloned BEFORE the change and KEEPS DEFAULT SIGPIPE
   * (restricted-lineage pipeline semantics unperturbed). Residual corner
   * (documented, not handled - character-identical to the SIGSTOP
   * residual): a lineage dying by SIGPIPE surfaces at the parent as the
   * dead-code backstop numeric exit, because the self-raised SIGPIPE is
   * ignored here. SDK kill vectors (TERM/KILL) are unaffected. */
  struct sigaction ignore_pipe;
  memset(&ignore_pipe, 0, sizeof ignore_pipe);
  ignore_pipe.sa_handler = SIG_IGN;
  (void)sigaction(SIGPIPE, &ignore_pipe, NULL);

  /* (d) HARDENED MAP WRITES, IN ORDER, SINGLE LINE each. Content derives
   * from the CAPTURED step-(a) identity ONLY - setgroups DENIED FIRST
   * (owner ruling), then the single-line single-identity caller-uid/gid
   * maps (runtime-derived - NO hardcoded literals; inner-root declined). */
  (void)close(pipefd[0]);
  char uid_bytes[64];
  long ulm = map_line(uid_bytes, sizeof uid_bytes, cap_uid);
  char gid_bytes[64];
  long glm = map_line(gid_bytes, sizeof gid_bytes, cap_gid);
  static const char deny_bytes[] = "deny\n";
  int rc = 0;
  if (ulm >= 0 && glm >= 0) {
    rc = map_write_field(child, "setgroups", deny_bytes);
    if (rc == 0)
      rc = map_write_field(child, "uid_map", uid_bytes);
    if (rc == 0)
      rc = map_write_field(child, "gid_map", gid_bytes);
  } else {
    rc = FAULT_REALM_MAP_WRITE_FAILURE; /* unreachable - guarded corner */
  }
  if (rc != 0) {
    if (rc != FAULT_CHILD_EARLY_DEATH) {
      char deny = 'd';
      ssize_t dw = write(pipefd[1], &deny, 1);
      (void)dw; /* best-effort deny; errors deliberately ignored */
    }
    /* REAP-BEFORE-CLASSIFY (observability hardening, amendment 2026-10-07):
     * ONE NON-BLOCKING reap of the direct child strictly BEFORE the
     * classification below - fault 108 must not assert "the child
     * vanished" without consulting the child. Lifecycle-neutral hygiene:
     * it never signals, blocks, or kills, and nothing waits past this
     * bounded instant. A still-alive child (blocked in its verdict read -
     * the EXPECTED corner in most map-stage faults) remains orphaned
     * exactly as before (closing the write end makes its pending read
     * EOF; it aborts silently without establishing). Both modes PERFORM
     * the reap; only EMISSION is mode-gated - the measured outcome folds
     * into the COMBINED-ARM stderr diagnostic as its own pinned line
     * (after the stage diagnostic, before the report line); production
     * arms render nothing. Conservative corner (not exited yet, reap
     * failure, or stopped status): NO detail, the classification stands
     * as-is. errno is captured before the waitpid and restored before the
     * sink so the stage diagnostic renders the MAP operation's errno
     * byte-pinned (waitpid success leaves errno untouched by glibc; the
     * restore makes that guarantee mechanical, not implementation-
     * dependent). The assembled line rides a stack frame valid through
     * the synchronous est_fault -> overlay_fault chain (no fork between).
     */
    int saved_errno = errno;
    int reap_status = 0;
    char reap_line[96];
    const char *reap_detail = NULL;
    if (waitpid(child, &reap_status, WNOHANG) > 0 &&
        (WIFEXITED(reap_status) || WIFSIGNALED(reap_status))) {
      static const char reaped_pre[] =
          "landlock-helper overlay: reaped child: ";
      size_t rn = sizeof(reaped_pre) - 1;
      memcpy(reap_line, reaped_pre, rn);
      if (WIFEXITED(reap_status)) {
        memcpy(reap_line + rn, "exit=", 5);
        rn += 5;
        rn = append_decimal(reap_line, rn, (long)WEXITSTATUS(reap_status));
      } else {
        memcpy(reap_line + rn, "signal=", 7);
        rn += 7;
        rn = append_decimal(reap_line, rn, (long)WTERMSIG(reap_status));
      }
      reap_line[rn++] = '\n';
      reap_detail = reap_line;
    }
    errno = saved_errno;
    est_fault(c, rc == FAULT_CHILD_EARLY_DEATH ? "child-early-death"
                                               : "realm-map",
              rc, 0, reap_detail);
  }

  /* (e) CONTINUE-VERDICT. Write failure (vanishing child between maps and
   * verdict) => 108. Close the write end, then wait (step h). */
  char cont = 'c';
  ssize_t vw = write(pipefd[1], &cont, 1);
  if (vw != 1)
    est_fault(c, "child-early-death", FAULT_CHILD_EARLY_DEATH, 0, NULL);
  (void)close(pipefd[1]);

  /* (h) waitpid outcome propagates UNTRANSFORMED in observational class. */
  int status = 0;
  if (waitpid(child, &status, 0) < 0)
    _exit(255); /* dead-code backstop */
  if (WIFEXITED(status))
    _exit(WEXITSTATUS(status));
  if (WIFSIGNALED(status)) {
    int sig = WTERMSIG(status);
    kill(getpid(), sig); /* self-raise; default dispositions inherited */
    _exit(sig);          /* unreachable unless the signal is blocked */
  }
  _exit(255); /* dead-code backstop (WIFSTOPPED invisible to plain waitpid) */
}

/* Supervisor mode: SILENT parse/validate the lead section (any violation
 * exits 105 STRICTLY BEFORE any system state changes - the silence law
 * maintained across both fault-emitting modes), capture the OWN uid/gid
 * NOW (identity read taken while still holding outer-world credentials),
 * then establish and wait. Lead grammar: --mount L U W TRIPLES ONLY (each
 * value NON-EMPTY, ABSOLUTE, NOT exactly "/" - root-component rejection at
 * carrier level, twin of the planner's root-mount refusal); >=1 complete
 * triple required; IDENTICAL triples dedupe silently (first occurrence kept,
 * order preserved - the --write dedupe rule mirrored); DISTINCT
 * overlapping/nested triples are NOT grammar faults - the kernel refuses
 * them at mount time (typed 110 fail-closed; the PLANNER refuses true
 * nesting earlier at the spawn site - defense in depth, not grammar). The
 * -- separator is REQUIRED with >=1 child token after it; EVERYTHING after
 * the FIRST -- passes through VERBATIM as the child invocation. */
static int run_supervise(int argc, char **argv)
{
  struct mirror_triple table[argc]; /* argc-sized stack array (established pattern) */
  int ntriples = 0;
  int sep = -1;
  int i = 1;
  for (; i < argc; i++) {
    const char *tok = argv[i];
    if (strcmp(tok, "--") == 0) {
      sep = i;
      break;
    }
    if (strcmp(tok, "--mount") != 0)
      die(FAULT_SUPERVISOR_TABLE_MALFORMED); /* unknown leading token (incl. --write) */
    if (i + 3 >= argc)
      die(FAULT_SUPERVISOR_TABLE_MALFORMED); /* dangling/incomplete triple */
    const char *lower = argv[i + 1];
    const char *upper = argv[i + 2];
    const char *work = argv[i + 3];
    const char *values[3] = {lower, upper, work};
    for (int k = 0; k < 3; k++) {
      if (values[k][0] != '/' || strcmp(values[k], "/") == 0)
        die(FAULT_SUPERVISOR_TABLE_MALFORMED); /* empty / relative / root component */
    }
    int dup = 0;
    for (int k = 0; k < ntriples; k++)
      if (strcmp(table[k].lower, lower) == 0 &&
          strcmp(table[k].upper, upper) == 0 && strcmp(table[k].work, work) == 0)
        dup = 1;
    if (!dup) {
      table[ntriples].lower = lower;
      table[ntriples].upper = upper;
      table[ntriples].work = work;
      ntriples++;
    }
    i += 3;
  }
  if (sep < 0 || ntriples < 1 || sep + 1 >= argc)
    die(FAULT_SUPERVISOR_TABLE_MALFORMED); /* missing separator / table / child */

  /* Step (a) PIN: capture the supervisor's OWN uid/gid NOW - the map
   * CONTENT derives from these captured values only (an identity read
   * taken after entering an unmapped userns reports the overflow uid and
   * violates the single-line / same-effective-uid write rule). */
  unsigned long cap_uid = (unsigned long)getuid();
  unsigned long cap_gid = (unsigned long)getgid();

  struct realm_ctx c;
  c.emit = 0;
  c.verdict_read = 0; /* assigned by establish_and_wait before the clone */
  c.ntriples = ntriples;
  c.table = table;
  c.child_argv = &argv[sep + 1]; /* C runtimes NUL-terminate argv */
  c.probe_root = NULL;
  establish_and_wait(&c, cap_uid, cap_gid); /* noreturn */
}

/* Combined applicability probe arm (self-contained THROWAWAY): mints a tiny
 * hidden subtree <ABS_ROOT>/.llh-overlay-probe/{lower,upper,work} plus the
 * fixed-byte seed, then runs the committed establishment over the seeded
 * triple (mount point = lowerdir), verifies IN FLIGHT (exact bytes both
 * ways while mounted), umounts, removes the minted tree SWALLOW-ALL, and
 * emits the report line. The arm restricts/isolates ITS OWN disposable
 * process pair only - nothing long-lived is ever mounted (the standing
 * ratchet doctrine extends: the agent/session process stays unrestricted
 * AND unmounted). Emission structure: setup faults emit at the top level;
 * vehicle faults (clone/map/early-death) emit in the parent; unshare/mount/
 * verify/umount emit in the child; success emits the ok cell in the child.
 * AT MOST ONCE per execution (continue-verdict partition). */
static int run_overlay_probe(int argc, char **argv)
{
  /* Arity/path: exactly ONE value - a non-empty ABSOLUTE path to an
   * EXISTING directory; violations => silent 105 (existence is GRAMMAR -
   * checked before any system state change; the mint stage faults
   * separately as SETUP). */
  if (argc != 3)
    die(FAULT_SUPERVISOR_TABLE_MALFORMED);
  const char *root = argv[2];
  if (root[0] != '/')
    die(FAULT_SUPERVISOR_TABLE_MALFORMED);
  int rfd = open(root, O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  if (rfd < 0)
    die(FAULT_SUPERVISOR_TABLE_MALFORMED); /* absent / not a directory */
  (void)close(rfd);

  /* Path assembly (guarded corners unreachable for expressible roots -
   * oversize argv strings already faulted at the existence check above).
   * Buffer discipline: root <= PATH_MAX + protocol-constant suffixes. */
  char tree[4352];
  long pl = join_name(tree, sizeof tree, root, OVERLAY_TREE_NAME);
  if (pl < 0)
    die(FAULT_SUPERVISOR_TABLE_MALFORMED);
  char lower[4352], upper[4352], work[4352];
  pl = join_name(lower, sizeof lower, tree, "lower");
  if (pl < 0)
    die(FAULT_SUPERVISOR_TABLE_MALFORMED);
  pl = join_name(upper, sizeof upper, tree, "upper");
  if (pl < 0)
    die(FAULT_SUPERVISOR_TABLE_MALFORMED);
  pl = join_name(work, sizeof work, tree, "work");
  if (pl < 0)
    die(FAULT_SUPERVISOR_TABLE_MALFORMED);

  /* SETUP (mkdir x4 incl. the base dir + seed write). Any failure => 110
   * with the realm applicability untouched (non-vehicle leg). */
  if (make_dir(tree) != 0 || make_dir(lower) != 0 || make_dir(upper) != 0 ||
      make_dir(work) != 0)
    overlay_fault("setup", FAULT_OVERLAY_MOUNT_FAILURE, 1, NULL);
  char seed_path[4352];
  pl = join_name(seed_path, sizeof seed_path, lower, "seed.txt");
  if (pl < 0)
    die(FAULT_SUPERVISOR_TABLE_MALFORMED); /* unreachable - guarded corner */
  int sfd = open(seed_path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
  if (sfd < 0)
    overlay_fault("setup", FAULT_OVERLAY_MOUNT_FAILURE, 1, NULL);
  ssize_t sw = write(sfd, OVERLAY_SEED, sizeof(OVERLAY_SEED) - 1);
  (void)close(sfd);
  if (sw != (ssize_t)(sizeof(OVERLAY_SEED) - 1))
    overlay_fault("setup", FAULT_OVERLAY_MOUNT_FAILURE, 1, NULL);

  struct mirror_triple table;
  table.lower = lower;
  table.upper = upper;
  table.work = work;
  unsigned long cap_uid = (unsigned long)getuid();
  unsigned long cap_gid = (unsigned long)getgid();
  struct realm_ctx c;
  c.emit = 1;
  c.verdict_read = 0; /* assigned by establish_and_wait before the clone */
  c.ntriples = 1;
  c.table = &table;
  c.child_argv = NULL;
  c.probe_root = tree;
  establish_and_wait(&c, cap_uid, cap_gid); /* noreturn */
}

int main(int argc, char **argv)
{
  if (argc > 1 && strcmp(argv[1], "--probe") == 0) {
    /* Probe mode takes EXACTLY one token; ANY additional token is
     * malformed-spec (silent 100, like every apply-mode fault). */
    if (argc > 2)
      die(FAULT_MALFORMED_SPEC);
    return run_probe();
  }
  /* Dispatch ladder: the existing probe arm is BYTE-STABLE (untouched
   * above); the combined arm and supervisor mode route on their exact
   * tokens; ANY other token falls through to the UNCHANGED apply-mode
   * parser (its discipline stands - the zero-churn proof). */
  if (argc > 1 && strcmp(argv[1], "--overlay-probe") == 0)
    return run_overlay_probe(argc, argv);
  if (argc > 1 && strcmp(argv[1], "--mount") == 0)
    return run_supervise(argc, argv);
  return run_apply(argc, argv);
}
