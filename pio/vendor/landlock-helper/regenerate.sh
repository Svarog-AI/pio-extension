#!/usr/bin/env bash
# regenerate.sh - developer-only static-link regeneration of landlock-helper.
#
# Rebuilds the vendored prebuilt binary from the checked-in source (zero-
# build doctrine holds: the committed prebuild is what runs; a compiler is a
# dev-time artifact-regeneration tool only). Idempotent in-place rebuild; no
# network, no fetches, no timestamp-dependent inputs. BYTE-reproducibility
# across rebuilds is NOT claimed - behavioral parity via the --probe line is
# the bar.
#
# Usage: regenerate.sh [OUT_PATH]
#   OUT_PATH  optional override for the output binary (default:
#             <script dir>/bin/<arch>-linux/landlock-helper). Tests pass a
#             tmp path so they NEVER overwrite the committed binary in place.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CC_BIN="${CC:-cc}"
ARCH="$(uname -m)"
SRC="$DIR/landlock-helper.c"
DEFAULT_OUT="$DIR/bin/${ARCH}-linux/landlock-helper"
OUT="${1:-$DEFAULT_OUT}"

case "$ARCH" in
x86_64)
  ;;
aarch64)
  echo "regenerate.sh: REFUSAL (named): aarch64 host class is UNMEASURED - no committed constants exist for it (the source's own #error is belt-and-suspenders). Run the README measure-and-pin procedure on real aarch64 hardware first." >&2
  exit 1
  ;;
*)
  echo "regenerate.sh: REFUSAL (named): unsupported architecture '${ARCH}' - fail-closed house posture, no partial artifacts. Supported: x86_64 (aarch64 deferred pending measurement)." >&2
  exit 1
  ;;
esac

mkdir -p "$(dirname "$OUT")"
"$CC_BIN" -O2 -Wall -Wextra -Werror -static -o "$OUT" "$SRC"
chmod 755 "$OUT"

# Post-build smoke gate: the rebuilt binary must probe GREEN on this host.
# A regeneration on a host without usable Landlock (or with an ABI identity
# mismatch vs the compiled pin) refuses loudly with this named diagnostic -
# the prebuild is meaningless elsewhere and never ships silently.
if ! "$OUT" --probe; then
  echo "regenerate.sh: REFUSAL (named): regenerated binary failed its --probe smoke on this host (Landlock unusable or ABI identity mismatch) - refusing to leave it in place." >&2
  exit 1
fi
