// ── denial-vocabulary.ts — SHARED DENIAL BYTE FAMILY (values only; imports
// NOTHING; no classes; the SOLE OWNER of both refusal line templates —
// consumed by the write gate and the landlock command fence alike). Placed
// at the PACKAGE TOP LEVEL beside session-execution-state.ts (same doctrine:
// consumed across capability/guards and tools — belongs to neither). ──

// THE SOLE TAIL VERDICT - ONE parameter-free pinned constant (owner-pinned
// verbatim - zero rewording discretion) emitted for EVERY non-governing
// window regardless of span presence; \u2014 escaped so the em-dash bytes
// survive editor/toolkit glyph mangling. The capability-named and no-span
// line shapes RETIRED outright with the strict-confirmation ruling.
export const UNIVERSAL_NO_PERMISSION_DENIAL =
  "Writing is refused \u2014 no write permission is declared by any active phase. Allowed targets: none.";

// SOLE DENIAL LINE SHAPES - the suite goldens mirror these byte-for-byte.
// The phase line carries the MOMENT'S effective listing: surviving paths in
// declaration order, the scope element APPENDED AFTER THEM when the class is
// active, the scratch element appended LAST when the phase's flag is active
// (pinned order: scope before scratch); the join-or-"none" constructor shape
// is kept for structural parity (structurally unreachable at the gate's call
// site - rendering is gated on a non-empty effective construction).
export function renderPhaseDenial(
  phaseId: string,
  survivors: readonly string[],
  workspaceCwd: string | null,
  scratchActive: boolean,
): string {
  const parts: string[] = [...survivors];
  if (workspaceCwd !== null) {
    parts.push(`project files under ${workspaceCwd}`);
  }
  if (scratchActive) {
    parts.push("scratch files under /tmp/");
  }
  const allowlist = parts.length === 0 ? "none" : parts.join(", ");
  return `Writing is refused during phase '${phaseId}'. Allowed targets: ${allowlist}.`;
}
