import * as fs from "node:fs";
import * as path from "node:path";
import type { PioSessionState } from "../../runtime/session-state";
import type {
  CodeStepContext,
  WorkflowPhase,
} from "../../runtime/workflow-types";

/** Store variable carrying the absolute path of this session's updates.md scratch artifact. */
const UPDATES_VAR = "updates_path";

/** Session-scoped scratch directory (removed by the cleanup phase; OS also reclaims /tmp). */
const SCRATCH_DIR = "/tmp/pio-finalize-goal";

/**
 * Resolve the session-scoped `updates.md` path from the store. Total — never
 * throws. Undefined/empty ⇒ fail-safe "" (a missing `updates.md` never
 * matches the loopWhile callbacks, so the exhaustion loops advance).
 */
function updatesPathOf(state: PioSessionState): string {
  const p = state.store?.get(UPDATES_VAR);
  return typeof p === "string" && p !== "" ? p : "";
}

const steps: WorkflowPhase[] = [
  // -------------------------------------------------------------------------
  // Default Setup — create the session-scoped scratch dir and set the
  // updates_path store variable (programmatic, no agent turn).
  // -------------------------------------------------------------------------
  {
    id: "default-setup",
    title: "Set up the session scratch space",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      const root = path.join(SCRATCH_DIR, ctx.state.sessionId ?? "unknown");
      fs.mkdirSync(root, { recursive: true });
      ctx.state.store?.set(
        UPDATES_VAR,
        "string",
        path.join(root, "updates.md"),
      );
    },
  },

  // -------------------------------------------------------------------------
  // Read Context — single-pass full-context gathering. No loop fields, no
  // write gates: this phase is the exhaustiveness mechanism for a closed
  // task whose inputs all fit one scan.
  // -------------------------------------------------------------------------
  {
    id: "read-context",
    title: "Read all change drivers and context",
    instructions: `Gather every change driver and the surrounding context in a single pass, then cross-reference all sources. This is single-pass by design — read everything you need now.

**Per-step completion summaries:** Scan the subdirectories in the goal workspace. Read completion summaries from each one that exists. These provide ground truth of what was actually built: files created, modified, or deleted per step; decisions made during implementation; test coverage details. If a subdirectory has no completion summary, skip it gracefully.

**Subgoal-aware reading:** When scanning subdirectories, check for a \`subgoals/\` subdirectory inside each one. If present, this step spawned nested subgoals. For each subgoal workspace under \`subgoals/<name>/\`:
- Read the subgoal's requirements file for context on what was built
- Read per-sub-step completion summaries from the subgoal workspace

Treat the subgoal as a single unit — don't confuse subgoal subdirectories with parent subdirectories. The subgoal's completion marker signals that the parent step is complete.

**Decisions file (if provided):** If the initial user message provides a path to an accumulated decisions file, read it for explicit architectural decisions, file placement changes, and prompt reference mappings captured during the goal lifecycle. The decisions file may be missing, empty, or incomplete — if it doesn't exist or has no relevant content, proceed using the other sources and note this in your final summary.

**Git commit history:** Read the git commit history (the changes that were made during this goal) as an additional ground-truth source of what actually changed. If the workspace is not a git repository or \`git\` is unavailable, skip this gracefully.

**Plan / Goal / Quality gate:** Read the \`plan\`, \`goal\`, and \`quality-gate\` inputs from the goal workspace root for intent and scope — what was planned to change, which files were targeted, and the overall architecture or capability being built.

**Existing PROJECT files:** Read the existing \`.pio/PROJECT/*.md\` files so your updates are informed by current content and avoid duplicating what is already documented. Skip any that do not exist.

**Cross-reference all sources:** Combine insights from the \`plan\` input (intent), completion summaries (ground truth), the decisions file (explicit decisions), git history (what actually changed), and the existing PROJECT files. Do not rely on any single source alone — if the \`plan\` input mentions a new capability module that a completion summary confirms was created, still evaluate it for PROJECT file updates.`,
  },

  // -------------------------------------------------------------------------
  // Draft Updates — identify candidate documentation changes and write the
  // finalized records to the single durable updates.md artifact. An
  // exhaustion loop: replays while the just-finished run wrote to updates.md;
  // a run that writes nothing advances (double-checked, nothing missed).
  // -------------------------------------------------------------------------
  {
    id: "draft-updates",
    title: "Identify and draft PROJECT file updates",
    maxIterations: 4,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.some((f) => f.endsWith("updates.md")),
      },
    ],
    loopMessage: `Double-check the change drivers for any updates you missed; append or refine them in \`\${updates_path}\`. Do not re-add records already present. If nothing is missed, make **no changes** to \`\${updates_path}\` and finish — a run that writes nothing to it advances.`,
    instructions: `Review the change drivers you gathered (per-step completion summaries, DECISIONS.md, git commit history) with the \`plan\`, \`goal\`, and \`quality-gate\` inputs and the existing \`.pio/PROJECT/*.md\` files as context. Identify candidate documentation changes and, in the **same turn**, apply the **Decision Filtering** guidance and the **Update Rules** from the \`pio-project-knowledge\` skill:

**Decision Filtering:**
- **Skip implementation-only details:** Internal function signatures, local variable naming, or algorithm choices with no project-wide impact.
- **Skip local design choices:** Decisions scoped to a single file or module with no downstream consequences.
- **Skip one-off decisions:** Temporary workarounds, experimental features, or decisions unlikely to persist.
- **Update when the decision establishes a pattern, convention, or structural change** that future contributors or agents should know about.
- When in doubt, skip — it's better to leave a decision undocumented than to force an update that doesn't fit naturally.

**Update Rules:** For each finding that passes the filter, consult the "Update Rules" section of the \`pio-project-knowledge\` skill to determine which PROJECT file to update, which section within that file, and what action to take (add, modify, document). If a finding doesn't map to any update rule, skip it.

**Write the finalized records** to the single file at \`\${updates_path}\` (under /tmp — writes there are not blocked by the write gate). One record per change, each carrying:
- the **target PROJECT file** (e.g. \`PROJECT/CONVENTIONS.md\`)
- the **section** within that file
- the **action** (add / modify / document)
- the **content** to apply

This phase only **drafts** the update list — it does not modify the PROJECT files. On a replay, re-check the change drivers for any **missed** updates and **dedupe** (do not re-add records already present in \`\${updates_path}\`); if nothing is missed and nothing is new, write **nothing**. If no updates are warranted at all, write nothing — the phase advances.`,
  },

  // -------------------------------------------------------------------------
  // Seven single-output write phases — one PROJECT file per phase, each gated
  // to exactly its own contract output with a total `filesWritten` exhaustion
  // loop. Each first checks the file exists and skips (never creates) it if
  // not; applies only that file's records from updates.md; and only writes
  // when making a real change (a silent run advances).
  // -------------------------------------------------------------------------
  {
    id: "write-overview",
    title: "Write PROJECT/OVERVIEW.md updates",
    write: ["overview"],
    maxIterations: 4,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.some((f) => f.endsWith("PROJECT/OVERVIEW.md")),
      },
    ],
    loopMessage: `Double-check \`\${updates_path}\` for any updates targeting \`PROJECT/OVERVIEW.md\` you missed and apply them; if nothing remains, make **no changes** to that file and finish — a run that makes no change advances.`,
    instructions: `Check that \`.pio/PROJECT/OVERVIEW.md\` exists. **If it does not exist, skip this file (do not create it)** — finalize-goal only refines PROJECT files that already exist.

Otherwise apply the records from \`\${updates_path}\` that target \`PROJECT/OVERVIEW.md\`, per the \`pio-project-knowledge\` section structure:
- **Read the current file first**, preserve all existing content, and insert updates at the appropriate section.
- Be concise — document the change without padding.
- Reference the goal or decision that triggered the update when helpful.

If there are no records for this file (or the file is missing), make no changes. Only write when making a real change.`,
  },
  {
    id: "write-development",
    title: "Write PROJECT/DEVELOPMENT.md updates",
    write: ["development"],
    maxIterations: 4,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.some((f) => f.endsWith("PROJECT/DEVELOPMENT.md")),
      },
    ],
    loopMessage: `Double-check \`\${updates_path}\` for any updates targeting \`PROJECT/DEVELOPMENT.md\` you missed and apply them; if nothing remains, make **no changes** to that file and finish — a run that makes no change advances.`,
    instructions: `Check that \`.pio/PROJECT/DEVELOPMENT.md\` exists. **If it does not exist, skip this file (do not create it)** — finalize-goal only refines PROJECT files that already exist.

Otherwise apply the records from \`\${updates_path}\` that target \`PROJECT/DEVELOPMENT.md\`, per the \`pio-project-knowledge\` section structure:
- **Read the current file first**, preserve all existing content, and insert updates at the appropriate section.
- Be concise — document the change without padding.
- Reference the goal or decision that triggered the update when helpful.

If there are no records for this file (or the file is missing), make no changes. Only write when making a real change.`,
  },
  {
    id: "write-conventions",
    title: "Write PROJECT/CONVENTIONS.md updates",
    write: ["conventions"],
    maxIterations: 4,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.some((f) => f.endsWith("PROJECT/CONVENTIONS.md")),
      },
    ],
    loopMessage: `Double-check \`\${updates_path}\` for any updates targeting \`PROJECT/CONVENTIONS.md\` you missed and apply them; if nothing remains, make **no changes** to that file and finish — a run that makes no change advances.`,
    instructions: `Check that \`.pio/PROJECT/CONVENTIONS.md\` exists. **If it does not exist, skip this file (do not create it)** — finalize-goal only refines PROJECT files that already exist.

Otherwise apply the records from \`\${updates_path}\` that target \`PROJECT/CONVENTIONS.md\`, per the \`pio-project-knowledge\` section structure:
- **Read the current file first**, preserve all existing content, and insert updates at the appropriate section.
- Be concise — document the change without padding.
- Reference the goal or decision that triggered the update when helpful.

If there are no records for this file (or the file is missing), make no changes. Only write when making a real change.`,
  },
  {
    id: "write-git",
    title: "Write PROJECT/GIT.md updates",
    write: ["git"],
    maxIterations: 4,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.some((f) => f.endsWith("PROJECT/GIT.md")),
      },
    ],
    loopMessage: `Double-check \`\${updates_path}\` for any updates targeting \`PROJECT/GIT.md\` you missed and apply them; if nothing remains, make **no changes** to that file and finish — a run that makes no change advances.`,
    instructions: `Check that \`.pio/PROJECT/GIT.md\` exists. **If it does not exist, skip this file (do not create it)** — finalize-goal only refines PROJECT files that already exist.

Otherwise apply the records from \`\${updates_path}\` that target \`PROJECT/GIT.md\`, per the \`pio-project-knowledge\` section structure:
- **Read the current file first**, preserve all existing content, and insert updates at the appropriate section.
- Be concise — document the change without padding.
- Reference the goal or decision that triggered the update when helpful.

If there are no records for this file (or the file is missing), make no changes. Only write when making a real change.`,
  },
  {
    id: "write-architecture",
    title: "Write PROJECT/ARCHITECTURE.md updates",
    write: ["architecture"],
    maxIterations: 4,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.some((f) => f.endsWith("PROJECT/ARCHITECTURE.md")),
      },
    ],
    loopMessage: `Double-check \`\${updates_path}\` for any updates targeting \`PROJECT/ARCHITECTURE.md\` you missed and apply them; if nothing remains, make **no changes** to that file and finish — a run that makes no change advances.`,
    instructions: `Check that \`.pio/PROJECT/ARCHITECTURE.md\` exists. **If it does not exist, skip this file (do not create it)** — finalize-goal only refines PROJECT files that already exist.

Otherwise apply the records from \`\${updates_path}\` that target \`PROJECT/ARCHITECTURE.md\`, per the \`pio-project-knowledge\` section structure:
- **Read the current file first**, preserve all existing content, and insert updates at the appropriate section.
- Be concise — document the change without padding.
- Reference the goal or decision that triggered the update when helpful.

If there are no records for this file (or the file is missing), make no changes. Only write when making a real change.`,
  },
  {
    id: "write-dependencies",
    title: "Write PROJECT/DEPENDENCIES.md updates",
    write: ["dependencies"],
    maxIterations: 4,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.some((f) => f.endsWith("PROJECT/DEPENDENCIES.md")),
      },
    ],
    loopMessage: `Double-check \`\${updates_path}\` for any updates targeting \`PROJECT/DEPENDENCIES.md\` you missed and apply them; if nothing remains, make **no changes** to that file and finish — a run that makes no change advances.`,
    instructions: `Check that \`.pio/PROJECT/DEPENDENCIES.md\` exists. **If it does not exist, skip this file (do not create it)** — finalize-goal only refines PROJECT files that already exist.

Otherwise apply the records from \`\${updates_path}\` that target \`PROJECT/DEPENDENCIES.md\`, per the \`pio-project-knowledge\` section structure:
- **Read the current file first**, preserve all existing content, and insert updates at the appropriate section.
- Be concise — document the change without padding.
- Reference the goal or decision that triggered the update when helpful.

If there are no records for this file (or the file is missing), make no changes. Only write when making a real change.`,
  },
  {
    id: "write-glossary",
    title: "Write PROJECT/GLOSSARY.md updates",
    write: ["glossary"],
    maxIterations: 4,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.some((f) => f.endsWith("PROJECT/GLOSSARY.md")),
      },
    ],
    loopMessage: `Double-check \`\${updates_path}\` for any updates targeting \`PROJECT/GLOSSARY.md\` you missed and apply them; if nothing remains, make **no changes** to that file and finish — a run that makes no change advances.`,
    instructions: `Check that \`.pio/PROJECT/GLOSSARY.md\` exists. **If it does not exist, skip this file (do not create it)** — finalize-goal only refines PROJECT files that already exist.

Otherwise apply the records from \`\${updates_path}\` that target \`PROJECT/GLOSSARY.md\`, per the \`pio-project-knowledge\` section structure:
- **Read the current file first**, preserve all existing content, and insert updates at the appropriate section.
- Be concise — document the change without padding.
- Reference the goal or decision that triggered the update when helpful.

If there are no records for this file (or the file is missing), make no changes. Only write when making a real change.`,
  },

  // -------------------------------------------------------------------------
  // Produce Summary — finalize the change-log summary. Lean, single-pass.
  // -------------------------------------------------------------------------
  {
    id: "produce-summary",
    title: "Produce a summary output",
    instructions: `After all updates are applied, produce a structured summary:

- **Files modified:** List each \`.pio/PROJECT/*.md\` file that was changed
- **Changes made:** Brief description of what was added or modified in each file
- **Triggering sources:** Which decisions entry, completion summary finding, git commit, or \`plan\` input item triggered each change
- **Sources available:** Note which sources were read (the \`plan\` input, decisions file, per-step completion summaries, git history) and which were missing or empty

If no updates were warranted, explicitly state: "No PROJECT file updates were warranted. All decisions from this goal were implementation-specific or locally scoped, and none mapped to project-wide patterns, conventions, or structural changes."`,
  },

  // -------------------------------------------------------------------------
  // Cleanup — remove the session-scoped scratch directory (best-effort, total
  // — /tmp is OS-reclaimed anyway).
  // -------------------------------------------------------------------------
  {
    id: "cleanup",
    title: "Cleanup scratch files",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      const updatesPath = updatesPathOf(ctx.state);
      const root =
        updatesPath !== ""
          ? path.dirname(updatesPath)
          : path.join(SCRATCH_DIR, ctx.state.sessionId ?? "unknown");
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort — /tmp is OS-reclaimed anyway
      }
    },
  },
];

export default steps;
