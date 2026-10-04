/* landlock-helper - vendored fence carrier for the pio command-write fence.
 *
 * Provenance: self-authored (2026-10-04), MIT-aligned with the repository.
 * The protocol home is README.md in this directory (argv grammar,
 * fault-code table, ABI pin policy, measured record). Regenerate via
 * regenerate.sh (static link, -O2 -Wall -Wextra -Werror). No third-party
 * bytes, no kernel headers, no network at build time.
 *
 * Silence: APPLY mode emits ZERO bytes on stdout AND stderr on every fault
 * fault path - the classified exit code is the entire channel; typed refusal
 * rendering lives in the TS side. PROBE mode emits exactly ONE stdout line
 * (pinned format) in both outcomes, plus a short stderr diagnostic on
 * failure only. The exit code is authoritative in all cases.
 *
 * ABI pin: EXACT-IDENTITY lock at 8 (measured 2026-10-04 on kernel
 * 7.0.0-34-generic - see README "Measured ABI/pin record"). REGISTER
 * DISCIPLINE: every Landlock call issues exactly six arguments with explicit
 * trailing zeros - leftover vararg garbage produced MEASURED false failures.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <sys/types.h>
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
 * assignment uses the low half (105-199 stay reserved). Every apply-mode fault exits BEFORE any
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
  FAULT_EXECVE_FAILURE = 104         /* execve failed after restriction      */
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
 * heap, no stdio formatting. */
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

int main(int argc, char **argv)
{
  if (argc > 1 && strcmp(argv[1], "--probe") == 0) {
    /* Probe mode takes EXACTLY one token; ANY additional token is
     * malformed-spec (silent 100, like every apply-mode fault). */
    if (argc > 2)
      die(FAULT_MALFORMED_SPEC);
    return run_probe();
  }
  return run_apply(argc, argv);
}
