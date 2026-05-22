# Feasibility Study: Subgoals in pio

Structured analysis of nested subgoals — plan steps that spawn nested goal workspaces passing through the full pio lifecycle recursively.

## Dimension 1: Nesting structure on disk

### Recommended approach: `S{NN}/subgoals/<name>/`

**Recommendation:** Subgoal workspaces should live nested inside the parent step directory under a fixed `subgoals/` marker:

```
.pio/goals/parent-goal/
├── GOAL.md
├── PLAN.md
├── S01/
│   ├── TASK.md
│   ├── TEST.md
│   └── COMPLETED
├── S02/
│   ├── TASK.md
│   ├── TEST.md
│   └── COMPLETED
└── S03/
    ├── TASK.md
    ├── TEST.md
    └── subgoals/
        └── nested-feature/          ← subgoal workspace
            ├── GOAL.md
            ├── PLAN.md
            ├── S01/
            │   ├── TASK.md
            │   └── TEST.md
            └── S02/
                ├── TASK.md
                ├── TEST.md
                └── subgoals/       ← recursive nesting
                    └── deep-feature/
```

**Justification:** This approach places subgoals physically close to the parent step that spawned them, making the decomposition relationship obvious in the directory tree. The `subgoals/` directory marker disambiguates subgoal workspaces from step folders (`S{NN}/`), preventing naming collisions with the `steps()` scanner regex.

### Recursive nesting depth analysis

The `S{NN}/subgoals/<name>/` pattern composes recursively without structural conflict:

- **Level 1:** `.pio/goals/parent/S03/subgoals/nested/`
- **Level 2:** `.pio/goals/parent/S03/subgoals/nested/S01/subgoals/deep/`
- **Level N:** Each level adds exactly two path segments: `subgoals/<name>/`

**Depth implications:**

- **Path length:** Each nesting level adds `subgoals/<name>/` (~20 chars average). At 5 levels deep, total path from `.pio/goals/` is ~150 chars — well under typical filesystem limits (4096 on ext4, 260 on Windows with long-path enabled).
- **Marker collision risk:** None. The `subgoals/` directory marker is a fixed name that does not match `STEP_FOLDER_RE` (`/^S(\d+)$/`). A parent's `steps()` scan of `S03/` will find `subgoals/` as a directory but skip it since `"subgoals"` does not match `/^S(\d+)$/`.
- **GoalState confusion:** The `steps()` method in `src/goal-state.ts` scans the goal directory directly. For a nested subgoal at `parent/S03/subgoals/nested/`, `steps()` would scan `parent/S03/subgoals/nested/` for `S{NN}/` folders — it would NOT scan the parent's `S03/` directory. This is correct behavior, provided `goalDir` is resolved to the subgoal's own directory (see required changes below).

### Alternatives evaluated

| Approach | Path Example | Pros | Cons |
|----------|-------------|------|------|
| **Nested in step dirs (recommended)** | `S03/subgoals/nested/` | Physical proximity to parent step, clear hierarchy, no naming collisions | Requires path resolution changes (see below) |
| **Flat naming with delimiters** | `.pio/goals/parent__S03__nested/` | Minimal code changes (flat paths still work) | Loss of physical hierarchy, ugly names, potential name collisions across parents |
| **Dedicated `.pio/subgoals/` directory** | `.pio/subgoals/parent/S03/nested/` | Separates subgoals from goals entirely | Breaks proximity to parent step, requires separate scanning logic, complicates `list-goals` |
| **Sibling to step dirs** | `.pio/goals/parent/subgoals/nested/` | Closer to existing flat structure | Loses step-to-subgoal relationship, ambiguous parent linkage |

The nested-in-step-dirs approach is recommended because it preserves the physical relationship between a step and its subgoal decomposition, which is the primary mental model for users ("this step was broken into subgoals"). The `subgoals/` marker provides a stable anchor for path resolution without conflicting with existing step folder naming.

### Required changes to `src/fs-utils.ts`

#### `resolveGoalDir(cwd, name)` — **new logic**

**Current behavior** (line 9):
```typescript
export function resolveGoalDir(cwd: string, name: string): string {
  return path.join(cwd, ".pio", "goals", name);
}
```

Always produces flat paths: `<cwd>/.pio/goals/<name>/`. A call like `resolveGoalDir(cwd, "parent__S03__nested")` would resolve to `.pio/goals/parent__S03__nested/` — not a nested path.

**Required change:** The function must support resolving nested subgoal paths. Two options:

1. **Accept a parent step directory instead of a flat name:** Add an overload or new parameter `parentStepDir?: string`. When present, resolve relative to the parent step: `path.join(parentStepDir, "subgoals", name)`. This is a **new logic** change — existing callers without `parentStepDir` continue to work.

2. **Accept full path instead of goal name:** Change the `name` parameter to accept either a flat goal name or a full nested path. Detect nesting by checking if the input contains path separators. This is a **breaking change** — callers passing goal names would need to adapt.

**Recommendation:** Option 1 — add an optional `parentStepDir` parameter. This preserves backward compatibility for flat goals while enabling nested resolution. Categorization: **new logic** (non-breaking extension).

#### `discoverNextStep(goalDir)` — **no change required**

**Current behavior** (line 105): Scans `goalDir` for `S{NN}/` folders sequentially. Since subgoals live under `subgoals/` (not directly as `S{NN}/`), this function will correctly skip the `subgoals/` directory and only find actual step folders. No modification needed.

#### `deriveSessionName(goalName, capability, stepNumber)` — **new logic**

**Current behavior** (line 81):
```typescript
export function deriveSessionName(goalName: string, capability: string, stepNumber?: number): string {
  if (!goalName) return capability;

  let name = `${goalName} ${capability}`;
  if (typeof stepNumber === "number") {
    name += ` s${stepNumber}`;
  }
  return name;
}
```

For a subgoal named `nested` under `parent/S03/`, the session name would be `nested execute-task s1` — losing the parent context. The function should optionally accept a parent path prefix to produce names like `parent/S03/nested execute-task s1`.

Categorization: **new logic** (non-breaking — add optional parameter).

### Required changes to `src/goal-state.ts`

#### cwd derivation in `createGoalState(goalDir)` — **no change required**

**Current behavior** (lines 168–183):
```typescript
const goalsIdx = goalDir.indexOf("/goals/");
let cwd: string;
if (goalsIdx !== -1) {
  const beforeGoals = goalDir.slice(0, goalsIdx);
  // beforeGoals is now <cwd>/.pio
  cwd = path.dirname(beforeGoals);
} else {
  // Fallback: if the path doesn't contain "/goals/", use the parent of .pio
  // This handles edge cases where goalDir might be constructed differently.
  const pioIdx = goalDir.indexOf("/.pio/");
  if (pioIdx !== -1) {
    cwd = goalDir.slice(0, pioIdx);
  } else {
    // Last resort: use dirname of dirname (handles relative-ish paths)
    cwd = path.dirname(path.dirname(goalDir));
  }
}
```

For `goalDir = "/repo/.pio/goals/parent/S03/subgoals/nested/"`:
- `indexOf("/goals/")` finds the first occurrence at the `.pio/goals/` boundary
- `beforeGoals` becomes `/repo/.pio` (everything before the first `/goals/`)
- `path.dirname("/repo/.pio")` produces `/repo` — **correct**

The derivation works for all nesting depths because `indexOf("/goals/")` always finds the canonical `.pio/goals/` boundary (the first occurrence in the path), and `path.dirname()` strips the `.pio` segment regardless of what follows. The `else` branch provides a fallback using `/.pio/` directly for edge cases.

**Verified by tracing with actual inputs:**
- Flat path `/repo/.pio/goals/my-goal/` → cwd: `/repo` ✓
- Nested path `/repo/.pio/goals/parent/S03/subgoals/nested/` → cwd: `/repo` ✓
- Deep nesting `/repo/.pio/goals/parent/S03/subgoals/nested/S01/subgoals/deep/` → cwd: `/repo` ✓

Categorization: **no change required**. The existing cwd derivation correctly handles nested paths.

#### `goalName` derivation — **new fields**

**Current behavior** (line 163):
```typescript
const goalName = path.basename(goalDir);
```

For a nested subgoal at `.../subgoals/nested/`, `goalName` would be `"nested"` — which is correct for the subgoal's own identity. However, this loses the parent context. If `goalName` is used for queue keying (`task-${goalName}.json`), sibling subgoals with the same name under different parents would collide.

**Required change:** Either accept a fully-qualified goal name as a parameter, or derive a hierarchical name from the full path. This interacts with Dimension 2 (queue keying strategy).

Categorization: **new fields** (add optional `qualifiedName` parameter) or **new logic** (derive from path).

#### `steps()` regex (`/^S(\d+)$/`) — **no change required**

**Current behavior** (line 17, used at line 245):
```typescript
const STEP_FOLDER_RE = /^S(\d+)$/;
```

The `steps()` method (lines 236–254) scans `goalDir` for directories matching this regex. For a nested subgoal workspace at `.../subgoals/nested/`, the scanner would find `S01/`, `S02/`, etc. inside the subgoal's own directory — correct behavior. The `subgoals/` directory itself does not match `/^S(\d+)$/` and is correctly skipped.

**However,** if a parent goal's `steps()` scans `S03/` (the parent step directory), it would encounter `subgoals/` as a subdirectory. Since `steps()` only scans the top level of `goalDir` (not recursively), this is not a problem — `steps()` on the parent goal scans `.pio/goals/parent/` directly, not inside `S03/`.

Categorization: **no change required**.

#### `pendingTask()` queue path — **new logic**

**Current behavior** (line 272):
```typescript
const queuePath = path.join(cwd, ".pio", "session-queue", `task-${goalName}.json`);
```

With the cwd derivation confirmed correct above, `cwd` will resolve properly. However, `goalName` for a nested subgoal is just `"nested"` — sibling subgoals under different parents would share the same queue file. This requires the queue keying fix from Dimension 2.

Categorization: **new logic** (deferred to Dimension 2 queue keying strategy).

### Summary of changes (Dimension 1)

| File | Function | Change Type | Description |
|------|----------|-------------|-------------|
| `src/fs-utils.ts` | `resolveGoalDir` | **new logic** | Add optional `parentStepDir` parameter for nested resolution |
| `src/fs-utils.ts` | `deriveSessionName` | **new logic** | Accept parent path prefix for hierarchical session names |
| `src/goal-state.ts` | `createGoalState` (cwd derivation) | no change | Existing `indexOf("/goals/")` + `path.dirname()` correctly handles all nesting depths |
| `src/goal-state.ts` | `createGoalState` (goalName) | **new fields** | Accept optional fully-qualified name parameter |
| `src/goal-state.ts` | `steps()` | no change | Regex is safe with `subgoals/` marker |
| `src/fs-utils.ts` | `discoverNextStep` | no change | Correctly skips non-`S{NN}` directories |

## Dimension 2: Queue keying strategy

### Problem statement

The per-goal single-slot queue at `src/queues.ts` uses `goalName` (a flat string) to derive the queue filename: `task-{goalName}.json`. With nested subgoals under `S{NN}/subgoals/<name>/`, `path.basename(goalDir)` yields only the leaf name (e.g., `"nested"`). This creates collisions when:

- **Sibling subgoals share the same name under different parents:** `parent-a/S03/subgoals/nested/` and `parent-b/S05/subgoals/nested/` would both produce `task-nested.json`.
- **A subgoal name matches a top-level goal name:** `.pio/goals/nested/` and `.pio/goals/parent/S01/subgoals/nested/` collide on `task-nested.json`.

The queue directory (`queueDir(cwd)`) resolves correctly for all nesting depths — `cwd` derivation was confirmed correct in Dimension 1. The problem is strictly in filename/key generation.

### Current queue behavior analysis

#### `enqueueTask(cwd, goalName, task)`

```typescript
export function enqueueTask(cwd: string, goalName: string, task: SessionQueueTask): void {
  const dir = queueDir(cwd);
  const filePath = path.join(dir, `task-${goalName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(task, null, 2), "utf-8");
}
```

Takes `goalName` as a flat string. Constructs `task-{goalName}.json`. With `goalName = "nested"`, produces `task-nested.json` regardless of which parent goal the subgoal belongs to.

#### `readPendingTask(cwd, goalName)`

```typescript
export function readPendingTask(cwd: string, goalName: string): SessionQueueTask | undefined {
  const dir = queueDir(cwd);
  const filePath = path.join(dir, `task-${goalName}.json`);
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SessionQueueTask;
}
```

Same pattern — looks up by `goalName`. Must use the identical key format as `enqueueTask` for round-trip fidelity.

#### `listPendingGoals(cwd)`

```typescript
export function listPendingGoals(cwd: string): string[] {
  const dir = queueDir(cwd);
  if (!fs.existsSync(dir)) return [];
  const goals: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith("task-") && entry.endsWith(".json")) {
      const goalName = entry.slice(5, entry.length - 5);
      goals.push(goalName);
    }
  }
  return goals;
}
```

Extracts goal names by stripping `task-` prefix and `.json` suffix. The extracted string is used downstream — for example, `/pio-list-goals` calls `resolveGoalDir(cwd, goalName)` on each entry. With hierarchical keys, extraction must reliably reconstruct a value usable by downstream code.

#### `writeLastTask(goalDir, task)`

```typescript
export function writeLastTask(goalDir: string, task: SessionQueueTask): void {
  const filePath = path.join(goalDir, "LAST_TASK.json");
  fs.writeFileSync(filePath, JSON.stringify(task, null, 2), "utf-8");
}
```

Writes inside the goal directory itself — unaffected by queue filename keying. No change required.

### Strategy evaluation

#### Strategy A: Hierarchical keys with delimiters

**Format:** `task-{parentPath}__{step}__{name}.json`

For a subgoal at `parent/S03/subgoals/nested/`, the key would be: `task-parent__S03__nested.json`.

**Encoding rules:**
- Derive key from the relative goal path: strip `.pio/goals/` prefix, replace path separators with `__`
- For flat goals: `task-my-feature.json` (unchanged — backward compatible)
- For nested: `task-parent__S03__nested.json`

**Pros:**
- **Human-readable:** Filenames clearly show the nesting hierarchy. Debugging queue state is straightforward.
- **Backward compatible:** Flat goals produce identical filenames. No migration needed.
- **Deterministic:** Same goal path always produces the same key. No hash collisions.
- **Simple extraction:** `listPendingGoals` strips `task-` and `.json`, yielding `parent__S03__nested`. A new `resolveGoalDir` can reconstruct the path by splitting on `__`.

**Cons:**
- **Filename length:** Each nesting level adds `~{parentName}__S{NN}__` to the filename. At 5 levels deep with average 10-char names: `task-a__S03__b__S01__c__S02__d.json` (~50 chars) — well under the 255-byte OS limit.
- **Delimiter collision:** If a goal name contains `__`, extraction becomes ambiguous. Mitigation: goal names should be slugs (alphanumeric + hyphens). The `pio_create_goal` tool already expects a `name` parameter — enforcing slug-only names is feasible.
- **Extraction complexity:** `listPendingGoals` returns `parent__S03__nested` instead of `nested`. Downstream code (`/pio-list-goals`) must handle hierarchical names — it currently calls `resolveGoalDir(cwd, goalName)` which assumes flat names.

**Required changes:**
- `enqueueTask`: **new logic** — accept a `qualifiedName` parameter or derive hierarchical key from goal path. Function signature change: add optional `qualifiedName?: string` parameter.
- `readPendingTask`: **new logic** — same parameter change as `enqueueTask`.
- `listPendingGoals`: **new logic** — return qualified names. Downstream callers must adapt.
- `resolveGoalDir` (in `fs-utils.ts`): **new logic** — handle hierarchical names by splitting on `__` and reconstructing nested paths (already identified in Dimension 1).

#### Strategy B: Path-based keys (relative path encoding)

**Format:** Encode the full relative goal path as a safe filename.

For `parent/S03/subgoals/nested/`, derive key from `.pio/goals/parent/S03/subgoals/nested` → encode slashes as a safe separator (e.g., `task-parent_S03_subgoals_nested.json`).

**Pros:**
- **Complete path information:** Full path is preserved in the filename.
- **No delimiter ambiguity:** Using underscore (`_`) instead of double-underscore avoids collision with typical goal names.

**Cons:**
- **Longer filenames:** Includes `subgoals` marker segment, making filenames longer than Strategy A.
- **Structural coupling:** Filename encodes directory structure (`subgoals` marker). If the nesting convention changes (e.g., from `subgoals/` to `nested/`), all queue filenames break.
- **Same extraction problem as Strategy A:** `listPendingGoals` returns encoded paths that downstream code must decode.

**Required changes:** Same as Strategy A — **new logic** in all three queue functions plus `resolveGoalDir`.

**Comparison with Strategy A:** Strategy B is strictly worse — it includes redundant path segments (`subgoals`), couples to the directory convention, and produces longer filenames. Strategy A strips the `subgoals` marker since the step number (`S03`) already identifies the parent step.

#### Strategy C: Hashed paths

**Format:** `task-{hash(goalPath)}.json` where hash is a short SHA-256 prefix (e.g., first 8 hex chars).

**Pros:**
- **Guaranteed uniqueness:** Hash collisions are negligible with 8+ hex chars.
- **Fixed filename length:** Always `task-xxxxxxxx.json` regardless of nesting depth.
- **No delimiter issues:** Hash output is alphanumeric.

**Cons:**
- **Not human-readable:** Cannot inspect queue state by reading filenames. Requires reading file contents to identify which goal a task belongs to.
- **Extraction is lossy:** `listPendingGoals` returns hash values, not goal names. Downstream code cannot reconstruct goal paths from hashes without a reverse index.
- **Requires additional infrastructure:** Need a mapping table (hash → path) stored somewhere, or require reading every queue file to resolve names.
- **Overkill for the problem:** The collision space is small — typical projects have <100 goals. Deterministic encoding (Strategy A) provides sufficient uniqueness without hashing.

**Required changes:**
- `enqueueTask`: **new logic** — compute hash from goal path, store path inside task JSON for round-trip.
- `readPendingTask`: **new logic** — same.
- `listPendingGoals`: **breaking change** — returns hashes instead of names. Downstream code breaks unless a resolution layer is added.

**Verdict:** Rejected. The readability and infrastructure costs outweigh the benefits for a problem space where deterministic encoding is sufficient.

#### Strategy D: Multi-slot queues

**Format:** Replace per-file slots with a single `.pio/session-queue/tasks.json` containing an array of `{ goalName, capability, params }` entries.

**Pros:**
- **No filename collision:** Goal identity is stored inside the JSON, not in the filename.
- **Supports concurrent tasks:** Multiple pending tasks across goals in a single file.

**Cons:**
- **Breaking change:** Existing `task-{name}.json` files become obsolete. Migration required.
- **Concurrency issues:** Array-based storage requires file locking or atomic writes for concurrent access. Current single-file-per-goal design avoids this.
- **Over-engineering:** Single-slot per goal is the existing design — multi-slot adds complexity without clear user benefit. Parent and subgoal sessions are serialized by the sub-session model (a subgoal session runs to completion before the parent resumes).
- **Performance:** Reading the full array to find one goal's task is slower than direct file lookup (negligible for small projects, but unnecessary optimization debt).

**Required changes:**
- All queue functions: **breaking change** — complete rewrite of storage format.
- `GoalState.pendingTask()`: **breaking change** — reads from array instead of per-file.

**Verdict:** Rejected. Adds significant complexity for no user-visible benefit. The single-slot design is sufficient.

### Recommendation: Strategy A — Hierarchical keys with delimiters

**Chosen approach:** Use `__` as a delimiter to encode the parent path hierarchy in queue filenames.

**Key derivation algorithm:**

```typescript
function deriveQueueKey(goalDir: string, cwd: string): string {
  // goalDir: /repo/.pio/goals/parent/S03/subgoals/nested/
  // cwd: /repo
  const pioGoalsPrefix = path.join(cwd, ".pio", "goals");
  const relativePath = goalDir.slice(pioGoalsPrefix.length + 1); // "parent/S03/subgoals/nested"
  
  // Strip trailing "subgoals/name" to get parent chain + step
  // For flat goals, relativePath is just the goal name
  const segments = relativePath.split(path.sep);
  
  // Filter out "subgoals" markers, keep parent name + step numbers + leaf name
  const keySegments = segments.filter(seg => seg !== "subgoals");
  
  return keySegments.join("__");
}
```

**Examples:**
- Flat goal `.pio/goals/my-feature/` → key: `my-feature` → file: `task-my-feature.json`
- Subgoal `.pio/goals/parent/S03/subgoals/nested/` → key: `parent__S03__nested` → file: `task-parent__S03__nested.json`
- Deep nesting `.pio/goals/parent/S03/subgoals/nested/S01/subgoals/deep/` → key: `parent__S03__nested__S01__deep` → file: `task-parent__S03__nested__S01__deep.json`

**Justification:**
1. **Backward compatible:** Flat goals produce identical filenames. No migration of existing queue files.
2. **Human-readable:** Filenames clearly show the nesting hierarchy for debugging.
3. **Deterministic uniqueness:** The `__`-delimited path is unique per goal workspace (given slug-only goal names).
4. **Minimal infrastructure:** No hash tables, no file locking, no format migration. Pure filename encoding.
5. **Reconstructable:** The key can be split on `__` to recover path segments. Combined with the `resolveGoalDir` change from Dimension 1 (accepting hierarchical names), downstream code can resolve queue keys back to full goal paths.

### Backward compatibility

Flat goals are unaffected:
- `enqueueTask(cwd, "my-feature", task)` produces `task-my-feature.json` — identical to current behavior.
- `readPendingTask(cwd, "my-feature")` reads `task-my-feature.json` — identical.
- `listPendingGoals(cwd)` returns `["my-feature"]` — identical.

No existing queue files need migration. The only change is that `enqueueTask` and `readPendingTask` must accept a fully-qualified name for subgoals. For flat goals, callers pass the same `goalName` as today.

### Required changes to `src/queues.ts`

| Function | Change Type | Description |
|----------|-------------|-------------|
| `enqueueTask` | **new logic** | Add optional `qualifiedName?: string` parameter. When present, use it as the queue key instead of `goalName`. Derive key via `deriveQueueKey` helper (see algorithm above). |
| `readPendingTask` | **new logic** | Same parameter change as `enqueueTask`. Must use identical key derivation for round-trip fidelity. |
| `listPendingGoals` | **new logic** | Return qualified names (e.g., `parent__S03__nested`). Downstream callers must handle hierarchical names. Consider adding a new `listPendingTasks()` that returns `{ key, task }` pairs with full task data. |
| `writeLastTask` | no change | Writes inside goal dir — unaffected by queue keying. |

Additionally, a new helper function is required:

| New Function | Change Type | Description |
|-------------|-------------|-------------|
| `deriveQueueKey(goalDir, cwd)` | **new logic** | Derives the `__`-delimited queue key from a goal directory path. Pure function — no I/O. |

### Downstream integration

#### `GoalState.pendingTask()` in `src/goal-state.ts`

**Current code** (line 272):
```typescript
const queuePath = path.join(cwd, ".pio", "session-queue", `task-${goalName}.json`);
```

`goalName` is derived from `path.basename(goalDir)` — just the leaf name. For nested subgoals, this must use the qualified key instead.

**Required change:** **new logic** — compute the qualified queue key from `goalDir` using the same `deriveQueueKey` helper. The `GoalState` constructor already has access to `goalDir` and `cwd` — it can derive the key at construction time.

Alternatively, accept a `qualifiedName` parameter in `createGoalState()` (already identified in Dimension 1 as a **new fields** change). Pass it through to `pendingTask()`.

#### Capability config resolution in `src/capability-config.ts`

**Current code:**
```typescript
const workingDir = explicitWorkingDir
  ? explicitWorkingDir
  : goalName
    ? resolveGoalDir(cwd, goalName)
    : cwd;
```

For a subgoal, `goalName` would be the qualified key (e.g., `"parent__S03__nested"`). `resolveGoalDir(cwd, "parent__S03__nested")` currently produces `.pio/goals/parent__S03__nested/` — a flat path that doesn't exist.

**Required change:** **new logic** in `resolveGoalDir` (already identified in Dimension 1). The function must detect hierarchical names and reconstruct nested paths:
- `parent__S03__nested` → `.pio/goals/parent/S03/subgoals/nested/`
- `my-feature` → `.pio/goals/my-feature/` (unchanged)

Alternatively, pass `workingDir` explicitly via `params.workingDir` for subgoal sessions, bypassing the `resolveGoalDir` path entirely. This is already supported — `capability-config.ts` checks `params.workingDir` before falling back to `resolveGoalDir`.

#### Session naming in `deriveSessionName()` from `src/fs-utils.ts`

**Current code** (line 81):
```typescript
export function deriveSessionName(goalName: string, capability: string, stepNumber?: number): string {
  if (!goalName) return capability;
  let name = `${goalName} ${capability}`;
  // ...
}
```

For a subgoal with qualified key `parent__S03__nested`, the session name would be `parent__S03__nested execute-task s1`. This is functional but could be improved for display (e.g., `parent/S03/nested execute-task s1`).

**Required change:** **new logic** (already identified in Dimension 1). Add an optional `parentPathPrefix` parameter or format the qualified key for display by replacing `__` with `/`.

### Risks and edge cases

| Risk | Mitigation |
|------|-----------|
| **Filename length:** Deep nesting produces long filenames. At 5 levels with 10-char names: `task-a__S03__b__S01__c__S02__d.json` (~50 chars). Well under 255-byte OS limit. | Monitor nesting depth. 10 levels of nesting would produce ~100-char filenames — still safe but architecturally questionable. |
| **Delimiter collision:** Goal names containing `__` would break extraction. | Enforce slug-only goal names (alphanumeric + hyphens). `pio_create_goal` tool validates the `name` parameter. |
| **Round-trip fidelity:** `listPendingGoals()` returns qualified keys. Downstream `resolveGoalDir` must reconstruct paths. | `resolveGoalDir` change (Dimension 1) handles this. Test with hierarchical keys explicitly. |
| **Special characters in goal names:** Path separators, spaces, or unicode in goal names. | Goal names are slugs — enforced by the `pio_create_goal` tool. No special character handling needed. |
| **Migration of existing queue files:** Flat goal queue files (`task-my-feature.json`) remain valid. No migration needed. | N/A — backward compatible by design. |
| **Concurrent parent+subgoal execution:** Single-slot design serializes execution. Parent enqueues a task, subgoal enqueues its own task — both have unique keys. | Unique keys enable concurrent parent+subgoal queues without collision. The sub-session model serializes execution, but queue slots are independent. |

### Cross-references

- **Dimension 1:** `resolveGoalDir` change (new logic) is required for `listPendingGoals` output to work downstream. `deriveSessionName` change (new logic) improves display names for hierarchical keys.
- **Dimension 8:** `createGoalState` cwd derivation works correctly (confirmed in Dimension 1). The `goalName` field needs the qualified name — this dimension provides the derivation strategy (`deriveQueueKey`).
- **Dimension 3 (State machine):** State machine transitions pass `goalName` as a parameter. With hierarchical keys, the state machine must propagate qualified names through transition params. See Dimension 3 for detailed analysis.

## Dimension 3: State machine extensions

### Problem statement

The state machine (`src/state-machine.ts`) is a pure transition resolver dispatching on capability name. Current transitions are linear within a single goal:

```
create-goal → create-plan → evolve-plan → execute-task → review-task → evolve-plan (cycle)
                                                          ↓
                                                    revise-plan → evolve-plan
                                                          ↓
                                                    finalize-goal → undefined (terminal)
```

`resolveTransition(capability, state, params)` is the single entry point. It knows nothing about parent-child relationships — it operates on one goal workspace at a time via `goalName` + optional `stepNumber`. For subgoals, the state machine must handle: (a) spawning a subgoal from a parent step, (b) composing the subgoal lifecycle with the parent's, and (c) propagating subgoal completion back to the parent.

### Subgoal spawning mechanism

How does a step spawn a subgoal? Two approaches evaluated:

#### Approach 1: New transition in the state machine

Add a dedicated subgoal-spawning transition. When `evolve-plan` encounters a step marked as a subgoal (via PLAN.md metadata — see Dimension 4), `transitionEvolvePlan` routes to `create-goal` with params identifying the subgoal name and parent context:

```typescript
// Inside transitionEvolvePlan:
if (stepIsSubgoal(state, explicitStepNumber)) {
  return {
    capability: "create-goal",
    params: {
      goalName: subgoalName,
      parentGoalName: goalName,
      parentStepNumber: explicitStepNumber,
      subgoalType: true,
    },
  };
}
```

**Pros:**
- **Explicit and traceable:** The transition is visible in `transitions.json` audit log. A `create-goal` capability with `subgoalType: true` is unambiguous.
- **Centralized logic:** Spawning decision lives in the state machine, not scattered across prompts or capability code. Consistent with existing pio philosophy (state machine is the single source of truth for transitions).
- **Testable:** Pure function — can unit-test the subgoal-spawning decision without filesystem I/O.

**Cons:**
- **Requires step-level metadata:** PLAN.md must mark certain steps as subgoals (Dimension 9). The state machine needs to read this metadata to make the routing decision.
- **Blurs lifecycle boundaries:** `evolve-plan → create-goal` is not a natural transition in the existing lifecycle (normally `create-goal` is the first step of a new goal, invoked by the user). Adding it as a mid-lifecycle transition could confuse downstream code that assumes `create-goal` starts a fresh goal.
- **State machine complexity:** The `transitionEvolvePlan` function already handles plan completion (`finalize-goal`), revision (`revise-plan`), and normal execution (`execute-task`). Adding subgoal detection increases branching.

**Required changes to `src/state-machine.ts`:**
- `transitionEvolvePlan`: **new logic** — add subgoal-step detection and routing to `create-goal`.
- `resolveTransition`: **no change** — existing switch handles `create-goal` already. The new subgoal-spawning path reuses the existing `create-goal` case.
- New helper `stepIsSubgoal(state, stepNumber)`: **new logic** — reads step metadata from PLAN.md or a sidecar file to determine if a step is a subgoal.

#### Approach 2: Piggyback on existing transitions (capability-layer spawning)

Subgoal spawning happens at the capability layer, not the state machine. The `evolve-plan` prompt instructs the specification writer to detect when a step needs subgoal decomposition. When detected, the spec writer writes a marker file (e.g., `S03/SUBGOAL_NEEDED`) alongside TASK.md/TEST.md. `pio_mark_complete` (in `session-capability.ts`) detects this marker and routes to `create-goal` with parent context:

```typescript
// Inside pio_mark_complete execute handler:
const state = createGoalState(dir);
if (state.currentStep()?.revisionNeeded()) { /* existing revise-plan path */ }
if (state.currentStep()?.subgoalNeeded()) {
  // Route to create-goal for the subgoal instead of the normal transition
  const subgoalTask = resolveTransition("create-goal", state, {
    goalName: subgoalName,
    parentGoalName: goalName,
    parentStepNumber: stepNumber,
  });
  enqueueTask(cwd, subgoalName, subgoalTask);
  return;
}
```

Alternatively, the `execute-task` agent could write a `SUBGOAL_NEEDED` marker mid-execution if the implementer determines the step requires decomposition. `pio_mark_complete` would detect this on the next call and route accordingly.

**Pros:**
- **No state machine changes for spawning:** The state machine remains unaware of subgoals at the spawning point. Subgoal awareness is confined to the capability layer (`pio_mark_complete` handler) and `GoalState`.
- **Flexible trigger points:** Spawning can happen from `evolve-plan` (spec writer decides), `execute-task` (implementer requests), or even `review-task` (reviewer flags for decomposition). All paths converge on the same marker-file detection in `pio_mark_complete`.
- **Minimal state machine impact:** Only the completion path (`finalize-goal` for subgoals) requires state machine changes.

**Cons:**
- **Marker-file proliferation:** Adding `SUBGOAL_NEEDED` alongside `REVISE_PLAN_NEEDED` increases the marker-file surface area. Each marker requires `GoalState` support, prompt instructions, and documentation.
- **Less traceable:** The spawning decision is implicit (marker file detection) rather than explicit (state machine transition). `transitions.json` would show `evolve-plan → create-goal` but not the reasoning.
- **Capability-layer coupling:** `pio_mark_complete` becomes responsible for subgoal orchestration logic — it already handles validation, transitions, enqueuing, and cleanup. Adding subgoal detection increases its complexity.

**Required changes to `src/state-machine.ts`:**
- `transitionEvolvePlan`: **no change** — spawning happens outside the state machine.
- `resolveTransition`: **no change** for spawning. However, `finalize-goal` routing (see below) still requires changes.
- `transitionFinalizeGoal`: **new logic** — for subgoals, return a non-terminal transition back to the parent (see completion propagation below).

**Required changes to `src/capabilities/session-capability.ts`:**
- `pio_mark_complete` execute handler: **new logic** — detect `SUBGOAL_NEEDED` marker and route to `create-goal` with parent context.

**Required changes to `src/goal-state.ts`:**
- `StepStatus`: **new fields** — add `subgoalNeeded: () => boolean` method (analogous to `revisionNeeded()`).

#### Recommendation: Approach 1 (new transition in the state machine)

**Justification:**
1. **Consistency with pio design:** The state machine is the canonical transition resolver. Routing decisions belong there, not scattered across capability layers. This matches the existing pattern: `transitionEvolvePlan` already routes to `revise-plan` when `REVISE_PLAN_NEEDED` is detected — subgoal routing follows the same precedent.
2. **Single trigger point:** `evolve-plan` is the natural spawning point (spec writer analyzes the step and decides if it needs decomposition). This avoids mid-flight requests from `execute-task`, which would require pausing an active implementation session.
3. **Explicit audit trail:** `transitions.json` records `evolve-plan → create-goal` with `subgoalType: true`, providing clear provenance for the subgoal's origin.
4. **Testable:** Pure function in `transitionEvolvePlan` — unit-testable without mocking capability layers.

### Lifecycle composition model

How does the subgoal lifecycle compose with the parent's? Three models evaluated:

#### Model 1: Parent implicitly pauses (recommended)

The parent step is implicitly paused — no active coordination mechanism. The subgoal runs through the full lifecycle independently: `create-goal → create-plan → evolve-plan → execute-task → review-task → finalize-goal`. When the subgoal completes, the state machine routes back to the parent's `evolve-plan` (see completion propagation below). The user manually navigates back via `/pio-parent` and resumes via `/pio-next-task`.

**Key insight:** We do not support concurrency. `pio-parent` is a navigation feature (UI), not a lifecycle management mechanism. The lifecycle is purely sequential: one session active at a time. The parent "pauses" in the sense that its queue slot is occupied by the subgoal's task — not because of any explicit pause/resume protocol.

**Lifecycle events:**

| Event | Parent state | Subgoal state |
|-------|-------------|---------------|
| Subgoal spawned | Step S{NN} status: pending. Parent queue slot overwritten by subgoal's `create-goal` task | `create-goal` session starts |
| Subgoal executing | Parent is not active. No coordination. | Running through lifecycle normally |
| Subgoal completes (`finalize-goal`) | State machine routes to parent's `evolve-plan`. Parent's queue slot is updated with `evolve-plan` task | Subgoal workspace has `COMPLETED` marker |
| User resumes | User runs `/pio-parent` to switch sessions, then `/pio-next-task` to dequeue parent's `evolve-plan` | Read-only — subgoal is done |

**Pros:**
- **Simplest model:** No active pause/resume protocol. The parent's queue slot is simply overwritten when the subgoal spawns, and restored when the subgoal completes.
- **No state machine concurrency:** The state machine processes one goal at a time. No need to track multiple active contexts.
- **Matches existing pio mechanics:** Single-slot queue, one session at a time, user-driven navigation. No new infrastructure needed.

**Cons:**
- **Sequential execution:** Cannot work on multiple subgoals concurrently. If a step has multiple subgoals, they must complete one at a time.
- **User must navigate manually:** After subgoal completion, the user must use `/pio-parent` to return to the parent session and `/pio-next-task` to resume. This is a UI concern, not a lifecycle concern.

#### Model 2: Concurrent execution

Parent and subgoal sessions run independently but serialized via queue slots. The state machine tracks both contexts. For example, a parent could have three subgoals under steps S03, S05, S07 — all subgoals could have pending tasks simultaneously.

**Pros:**
- **True concurrency:** Multiple subgoals can progress independently.
- **Independent queue slots:** Dimension 2's hierarchical keys enable this.

**Cons:**
- **Complex state management:** The state machine must track parent-child relationships.
- **Completion ordering ambiguity:** Dependency tracking required.
- **Over-engineering:** Subgoals decompose a single step. Sequential execution is the natural workflow.

**Verdict:** Rejected. We do not support concurrency. The sequential model is simpler and matches the pio design.

#### Model 3: Full delegation

The step effectively _becomes_ the subgoal — no wrapper logic in the parent. When `evolve-plan` encounters a subgoal-type step, it spawns the subgoal and the step is considered "in progress" until the subgoal completes. Step completion is synonymous with subgoal completion.

**Pros:**
- **Minimal parent overhead:** The parent step folder is thin.

**Cons:**
- **Loss of step-level specification:** No TASK.md/TEST.md in `S{NN}/`.
- **Ambiguous step status:** `GoalState.steps()` would see the step as "pending".
- **Tight coupling:** Parent step entirely dependent on the subgoal.

**Verdict:** Rejected. The implicit-pause model preserves step-level specification and maintains clear status boundaries.

#### Recommendation: Model 1 (Parent implicitly pauses)

**Justification:**
1. **No concurrency, no coordination:** The parent's queue slot is overwritten by the subgoal's task. When the subgoal completes, the state machine restores the parent's queue slot. No explicit pause/resume protocol needed.
2. **`pio-parent` is navigation, not lifecycle:** The user manually switches sessions. The state machine handles task enqueuing independently.
3. **Simplest state machine changes:** No concurrent context tracking. The state machine processes one goal at a time.
4. **Subgoal COMPLETED = step COMPLETED:** The subgoal's `COMPLETED` marker is the authoritative signal. When `evolve-plan` encounters the parent step, it sees the subgoal is done and proceeds to the next step.

### Subgoal completion → parent resumption

When a subgoal completes (subgoal's `finalize-goal`), how does this propagate back to the parent? The subgoal, like any goal, has a `COMPLETED` marker. This is what counts. Once the goal is `COMPLETED`, it's the same as if the parent task was `COMPLETED`. The state machine routes to the parent's `evolve-plan` — just as `review-task` (approved) routes to `evolve-plan`.

#### Recommended approach: `finalize-goal` → parent's `evolve-plan`

Make `finalize-goal` non-terminal for subgoals. `transitionFinalizeGoal` detects parent context (via params) and routes to the parent's `evolve-plan`:

```typescript
function transitionFinalizeGoal(_state: GoalState, params?: Record<string, unknown>): TransitionResult | undefined {
  const parentGoalName = typeof params?.parentGoalName === "string" ? params.parentGoalName : undefined;
  const parentStepNumber = typeof params?.parentStepNumber === "number" ? params.parentStepNumber : undefined;

  if (parentGoalName && parentStepNumber != null) {
    // This is a subgoal — transition to parent's evolve-plan
    // Subgoal COMPLETED = step COMPLETED. evolve-plan picks up the next step.
    return {
      capability: "evolve-plan",
      params: {
        goalName: parentGoalName,
        stepNumber: parentStepNumber + 1,
      },
    };
  }

  // Top-level goal — terminal behavior (unchanged)
  return undefined;
}
```

**How it fits the existing lifecycle:**

The normal flow for a regular step is:
```
evolve-plan → execute-task → review-task (approved) → evolve-plan (next step)
```

For a subgoal step:
```
evolve-plan → create-goal (subgoal) → ... → finalize-goal (subgoal) → evolve-plan (parent, next step)
```

The subgoal replaces the `execute-task → review-task` cycle. When the subgoal completes, `finalize-goal` routes to `evolve-plan` with the next step number — exactly where `review-task` (approved) would route. The parent's `evolve-plan` then discovers the next incomplete step and proceeds normally.

**Queue mechanics:**

When the subgoal's `finalize-goal` calls `pio_mark_complete`:
1. `resolveTransition("finalize-goal", state, params)` returns `{ capability: "evolve-plan", params: { goalName: parentGoalName, stepNumber: N+1 } }`
2. `pio_mark_complete` calls `enqueueTask(cwd, parentGoalName, task)` — enqueuing to the **parent's** queue slot
3. This overwrites the subgoal's own queue entry (which is no longer needed)
4. User runs `/pio-parent` to switch back to the parent session, then `/pio-next-task` to dequeue the parent's `evolve-plan` task

**User navigation is separate from state machine transitions:**

- `/pio-parent` is a UI feature — it switches the active session. It does not enqueue tasks or manage lifecycles.
- `/pio-next-task` dequeues the pending task from the queue. After subgoal completion, the parent's queue slot contains `evolve-plan`.
- The user navigates back manually. The state machine handles the task enqueuing. These are independent concerns.

**Pros:**
- **Symmetric with existing lifecycle:** `review-task` (approved) → `evolve-plan` and `finalize-goal` (subgoal) → `evolve-plan`. Same destination, same semantics.
- **Subgoal COMPLETED = step COMPLETED:** The subgoal's `COMPLETED` marker is the authoritative signal. `evolve-plan` reads the filesystem and proceeds to the next step.
- **State machine owns the logic:** Consistent with Approach 1 (state machine handles spawning). Completion is the inverse of spawning.
- **Terminal behavior preserved for top-level goals:** `parentGoalName` in params is the discriminator. Top-level goals (no parent) return `undefined` (terminal, unchanged).
- **Audit trail:** `transitions.json` records `finalize-goal → evolve-plan` for subgoals, providing clear provenance.

**Cons:**
- **Changes `finalize-goal` from terminal to conditional:** This is a behavioral change. All existing `finalize-goal` calls must not have spurious `parentGoalName` params.
- **Param pollution risk:** `parentGoalName` and `parentStepNumber` must be scoped to subgoal sessions only (see param pollution analysis below).
- **Requires `transitionFinalizeGoal` function:** Currently `finalize-goal` returns `undefined` directly in the `resolveTransition` switch. Extracting it to a named function is a refactoring prerequisite.

**Required changes to `src/state-machine.ts`:**
- `transitionFinalizeGoal`: **new logic** — new function (extracted from inline `undefined` in `resolveTransition`). Checks for parent context, returns `evolve-plan` for the parent. Returns `undefined` for top-level goals.
- `resolveTransition`: **new logic** — call `transitionFinalizeGoal` instead of returning `undefined` inline.

**Param scoping strategy:** To prevent param pollution:
- `parentGoalName` and `parentStepNumber` are set explicitly when spawning the subgoal (in `transitionEvolvePlan`).
- These params are NOT propagated through `_sessionContext` — they are top-level params on the subgoal session only.
- `transitionFinalizeGoal` checks for these params explicitly and does NOT forward them to the parent's `evolve-plan` (the parent doesn't need parent context — it's a top-level goal from its own perspective).

### Changes to `src/state-machine.ts`

| Function | Change Type | Description |
|----------|-------------|-------------|
| `resolveTransition()` | **new logic** | Replace inline `undefined` for `finalize-goal` with a call to `transitionFinalizeGoal(state, params)`. No other switch cases change. |
| `transitionEvolvePlan()` | **new logic** | Add subgoal-step detection before the existing `execute-task` routing. When the current step is flagged as a subgoal, route to `create-goal` with `parentGoalName`, `parentStepNumber`, and `subgoalType: true` in params. |
| `transitionFinalizeGoal()` | **new logic** | New function (currently inline in `resolveTransition`). For subgoals (has `parentGoalName` param), return `evolve-plan` for the parent with `stepNumber: parentStepNumber + 1`. For top-level goals, return `undefined` (terminal, unchanged). |
| `stepIsSubgoal(state, stepNumber)` | **new logic** | New helper function. Reads step-level metadata from PLAN.md or a sidecar mechanism to determine if a step is a subgoal. Delegates to `GoalState` or `frontmatter` APIs (Dimension 9). |
| `extractParentGoalName(params)` | **new fields** | New helper (analogous to `extractGoalName`). Extracts `parentGoalName` from params if it's a string. |
| `extractParentStepNumber(params)` | **new fields** | New helper (analogous to `extractStepNumber`). Extracts `parentStepNumber` from params if it's a number. |

**No breaking changes identified.** All modifications are additive:
- New params (`parentGoalName`, `parentStepNumber`, `subgoalType`) are optional — existing callers without these params see identical behavior.
- `transitionFinalizeGoal` is a new function — the inline `undefined` in `resolveTransition` is replaced with a function call that returns `undefined` for the top-level case.
- `stepIsSubgoal` is a new helper — existing code paths in `transitionEvolvePlan` execute identically when the step is not a subgoal.

### Circular transition analysis

**Risk:** Recursive nesting (subgoal spawns subgoal) could create infinite loops.

**Analysis:** Each nesting level has its own goal workspace and independent lifecycle. The state machine operates on one goal at a time. When a level-2 subgoal completes, `transitionFinalizeGoal` routes back to its immediate parent's `evolve-plan`, not the top-level goal. The chain unwinds correctly:

```
Parent S03 → subgoal "nested" → subgoal "deep"
  ├─ evolve-plan (parent) → create-goal (nested)  [spawn level 1]
  ├─ evolve-plan (nested) → create-goal (deep)    [spawn level 2]
  ├─ ... (deep runs lifecycle) ...
  ├─ finalize-goal (deep) → evolve-plan (nested)  [complete level 2]
  ├─ ... (nested continues) ...
  ├─ finalize-goal (nested) → evolve-plan (parent) [complete level 1]
  └─ ... (parent continues) ...
```

No circular transitions: each `finalize-goal → evolve-plan` transition moves _up_ one level in the nesting hierarchy. The chain terminates at the top-level goal's `finalize-goal` (which returns `undefined` — no parent). **No infinite loop risk.**

### Param pollution analysis

**Risk:** `parentGoalName` and `parentStepNumber` could leak into downstream transitions via `_sessionContext` propagation.

**Analysis:** In `session-capability.ts`, `pio_mark_complete` propagates params as:
```typescript
enqueueTask(cwd, goalName, {
  capability: nextTask.capability,
  params: {
    goalName,
    ...adjustedParams,
    _sessionContext: sessionParams,
    ...(finalStepNumber != null ? { stepNumber: finalStepNumber } : {}),
  },
});
```

`_sessionContext` contains the original session params. If a subgoal session has `parentGoalName` in its params, this would be included in `_sessionContext` of the next task. However, `transitionFinalizeGoal` checks for `parentGoalName` as a **top-level param** — it does not look inside `_sessionContext`. This prevents accidental activation from nested contexts.

**Mitigation:** `transitionFinalizeGoal` must explicitly check `params?.parentGoalName` (top-level only) and NOT recurse into `_sessionContext`. This is the default behavior of the current implementation — no change needed.

### Cross-references

- **Dimension 1 (Nesting structure):** The `S{NN}/subgoals/<name>/` path determines where subgoal workspaces live. When `transitionEvolvePlan` spawns a subgoal, it must construct the subgoal's `goalDir` using the parent step directory. The `resolveGoalDir` change (Dimension 1, optional `parentStepDir` parameter) enables this.
- **Dimension 2 (Queue keying):** Hierarchical keys (`parent__S03__nested`) enable independent queue slots for parent and subgoal. When the subgoal's `finalize-goal` routes to the parent's `evolve-plan`, `pio_mark_complete` enqueues to the parent's queue slot (using the parent's flat key). Dimension 2's `deriveQueueKey` provides the canonical derivation.
- **Dimension 4 (Subgoal trigger):** The recommended trigger point is `evolve-plan` (spec writer decides). This aligns with Approach 1 (state machine spawning) — `transitionEvolvePlan` is where the detection and routing happens. If Dimension 4 recommends a different trigger point (e.g., `execute-task`), the spawning mechanism would shift to Approach 2 (capability-layer).
- **Dimension 5 (File protection):** The recommended approach (automatic `transitionFinalizeGoal`) does not require cross-directory writes from the subgoal session. The parent's `evolve-plan` session writes to its own `workingDir`. Dimension 5 should verify that the default write protection is sufficient.
- **Dimension 7 (Completion propagation):** This dimension's analysis directly feeds Dimension 7. The subgoal's `COMPLETED` marker is the authoritative signal. `finalize-goal` routes to the parent's `evolve-plan` — the parent step is treated as complete (subgoal COMPLETED = step COMPLETED). Dimension 7 should specify how the parent step's markers (`COMPLETED`, `SUMMARY.md`) are derived from the subgoal's completion.
- **Dimension 8 (GoalState and path resolution):** `transitionEvolvePlan` calls `resolveGoalDir(cwd, goalName!)` when routing to `finalize-goal`. For subgoals, the parent's `goalDir` must be resolved correctly. Dimension 8's path resolution strategy must support this.

## Dimension 4: Subgoal trigger mechanism

### Problem statement

Two initiation points exist for subgoal creation: (a) `create-plan` (planning agent decides upfront), and (b) `evolve-plan` (specification writer corrects planning errors). These address **who** makes the decision. But the harder question is **how do we determine that a step warrants subgoal decomposition at all?** Without this, any planner (human or AI) will produce a flat plan with 20+ monolithic steps and no subgoals — defeating the purpose of recursive nesting.

This dimension analyzes: (1) the decision model — abstraction tree + leaf-node criteria, (2) how the system signals that a step is a subgoal, and (3) who makes the decision.

### Part A: The abstraction tree model

#### Concept

The abstraction tree frames plan decomposition as a recursive structure:

- **Root:** Top-level goal (e.g., "build authentication system")
- **Children:** Immediate plan steps from PLAN.md
- **Each child is either:**
  - A **leaf node** — directly implementable in one `execute-task` session (e.g., "add JWT validation middleware")
  - A **composite node** — requires its own subgoal with its own plan → specs → implementation cycle (e.g., "implement OAuth flow" which itself decomposes into provider integration, token management, callback handling, etc.)

This maps to the pio lifecycle as:
```
Goal → Plan → Steps
                ├─ Leaf step → evolve-plan → execute-task → review-task → done
                └─ Composite step → subgoal → (recursive: Goal → Plan → Steps → ...)
```

**Concrete example:** A goal to "build authentication" decomposes into:
- `S01: Add JWT validation middleware` — **leaf** (single file, single behavior, one session)
- `S02: Implement OAuth flow` — **composite** (multiple independent concerns: provider config, token exchange, callback routing, session management) → spawns subgoal
- `S03: Add rate limiting` — **leaf** (single middleware, clear interface)
- `S04: Build admin dashboard` — **composite** (UI components, API endpoints, permissions) → spawns subgoal

The abstraction tree makes the decomposition hierarchy explicit: `build-auth → [jwt-leaf, oauth-subgoal, rate-limit-leaf, dashboard-subgoal]`.

#### Leaf-node criteria: the I/O contract test

How do we determine when a step is "leaf-level" versus "composite" (needs subgoal decomposition)?

**Single principle:** A plan step is a **coherent transformation**: given well-defined inputs, it produces well-defined outputs that meaningfully advance the goal. The step is a leaf if this transformation can be described as a single contract. If describing the outputs requires decomposing into multiple sub-transformations, the step is composite.

**Concrete test:** Ask "can you state the output without also listing the internal sub-outputs?" If yes → leaf. If no → composite.

**Examples across domains:**

| Step | Output | Single contract? | Verdict |
|------|--------|-----------------|---------|
| "Add JWT validation" | middleware with validation | Yes — one deliverable | **Leaf** |
| "Implement OAuth flow" | provider config + token exchange + callbacks + sessions | No — multiple sub-deliverables | **Composite** |
| "Design DB schema" | schema definition | Yes — one deliverable | **Leaf** |
| "Setup database" | schema + Aurora instance + migrations | No — multiple sub-deliverables | **Composite** |
| "Write Dimension 4 analysis" | feasibility section | Yes — one deliverable | **Leaf** (research goal) |

**Why subgoals instead of flat steps?**

The parent plan operates at the *deliverable* level. Each parent step is one coherent deliverable. Subgoals encapsulate the *process steps* to produce that deliverable — internal details irrelevant to the parent plan's coordination.

**The encapsulation rule:** If multiple steps share a common context and have internal dependencies that are irrelevant to the parent plan, they belong in a subgoal. The parent says "we need X." The subgoal says "here's how we build X."

**Concrete test for the boundary:** Ask "does the parent plan need to know *how* this deliverable is built?" If yes → flatten (the parent coordinates the details). If no → subgoal (the details are internal).

| Scenario | Parent needs to know how? | Decision |
|----------|------------------------|----------|
| "Setup database" | No — Aurora vs Postgres, migration strategy are internal details | **Subgoal** |
| "Set up project" | No — one command, no internal coordination | **Leaf** |
| "Build auth" | No — password hashing, sessions, tokens are internal | **Subgoal** |
| "Add input validation to login form" | No — trivial, one step | **Leaf** |
| "Integrate auth with API routes" | Yes — parent needs to know which routes, in what order | **Flatten** |

**Where this lives:** This principle is encoded in the `pio-planning` skill. Both `create-plan` and `revise-plan` consume this skill — the planning agent evaluates each step against the I/O contract test and flags composite steps for subgoal decomposition. This follows the pio convention: capability prompts say WHAT to do, skills say HOW.

**Categorization:** **new logic** — skill-level principle (in `pio-planning/SKILL.md`), not code enforcement. It guides the planning agent's decisions but is not programmatically validated.

#### Preventing flat trees: decomposition guards

Without explicit guards, planners (especially AI agents optimizing for simplicity) will produce single-level trees with many large steps instead of properly nested abstractions. Two approaches evaluated:

##### Approach 1: Step count limit

**Mechanism:** Enforce a hard limit on `totalSteps` in PLAN.md frontmatter. If `totalSteps > N`, the plan is invalid — the planner must decompose some steps into subgoals.

**Threshold selection:**
- **N = 5:** Too aggressive. Many legitimate features have 5-8 implementable steps. Forces unnecessary nesting.
- **N = 8:** Reasonable default. Most single-session features decompose into 3-6 steps. Plans exceeding 8 steps likely contain composite steps that should be subgoals.
- **N = 12:** Too permissive. Allows genuinely flat plans with 10+ large steps, defeating the purpose.

**Recommended threshold: N = 8** with the following rationale:
- An `execute-task` session has a practical time/token budget. A plan with 8+ steps implies a total scope that likely exceeds what a flat decomposition can handle effectively.
- This is a **soft guard** — it triggers a warning or requires justification, not an automatic rejection. The planner can override with explicit reasoning (e.g., "these 10 steps are all small, independent fixes").

**Pros:**
- **Simple to implement and enforce:** Add a check in `create-plan` post-validation or encode as a skill instruction: "If your plan exceeds 8 steps, decompose some into subgoals."
- **Easy to explain:** "Plans with more than 8 steps should use subgoals" is a clear, memorable rule.
- **Backward compatible:** Existing plans with >8 steps are not invalidated — the rule applies to new plans only.
- **Enforceable programmatically:** `PLAN_FRONTMATTER_SCHEMA` could add a `maxSteps` constraint or a post-validation hook could check the count.

**Cons:**
- **Arbitrary threshold:** 8 is a heuristic, not a principled bound. Some features genuinely need 10 small steps; others are complex in just 4 steps.
- **Doesn't account for step complexity:** A plan with 7 very complex steps is worse than a plan with 10 simple steps, but the count limit treats them the same.
- **Gaming the rule:** A planner could produce a plan with exactly 8 oversized steps to avoid the limit.

**Categorization:** **new logic** in the `pio-planning` skill and/or `create-plan` post-validation. **new fields** in `PLAN_FRONTMATTER_SCHEMA` if programmatic enforcement is desired.

##### Approach 2: Abstraction distance metric

**Mechanism:** Define a notion of "distance" between a parent goal's abstraction level and a child step's abstraction level. If the distance exceeds a threshold, the step needs its own subgoal.

**Possible formulations:**

1. **Scope ratio:** Parent goal covers X features/stories. A child step that covers Y << X features is too coarse — it should be a leaf. Conversely, if a child step's scope is comparable to the parent's (Y ≈ X), it's too broad — it needs decomposition.

2. **Abstraction level difference:** Classify each step by its abstraction level (strategic, tactical, operational). A strategic goal should decompose into tactical steps. A tactical step that decomposes into more tactical steps (rather than operational/leaf steps) is too abstract — it needs its own subgoal.

3. **Qualitative heuristic in skill instructions:** Encode the distance concept as natural-language guidance in the `pio-planning` skill. E.g., "Each step should be concrete enough to implement in a single session. If a step reads like a mini-project rather than a task, it needs its own subgoal."

**Pros:**
- **More nuanced than a count:** Accounts for actual complexity and scope, not just step quantity.
- **Principled:** Based on the abstraction hierarchy concept, not an arbitrary number.
- **Scales to deep nesting:** At each nesting level, the distance metric applies relative to the parent's scope — naturally controlling depth.

**Cons:**
- **Hard to quantify for an AI planner:** "Abstraction distance" is a conceptual metric. Encoding it as a programmatically enforceable rule is difficult. The planning agent must reason about it qualitatively.
- **Skill-dependent:** Effectiveness depends entirely on skill/prompt quality. Poorly worded guidance produces flat trees regardless of the metric.
- **No hard enforcement:** Without a programmatic check, the planner can ignore the guidance.
- **Requires meta-reasoning:** The agent must evaluate its own output against abstract criteria — this is error-prone and context-dependent.

**Categorization:** **new logic** — skill-level guidance only (`pio-planning/SKILL.md`). No code changes required beyond skill updates.

##### Recommendation: Hybrid approach (count limit + distance heuristic)

**Recommended approach:** Use both mechanisms together — a step count limit as a **hard guard** and the abstraction distance heuristic as **skill guidance**.

- **Hard guard:** `totalSteps > 8` triggers a requirement for subgoal decomposition. The planner must either decompose steps into subgoals or provide explicit justification for the flat structure.
- **Skill guidance:** The `pio-planning` skill includes the leaf-node criteria and abstraction distance heuristic. Both `create-plan` and `revise-plan` consume this skill — the planning agent evaluates each step against these criteria and flags composite steps for subgoal decomposition.

**Justification:**
1. **Count limit catches the obvious cases:** A plan with 15 steps is almost certainly flat and needs decomposition.
2. **Distance heuristic handles edge cases:** A plan with 6 very complex steps is still a problem — the distance heuristic catches this even when the count is below the threshold.
3. **Defense in depth:** Both mechanisms reinforce each other.
4. **Skill-level enforcement is sufficient:** For a feasibility study, we recommend skill-level enforcement. Programmatic validation (e.g., rejecting plans with `totalSteps > 8`) is a future enhancement.

**Required changes:**
- `src/skills/pio-planning/SKILL.md`: **new logic** — add leaf-node criteria and decomposition guard instructions to the step design rules. Both `create-plan` and `revise-plan` consume this skill.
- `src/prompts/create-plan.md`: **new logic** — add a reference to the subgoal decomposition section of the `pio-planning` skill (WHAT to do, not HOW).
- `src/frontmatter-schemas.ts`: **new fields** — `PLAN_FRONTMATTER_SCHEMA` may need a `maxSteps` field or a `subgoalSteps` array. Detailed schema design is deferred to Dimension 9.

### Part B: How the system knows a step is a subgoal (signaling)

Before evaluating initiation points, we must answer: **how does the state machine know a step needs subgoal decomposition?** Two fundamentally different approaches:

#### Mechanism A: PLAN.md metadata (declarative)

The planning agent marks composite steps in PLAN.md. The state machine reads PLAN.md and detects the marking.

**Formats (not yet decided):**
- Step heading annotation: `### Step 3: Implement OAuth flow [subgoal]`
- Frontmatter array: `subgoalSteps: [3, 5]`

**Pros:**
- **Declarative and auditable:** Subgoal structure is explicit in the plan. Easy to inspect.
- **No new marker files:** Uses existing PLAN.md. No new write allowlist entries, no new `GoalState` methods.
- **State machine can decide without agent input:** `transitionEvolvePlan` reads PLAN.md and routes. No runtime marker detection needed.
- **Single source of truth:** The plan documents the full decomposition hierarchy.

**Cons:**
- **Planning-time commitment:** The planning agent must decide upfront. It may lack concrete info (exact file counts, codebase complexity).
- **Schema evolution required:** `PLAN_FRONTMATTER_SCHEMA` needs new fields and/or step format needs annotation support. Deferred to Dimension 9.
- **Rigid:** Misclassified steps require plan revision.

**Categorization:** **new fields** in `PLAN_FRONTMATTER_SCHEMA` (deferred to Dimension 9). **new logic** in `transitionEvolvePlan` (read step metadata).

#### Mechanism B: Runtime marker file

The spec writer writes a marker file in `S{NN}/`. `GoalState` detects it (analogous to `revisionNeeded()`). State machine routes to `create-goal`.

**Pros:**
- **Follows existing pattern:** `REVISE_PLAN_NEEDED` already uses this mechanism.
- **Runtime decision:** The agent has current information (codebase state, actual complexity).
- **No PLAN.md schema changes:** Plan remains unchanged.

**Cons:**
- **New marker proliferation:** Adds another marker alongside `REVISE_PLAN_NEEDED`. Each marker requires `GoalState` support, write allowlist entries, prompt instructions, and documentation.
- **Requires write allowlist changes:** `evolve-plan`'s `resolveEvolveWriteAllowlist()` must include it.
- **Validation complexity:** `CAPABILITY_CONFIG` expects `TASK.md` + `TEST.md`. A marker is an alternative output — validation must accept either.
- **Not auditable in the plan:** The decomposition decision lives in a transient marker, not the canonical plan.

**Categorization:** **new fields** in `GoalState` (marker detection method). **new logic** in `evolve-plan.ts`, `state-machine.ts`, and prompts.

#### Signaling mechanism: no recommendation yet

Both mechanisms are feasible. Mechanism A (PLAN.md metadata) is more declarative and auditable but requires schema evolution (Dimension 9). Mechanism B (marker file) follows existing patterns but adds marker surface area.

**This decision should be made in coordination with Dimension 9** (planning awareness), which will design the PLAN.md metadata schema. If Dimension 9 determines that per-step metadata in PLAN.md is feasible, Mechanism A is preferred. Otherwise, Mechanism B is the fallback.

### Part C: Initiation points (who makes the decision)

With two signaling mechanisms established, we now evaluate who makes the leaf-vs-composite decision:

#### Initiation point 1: create-plan (planning agent decides upfront)

**Mechanism:** The planning agent evaluates each step against leaf-node criteria (from `pio-planning/SKILL.md`). Composite steps are marked in PLAN.md (Mechanism A). When `evolve-plan` encounters a marked step, the state machine routes to `create-goal` instead of producing TASK.md/TEST.md.

**Information flow:**
- Planning agent reads GOAL.md, researches the codebase, and designs steps.
- For each step, evaluates leaf-node criteria. Marks composites in PLAN.md.
- Subgoal name is derived from the step title (slugified).
- `evolve-plan` → state machine reads PLAN.md, detects marking, routes to `create-goal`.

**Required changes:**
- `src/skills/pio-planning/SKILL.md`: **new logic** — add leaf-node criteria and decomposition instructions (see Part A).
- `src/prompts/create-plan.md`: **new logic** — reference the subgoal decomposition section.
- `src/state-machine.ts`: **new logic** — `transitionEvolvePlan` reads PLAN.md step metadata and routes to `create-goal` for marked steps.
- `src/frontmatter-schemas.ts`: **new fields** — if frontmatter-based metadata is used (deferred to Dimension 9).

**Pros:**
- **Declarative and auditable:** Plan documents the full decomposition hierarchy.
- **No new marker files:** Uses existing PLAN.md structure (Mechanism A).
- **Decouples planning from specification:** Planning agent makes the decision. `evolve-plan` doesn't need judgment calls.
- **Single decision point:** The planning agent decides once, upfront. No runtime correction needed.

**Cons:**
- **Planning-time assessment may be inaccurate:** The planning agent may lack concrete info (exact file counts, codebase complexity).
- **Rigid:** Misclassified steps require plan revision.

#### Initiation point 2: evolve-plan (specification writer corrects planning errors)

**Mechanism:** The spec writer evaluates the assigned step against leaf-node criteria. If the planning agent missed a composite step, the spec writer signals this via a runtime marker (Mechanism B fallback). This is the correction path, not the primary path.

**Current code analysis (`src/capabilities/evolve-plan.ts`):**

- `validateAndFindNextStep()` scans for the next incomplete step. No concept of subgoal-type steps.
- `CAPABILITY_CONFIG` defines expected outputs: `${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`. Write allowlist includes `COMPLETED`, `TASK.md`, `TEST.md`, `DECISIONS.md`, and `REVISE_PLAN_NEEDED`.

**Information flow:**
- Spec writer reads PLAN.md. Step is NOT marked as a subgoal.
- Evaluates leaf-node criteria. Determines step is actually composite.
- Writes a runtime marker in `S{NN}/`.
- `pio_mark_complete` detects the marker. State machine routes to `create-goal`.

**Required changes (fallback only):**
- `src/capabilities/evolve-plan.ts`: **new logic** — add marker to write allowlist.
- `src/goal-state.ts`: **new fields** — marker detection method.
- `src/state-machine.ts`: **new logic** — detect marker and route to `create-goal`.
- `src/prompts/evolve-plan.md`: **new logic** — instructions for writing the marker.

**Pros:**
- **Informed decision:** Spec writer has access to the actual codebase and previous step context.
- **Corrects planning errors:** Catches cases where the planning agent misclassified.
- **Before implementation:** Decomposition happens before any code is written.

**Cons:**
- **Requires new infrastructure:** Write allowlist, `GoalState` method, validation changes.
- **Marker file proliferation:** Adds another marker alongside `REVISE_PLAN_NEEDED`.

### Recommendation: create-plan as the primary initiation point

**Recommended approach:** `create-plan` (planning agent) is the primary initiation point for subgoal decomposition, with `evolve-plan` (spec writer) as a correction fallback.

**Justification grounded in the abstraction tree model:**

1. **Single decision point:** The planning agent evaluates all steps against leaf-node criteria at once. One decision per step, made upfront. This is simpler than distributing the decision across multiple agents.

2. **Declarative and auditable:** With Mechanism A (PLAN.md metadata), the decomposition hierarchy is explicit in the plan. Anyone reading PLAN.md can see which steps are subgoals. No runtime markers to track.

3. **Aligns with the pio workflow:** The planning agent already decomposes the goal into steps. Adding leaf-vs-composite classification is a natural extension of existing decomposition work. The `pio-planning` skill already defines step design rules — adding subgoal decomposition criteria is an extension of those rules.

4. **Before specification, before implementation:** Decomposition happens at the earliest possible point. No wasted specification or implementation effort on steps that should be subgoals.

5. **`evolve-plan` as a safety valve:** If the planning agent misclassifies a step, the spec writer can correct it via a runtime marker (Mechanism B). This handles planning errors without requiring plan revision.

**How the recommended approach works end-to-end:**

1. Planning agent writes PLAN.md with N steps. Composite steps are marked (e.g., `[subgoal]` in step headings).
2. `evolve-plan` processes Step K. State machine reads PLAN.md, detects the marking.
3. If Step K is marked as a subgoal: state machine routes to `create-goal` with parent context. Subgoal is created at `S{NN}/subgoals/<name>/` per Dimension 1.
4. If Step K is a leaf: spec writer produces TASK.md + TEST.md normally. `pio_mark_complete` validates, enqueues `execute-task`.
5. If the spec writer discovers an unmarked step is actually composite: writes a runtime marker (Mechanism B fallback). State machine routes to `create-goal`.
6. Subgoal runs through its own lifecycle: `create-goal → create-plan → evolve-plan → ... → finalize-goal`.
7. On subgoal completion, `finalize-goal` routes back to parent's `evolve-plan` (per Dimension 3).

The implementer (`execute-task`) is never involved in decomposition decisions. It receives TASK.md/TEST.md for leaf steps and executes them. If a step is a subgoal, the implementer never sees it — the subgoal's own lifecycle handles implementation.

### Required code changes summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/skills/pio-planning/SKILL.md` | **new logic** | Add leaf-node criteria and decomposition guard instructions to step design rules. Shared by `create-plan` and `revise-plan`. |
| `src/prompts/create-plan.md` | **new logic** | Add reference to the subgoal decomposition section of the `pio-planning` skill (WHAT, not HOW) |
| `src/prompts/evolve-plan.md` | **new logic** | Add instructions for detecting subgoal-marked steps and for the runtime marker fallback |
| `src/state-machine.ts` | **new logic** | `transitionEvolvePlan` reads PLAN.md step metadata and routes to `create-goal` for marked steps. Detects runtime markers for fallback routing. |
| `src/goal-state.ts` | **new fields** | Add marker detection method for the runtime fallback (Mechanism B). Not needed if only Mechanism A is used. |
| `src/capabilities/evolve-plan.ts` | **new logic** | If Mechanism B is used: add runtime marker to write allowlist. Accept it as valid output alongside TASK.md/TEST.md. |
| `src/frontmatter-schemas.ts` | **new fields** | `PLAN_FRONTMATTER_SCHEMA` may need `subgoalSteps` array or per-step metadata. Detailed design deferred to Dimension 9. |

**No breaking changes identified.** All modifications are additive: new skill instructions, new prompt references, new state machine routing.

### Edge cases

1. **No subgoal name provided:** If a step is marked as a subgoal but no name is specified, the system must derive one. Fallback: slugify the step title from PLAN.md (e.g., "Implement OAuth flow" → `oauth-flow`). If the step title is too generic, use a default like `subgoal-{stepNumber}`.

2. **All steps are subgoals:** If every step in a plan is composite, the plan becomes a pure decomposition tree with no leaf nodes. This is valid — it means the entire goal is recursive. The `evolve-plan` session will spawn subgoals for every step, and the parent plan effectively becomes an index of subgoals.

3. **Subgoal within a subgoal (recursive nesting):** The trigger works at any nesting depth. A subgoal's `create-plan` session evaluates its own steps against leaf-node criteria and can mark further sub-subgoals. The abstraction tree grows recursively.

4. **Step count limit interaction:** If a plan has exactly 8 steps but some are composite, the planning agent will mark them as subgoals. The remaining flat steps may be fewer than 8 — this is correct behavior. The count limit is a guard against flat plans, not a requirement for exactly 8 steps.

5. **Spec writer disagrees with PLAN.md marking:** If PLAN.md marks a step as a subgoal but the spec writer determines it's actually a leaf, the spec writer should produce TASK.md/TEST.md normally (override the marking). The spec writer has more concrete information (actual codebase state) than the planning agent had.

6. **Signaling mechanism not yet decided:** The choice between Mechanism A (PLAN.md metadata) and Mechanism B (runtime marker) is deferred to Dimension 9. The feasibility analysis above covers both options. The final decision will determine which code changes are actually required.

7. **Implementer is never involved:** `execute-task` does not participate in decomposition decisions. The implementer receives TASK.md/TEST.md for leaf steps and executes them. Decomposition is the responsibility of the planning and specification phases only.

### Cross-references

- **Dimension 1 (Nesting structure):** Subgoal workspaces are created at `S{NN}/subgoals/<name>/`. The subgoal name (derived from the step title) maps to this path. The `resolveGoalDir` change (Dimension 1, optional `parentStepDir` parameter) enables resolving the nested path.
- **Dimension 2 (Queue keying):** When the state machine routes to `create-goal` for a subgoal, the subgoal gets its own queue slot with a hierarchical key (`parent__S03__nested`). Dimension 2's `deriveQueueKey` ensures no collisions.
- **Dimension 3 (State machine extensions):** `transitionEvolvePlan` is the spawning mechanism. It reads step metadata (Mechanism A) or detects runtime markers (Mechanism B) and routes to `create-goal` with `parentGoalName`, `parentStepNumber`, and `subgoalName` params.
- **Dimension 9 (Planning awareness):** PLAN.md metadata for subgoal step marking is primarily a Dimension 9 topic. Dimension 4 evaluates it as a signaling mechanism (Mechanism A) but defers detailed schema design (`subgoalSteps` array, per-step annotations, heading format) to Dimension 9. The leaf-node criteria and decomposition guards are skill-level concerns (`pio-planning/SKILL.md`) that Dimension 4 addresses directly. Dimension 9 should coordinate with Dimension 4 on the final signaling mechanism choice.
- **Dimension 5 (File protection):** If Mechanism B (runtime marker) is used, the marker is written inside `S{NN}/` — within the `evolve-plan` session's `workingDir`. No cross-directory writes required. Default write protection is sufficient. If only Mechanism A is used, no new file writes are needed.
- **Dimension 7 (Completion propagation):** When a subgoal completes, `finalize-goal` routes back to the parent's `evolve-plan`. The parent step is treated as complete (subgoal COMPLETED = step COMPLETED). Dimension 7 specifies the detailed propagation mechanism.

## Dimension 5: File protection scope

### Problem statement

A subgoal session's `workingDir` will be nested inside the parent goal workspace (e.g., `/repo/.pio/goals/parent/S03/subgoals/nested/`). The file protection engine in `src/guards/validation.ts` enforces write restrictions via the `tool_call` event handler: default-deny for writes to `.pio/`, with exceptions for the session's own `workingDir` and explicit `writeAllowlist`. This dimension verifies correctness for nested paths, identifies the `workingDir` assignment gap, analyzes write-allowlist behavior for parent-level file writes, and documents read-access requirements.

### Part A: Current write protection behavior for nested paths

#### A.1: Default-deny check analysis

The core permission check in `validation.ts` (line ~103) is:

```typescript
if (workingDir && (tp.startsWith(workingDir + path.sep) || tp === workingDir)) {
  continue; // permit
}
```

Where `tp` is the resolved absolute target path from a write tool call. This check permits writes only if the target is inside or exactly equal to `workingDir`. All other writes to `.pio/` paths are blocked.

**Concrete path analysis for a nested subgoal session:**

Assume `workingDir = /repo/.pio/goals/parent/S03/subgoals/nested/`.

| Target path | Resolved (`tp`) | `tp.startsWith(workingDir + path.sep)` | `tp === workingDir` | Verdict |
|-------------|----------------|---------------------------------------|---------------------|---------|
| `nested/GOAL.md` (own file) | `/repo/.pio/goals/parent/S03/subgoals/nested/GOAL.md` | `true` (starts with workingDir + `/`) | `false` | **Allowed** ✓ |
| `nested/S01/TASK.md` (nested step file) | `/repo/.pio/goals/parent/S03/subgoals/nested/S01/TASK.md` | `true` | `false` | **Allowed** ✓ |
| `../../TASK.md` (parent step file) | `/repo/.pio/goals/parent/S03/TASK.md` | `false` (does not start with workingDir prefix) | `false` | **Blocked** ✓ |
| `../subgoals/other/file.md` (sibling subgoal) | `/repo/.pio/goals/parent/S03/subgoals/other/file.md` | `false` (different subgoal name) | `false` | **Blocked** ✓ |
| `../../../PLAN.md` (parent PLAN.md) | `/repo/.pio/goals/parent/PLAN.md` | `false` | `false` | **Blocked** ✓ |
| `nested/` (the workingDir itself) | `/repo/.pio/goals/parent/S03/subgoals/nested/` | `false` (no trailing separator match) | `true` (exact match) | **Allowed** ✓ |

**Path traversal via `../`:** `path.resolve()` normalizes path traversal sequences before the `startsWith` check. For example, `path.resolve("/repo/.pio/goals/parent/S03/subgoals/nested/", "../../TASK.md")` produces `/repo/.pio/goals/parent/S03/TASK.md` — the traversal is resolved to an absolute path, and the prefix check correctly rejects it. **No path traversal bypass exists.**

**Edge case — prefix collision:** Could a subgoal name be a prefix of another path that causes false positives? For `workingDir = /repo/.pio/goals/parent/S03/subgoals/nested/`, the check `tp.startsWith(workingDir + path.sep)` requires the separator after `workingDir`. This prevents false matches like `tp = /repo/.pio/goals/parent/S03/subgoals/nested-extra/` (starts with `nested` but not `nested/`). **The separator requirement eliminates prefix collisions.**

**Conclusion:** The default-deny check is **correct for nested paths**. When `workingDir` is set to the subgoal's actual directory, writes are correctly scoped to that directory only. No modification to the prefix check logic is required.

Categorization: **no change required**.

#### A.2: The `workingDir` assignment gap

The default-deny check works correctly — but only if `workingDir` is set to the correct nested path. The question is: how does a subgoal session get its `workingDir`?

**Current derivation chain** (`src/capability-config.ts`, lines 38–43):

```typescript
const explicitWorkingDir = typeof params?.workingDir === "string" && params.workingDir
  ? params.workingDir
  : "";
const workingDir = explicitWorkingDir
  ? explicitWorkingDir
  : goalName
    ? resolveGoalDir(cwd, goalName)
    : cwd;
```

Priority: `params.workingDir` (explicit) > `resolveGoalDir(cwd, goalName)` (flat derivation) > `cwd` (fallback).

**The gap:** `resolveGoalDir(cwd, goalName)` always produces flat paths: `<cwd>/.pio/goals/<name>/`. For a subgoal at `parent/S03/subgoals/nested/`, calling `resolveGoalDir(cwd, "nested")` produces `.pio/goals/nested/` — a flat path that either doesn't exist or refers to a different top-level goal. The flat derivation **cannot resolve nested subgoal paths**.

**Failure mode — if `params.workingDir` is not explicitly set:**

1. Spawning transition (e.g., `transitionEvolvePlan`) passes `goalName: "nested"` but no `workingDir`.
2. `resolveCapabilityConfig()` falls back to `resolveGoalDir(cwd, "nested")` → `.pio/goals/nested/`.
3. `workingDir` is set to `.pio/goals/nested/` — a wrong directory.
4. The subgoal session can write to `.pio/goals/nested/` (wrong scope) but cannot write to the actual subgoal directory `.pio/goals/parent/S03/subgoals/nested/` (blocked by default-deny).
5. **Result:** The subgoal session operates on the wrong directory. Writes intended for the subgoal workspace go to a flat directory. Writes to the actual subgoal directory are blocked.

This is a **critical failure mode** if the spawning transition doesn't pass explicit `params.workingDir`.

**Required fix:** The spawning transition (identified in Dimension 3 as `transitionEvolvePlan` routing to `create-goal`) **must pass `params.workingDir` explicitly** for nested subgoals. The value should be the full nested path: `/repo/.pio/goals/parent/S03/subgoals/nested/`.

**How the spawning transition computes the correct `workingDir`:**

The transition knows the parent goal name, the parent step number, and the subgoal name. It must construct the nested path:

```typescript
// In transitionEvolvePlan, when routing to create-goal for a subgoal:
const parentGoalDir = resolveGoalDir(cwd, goalName!); // /repo/.pio/goals/parent/
const parentStepDir = path.join(parentGoalDir, `S${String(explicitStepNumber).padStart(2, "0")}`); // /repo/.pio/goals/parent/S03/
const subgoalWorkingDir = path.join(parentStepDir, "subgoals", subgoalName); // /repo/.pio/goals/parent/S03/subgoals/nested/

return {
  capability: "create-goal",
  params: {
    goalName: subgoalName,
    workingDir: subgoalWorkingDir, // explicit — bypasses resolveGoalDir
    parentGoalName: goalName,
    parentStepNumber: explicitStepNumber,
  },
};
```

**Dependency on Dimension 8:** If Dimension 8 introduces a nested-aware `resolveGoalDir` (e.g., accepting a `parentStepDir` parameter), the spawning transition could use that instead of manual path construction. However, passing `params.workingDir` explicitly is the most direct approach — it bypasses `resolveGoalDir` entirely and guarantees the correct path regardless of resolver changes.

Categorization: **new logic** in the spawning transition (`transitionEvolvePlan` in `src/state-machine.ts`). The transition must construct and pass the nested `workingDir`. This is a non-breaking change — existing transitions without subgoals continue to use the flat derivation path.

#### A.3: Write-allowlist behavior for parent-level file writes

When `writeAllowlist` is configured, writes are restricted to exact matches only. The allowlist paths are resolved relative to `workingDir`:

```typescript
// validation.ts, resources_discover handler
if (config.writeAllowlist && config.workingDir) {
  writeAllowlistPaths = config.writeAllowlist.map((f) => path.resolve(config.workingDir!, f));
}
```

**Resolution behavior for nested paths:**

For a subgoal with `workingDir = /repo/.pio/goals/parent/S03/subgoals/nested/`:
- Allowlist entry `"SUMMARY.md"` resolves to `/repo/.pio/goals/parent/S03/subgoals/nested/SUMMARY.md` — correct.
- Allowlist entry `"../../FEASIBILITY.md"` resolves to `/repo/.pio/goals/parent/S03/FEASIBILITY.md` — `path.resolve()` normalizes the traversal. This would allow writing to a parent-level file.

**Can a subgoal session write to a file in the parent goal workspace?**

Theoretically, yes — if the allowlist includes a parent-relative path like `"../../FEASIBILITY.md"`. `path.resolve()` normalizes `../` sequences, producing an absolute path above the `workingDir`. The allowlist check uses exact match (`writeAllowlistPaths.includes(tp)`), so the resolved absolute path would match.

**However, this is a gap in practice:**

1. **Capability config resolution:** `writeAllowlist` is defined in `CAPABILITY_CONFIG` per capability. The allowlist is resolved relative to `workingDir` at session startup. A subgoal capability's `CAPABILITY_CONFIG` would need to know about parent-level file paths — but it doesn't have access to the parent goal directory structure.

2. **Relative path expressibility:** To write to the parent's `FEASIBILITY.md` from a subgoal at `parent/S03/subgoals/nested/`, the allowlist would need `"../../../FEASIBILITY.md"` (going up from nested → subgoals → S03 → parent). The nesting depth varies — a deeper subgoal would need more `../` segments. The allowlist cannot express this generically.

3. **Absolute path alternative:** If the allowlist used absolute paths instead of relative paths, the subgoal session could explicitly list the parent file's full path. However, `CAPABILITY_CONFIG` resolves allowlist entries via `path.resolve(config.workingDir!, f)` — it always resolves relative to `workingDir`. There is no mechanism to specify an absolute path directly.

**Gap summary:** If a subgoal session needs to write to files outside its own directory (e.g., appending to the parent's `FEASIBILITY.md`, writing a parent step's `SUMMARY.md`), the current allowlist resolution cannot express parent-relative paths in a depth-independent way.

**Impact assessment:** For the recommended lifecycle model (Dimension 3, parent implicitly pauses), subgoal sessions typically write only to their own workspace. The parent's `FEASIBILITY.md` is written by the parent goal's own sessions (e.g., the feasibility study steps). Subgoal sessions don't need to write to parent-level files in the normal lifecycle. **This gap is low-impact for the recommended approach but must be documented for future reference.**

**If cross-directory writes are needed in the future:**

Two options:
1. **Absolute-path allowlist entries:** Modify the allowlist resolution to detect absolute paths (starting with `/`) and use them directly instead of resolving relative to `workingDir`. This is a **new logic** change to `validation.ts`.
2. **Explicit `writeAllowlist` in params:** Allow the spawning transition to pass an explicit `writeAllowlist` array via `params.writeAllowlist`, overriding the capability's default allowlist. This is already partially supported — `capability-config.ts` resolves `writeAllowlist` from the capability module, but could accept an override from params.

Categorization: **no change required** for the recommended approach. **new logic** (optional enhancement) if cross-directory writes become necessary.

### Part B: Read access requirements

#### B.1: What files a subgoal session needs to READ from the parent

A subgoal session operates on a decomposed piece of the parent goal. To function correctly, it needs context from the parent:

| File | Purpose | Required? |
|------|---------|-----------|
| Parent `GOAL.md` | Overall goal context — what is the parent trying to achieve? | **Yes** — essential for understanding scope |
| Parent `PLAN.md` | Where does this subgoal fit in the larger plan? What are the other steps? | **Yes** — essential for understanding position in the hierarchy |
| Parent step's `TASK.md` | If `evolve-plan` produced TASK.md/TEST.md before subgoal spawning, these contain the specific scope for this step | **Conditional** — only if the step has wrapper specs |
| Parent step's `TEST.md` | Acceptance criteria for the step (maps to subgoal completion) | **Conditional** — only if wrapper specs exist |
| Sibling subgoal outputs | If coordination between parallel decomposition paths is needed | **Rare** — subgoals are sequential, not concurrent |
| `.pio/PROJECT/OVERVIEW.md` | Project-level context (tech stack, conventions) | **Yes** — already injected via prompt injection |

**Current behavior:** The validation engine (`tool_call` handler in `validation.ts`) protects **writes only** — it does not restrict reads. Tool calls like `read`, `bash` (e.g., `cat`, `ls`), and `vscode_get_*` tools are not intercepted by the write-protection handler. The LLM can request reads to any path on the filesystem.

**Conclusion:** Read access to parent files works naturally with the current design. No file protection changes are needed to enable reads. The subgoal session can read parent `GOAL.md`, parent `PLAN.md`, and any other parent-level files on demand.

Categorization: **no change required**.

#### B.2: Project context injection

The `before_agent_start` handler in `session-capability.ts` loads project context:

```typescript
const projectContextPath = resolveProjectContextPath(process.cwd());
// resolveProjectContextPath returns: path.join(cwd, ".pio", "PROJECT", "OVERVIEW.md")
```

For a subgoal session, `process.cwd()` is the repo root (unchanged). This resolves correctly to `.pio/PROJECT/OVERVIEW.md` — the project-level context is shared across all sessions regardless of nesting depth. **Project context injection works correctly for subgoals.**

#### B.3: Parent context injection approaches

While reads work naturally, the question is whether the subgoal session should have parent context **injected automatically** (proactively loaded into the session) or whether it should **read parent files on demand** (reactive reads by the LLM).

**Approach A: `prepareSession` hook injection**

The `prepareSession` callback (in `CAPABILITY_CONFIG`) runs during session startup, after `enrichedSessionParams` is populated. It receives `(workingDir, params)` and can perform filesystem reads. The spawning transition could instruct `prepareSession` to read parent `GOAL.md` and relevant `PLAN.md` step content, then inject as initial message context.

**Pros:**
- **Guaranteed context:** The subgoal session starts with parent context already available. No risk of the LLM forgetting to read parent files.
- **Consistent across subgoals:** All subgoal sessions receive the same parent context, regardless of LLM behavior.
- **Pre-loaded in conversation:** Context appears as a conversation message — the LLM can reference it without additional tool calls.

**Cons:**
- **Token overhead:** Parent `GOAL.md` and `PLAN.md` can be large. Injecting both adds significant tokens to every subgoal session.
- **Stale context:** If the parent `PLAN.md` changes after the subgoal session starts, the injected context is outdated.
- **Complexity:** Requires the `create-goal` capability's `prepareSession` to detect subgoal sessions (via params) and load parent files. The `create-goal` module needs to know about the parent goal directory — this information must be passed through params.
- **Depth-dependent reads:** For deeply nested subgoals (level 2+), should we inject grandparent context too? The injection logic becomes depth-aware.

**Required changes:** **new logic** in `create-goal` capability's `prepareSession` hook. Read parent files based on `parentGoalName` and `parentStepNumber` from params.

**Approach B: No injection — reactive reads**

Rely on the LLM to read parent files on its own when needed. The subgoal session's prompt instructions (from `src/prompts/create-goal.md`) would include guidance like: "Before starting, read the parent goal's GOAL.md at `<parentGoalDir>/GOAL.md` and the relevant step from `<parentGoalDir>/PLAN.md`."

**Pros:**
- **Zero infrastructure changes:** No code modifications required. Reads are unrestricted.
- **No token overhead:** Parent context is loaded only when the LLM needs it.
- **Fresh context:** Each read gets the latest file contents.
- **Depth-independent:** Works at any nesting level — the LLM reads whatever it needs.

**Cons:**
- **Relies on LLM compliance:** The LLM might forget to read parent files, especially for complex goals.
- **Inconsistent behavior:** Different LLM instances might read different parent files, leading to inconsistent context.
- **Additional tool calls:** Reading parent files consumes tool call budget and tokens.

**Required changes:** **new logic** in `src/prompts/create-goal.md` — add instructions to read parent files for subgoal sessions. The prompt would need to receive the parent goal directory path (via `defaultInitialMessage` or params).

**Approach C: Hybrid — inject parent goal name, let LLM read**

Inject the parent goal directory path into the subgoal session's initial message. The LLM is instructed to read from that path. This gives the LLM the exact path without requiring complex path derivation.

**Pros:**
- **Minimal injection:** Only injects a path string, not full file contents. Low token overhead.
- **Guided reads:** The LLM knows exactly where to look.
- **Fresh context:** Reads are on-demand, always up-to-date.

**Cons:**
- **Still relies on LLM compliance:** The LLM might not read the files.
- **Requires prompt changes:** `create-goal` prompt or initial message must include the parent path.

**Required changes:** **new logic** in the spawning transition — include parent goal directory in `params.initialMessage` or `params.parentGoalDir`.

**Recommendation: Approach C (hybrid)**

Inject the parent goal directory path into the initial message. This provides the LLM with the exact path to parent files without the token overhead of full file injection. The `create-goal` prompt should instruct subgoal sessions to read parent `GOAL.md` and `PLAN.md` from the provided path.

**Justification:**
1. **Minimal overhead:** Injecting a path string is negligible compared to injecting full file contents.
2. **Guided behavior:** The LLM knows exactly where to look — reduces the risk of forgetting.
3. **Fresh context:** On-demand reads always get the latest file contents.
4. **Depth-independent:** Works at any nesting level.

**Required changes:**
- Spawning transition (`transitionEvolvePlan`): **new logic** — include `parentGoalDir` in params or initial message.
- `src/prompts/create-goal.md`: **new logic** — add instructions for subgoal sessions to read parent files.

### Part C: Scoping recommendations

#### C.1: Summary of findings

| Aspect | Current behavior | Correct for nested paths? | Changes needed |
|--------|-----------------|--------------------------|----------------|
| Default-deny check (`startsWith`) | Blocks writes outside `workingDir` | **Yes** — prefix check with separator is correct | None |
| Path traversal (`../`) | `path.resolve()` normalizes before check | **Yes** — no bypass exists | None |
| `workingDir` assignment | Falls back to `resolveGoalDir` (flat paths) | **No** — flat derivation cannot resolve nested paths | Spawning transition must pass explicit `params.workingDir` |
| Write-allowlist resolution | Resolves relative to `workingDir` | **Partial** — cannot express parent-relative paths generically | None for recommended approach. Enhancement needed if cross-directory writes required |
| Read access | Unrestricted — writes-only protection | **Yes** — reads work naturally | None |
| Project context injection | Resolves from `process.cwd()` | **Yes** — repo root is unchanged | None |
| Parent context injection | Not implemented | N/A | Recommended: inject parent goal directory path (Approach C) |

#### C.2: Recommended changes

**Required changes:**

1. **Spawning transition must pass explicit `params.workingDir`** (`src/state-machine.ts`):
   - When `transitionEvolvePlan` routes to `create-goal` for a subgoal, it must construct the full nested path and pass it as `params.workingDir`.
   - This bypasses the flat `resolveGoalDir` derivation and guarantees correct scoping.
   - Categorization: **new logic** (non-breaking — existing transitions unaffected).

2. **Inject parent goal directory into subgoal sessions** (`src/prompts/create-goal.md`):
   - Include the parent goal directory path in the initial message or params.
   - Add prompt instructions for subgoal sessions to read parent `GOAL.md` and `PLAN.md`.
   - Categorization: **new logic** (prompt-level change — no code modifications).

**No changes required:**

- `src/guards/validation.ts`: The default-deny check is correct for nested paths. No modification to the prefix check, path traversal handling, or allowlist resolution is needed for the recommended approach.
- `src/capability-config.ts`: The explicit `params.workingDir` path already works — no code changes needed. The fix is in the caller (spawning transition), not the resolver.

**Optional enhancements (deferred):**

- **Absolute-path allowlist support:** If a future capability requires cross-directory writes, modify `validation.ts` to detect absolute paths in the allowlist and use them directly. Categorization: **new logic**.
- **Param-based allowlist override:** Allow `params.writeAllowlist` to override the capability's default allowlist. Categorization: **new logic** in `capability-config.ts`.

#### C.3: Cross-references

- **Dimension 1 (Nesting structure):** The `S{NN}/subgoals/<name>/` path convention determines the exact `workingDir` value. The spawning transition must construct this path correctly. The `resolveGoalDir` change (Dimension 1, optional `parentStepDir` parameter) could simplify path construction but is not required — manual path joining is sufficient.
- **Dimension 3 (State machine extensions):** `transitionEvolvePlan` is the spawning transition. It must pass `params.workingDir` explicitly for nested subgoals. This dimension specifies the transition logic; this dimension specifies the `workingDir` value it must produce. The `params.workingDir` mechanism already exists in `capability-config.ts` — no new infrastructure needed.
- **Dimension 8 (GoalState and path resolution):** If Dimension 8 introduces a nested-aware path resolver, the spawning transition could use it instead of manual path construction. However, the explicit `params.workingDir` approach is independent of resolver changes — it works regardless of how `resolveGoalDir` evolves.
- **Dimension 4 (Subgoal trigger):** If `evolve-plan` is the correction fallback (Mechanism B, runtime marker), the marker is written inside `S{NN}/` — within the `evolve-plan` session's `workingDir`. No cross-directory writes required. Default write protection is sufficient for the fallback path.

### Summary of changes (Dimension 5)

| File | Function/Area | Change Type | Description |
|------|--------------|-------------|-------------|
| `src/guards/validation.ts` | Default-deny check | no change | `tp.startsWith(workingDir + path.sep)` is correct for nested paths |
| `src/guards/validation.ts` | Path traversal handling | no change | `path.resolve()` normalizes `../` before the prefix check |
| `src/guards/validation.ts` | Write-allowlist resolution | no change | Relative-to-`workingDir` resolution is sufficient for recommended approach |
| `src/state-machine.ts` | `transitionEvolvePlan` | **new logic** | Must pass explicit `params.workingDir` for nested subgoals |
| `src/capability-config.ts` | `resolveCapabilityConfig` | no change | Explicit `params.workingDir` already supported — bypasses `resolveGoalDir` |
| `src/prompts/create-goal.md` | Prompt instructions | **new logic** | Add instructions for subgoal sessions to read parent `GOAL.md` and `PLAN.md` |
| `src/capabilities/session-capability.ts` | `before_agent_start` | no change | Project context injection from `process.cwd()` works correctly for subgoals |

## Dimension 6: Session hierarchy and navigation

### Problem statement

With nested subgoals, the session tree deepens beyond the current two-level model (root → goal session). A subgoal lifecycle adds intermediate sessions: root → parent goal → parent step → subgoal create-goal → subgoal create-plan → subgoal evolve-plan → .... The feasibility study must determine whether the existing pi session infrastructure supports this depth without modification, and what changes pio code needs to provide a good user experience for navigating multi-level nesting.

This dimension analyzes four areas: (A) pi's `parentSession` depth support, (B) `/pio-parent` multi-level navigation behavior, (C) session naming with hierarchical context, and (D) recommendations and required changes.

### Part A: Pi parentSession depth support

#### Evidence from `launchCapability()` in `src/capabilities/session-capability.ts`

**Current code** (lines 49–62):
```typescript
export async function launchCapability(ctx: ExtensionCommandContext, config: CapabilityConfig): Promise<void> {
  const parentSession = ctx.sessionManager.getSessionFile();

  await ctx.newSession({
    parentSession,
    setup: async (newSm) => {
      newSm.appendCustomEntry("pio-config", config);
    },
    withSession: async (_newCtx) => {
      if (config.initialMessage) {
        _newCtx.sendUserMessage(config.initialMessage);
      }
    },
  });
}
```

`launchCapability` captures the current session file via `ctx.sessionManager.getSessionFile()` and passes it as `parentSession` to `ctx.newSession()`. There is no depth check, no nesting counter, and no conditional logic based on the current session's own parent. Every sub-session records its immediate creator as parent — a simple linked-list chain.

**Observation:** The `parentSession` parameter is passed unconditionally. The depth of the chain is determined entirely by how many times `ctx.newSession({ parentSession })` is called in succession. `launchCapability` imposes no limit.

#### Evidence from pi docs — `ctx.newSession()` in `docs/extensions.md`

The pi extensions documentation describes `ctx.newSession(options?)` with the following options:
- `parentSession`: parent session file to record in the new session header
- `setup`: mutate the new session's `SessionManager` before `withSession` runs
- `withSession`: run post-switch work against a fresh replacement-session context

**No depth constraint is documented.** The `parentSession` option accepts a session file path string — it does not validate nesting depth or reject deeply nested chains. The API is designed for arbitrary parent-child relationships.

#### Evidence from pi docs — session header format in `docs/session-format.md`

The session format documentation (lines 194–197) specifies the header for sessions with a parent:

```json
{"type":"session","version":3,"id":"uuid","timestamp":"...","cwd":"/path/to/project","parentSession":"/path/to/original/session.jsonl"}
```

**Key observation:** The header records only the `parentSession` — a single path to the immediate parent. This is a linked-list structure: each session knows its parent, but not its grandparents. Traversal up the chain requires following `parentSession` links iteratively. `getHeader()` (documented at line 406) returns this header metadata.

**Conclusion from linked-list structure:** The linked-list chain has no inherent depth limit. Each session stores exactly one parent reference. Traversal depth is bounded only by filesystem path limits and practical usability — not by any pi API constraint.

#### Evidence from `ctx.switchSession()` in `docs/extensions.md`

`ctx.switchSession(sessionPath)` switches to any session file by path. It does not validate parent-child relationships or depth. A session can switch to any other session in the tree — parent, sibling, or unrelated. This confirms that pi's session model supports arbitrary tree structures, not just flat or two-level hierarchies.

#### Conclusion: pi supports arbitrary depth

**Evidence summary:**
1. `launchCapability()` passes `parentSession` unconditionally — no depth check in pio code.
2. `ctx.newSession({ parentSession })` has no documented depth limit — pi API accepts any session file path.
3. Session header uses a linked-list chain (`parentSession` → one parent) — no structural constraint on chain length.
4. `ctx.switchSession()` navigates freely — no depth-dependent behavior.

**pi's `parentSession` mechanism supports arbitrary nesting depth.** No modification to pi or pio's session creation code is required for subgoals. The linked-list chain naturally composes: each sub-session records its immediate creator as parent, regardless of how deep the chain is.

**Categorization: no change required.**

### Part B: `/pio-parent` multi-level navigation

#### Current behavior analysis (`src/capabilities/parent.ts`)

**Full source** (29 lines):
```typescript
async function findParentPath(ctx: ExtensionCommandContext): Promise<string | null> {
  const header = ctx.sessionManager.getHeader();
  if (header?.parentSession && fs.existsSync(header.parentSession)) {
    return header.parentSession;
  }
  return null;
}

async function handleParent(_args: string | undefined, ctx: ExtensionCommandContext) {
  const parentPath = await findParentPath(ctx);

  if (!parentPath) {
    ctx.ui.notify("No parent session found", "warning");
    return;
  }

  await ctx.switchSession(parentPath);
}
```

**Behavior:** `findParentPath` reads `header.parentSession`, checks `fs.existsSync(header.parentSession)` for existence, then `ctx.switchSession(parentPath)` switches to it. This is a **single hop** — one `/pio-parent` invocation moves up exactly one level in the session tree.

#### Multi-level nesting scenario

Consider depth 4: root → parent goal session → subgoal create-goal → subgoal execute-task.

| Session | parentSession | `/pio-parent` hops to root |
|---------|--------------|--------------------------|
| root | (none) | 0 |
| parent goal session | root | 1 |
| subgoal create-goal | parent goal session | 2 |
| subgoal execute-task | subgoal create-goal | 3 |

To navigate from the deepest session back to root, the user needs **three `/pio-parent` invocations**. Each invocation moves up exactly one level. There is no batch operation, no "go to root" command, and no visual breadcrumb showing the nesting chain.

#### Is single-hop navigation acceptable?

**Arguments for sufficiency:**
1. **Predictable behavior:** One command = one hop. The user always knows exactly where they are after each invocation. No ambiguity about "which parent" when multiple levels exist.
2. **Rare deep navigation:** Most users will navigate 1-2 levels. Deep nesting (4+ levels) is architecturally unusual — the `totalSteps > 8` guard from Dimension 4 limits plan breadth, which indirectly limits nesting depth.
3. **No pi API support for batch navigation:** `ctx.switchSession()` switches to a single path. Implementing "go to root" would require traversing the linked-list chain in pio code — feasible but adds complexity for a rare operation.
4. **Existing pio convention:** `/pio-parent` is documented as "switch back to the parent session" (singular). The semantics are clear and consistent with the single-hop behavior.

**Arguments for enhancement:**
1. **User confusion:** A user deep in a subgoal might not realize they need to invoke `/pio-parent` multiple times. They might invoke it once, see they're still in a sub-session, and be confused.
2. **No visibility into the chain:** The user cannot see the full nesting path. They don't know how many hops to root remain.
3. **Frustration for deep nesting:** 5+ levels of nesting would require 5+ invocations. This is tedious.

#### Enhancement options evaluated

**Option 1: No enhancement — accept single-hop behavior**

**Pros:** Zero code changes. Predictable semantics. Matches existing behavior.
**Cons:** No visibility into nesting depth. Tedious for deep nesting.

**Option 2: Notification showing nesting depth**

Modify `handleParent` to show a notification with the nesting depth: "Switched to parent (2 levels remaining)" or "No parent session found (you are at the root)".

**Implementation:** Traverse the linked-list chain to count total depth before switching. Display depth in the notification.

```typescript
async function handleParent(_args: string | undefined, ctx: ExtensionCommandContext) {
  const parentPath = await findParentPath(ctx);
  if (!parentPath) {
    ctx.ui.notify("No parent session found (root session)", "info");
    return;
  }
  // Count remaining depth
  let depth = 0;
  let current = parentPath;
  while (true) {
    // Would need to read header of each session — requires loading each session file
    // This is expensive for deep chains
    break;
  }
  await ctx.switchSession(parentPath);
}
```

**Problem:** Counting depth requires reading the header of each ancestor session file. This is filesystem I/O for every `/pio-parent` invocation. The linked-list chain is stored in session files — `getHeader()` returns the header of the _current_ session, not arbitrary sessions.

**Verdict:** Impractical without pi API changes. Would require reading raw session files to traverse the chain.

**Option 3: `/pio-session-chain` command (breadcrumb)**

A new command that displays the full session chain: root → parent → subgoal → current. Shows the nesting hierarchy as a visual breadcrumb.

**Implementation:** Traverse the linked-list chain by reading session headers, collect the chain, and display as a formatted list.

**Pros:** Gives the user full visibility into the nesting hierarchy. No navigation action required — purely informational.
**Cons:** Requires reading multiple session files. Adds a new command. Depth traversal requires loading each session's header.

**Verdict:** Feasible but adds complexity. The linked-list traversal requires reading raw session JSONL files to extract headers of ancestor sessions. This is a pio-level feature, not a pi API feature.

**Option 4: `/pio-parent --all` or `/pio-root`**

A flag or separate command to jump directly to the root session. Traverses the linked-list chain and switches to the topmost session.

**Implementation:** Same linked-list traversal as Option 3, but instead of displaying, switches to the last session in the chain.

**Pros:** Solves the deep-navigation problem directly. One command to return to root.
**Cons:** Same traversal complexity. Loses intermediate context — the user skips all intermediate sessions.

**Verdict:** Feasible. Would be a useful enhancement for deep nesting. However, the traversal complexity (reading session files) and the rarity of deep nesting make this a lower priority.

#### Recommendation: No changes to `/pio-parent` for now

**Justification:**
1. **Single-hop is sufficient for typical use:** Most subgoal workflows will have 2-3 levels of nesting. Two `/pio-parent` invocations is acceptable.
2. **No pi API support for efficient chain traversal:** Reading session headers of arbitrary sessions requires filesystem I/O. This is a pio-level concern, not a pi API concern.
3. **Future enhancement is possible:** A `/pio-session-chain` command or `/pio-root` can be added later when subgoals are in active use and user feedback indicates the need. The linked-list chain is stable — the enhancement doesn't require structural changes.
4. **Notification improvement is feasible without chain traversal:** At minimum, the "No parent session found" message could be improved to "You are at the root session" for clarity. This is a trivial **new logic** change to `parent.ts`.

**Categorization:** **no change required** for core functionality. **new logic** (optional UX improvement) for the root-session notification message.

### Part C: Session naming with hierarchical context

#### Current behavior — `deriveSessionName()` in `src/fs-utils.ts`

**Current code** (lines 81–90):
```typescript
export function deriveSessionName(goalName: string, capability: string, stepNumber?: number): string {
  if (!goalName) return capability;

  let name = `${goalName} ${capability}`;
  if (typeof stepNumber === "number") {
    name += ` s${stepNumber}`;
  }
  return name;
}
```

**Format:** `<goalName> <capability> s{N}`

**Example for a flat goal:** `deriveSessionName("my-feature", "execute-task", 3)` → `"my-feature execute-task s3"`

#### Usage in `src/capability-config.ts`

**Current code** (line 81):
```typescript
sessionName: deriveSessionName(goalName, cap, stepNumber),
```

The session name is derived from `goalName` (from params), capability name, and step number. This is set via `pi.setSessionName(config.sessionName)` in `session-capability.ts` (line 156).

#### Subgoal session naming — current format with qualified names

With Dimension 2's hierarchical queue keys (`parent__S03__nested`), the `goalName` parameter for a subgoal would be the qualified key. `deriveSessionName("parent__S03__nested", "execute-task", 1)` produces:

**`"parent__S03__nested execute-task s1"`**

This is **functional but not ideal for display:**
- The `__` delimiters are an implementation detail of the queue keying strategy. They are not intuitive display separators.
- The name is long — each nesting level adds `~{parentName}__S{NN}__` (~15 chars). At 3 levels: `"grandparent__S05__parent__S03__nested execute-task s1"` (~60 chars).
- The hierarchical structure is encoded but not visually clear. A user scanning session names would see `parent__S03__nested` and need to understand the `__` convention to parse the hierarchy.

#### Recommended formatting improvement

Replace `__` delimiters with a visual separator for display purposes. Two options:

**Option A: Replace `__` with `/`**

`"parent/S03/nested execute-task s1"`

**Pros:** Path-like separators are intuitive for hierarchy. Matches the filesystem structure (`S03/subgoals/nested`).
**Cons:** Forward slashes in session names could be confused with filesystem paths in logs or debugging output.

**Option B: Replace `__` with `→`**

`"parent → S03 → nested execute-task s1"`

**Pros:** Arrow clearly indicates a hierarchy/flow. Visually distinct from paths.
**Cons:** Unicode characters may not render correctly in all terminals. Long display names.

**Option C: Replace `__` with ` › ` (double-angle quote)**

`"parent › S03 › nested execute-task s1"`

**Pros:** Common breadcrumb separator in UI design. Visually clear hierarchy. ASCII-compatible.
**Cons:** Slightly longer than `/` but shorter than `→`.

**Recommendation: Option A (`/` separator)**

**Justification:**
1. **Matches filesystem structure:** The path `S03/subgoals/nested` maps directly to `S03/nested` in the display name. Users familiar with the directory structure will find the naming intuitive.
2. **Compact:** `/` is a single character — keeps session names short even at moderate nesting depths.
3. **ASCII-compatible:** No unicode rendering issues.
4. **Precedent:** Path-like separators in names are common in development tools (e.g., `webpack/Chunk/module`, `jest/Suite/Test`).

#### Implementation approach

**Modify `deriveSessionName()` to format qualified names:**

```typescript
export function deriveSessionName(goalName: string, capability: string, stepNumber?: number): string {
  if (!goalName) return capability;

  // Format hierarchical goal names for display: replace __ with /
  const displayName = goalName.includes("__")
    ? goalName.replace(/__/g, "/")
    : goalName;

  let name = `${displayName} ${capability}`;
  if (typeof stepNumber === "number") {
    name += ` s${stepNumber}`;
  }
  return name;
}
```

**Backward compatibility:** Flat goal names (no `__`) pass through unchanged. `deriveSessionName("my-feature", "execute-task", 3)` still produces `"my-feature execute-task s3"`. The formatting is purely cosmetic — it affects display only, not queue keying or path resolution.

**Examples:**

| Input | Current output | Improved output |
|-------|---------------|-----------------|
| `deriveSessionName("my-feature", "execute-task", 3)` | `"my-feature execute-task s3"` | `"my-feature execute-task s3"` (unchanged) |
| `deriveSessionName("parent__S03__nested", "execute-task", 1)` | `"parent__S03__nested execute-task s1"` | `"parent/S03/nested execute-task s1"` |
| `deriveSessionName("grandparent__S05__parent__S03__nested", "create-plan", undefined)` | `"grandparent__S05__parent__S03__nested create-plan"` | `"grandparent/S05/parent/S03/nested create-plan"` |

**Categorization: new logic** in `deriveSessionName()` (`src/fs-utils.ts`). Non-breaking — purely cosmetic formatting of the display name. Existing callers receive improved output for hierarchical names without any API changes.

### Part D: Recommendations and required changes

#### Summary of findings

| Area | Finding | Change Required? |
|------|---------|-----------------|
| Pi `parentSession` depth support | Linked-list chain with no depth limit. Confirmed by `launchCapability()`, pi `ctx.newSession()` docs, and session header format. | **No change** |
| `/pio-parent` navigation | Single-hop behavior (one level per invocation). Correct and predictable. Deep nesting requires multiple invocations. | **No change** (optional UX notification improvement) |
| Session naming (`deriveSessionName`) | Qualified names with `__` delimiters are functional but not ideal for display. Formatting improvement recommended. | **New logic** (cosmetic) |
| User visibility into nesting chain | No breadcrumb or chain visibility. User must navigate blind. | **No change** (deferred enhancement) |

#### Explicit recommendations

1. **Pi `parentSession` depth: No changes needed.** The linked-list chain supports arbitrary depth. `launchCapability()` passes `parentSession` unconditionally. The pi `ctx.newSession()` API has no depth constraints. Subgoal sessions will chain naturally through the existing mechanism.

2. **`/pio-parent` navigation: Accept single-hop behavior.** Multiple invocations for deep nesting is acceptable. The command semantics ("switch to parent") are clear and consistent. Optional enhancement: improve the "No parent session found" message to indicate root session status. Categorization: **no change required** (core), **new logic** (optional notification text).

3. **Session naming: Format qualified names for display.** Replace `__` delimiters with `/` in `deriveSessionName()`. This is a cosmetic improvement — it does not affect queue keying, path resolution, or any structural behavior. The qualified name (`parent__S03__nested`) remains the canonical identifier; the formatted name (`parent/S03/nested`) is for display only. Categorization: **new logic** in `src/fs-utils.ts`.

4. **Breadcrumb/chain visibility: Defer to future enhancement.** A `/pio-session-chain` command or session tree visualization is feasible but not required for subgoal viability. The linked-list chain traversal requires reading session files — this is a pio-level feature with no pi API support. Implement when subgoals are in active use and user feedback indicates need.

#### Change categorization

| File | Change | Type |
|------|--------|------|
| `src/capabilities/session-capability.ts` | `launchCapability()` with `ctx.newSession({ parentSession })` | no change — arbitrary depth already supported |
| `src/capabilities/parent.ts` | `findParentPath` / `handleParent` single-hop navigation | no change — single-hop is sufficient |
| `src/fs-utils.ts` | `deriveSessionName()` formatting for qualified names | **new logic** — cosmetic |
| `src/capability-config.ts` | `sessionName: deriveSessionName(goalName, cap, stepNumber)` | no change — receives improved output from `deriveSessionName` |
| `src/capabilities/parent.ts` | Notification text improvement (optional) | **new logic** — cosmetic |

#### Cross-references

- **Dimension 2 (Queue keying):** Hierarchical keys (`parent__S03__nested`) feed directly into `deriveSessionName()` as the `goalName` parameter. The `__` delimiter is a queue keying artifact — `deriveSessionName` formats it for display. Dimension 2's key format is the input; this dimension's formatting is the output. The two are tightly coupled: if Dimension 2 changes the delimiter (e.g., from `__` to `_`), `deriveSessionName` must update accordingly.

- **Dimension 3 (State machine):** State machine transitions (`transitionEvolvePlan`, `transitionFinalizeGoal`) set up the `parentSession` chain via `launchCapability()`. Each capability session records its immediate creator as parent. The lifecycle model (parent implicitly pauses) means the parent session exists but is not active — the user navigates back via `/pio-parent`. Dimension 3's spawning mechanism creates the chain; this dimension analyzes its properties.

- **Dimension 1 (Nesting structure):** The `S{NN}/subgoals/<name>/` path determines the maximum nesting depth. With the `totalSteps > 8` guard (Dimension 4), typical nesting is 2-3 levels. The session naming improvement (`parent/S03/nested`) mirrors this path structure for display.

- **Dimension 5 (File protection):** Not directly relevant. Session hierarchy is a navigation/display concern, not a file protection concern. However, the session `workingDir` (set by the spawning transition per Dimension 5) determines which directory the session operates on — this is independent of the session name or parent chain.

### Summary of changes (Dimension 6)

| File | Function/Area | Change Type | Description |
|------|--------------|-------------|-------------|
| `src/capabilities/session-capability.ts` | `launchCapability()` | no change | `ctx.newSession({ parentSession })` supports arbitrary depth |
| `src/capabilities/parent.ts` | `findParentPath` / `handleParent` | no change | Single-hop navigation is sufficient for typical nesting depths |
| `src/fs-utils.ts` | `deriveSessionName()` | **new logic** | Format qualified names: replace `__` with `/` for display |
| `src/capability-config.ts` | `sessionName` derivation | no change | Receives improved output from `deriveSessionName` |
| `src/capabilities/parent.ts` | Notification text | **new logic** (optional) | Improve "No parent session found" to indicate root session |

**No breaking changes identified.** All modifications are additive or cosmetic. The core session infrastructure (pi's `parentSession`, pio's `launchCapability`, `/pio-parent`) requires no changes for subgoal support.

[End of Dimension 6 analysis]

## Dimension 7: Completion propagation

### Problem statement

When a subgoal completes — the subgoal's `finalize-goal` session finishes and the subgoal workspace gets a `COMPLETED` marker — the parent step must somehow be notified so the parent goal can continue. This is the critical lifecycle boundary: the transition point where control returns from the nested subgoal back to the parent workflow.

The user's stated preference is authoritative on this dimension: **"the subgoal, like any goal, has a COMPLETED marker. This is what counts."** The propagation mechanism must be designed around this principle — the subgoal's own `COMPLETED` marker is the single source of truth for completion. No additional parent-level markers need to be written by the subgoal session itself.

This dimension specifies the detailed mechanics: what exactly happens at the propagation boundary, who writes what files, how queue slots are restored, and what changes are needed in each affected module. Dimension 3 already recommended that `finalize-goal` routes to the parent's `evolve-plan`; this dimension verifies that recommendation holds under detailed examination and fills in the specific code changes.

### Part A: Subgoal COMPLETED marker semantics

#### Regular goal COMPLETED marker

For a regular (top-level) goal, the `COMPLETED` marker at `<goalDir>/COMPLETED` is written by the `evolve-plan` agent when all plan steps are specified and no more incomplete steps remain. The `goalCompleted()` method in `GoalState` (`src/goal-state.ts`, line 344) checks for this file:

```typescript
goalCompleted: () => {
  return fs.existsSync(path.join(goalDir, "COMPLETED"));
}
```

When `goalCompleted()` returns `true`, `transitionEvolvePlan` (`src/state-machine.ts`, line 56) routes to `finalize-goal`. The `finalize-goal` session then updates `.pio/PROJECT/` documentation. Currently, `finalize-goal` is terminal — `resolveTransition` returns `undefined` for the `finalize-goal` case (`src/state-machine.ts`, line 185).

#### Subgoal COMPLETED marker

The same marker mechanism applies to subgoals. When a subgoal's `COMPLETED` marker appears at `<subgoalDir>/COMPLETED`, the subgoal is done. The `goalCompleted()` method works identically — it checks `<goalDir>/COMPLETED` regardless of whether `goalDir` is flat or nested. As confirmed in Dimension 1, the cwd derivation in `createGoalState()` correctly handles nested paths via `indexOf("/goals/")` + `path.dirname()`.

**Key difference from regular goals:** Unlike regular goals where `finalize-goal` is terminal (`undefined`), subgoal completion must propagate control back to the parent. The `COMPLETED` marker is the signal — but what happens after the signal is detected is where subgoals diverge.

#### User preference analysis

The user's statement — **"the subgoal, like any goal, has a COMPLETED marker. This is what counts"** — has specific design implications:

1. **The COMPLETED marker is authoritative:** The subgoal's own `COMPLETED` file is the completion signal. No additional "parent-step-completed" marker is required from the subgoal session. The subgoal session writes `COMPLETED` to its own workspace, just like any regular goal.

2. **No special subgoal-specific marker:** The system does not need a `SUBGOAL_COMPLETED` or `PROPAGATE_TO_PARENT` marker. The standard `COMPLETED` file is sufficient — the system detects subgoal context via params (`parentGoalName`), not via marker files.

3. **Subgoal COMPLETED = step COMPLETED:** When the subgoal's `COMPLETED` marker is present, the parent step is considered complete. The parent's `evolve-plan` will discover that the step's subgoal is done and proceed to the next step. This equivalence is the core semantic of the propagation mechanism.

4. **No additional writes from the subgoal session:** The subgoal session does not write to the parent's `S{NN}/` directory. It writes only to its own workspace. The propagation is handled by the state machine transition and queue mechanics — not by the subgoal session writing parent-level files.

### Part B: Recommended propagation mechanism

Three mechanisms are evaluated for propagating subgoal completion to the parent goal.

#### Mechanism 1: State machine routing (`finalize-goal` → parent's `evolve-plan`)

`transitionFinalizeGoal` detects `parentGoalName` in params and returns a non-terminal transition to the parent's `evolve-plan`. The `COMPLETED` marker is checked by the subgoal's own `finalize-goal` session (existing `validateFinalizeGoal` behavior). Upon successful completion, the state machine returns a transition to the parent's `evolve-plan` instead of `undefined`.

**How it works:**

```typescript
// New function in src/state-machine.ts
function transitionFinalizeGoal(
  _state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined {
  const parentGoalName = typeof params?.parentGoalName === "string" ? params.parentGoalName : undefined;
  const parentStepNumber = typeof params?.parentStepNumber === "number" ? params.parentStepNumber : undefined;

  if (parentGoalName && parentStepNumber != null) {
    // This is a subgoal — transition to parent's evolve-plan.
    // Subgoal COMPLETED = step COMPLETED. evolve-plan picks up the next step.
    return {
      capability: "evolve-plan",
      params: {
        goalName: parentGoalName,
        stepNumber: parentStepNumber + 1,
      },
    };
  }

  // Top-level goal — terminal behavior (unchanged).
  return undefined;
}
```

`resolveTransition` calls `transitionFinalizeGoal` instead of returning `undefined` inline:

```typescript
case "finalize-goal":
  return transitionFinalizeGoal(state, params);
```

**Queue mechanics:** When the subgoal's `finalize-goal` calls `pio_mark_complete`:
1. `resolveTransition("finalize-goal", state, params)` returns `{ capability: "evolve-plan", params: { goalName: parentGoalName, stepNumber: N+1 } }`
2. `pio_mark_complete` in `session-capability.ts` (lines 100–130) calls `enqueueTask(cwd, goalName, task)` — but here `goalName` is derived from `state.goalName` (the subgoal's name). The transition's `params.goalName` (the parent's name) is in `adjustedParams`, not at the top level.
3. **Critical issue:** `pio_mark_complete` uses `state.goalName` for `enqueueTask`, not the transition's `params.goalName`. This means the task would be enqueued to the subgoal's queue slot, not the parent's.
4. **Required fix:** `pio_mark_complete` must use the transition's `params.goalName` for `enqueueTask` when it differs from `state.goalName`. This is a **new logic** change to `session-capability.ts`.

**Pros:**
- **Symmetric with existing lifecycle:** `review-task` (approved) → `evolve-plan` and `finalize-goal` (subgoal) → `evolve-plan`. Same destination, same semantics. The subgoal replaces the `execute-task → review-task` cycle.
- **State machine owns the logic:** Consistent with Dimension 3's Approach 1 (state machine handles spawning). Completion is the inverse of spawning — both are centralized in the state machine.
- **Terminal behavior preserved for top-level goals:** `parentGoalName` in params is the discriminator. Top-level goals (no parent) return `undefined` (terminal, unchanged).
- **Audit trail:** `transitions.json` records `finalize-goal → evolve-plan` for subgoals, providing clear provenance.
- **Testable:** Pure function — unit-testable without filesystem I/O.

**Cons:**
- **Changes `finalize-goal` from terminal to conditional:** Existing `finalize-goal` calls must not have spurious `parentGoalName` params. Param scoping prevents this (see param pollution analysis below).
- **Requires `pio_mark_complete` fix:** The enqueueing logic must use the transition's `goalName` for parent task restoration. This is a non-trivial change to `session-capability.ts`.
- **Requires `transitionFinalizeGoal` extraction:** Currently `finalize-goal` returns `undefined` inline in `resolveTransition`. Extracting to a named function is a refactoring prerequisite.

**Required code changes:**
- `src/state-machine.ts`: `transitionFinalizeGoal` — **new logic** (new function). `resolveTransition` — **new logic** (replace inline `undefined` with function call).
- `src/capabilities/session-capability.ts`: `pio_mark_complete` — **new logic** (use transition's `params.goalName` for `enqueueTask` when it differs from `state.goalName`).

#### Mechanism 2: postExecute hook on finalize-goal

The `finalize-goal` capability registers a `postExecute` hook that detects subgoal sessions (via params) and writes parent-level markers or enqueues parent tasks. This keeps the state machine terminal but adds lifecycle logic at the capability layer.

**How it works:**

```typescript
// In src/capabilities/finalize-goal.ts CAPABILITY_CONFIG:
postExecute: (dir, params) => {
  const parentGoalName = typeof params?.parentGoalName === "string" ? params.parentGoalName : undefined;
  if (!parentGoalName) return; // top-level goal, nothing to do

  // Enqueue parent's evolve-plan task
  const parentGoalDir = resolveGoalDir(process.cwd(), parentGoalName);
  enqueueTask(process.cwd(), parentGoalName, {
    capability: "evolve-plan",
    params: { goalName: parentGoalName, stepNumber: params.parentStepNumber + 1 },
  });
},
```

**Pros:**
- **State machine remains terminal:** `finalize-goal` always returns `undefined`. No conditional terminal behavior.
- **Capability-layer logic:** The `postExecute` hook is designed for post-completion actions. Using it for propagation is semantically appropriate.
- **No state machine changes for `finalize-goal`:** Only `resolveTransition` needs the `finalize-goal` case to remain as-is.

**Cons:**
- **Bypasses the state machine:** The propagation decision lives in the capability layer, not the state machine. This is inconsistent with Dimension 3's Approach 1 (state machine owns transitions).
- **`postExecute` runs after `pio_mark_complete` transitions:** The `postExecute` hook runs after the transition is resolved and enqueued. If the transition returns `undefined` (terminal), the `pio_mark_complete` lifecycle has already completed. The `postExecute` would need to do its own `enqueueTask` — duplicating the enqueuing logic.
- **No audit trail:** `postExecute` does not go through `recordTransition`. The `finalize-goal → evolve-plan` transition would not appear in `transitions.json`.
- **Harder to test:** `postExecute` involves I/O (enqueueing) — less testable than a pure state machine function.
- **Fragile ordering:** `postExecute` runs after cleanup (`fileCleanup`). If cleanup removes files the hook needs, the hook fails silently (errors are caught and logged).

**Required code changes:**
- `src/capabilities/finalize-goal.ts`: `CAPABILITY_CONFIG.postExecute` — **new logic** (enqueue parent task).
- `src/state-machine.ts`: no change for `finalize-goal` (remains terminal).

#### Mechanism 3: User-initiated propagation

Subgoal completion does not automatically propagate. The user must manually run `/pio-parent` to switch back to the parent session, then `/pio-next-task` to resume. The subgoal's `finalize-goal` is terminal — it does not enqueue any parent tasks.

**How it works:**

1. Subgoal completes — `finalize-goal` runs, updates PROJECT docs, terminates.
2. User runs `/pio-parent` to switch to the parent session.
3. User runs `/pio-next-task` — but the parent's queue slot was overwritten by the subgoal's task. There's no pending parent task.
4. **Gap:** The parent has no queued task. The user must manually invoke `/pio-evolve-plan <parentName>` to resume.

**Pros:**
- **Simplest implementation:** No code changes required. `finalize-goal` remains terminal. No state machine changes.
- **Maximum user control:** The user decides when and how to resume the parent.
- **No automatic behavior:** No risk of incorrect propagation or queue slot collisions.

**Cons:**
- **Broken `/pio-next-task` flow:** After subgoal completion, `/pio-next-task` has nothing to dequeue for the parent. The user must manually invoke the next capability. This breaks the automated workflow.
- **Requires user to know the parent goal name:** The user must remember or look up the parent goal name to invoke `/pio-evolve-plan <parentName>`.
- **Inconsistent with pio design:** pio is designed for automated task chaining. Manual intervention at every subgoal completion defeats the purpose of the queue system.
- **No audit trail:** The transition from subgoal completion to parent resumption is not recorded.

**Required code changes:** None. However, this approach is **not recommended** — it breaks the core pio workflow of automated task chaining.

#### Recommendation: Mechanism 1 (State machine routing)

**Justification:**

1. **Consistent with Dimension 3:** Dimension 3 recommended Approach 1 (state machine spawning). Mechanism 1 is the natural inverse — spawning routes `evolve-plan → create-goal`, completion routes `finalize-goal → evolve-plan`. Both are state machine transitions.

2. **Symmetric lifecycle:** The subgoal replaces the `execute-task → review-task` cycle. `review-task` (approved) → `evolve-plan` is the existing pattern. `finalize-goal` (subgoal) → `evolve-plan` follows the same pattern. The parent's `evolve-plan` discovers the next step regardless of whether the previous step was a regular step or a subgoal.

3. **Subgoal COMPLETED = step COMPLETED:** The subgoal's `COMPLETED` marker is the authoritative signal. `evolve-plan` reads the filesystem and proceeds to the next step. No additional parent-level markers are needed.

4. **Audit trail:** `transitions.json` records the full lifecycle including subgoal completion → parent resumption. This is essential for debugging and understanding the goal history.

5. **Testable:** Pure function in `transitionFinalizeGoal` — unit-testable without mocking capability layers or filesystem I/O.

6. **User preference alignment:** The subgoal's own `COMPLETED` marker is the signal. The propagation mechanism detects subgoal context via params (`parentGoalName`) — not via additional marker files or special session behavior. The COMPLETED marker is authoritative.

**Trade-off analysis:**

| Criterion | Mechanism 1 | Mechanism 2 | Mechanism 3 |
|-----------|------------|-------------|-------------|
| State machine consistency | ✓ Centralized | ✗ Bypasses state machine | ✗ No state machine involvement |
| Audit trail | ✓ Recorded | ✗ Not recorded | ✗ Not recorded |
| Automated workflow | ✓ Automatic | ✓ Automatic | ✗ Manual |
| Testability | ✓ Pure function | ✗ I/O-dependent | N/A |
| Code changes | Moderate | Low | None |
| User preference alignment | ✓ COMPLETED is authoritative | ✓ COMPLETED is authoritative | ✓ COMPLETED is authoritative |

Mechanism 1 is the only approach that satisfies all criteria: state machine consistency, audit trail, automated workflow, and testability. The moderate code change cost is justified by the architectural benefits.

### Part C: Parent step marker behavior

When a subgoal completes, what happens to the parent step's markers in `S{NN}/`?

#### Parent step COMPLETED marker

**Question:** Does the parent `S{NN}/` directory get a `COMPLETED` marker when the subgoal completes?

**Analysis:** The subgoal's `COMPLETED` marker is at `<subgoalDir>/COMPLETED` (e.g., `S03/subgoals/nested/COMPLETED`). The parent step's `S03/` directory does not have its own `COMPLETED` marker. The `GoalState.steps()` method scans for step-level markers (`COMPLETED`, `APPROVED`, `REJECTED`, `BLOCKED`) inside each `S{NN}/` folder.

**Current behavior:** `StepStatus.status()` returns `"implemented"` when `COMPLETED` exists in the step folder. For a subgoal step, the `COMPLETED` marker is in the subgoal's directory (`S03/subgoals/nested/COMPLETED`), not in `S03/` itself. The parent's `steps()` scan would see `S03/` as `"pending"` or `"defined"` (depending on whether TASK.md/TEST.md exist), not `"implemented"`.

**Options:**

1. **No parent step COMPLETED marker (recommended):** The subgoal's `COMPLETED` is authoritative. The parent's `evolve-plan` does not check `S{NN}/COMPLETED` — it checks whether the subgoal workspace has `COMPLETED`. This requires `evolve-plan` to be aware of subgoal steps and check the subgoal directory instead of the step directory.

2. **Mirror COMPLETED to parent step:** When the subgoal completes, write `COMPLETED` to the parent's `S03/` directory. This makes the parent step appear "implemented" to `GoalState.steps()`. However, this requires the subgoal session (or the propagation mechanism) to write to the parent's directory — a cross-directory write.

3. **evolve-plan generates COMPLETED:** The parent's `evolve-plan` session detects that the step is a subgoal and checks the subgoal directory for `COMPLETED`. If present, it treats the step as complete and proceeds to the next step. No marker mirroring needed.

**Recommendation: Option 3 (evolve-plan generates awareness).** The subgoal's `COMPLETED` marker is the authoritative signal. The parent's `evolve-plan` must be aware of subgoal steps and check the subgoal directory for completion. This avoids cross-directory writes and maintains the principle that the subgoal's own `COMPLETED` is what counts.

**However,** this requires `evolve-plan` to know which steps are subgoals and where the subgoal directories are. This ties into Dimension 9 (planning awareness) — the PLAN.md metadata or step-level annotations must identify subgoal steps. Until Dimension 9's signaling mechanism is implemented, `evolve-plan` cannot distinguish subgoal steps from regular steps.

**Practical resolution:** For the initial implementation, the subgoal lifecycle replaces `execute-task → review-task`. When `finalize-goal` routes to the parent's `evolve-plan` with `stepNumber: parentStepNumber + 1`, the `evolve-plan` session skips the completed subgoal step and processes the next step. The step number increment (`parentStepNumber + 1`) effectively marks the subgoal step as "done" — `evolve-plan` moves past it without checking its markers.

**Who writes the parent step COMPLETED marker?** Nobody. The subgoal's `COMPLETED` is sufficient. The step number increment in the state machine transition (`stepNumber: parentStepNumber + 1`) is the propagation mechanism — it tells `evolve-plan` to skip the completed step and move to the next one.

#### Parent step SUMMARY.md

**Question:** Should the parent's `S{NN}/` directory have a `SUMMARY.md` when the subgoal completes?

**Analysis:** The `execute-task` agent writes `SUMMARY.md` upon completion. A subgoal replaces `execute-task` in the lifecycle. The subgoal's own `SUMMARY.md` files are in the subgoal's step folders (`S01/SUMMARY.md`, `S02/SUMMARY.md` inside the subgoal workspace). The parent's `S03/` directory lacks a `SUMMARY.md`.

**Downstream impact:** The `finalize-goal` agent reads per-step `SUMMARY.md` files to understand what was done. If the parent's `finalize-goal` expects `S03/SUMMARY.md` but finds none, it would miss context for that step.

**Options:**

1. **No wrapper SUMMARY.md (recommended for initial implementation):** The subgoal's own summaries are in the subgoal workspace. The parent's `finalize-goal` can read from `S03/subgoals/nested/` if it knows the subgoal path. This requires `finalize-goal` to be subgoal-aware.

2. **Subgoal writes SUMMARY.md to parent step:** The subgoal's `finalize-goal` writes a summary to the parent's `S03/SUMMARY.md`. This requires cross-directory writes — blocked by file protection (Dimension 5). The subgoal session's `workingDir` is the subgoal directory, not the parent step directory.

3. **State machine propagation writes SUMMARY.md:** The `transitionFinalizeGoal` or `pio_mark_complete` writes a wrapper `SUMMARY.md` to the parent step. This is I/O in the state machine or capability layer — not clean separation.

**Recommendation: Option 1 (no wrapper SUMMARY.md initially).** The subgoal's own summaries are authoritative. The parent's `finalize-goal` prompt should be updated to handle subgoal steps — it reads from the subgoal workspace instead of the parent step directory. This is a **new logic** change to `src/prompts/finalize-goal.md` (prompt-level, not code).

**Future consideration:** If wrapper summaries are needed for parent-level reporting, a `postExecute` hook on `finalize-goal` could generate a summary from the subgoal's accumulated `SUMMARY.md` files and write it to the parent step. This would require the explicit `writeAllowlist` enhancement from Dimension 5 (cross-directory writes).

#### APPROVED marker semantics

**Question:** After `review-task` approves, it writes `APPROVED`. For a subgoal step, does `APPROVED` still apply?

**Analysis:** The subgoal lifecycle replaces `execute-task → review-task`. The subgoal has its own `review-task` sessions for its own steps. When the subgoal completes (`finalize-goal`), the subgoal's steps are all approved. The parent step does not go through `review-task` — it goes through `evolve-plan → create-goal (subgoal) → ... → finalize-goal (subgoal) → evolve-plan (parent)`.

**Options:**

1. **No APPROVED for subgoal steps (recommended):** The subgoal completion implicitly approves the parent step. The `APPROVED` marker is a step-level artifact of the `review-task` cycle. Subgoal steps bypass `review-task` at the parent level. The subgoal's own `APPROVED` markers (inside the subgoal workspace) are the authority.

2. **Automatic APPROVED on subgoal completion:** When `finalize-goal` routes to the parent's `evolve-plan`, also write `APPROVED` to the parent's `S{NN}/`. This requires cross-directory writes.

3. **Parent review-task still runs:** After subgoal completion, the parent's `review-task` runs for the step. This would review the subgoal's outputs. However, the parent's `review-task` prompt expects `SUMMARY.md` from `execute-task` — a subgoal's outputs are in a different directory structure.

**Recommendation: Option 1 (no APPROVED for subgoal steps).** The subgoal completion is the approval. The `currentStepNumber()` method in `GoalState` checks for `APPROVED` to advance past a step. For subgoal steps, the state machine transition (`stepNumber: parentStepNumber + 1`) advances past the step — `currentStepNumber()` is not consulted for this advancement.

**Edge case:** If the parent's `currentStepNumber()` is called (e.g., by `evolve-plan` auto-discovery), it would see the subgoal step as not `APPROVED` and return it as the current step. This is resolved by the explicit `stepNumber` in the transition params — `evolve-plan` receives `stepNumber: parentStepNumber + 1` and does not auto-discover.

#### LAST_TASK.json

**Question:** Does `writeLastTask()` record in the subgoal dir or the parent dir?

**Analysis:** `writeLastTask(goalDir, task)` in `src/queues.ts` writes to `<goalDir>/LAST_TASK.json`. In `pio_mark_complete` (`session-capability.ts`, line 166), `goalDir` is `dir` (the `workingDir` of the completing session). For a subgoal's `finalize-goal`, this is the subgoal directory.

Similarly, `recordTransition(dir, capability, nextTask)` (`session-capability.ts`, line 162) appends to `<dir>/transitions.json`. Both calls use `dir` — the completing session's `workingDir` — which is the subgoal directory for subgoal sessions and the parent directory for parent sessions. The completing session's `dir` is always correct for both calls: `recordTransition` logs the transition that just completed (belongs to the completing workspace), and `writeLastTask` records what the completing session just finished (belongs to the completing workspace). Neither needs the transition's target directory.

**Current behavior:** Both `writeLastTask` and `recordTransition` write to the subgoal's directory. This is correct — they record the last completed task and transition audit entry for the subgoal workspace. The parent's `LAST_TASK.json` and `transitions.json` are unaffected.

**Required change:** None. Each workspace maintains its own `LAST_TASK.json`. The parent workspace's `LAST_TASK.json` records the last task completed in the parent workspace (e.g., `evolve-plan` for step N). The subgoal's `LAST_TASK.json` records the last task completed in the subgoal (e.g., `finalize-goal`).

### Part D: Required code changes and integration points

For the recommended mechanism (Mechanism 1: state machine routing), the following changes are required:

#### `src/state-machine.ts`

| Function | Change Type | Description |
|----------|-------------|-------------|
| `transitionFinalizeGoal()` | **new logic** | New function. Checks for `parentGoalName` and `parentStepNumber` in params. Returns `evolve-plan` for the parent with `stepNumber: parentStepNumber + 1`. Returns `undefined` for top-level goals (terminal, unchanged). |
| `resolveTransition()` | **new logic** | Replace inline `return undefined` for `finalize-goal` with `return transitionFinalizeGoal(state, params)`. No other switch cases change. |
| `extractParentGoalName()` | **new fields** | New helper (analogous to `extractGoalName`). Extracts `parentGoalName` from params if it's a string. Can be inlined or extracted — same pattern as existing extractors. |
| `extractParentStepNumber()` | **new fields** | New helper (analogous to `extractStepNumber`). Extracts `parentStepNumber` from params if it's a number. |

**No breaking changes.** All modifications are additive:
- `transitionFinalizeGoal` is a new function — the inline `undefined` is replaced with a function call that returns `undefined` for the top-level case.
- New param extractors follow the existing pattern (`extractGoalName`, `extractStepNumber`).
- Existing callers without `parentGoalName` params see identical behavior.

#### `src/capabilities/session-capability.ts`

| Function/Area | Change Type | Description |
|---------------|-------------|-------------|
| `pio_mark_complete` execute handler | **new logic** | When `resolveTransition` returns a next task, the `enqueueTask` call must use the transition's `params.goalName` (not `state.goalName`) for the queue key. This is critical: after subgoal completion, the transition's `goalName` is the parent's name. Enqueuing to the parent's queue slot restores the parent's task. |

**Detailed analysis of the `pio_mark_complete` change:**

Current code (lines 100–130):
```typescript
const state = createGoalState(dir);
const goalName = state.goalName;
// ...
const nextTask = capability
  ? resolveTransition(capability, state, { goalName, stepNumber, _sessionContext: sessionParams })
  : undefined;
if (nextTask && capability) {
  // ...
  enqueueTask(process.cwd(), goalName, {  // ← uses state.goalName
    capability: nextTask.capability,
    params: { goalName, ...adjustedParams, ... },
  });
}
```

For a subgoal's `finalize-goal`:
- `dir` is the subgoal's `workingDir` (e.g., `.../S03/subgoals/nested/`)
- `state.goalName` is `"nested"` (basename of subgoal dir)
- `resolveTransition` returns `{ capability: "evolve-plan", params: { goalName: "parent", stepNumber: 4 } }`
- `enqueueTask(process.cwd(), "nested", ...)` enqueues to `task-nested.json` — **wrong**. Should enqueue to `task-parent.json`.

**Fix:** Use `nextTask.params?.goalName` for `enqueueTask` when it differs from `state.goalName`:
```typescript
const enqueueGoalName = typeof nextTask.params?.goalName === "string"
  ? nextTask.params.goalName
  : goalName;
enqueueTask(process.cwd(), enqueueGoalName, {
  capability: nextTask.capability,
  params: {
    goalName: enqueueGoalName,
    ...adjustedParams,
    _sessionContext: sessionParams,
    ...(finalStepNumber != null ? { stepNumber: finalStepNumber } : {}),
  },
});
```

**Categorization:** **new logic** — modifies the enqueueing logic to respect the transition's `goalName`. Non-breaking — for top-level goals, `nextTask.params?.goalName` equals `state.goalName`, so behavior is identical.

**Additionally,** `recordTransition` (`session-capability.ts`, line 162) and `writeLastTask` (`session-capability.ts`, line 166) use the completing session's `dir` (the subgoal dir), not the transition's target dir. This is already correct — `dir` is `config.workingDir`, the completing session's working directory. `recordTransition` logs the transition that just completed (belongs to the completing workspace), and `writeLastTask` records what the completing session just finished (belongs to the completing workspace). Neither needs the transition's target directory. No change needed.

#### `src/capabilities/finalize-goal.ts`

| Function/Area | Change Type | Description |
|---------------|-------------|-------------|
| `validateFinalizeGoal` | no change | Checks `state.goalCompleted()` — works correctly for nested paths if `goalDir` is resolved correctly. If `resolveGoalDir` cannot resolve nested paths, explicit `params.goalDir` is the workaround (already supported via the command handler). |
| `CAPABILITY_CONFIG` | no change | Write allowlist and initial message are unchanged. Subgoal `finalize-goal` sessions operate on the subgoal workspace — same behavior as top-level goals. |

**Analysis:** `validateFinalizeGoal` calls `resolveGoalDir(cwd, name)` to get the goal directory. For a subgoal, this would produce a flat path (`.pio/goals/nested/`) — incorrect. However, the `pio_mark_complete` path does not call `validateFinalizeGoal` — it calls `resolveTransition` directly with the `GoalState` created from `config.workingDir`. The `validateFinalizeGoal` function is used by the tool handler and command handler, not by `pio_mark_complete`.

**For the tool/command path:** When a user invokes `pio_finalize_goal` or `/pio-finalize-goal` for a subgoal, `resolveGoalDir` produces a flat path. This would fail for subgoals. However, subgoals are not expected to be finalized by the user directly — they complete automatically through the state machine (`finalize-goal` → `evolve-plan`). The tool/command path is for top-level goals only.

**Required change:** None for the initial implementation. If subgoal `finalize-goal` needs to be invocable via tool/command, `resolveGoalDir` must support nested paths (Dimension 8).

#### `src/goal-state.ts`

| Function/Area | Change Type | Description |
|---------------|-------------|-------------|
| `goalCompleted()` | no change | Checks `<goalDir>/COMPLETED` — works correctly for nested paths. `goalDir` is the subgoal directory. The COMPLETED marker exists at the subgoal root. `fs.existsSync` works regardless of nesting depth. |
| `createGoalState` (cwd derivation) | no change | Confirmed correct in Dimension 1. `indexOf("/goals/")` + `path.dirname()` handles nested paths. |
| `pendingTask()` | no change | Uses `goalName` for queue key. For subgoals, the qualified key (Dimension 2) would be needed. However, `pendingTask()` is not called during the propagation path — `pio_mark_complete` uses `enqueueTask` directly with the transition's `goalName`. |

**Verification:** `goalCompleted()` works correctly for nested paths. It checks `fs.existsSync(path.join(goalDir, "COMPLETED"))` — if `goalDir` is the subgoal directory, this correctly finds the subgoal's COMPLETED marker. No changes needed.

#### Param pollution analysis

**Risk:** `parentGoalName` and `parentStepNumber` could leak into downstream transitions via `_sessionContext` propagation.

**Analysis:** In `session-capability.ts`, `pio_mark_complete` propagates params as:
```typescript
enqueueTask(cwd, goalName, {
  capability: nextTask.capability,
  params: {
    goalName,
    ...adjustedParams,
    _sessionContext: sessionParams,
    ...(finalStepNumber != null ? { stepNumber: finalStepNumber } : {}),
  },
});
```

`_sessionContext` contains the original session params. If a subgoal session has `parentGoalName` in its params, this would be included in `_sessionContext` of the parent's `evolve-plan` task. However, `transitionFinalizeGoal` checks for `parentGoalName` as a **top-level param** — it does not look inside `_sessionContext`. This prevents accidental activation from nested contexts.

**Mitigation:** `transitionFinalizeGoal` must explicitly check `params?.parentGoalName` (top-level only) and NOT recurse into `_sessionContext`. This is the default behavior — no change needed.

**Additional safeguard:** The transition params from `transitionFinalizeGoal` do NOT include `parentGoalName` or `parentStepNumber`. The parent's `evolve-plan` task receives `{ goalName: parentGoalName, stepNumber: parentStepNumber + 1 }` — no parent context. This prevents the parent from being treated as a subgoal of its own parent.

### Part E: Cross-references to other dimensions

#### Dimension 2 (Queue keying)

When the subgoal completes, the parent's queue slot must be restored with the correct key. `pio_mark_complete` calls `enqueueTask(cwd, enqueueGoalName, task)` where `enqueueGoalName` is derived from the transition's `params.goalName` (the parent's flat name). For a top-level parent goal, this is a flat key (`"parent"`) — `enqueueTask` produces `task-parent.json`. No hierarchical keying is needed for the parent's queue slot restoration.

**Interaction:** Dimension 2's `deriveQueueKey` is not needed for the parent queue restoration — the parent's `goalName` is a flat string. However, if the parent is itself a subgoal (recursive nesting), the parent's `goalName` would be a hierarchical key. The `pio_mark_complete` fix (using transition's `params.goalName`) handles this correctly — it uses whatever `goalName` the transition provides, flat or hierarchical.

#### Dimension 3 (State machine extensions)

Dimension 3 recommended `finalize-goal` → parent's `evolve-plan` as the completion propagation mechanism. Dimension 7 verifies this holds under detailed analysis and provides the specific code changes:
- `transitionFinalizeGoal` function (new logic in `src/state-machine.ts`)
- `pio_mark_complete` enqueueing fix (new logic in `src/capabilities/session-capability.ts`)
- Param scoping strategy (no changes — existing `_sessionContext` isolation is sufficient)

Dimension 3 identified the high-level approach; Dimension 7 provides the implementation details.

#### Dimension 5 (File protection)

The recommended mechanism (Mechanism 1) does not require cross-directory writes from the subgoal session. The subgoal's `finalize-goal` writes only to its own workspace (PROJECT docs). The propagation is handled by the state machine transition and `pio_mark_complete` enqueuing — both operate on queue files in `.pio/session-queue/`, not on goal workspace files.

**No file protection changes required.** The subgoal session does not write to parent-level files. The parent step markers (`COMPLETED`, `SUMMARY.md`, `APPROVED`) are not written by the subgoal session — they are derived from the subgoal's `COMPLETED` marker and the state machine transition.

#### Dimension 8 (GoalState and path resolution)

`goalCompleted()` works correctly for nested paths — it checks `<goalDir>/COMPLETED` and `goalDir` is the subgoal directory. The cwd derivation in `createGoalState()` is confirmed correct (Dimension 1). No additional changes to `GoalState` are required for completion propagation.

**However,** `validateFinalizeGoal` in `src/capabilities/finalize-goal.ts` calls `resolveGoalDir(cwd, name)` which produces flat paths. If `finalize-goal` needs to be invocable for subgoals via the tool/command path, `resolveGoalDir` must support nested paths. This is a Dimension 8 concern — deferred to the path resolution strategy.

### Edge cases

#### Subgoal fails without COMPLETED (BLOCKED)

If a subgoal is `BLOCKED` instead of `COMPLETED`, the propagation mechanism should not trigger. Analysis:

- `validateFinalizeGoal` checks `state.goalCompleted()` — returns `false` if `COMPLETED` is missing. The `finalize-goal` session will not start.
- If a subgoal step is `BLOCKED`, the `evolve-plan` session would see the step as blocked and... actually, `evolve-plan` doesn't check step status. It finds the next incomplete step and produces TASK.md/TEST.md.
- **Gap:** If a subgoal is blocked, the parent step is stuck. The parent's `evolve-plan` cannot proceed past the blocked step. The user must manually resolve the block (e.g., delete the `BLOCKED` marker, fix the issue, and re-run the subgoal).
- **Recommendation:** Document this as a known limitation. The user must intervene to resolve blocked subgoals. The state machine does not automatically handle blocked subgoals — this is consistent with how blocked regular steps are handled (user intervention required).

#### SUMMARY.md content gap

The parent's `S{NN}/` directory may lack a `SUMMARY.md` if the subgoal doesn't write one and no wrapper generates it. This affects the parent's `finalize-goal` session, which reads per-step summaries.

**Impact:** The parent's `finalize-goal` would skip the subgoal step's summary. The subgoal's own summaries are available in the subgoal workspace but require the `finalize-goal` prompt to be subgoal-aware.

**Recommendation:** Accept the gap for the initial implementation. Update the `finalize-goal` prompt to handle subgoal steps (read from subgoal workspace). This is a prompt-level change — **new logic** in `src/prompts/finalize-goal.md`.

#### APPROVED marker semantics

If the subgoal lifecycle bypasses `review-task`, the parent step never gets reviewed at the parent level. The subgoal's own `review-task` sessions review the subgoal's steps. The parent step is implicitly approved when the subgoal completes.

**Is automatic approval acceptable?** Yes — the subgoal's `review-task` sessions provide the quality gate. The parent step's approval is a consequence of the subgoal's completion. If the subgoal's review rejects a step, the subgoal re-executes that step. The parent is unaffected until the subgoal completes.

**Future consideration:** If parent-level review of subgoal outputs is desired, a `review-task` could run for the parent step after subgoal completion. This would require the `review-task` prompt to understand subgoal outputs (different directory structure). Defer to future enhancement.

#### Queue slot timing

The subgoal's queue slot must be cleaned up and the parent's restored. Analysis:

1. Subgoal spawns: `evolve-plan` routes to `create-goal` with subgoal params. `pio_mark_complete` enqueues to the subgoal's queue slot (`task-nested.json` or hierarchical key per Dimension 2).
2. Subgoal runs: Queue slot contains the subgoal's pending task. Parent's queue slot is unaffected (parent is not active).
3. Subgoal completes: `finalize-goal` → `pio_mark_complete` → `resolveTransition` returns `evolve-plan` for parent → `enqueueTask` with parent's `goalName` → writes to `task-parent.json`.
4. Parent resumes: `/pio-next-task` reads `task-parent.json` and launches `evolve-plan`.

**No race conditions:** The subgoal's queue slot and the parent's queue slot are independent files. `enqueueTask` overwrites atomically (single file write). No concurrent access — sub-session model serializes execution.

**Stale entries:** The subgoal's queue file (`task-nested.json`) remains after completion. It's not cleaned up. This is acceptable — the file is stale but harmless. Future cleanup could delete completed queue files in `pio_mark_complete`.

#### Multiple subgoals per step (future consideration)

Currently one subgoal per step. If multiple subgoals are needed per step in the future, completion semantics change — the parent step would need all subgoals to complete before advancing. This is a future constraint, not an immediate requirement. The current design (one subgoal per step) is sufficient for the initial implementation.

### Summary of changes (Dimension 7)

| File | Function/Area | Change Type | Description |
|------|--------------|-------------|-------------|
| `src/state-machine.ts` | `transitionFinalizeGoal()` | **new logic** | New function. Checks `parentGoalName`/`parentStepNumber` in params. Returns `evolve-plan` for parent, `undefined` for top-level goals. |
| `src/state-machine.ts` | `resolveTransition()` | **new logic** | Replace inline `undefined` for `finalize-goal` with `transitionFinalizeGoal(state, params)`. |
| `src/state-machine.ts` | `extractParentGoalName()` | **new fields** | New param extractor (follows existing pattern). |
| `src/state-machine.ts` | `extractParentStepNumber()` | **new fields** | New param extractor (follows existing pattern). |
| `src/capabilities/session-capability.ts` | `pio_mark_complete` | **new logic** | Use transition's `params.goalName` for `enqueueTask` when it differs from `state.goalName`. Enables parent queue slot restoration. |
| `src/capabilities/finalize-goal.ts` | `validateFinalizeGoal` | no change | Works for nested paths if `goalDir` is resolved correctly. Tool/command path deferred to Dimension 8. |
| `src/goal-state.ts` | `goalCompleted()` | no change | Checks `<goalDir>/COMPLETED` — correct for nested paths. |
| `src/goal-state.ts` | `createGoalState` (cwd) | no change | Confirmed correct for nested paths (Dimension 1). |
| `src/prompts/finalize-goal.md` | Prompt instructions | **new logic** | Handle subgoal steps — read summaries from subgoal workspace. |

**No breaking changes identified.** All modifications are additive:
- New function `transitionFinalizeGoal` — existing `finalize-goal` behavior is preserved (returns `undefined` for top-level goals).
- New param extractors — follow existing patterns, no API changes.
- `pio_mark_complete` change — backward compatible (flat goals: transition's `goalName` equals `state.goalName`).
- Prompt-level changes — no code modifications.

[End of Dimension 7 analysis]

## Dimension 8: GoalState and path resolution changes

### Problem statement

Every function that derives, resolves, or traverses goal workspace paths must be audited for flat-path assumptions. With nested subgoal paths at `S{NN}/subgoals/<name>/` (e.g., `<cwd>/.pio/goals/parent/S03/subgoals/nested/`), any code that splits on `/goals/`, uses `goalName` as a basename, or constructs paths via `resolveGoalDir(cwd, goalName)` must be examined. This dimension consolidates findings from Dimensions 1–7 into a systematic inventory.

### Comprehensive function inventory

#### `src/goal-state.ts`

| Function | Line | Flat-path assumption | Impact of nesting | Resolution strategy | Change category |
|----------|------|---------------------|-------------------|---------------------|-----------------|
| `createGoalState(goalDir)` — cwd derivation | 168 | `goalDir.indexOf("/goals/")` + `path.dirname()` to extract cwd | **No impact.** `indexOf("/goals/")` finds the first occurrence at the `.pio/goals/` boundary. For nested path `/repo/.pio/goals/parent/S03/subgoals/nested/`, it extracts `/repo/.pio`, then `path.dirname()` produces `/repo` — correct at all depths. Verified in Dimension 1. | No change required. | no change |
| `goalName` derivation | 163 | `path.basename(goalDir)` — extracts leaf directory name only | For nested subgoal at `.../subgoals/nested/`, `goalName` is `"nested"` — correct for the subgoal's own identity but loses parent context. Used downstream for queue keying (`task-${goalName}.json`), session naming, and display. Sibling subgoals with the same name under different parents collide on queue filenames. | Accept optional `qualifiedName` parameter, or derive hierarchical name from full path using `deriveQueueKey` helper (Dimension 2). | **new fields** (optional parameter) |
| `steps()` method | 236–254 | Scans `goalDir` for `/^S(\d+)$/` directories (regex at line 17) | **No impact.** For a nested subgoal workspace, `steps()` scans the subgoal's own directory for `S{NN}/` folders — correct behavior. The `subgoals/` directory does not match `/^S(\d+)$/` and is correctly skipped. Parent's `steps()` scans `.pio/goals/parent/` directly, not inside `S03/`. | No change required. | no change |
| `currentStepNumber()` | 258–277 | Sequential scan: iterates `S01/`, `S02/`, etc. inside `goalDir` | **No impact.** Same reasoning as `steps()` — scans the goal directory directly for `S{NN}/` folders. Works correctly whether `goalDir` is flat or nested. | No change required. | no change |
| `pendingTask()` | 283–284 | Constructs `cwd/.pio/session-queue/task-${goalName}.json` using `goalName` from `path.basename(goalDir)` | **Breaks for nested subgoals.** `goalName` is just the leaf name (`"nested"`). Queue filename `task-nested.json` collides with flat goals or sibling subgoals named `"nested"`. | Use `deriveQueueKey(goalDir, cwd)` helper (Dimension 2) to produce hierarchical keys. Compute qualified key at construction time from `goalDir` and `cwd`. | **new logic** |
| `lastCompleted()` | 295–303 | Reads `<goalDir>/LAST_TASK.json` | **No impact.** `goalDir` is the correct goal workspace directory (flat or nested). File read is relative to `goalDir` — works at any depth. | No change required. | no change |
| `getReviewOutputs()` | 311–338 | Reads `<goalDir>/S{NN}/REVIEW.md` | **No impact.** Path construction is relative to `goalDir`. Works correctly for nested paths. | No change required. | no change |
| `goalCompleted()` | 344–347 | Checks `<goalDir>/COMPLETED` | **No impact.** `fs.existsSync` works regardless of nesting depth. Confirmed in Dimension 7. | No change required. | no change |
| `planMetadata()` / `totalPlanSteps()` | 189–222 | Reads `<goalDir>/PLAN.md` | **No impact.** Path construction is relative to `goalDir`. Works correctly for nested paths. | No change required. | no change |

#### `src/fs-utils.ts`

| Function | Line | Flat-path assumption | Impact of nesting | Resolution strategy | Change category |
|----------|------|---------------------|-------------------|---------------------|-----------------|
| `resolveGoalDir(cwd, name)` | 9–10 | `path.join(cwd, ".pio", "goals", name)` — always produces flat paths | **Breaks for nested subgoals.** `resolveGoalDir(cwd, "nested")` produces `.pio/goals/nested/` — not `.pio/goals/parent/S03/subgoals/nested/`. This is the single most widespread flat-path assumption in the codebase (see capability files below). | Add optional `parentStepDir` parameter for nested resolution: `path.join(parentStepDir, "subgoals", name)`. Alternatively, detect hierarchical names (containing `__`) and reconstruct nested paths. See resolution strategy section below. | **new logic** (non-breaking extension) |
| `goalExists(goalDir)` | 14–15 | `fs.existsSync(goalDir)` — checks if a directory exists | **No impact.** Works with any path — flat or nested. The caller must pass the correct `goalDir`. | No change required. | no change |
| `deriveSessionName(goalName, capability, stepNumber)` | 81–90 | Uses raw `goalName` for display: `` `${goalName} ${capability}` `` | For qualified name `parent__S03__nested`, produces `parent__S03__nested execute-task s1` — functional but not ideal for display. The `__` delimiters are queue keying artifacts, not intuitive display separators. | Format qualified names by replacing `__` with `/`: `parent/S03/nested execute-task s1`. Non-breaking — flat names pass through unchanged. Cross-reference: Dimension 6 recommends this exact change. | **new logic** (cosmetic, non-breaking) |
| `stepFolderName(stepNumber)` | 96–97 | `S${String(stepNumber).padStart(2, "0")}` — formats step number | **No impact.** Pure formatting — no path assumptions. | No change required. | no change |
| `discoverNextStep(goalDir)` | 105–122 | Scans `goalDir` for `S{NN}/` folders, checks for `TASK.md` + `TEST.md` | **No impact.** Scans a given directory — works correctly if passed the right `goalDir` (subgoal's own directory). The `subgoals/` directory does not match the `S{NN}` pattern and is correctly skipped. | No change required. | no change |

#### `src/capability-config.ts`

| Function | Line | Flat-path assumption | Impact of nesting | Resolution strategy | Change category |
|----------|------|---------------------|-------------------|---------------------|-----------------|
| `resolveCapabilityConfig()` — workingDir derivation | 44 | Falls back to `resolveGoalDir(cwd, goalName)` when no explicit `params.workingDir` is provided | For subgoals, `resolveGoalDir(cwd, "nested")` produces `.pio/goals/nested/` — a wrong flat path. The subgoal session would operate on the wrong directory. Cross-reference: Dimension 5 identifies this as the `workingDir` assignment gap. | The spawning transition must pass explicit `params.workingDir` for nested subgoals (Dimension 5 recommendation). This bypasses `resolveGoalDir` entirely. No code change needed here — the fix is in the caller (`transitionEvolvePlan`). | no change (fix is in caller) |
| `resolveCapabilityConfig()` — session name derivation | 81 | Calls `deriveSessionName(goalName, cap, stepNumber)` | Receives improved output automatically when `deriveSessionName` is updated (see `fs-utils.ts` above). | No change required — receives improved output from `deriveSessionName`. | no change |

#### `src/state-machine.ts`

| Function | Line | Flat-path assumption | Impact of nesting | Resolution strategy | Change category |
|----------|------|---------------------|-------------------|---------------------|-----------------|
| `transitionEvolvePlan()` — finalize-goal routing | 77 | `resolveGoalDir(cwd, goalName!)` to compute `goalDir` for the `finalize-goal` transition | For a nested subgoal completing via `finalize-goal`, this produces an incorrect flat path. However, the `goalDir` passed to `finalize-goal` is used for the `workingDir` parameter — the actual goal directory resolution for subgoals should come from explicit params (Dimension 5). Cross-reference: Dimension 7 confirms this interaction. | The spawning transition should pass `goalDir` explicitly in params for subgoals. For top-level goals, existing behavior is unchanged. | **new logic** (in spawning transition, not here) |
| `resolveGoalDir` re-export | 29 | `export { stepFolderName, resolveGoalDir }` from `fs-utils` | API surface awareness — downstream consumers importing from `state-machine.ts` get the flat-path version. | No functional change needed. Document for API surface awareness. | no change |
| `recordTransition(goalDir, ...)` | 212 | Writes to `<goalDir>/transitions.json` | **No impact.** `goalDir` is passed as a parameter — if the caller provides the correct nested path, this works correctly. Cross-reference: Dimension 7 confirms `recordTransition` uses the completing session's `workingDir`, which is correct for both flat and nested goals. | No change required. | no change |

#### `src/queues.ts`

| Function | Line | Flat-path assumption | Impact of nesting | Resolution strategy | Change category |
|----------|------|---------------------|-------------------|---------------------|-----------------|
| `enqueueTask(cwd, goalName, task)` | 28 | Constructs `task-${goalName}.json` | With `goalName = "nested"` (leaf name from `path.basename`), produces `task-nested.json` — collides with flat goals or sibling subgoals named `"nested"`. Cross-reference: Dimension 2 analyzes this in detail and recommends hierarchical keys. | Add optional `qualifiedName` parameter. When present, use it as the queue key. Derive key via `deriveQueueKey` helper (Dimension 2). | **new logic** |
| `readPendingTask(cwd, goalName)` | 38 | Same as `enqueueTask` — looks up `task-${goalName}.json` | Must use identical key format as `enqueueTask` for round-trip fidelity. Same collision risk. | Same parameter change as `enqueueTask`. | **new logic** |
| `listPendingGoals(cwd)` | 50–58 | Extracts goal name by stripping `task-` prefix and `.json` suffix | With hierarchical keys like `task-parent__S03__nested.json`, extraction returns `parent__S03__nested`. Downstream code (e.g., `/pio-list-goals`) calls `resolveGoalDir(cwd, goalName)` — which cannot reconstruct nested paths from hierarchical names without the `resolveGoalDir` change (Dimension 1/8). | Return qualified names. Downstream callers must handle hierarchical names via the updated `resolveGoalDir`. | **new logic** |
| `writeLastTask(goalDir, task)` | 68–70 | Writes to `<goalDir>/LAST_TASK.json` | **No impact.** `goalDir` is the correct goal workspace directory. Works at any nesting depth. | No change required. | no change |
| `queueDir(cwd)` | 16 | `path.join(cwd, ".pio", "session-queue")` | **No impact.** Queue directory is always `.pio/session-queue/` — independent of goal nesting. Cwd derivation is correct (Dimension 1). | No change required. | no change |

#### `src/capabilities/list-goals.ts`

| Function | Line | Flat-path assumption | Impact of nesting | Resolution strategy | Change category |
|----------|------|---------------------|-------------------|---------------------|-----------------|
| `handleListGoals()` — directory scanning | 58 | `path.join(ctx.cwd, ".pio", "goals")` — scans `.pio/goals/*/` as flat directories | **Misses nested subgoals entirely.** `fs.readdirSync(goalsBaseDir)` returns only top-level goal directories. Subgoals at `parent/S03/subgoals/nested/` are invisible. | Option A: Recursive scan — walk the directory tree to find all goal workspaces. Option B: Flag-based listing — add `--include-subgoals` flag. Option C: List only top-level goals (current behavior) — subgoals are listed under their parent. | **new logic** |
| `handleListGoals()` — goal resolution | 75 | `resolveGoalDir(ctx.cwd, name)` for each directory entry | For top-level goals, this is correct. Cannot resolve nested subgoal paths without the `resolveGoalDir` change. | After `resolveGoalDir` is updated, this works for hierarchical names returned by `listPendingGoals`. | no change (depends on `resolveGoalDir` fix) |
| `inferPhase(goalDir)` | 18–39 | Scans `goalDir` for `S{NN}` folders with `TASK.md` | **No impact.** Works with any `goalDir` — flat or nested. Uses regex `/^S\d{2}$/` which is safe with `subgoals/` marker. | No change required. | no change |
| `readLastTask(goalDir)` | 41–51 | Reads `<goalDir>/LAST_TASK.json` | **No impact.** Works with any `goalDir`. | No change required. | no change |

#### `src/capabilities/session-capability.ts`

| Function | Line | Flat-path assumption | Impact of nesting | Resolution strategy | Change category |
|----------|------|---------------------|-------------------|---------------------|-----------------|
| `pio_mark_complete` — enqueueing | 151 | `enqueueTask(process.cwd(), goalName, ...)` where `goalName = state.goalName` | For subgoal completion, `state.goalName` is the subgoal's leaf name. Enqueues to the subgoal's queue slot instead of the parent's. Cross-reference: Dimension 7 identifies this as a critical fix — use transition's `params.goalName` for `enqueueTask`. | Use `nextTask.params?.goalName` for `enqueueTask` when it differs from `state.goalName`. Enables parent queue slot restoration on subgoal completion. | **new logic** |
| `pio_mark_complete` — `writeLastTask` | 166 | `writeLastTask(dir, ...)` where `dir = config.workingDir` | **No impact.** `dir` is the completing session's `workingDir` — correct for both flat and nested goals. Cross-reference: Dimension 7 confirms this. | No change required. | no change |
| `pio_mark_complete` — `recordTransition` | 165 | `recordTransition(dir, ...)` where `dir = config.workingDir` | **No impact.** Same reasoning as `writeLastTask`. | No change required. | no change |
| `before_agent_start` — step discovery | 246 | `discoverNextStep(config.workingDir)` | **No impact.** `discoverNextStep` scans a given directory — works correctly with nested `workingDir`. Cross-reference: `fs-utils.ts` entry above. | No change required. | no change |

#### Capability files that call `resolveGoalDir(cwd, name)`

Every capability that uses `resolveGoalDir` to construct `goalDir` from a `goalName` parameter must be audited. The pattern is identical across all files: `resolveGoalDir(cwd, name)` produces flat paths that cannot resolve nested subgoals. The fix is centralized in `resolveGoalDir` itself (see resolution strategy below) — once `resolveGoalDir` supports nested resolution, all these call sites are fixed automatically.

| File | Line(s) | Function | Impact | Resolution |
|------|---------|----------|--------|------------|
| `src/capabilities/create-goal.ts` | 38 | `prepareGoal()` | Creates new goal workspaces. For nested subgoals, must accept parent context to compute nested paths. | Fixed by `resolveGoalDir` extension. Spawning transition passes explicit `workingDir` (Dimension 5). |
| `src/capabilities/create-plan.ts` | 90 | `validateGoal()` | Reads PLAN.md from goal dir. Affected if `goalName` resolves incorrectly. | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/evolve-plan.ts` | 91 | `validateAndFindNextStep()` | Same pattern. Must receive correct `goalDir` via params for subgoals. | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/execute-task.ts` | 105, 165 | `validateGoal()`, `validateGoalWithStep()` | Reads TASK.md, writes SUMMARY.md. Same issue. | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/review-task.ts` | 205, 285 | `validateGoal()`, `validateGoalAuto()` | Reads REVIEW.md, writes markers. Same issue. | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/revise-plan.ts` | 35 | `validateGoal()` | Archives PLAN.md. Same issue. | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/finalize-goal.ts` | 52 | `validateFinalizeGoal()` | Writes COMPLETED marker. Same issue. | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. Cross-reference: Dimension 7 notes tool/command path is for top-level goals only. |
| `src/capabilities/goal-from-issue.ts` | 33 | Tool handler | Creates goal from issue. **Top-level only by design** — issues are always top-level. No nested resolution needed. | No change required. Document assumption explicitly. |
| `src/capabilities/delete-goal.ts` | 13 | Tool handler | Deletes goal workspace. Would fail for nested paths with flat resolution. | Fixed by `resolveGoalDir` extension. Consider restricting to top-level goals only. |
| `src/capabilities/execute-plan.ts` | 34 | `validateGoal()` | Executes all steps. Same issue. | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |

#### Capability files that call `enqueueTask(cwd, name, ...)`

| File | Line | Function | Impact | Resolution |
|------|------|----------|--------|------------|
| `src/capabilities/create-goal.ts` | 69 | Tool handler | Enqueues `create-goal` task. Uses `params.name` (flat goal name). | No change for top-level goals. For subgoals, spawning transition uses state machine, not tool handler. |
| `src/capabilities/create-plan.ts` | 129 | Tool handler | Same pattern. | Same — top-level only via tool handler. |
| `src/capabilities/evolve-plan.ts` | 171 | Tool handler | Same pattern. | Same — top-level only via tool handler. |
| `src/capabilities/execute-task.ts` | 243 | Tool handler | Same pattern. | Same — top-level only via tool handler. |
| `src/capabilities/review-task.ts` | 351 | Tool handler | Same pattern. | Same — top-level only via tool handler. |
| `src/capabilities/revise-plan.ts` | 180 | Tool handler | Same pattern. | Same — top-level only via tool handler. |
| `src/capabilities/finalize-goal.ts` | 96 | Tool handler | Same pattern. | Same — top-level only via tool handler. |
| `src/capabilities/goal-from-issue.ts` | 61 | Tool handler | Same pattern. | Same — top-level only. |

**Note:** All `enqueueTask` calls in capability tool handlers use `params.name` (the user-provided goal name). These are top-level operations invoked by the user — they do not need nested resolution. The nested subgoal lifecycle is managed by the state machine and `pio_mark_complete`, which use the queue functions differently (see `session-capability.ts` entry above).

#### `src/guards/validation.ts`

| Function | Line | Flat-path assumption | Impact of nesting | Resolution strategy | Change category |
|----------|------|---------------------|-------------------|---------------------|-----------------|
| Write protection engine | 22 (comment) | Comment references `.pio/goals/my-feature` as an example path | **No impact.** The validation engine operates on `workingDir` passed as a parameter — it does not construct goal paths. The default-deny check (`tp.startsWith(workingDir + path.sep)`) is correct for nested paths. Cross-reference: Dimension 5 provides detailed analysis. | No change required. | no change |

#### `src/capabilities/next-task.ts`

| Function | Line | Flat-path assumption | Impact of nesting | Resolution strategy | Change category |
|----------|------|---------------------|-------------------|---------------------|-----------------|
| `readPendingTask(ctx.cwd, goalName)` | 19, 33, 54 | Reads `task-{goalName}.json` | With hierarchical queue keys (Dimension 2), `goalName` from `listPendingGoals` would be a qualified key (e.g., `parent__S03__nested`). `readPendingTask` must accept qualified keys. | `readPendingTask` fix (Dimension 2) handles this. The function accepts any string as `goalName` — it constructs the filename directly. Hierarchical keys work as-is. | no change (depends on Dimension 2 queue key format) |
| `listPendingGoals(ctx.cwd)` | 45 | Returns goal names from queue filenames | Returns qualified keys with hierarchical names. Downstream display and resolution must handle these. | `listPendingGoals` fix (Dimension 2) returns qualified names. `resolveGoalDir` extension reconstructs paths. | **new logic** (in `queues.ts`) |

### Resolution strategy

The core problem is centralized in `resolveGoalDir(cwd, name)` — every capability that constructs a goal directory from a goal name depends on this function. The recommended resolution has two parts:

#### Part 1: Explicit absolute paths via params (primary mechanism)

The spawning transition (`transitionEvolvePlan` routing to `create-goal` for a subgoal) must pass **explicit absolute paths** in params rather than relying on goal name resolution. Key changes:

- **New optional params:** `workingDir` (absolute path to the subgoal workspace), `parentGoalDir` (for context injection per Dimension 5)
- `capability-config.ts` already supports `params.workingDir` — it takes priority over `resolveGoalDir(cwd, goalName)`. No code change needed in the resolver.
- This is the approach already recommended by Dimension 5: the spawning transition constructs the nested path manually and passes it explicitly.

#### Part 2: `resolveGoalDir` extension (secondary mechanism)

For callers that cannot easily pass explicit paths (e.g., tool handlers invoked by the user, or `listPendingGoals` downstream resolution), extend `resolveGoalDir` to handle hierarchical names:

```typescript
export function resolveGoalDir(cwd: string, name: string, options?: { parentStepDir?: string }): string {
  // Option 1: explicit parent step directory (nested resolution)
  if (options?.parentStepDir) {
    return path.join(options.parentStepDir, "subgoals", name);
  }

  // Option 2: detect hierarchical names (e.g. "parent__S03__nested")
  if (name.includes("__")) {
    const segments = name.split("__");
    let currentPath = path.join(cwd, ".pio", "goals");
    for (const segment of segments) {
      // Reconstruct: parent/S03/subgoals/nested
      if (/^S\d{2}$/.test(segment)) {
        currentPath = path.join(currentPath, segment);
      } else {
        currentPath = path.join(currentPath, "subgoals", segment);
      }
    }
    return currentPath;
  }

  // Default: flat resolution (unchanged behavior)
  return path.join(cwd, ".pio", "goals", name);
}
```

**Backward compatibility:** Flat goal names (no `__`, no `parentStepDir`) produce identical output. Existing callers see no behavioral change.

#### Part 3: `deriveQueueKey` helper (new function in `queues.ts`)

```typescript
export function deriveQueueKey(goalDir: string, cwd: string): string {
  const pioGoalsPrefix = path.join(cwd, ".pio", "goals");
  const relativePath = goalDir.slice(pioGoalsPrefix.length + 1);
  const segments = relativePath.split(path.sep).filter(Boolean);
  // Filter out "subgoals" markers, keep parent name + step numbers + leaf name
  const keySegments = segments.filter(seg => seg !== "subgoals");
  return keySegments.join("__");
}
```

**Examples:**
- Flat goal `.pio/goals/my-feature/` → key: `my-feature` (unchanged)
- Subgoal `.pio/goals/parent/S03/subgoals/nested/` → key: `parent__S03__nested`
- Deep nesting `.pio/goals/parent/S03/subgoals/nested/S01/subgoals/deep/` → key: `parent__S03__nested__S01__deep`

This is the same algorithm proposed in Dimension 2. It enables `GoalState.pendingTask()` to compute the correct queue path.

### Change summary table

| File | Function | Change Category | Description |
|------|----------|-----------------|-------------|
| `src/goal-state.ts` | `createGoalState` (cwd derivation) | no change | `indexOf("/goals/")` + `path.dirname()` correctly handles all nesting depths (Dimension 1) |
| `src/goal-state.ts` | `goalName` derivation | **new fields** | Accept optional `qualifiedName` parameter for hierarchical identity |
| `src/goal-state.ts` | `pendingTask()` | **new logic** | Use `deriveQueueKey(goalDir, cwd)` for hierarchical queue path construction |
| `src/goal-state.ts` | `steps()`, `currentStepNumber()`, `goalCompleted()`, etc. | no change | All path operations are relative to `goalDir` — work at any depth |
| `src/fs-utils.ts` | `resolveGoalDir` | **new logic** | Extend to support nested resolution: optional `parentStepDir` param + hierarchical name detection |
| `src/fs-utils.ts` | `deriveSessionName` | **new logic** | Format qualified names: replace `__` with `/` for display (Dimension 6) |
| `src/fs-utils.ts` | `discoverNextStep`, `stepFolderName`, `goalExists` | no change | No flat-path assumptions |
| `src/capability-config.ts` | `resolveCapabilityConfig` | no change | Explicit `params.workingDir` already supported — fix is in the spawning transition |
| `src/state-machine.ts` | `transitionEvolvePlan` | **new logic** | Pass explicit `workingDir` for nested subgoals (Dimension 5). Construct nested path from parent context. |
| `src/state-machine.ts` | `recordTransition` | no change | Uses caller-provided `goalDir` — works with nested paths |
| `src/queues.ts` | `enqueueTask`, `readPendingTask` | **new logic** | Accept qualified names for hierarchical queue keys (Dimension 2) |
| `src/queues.ts` | `listPendingGoals` | **new logic** | Return qualified names. Downstream must handle hierarchical names. |
| `src/queues.ts` | `deriveQueueKey` (new) | **new logic** | New helper: derives `__`-delimited queue key from goal directory path |
| `src/queues.ts` | `writeLastTask`, `queueDir` | no change | No flat-path assumptions |
| `src/capabilities/list-goals.ts` | `handleListGoals` scanning | **new logic** | Recursive scan or flag-based listing to discover nested subgoals |
| `src/capabilities/session-capability.ts` | `pio_mark_complete` enqueueing | **new logic** | Use transition's `params.goalName` for `enqueueTask` (Dimension 7) |
| `src/capabilities/session-capability.ts` | `writeLastTask`, `recordTransition`, `discoverNextStep` | no change | Correct for nested paths |
| `src/capabilities/create-goal.ts` | `prepareGoal` | no change | Fixed by `resolveGoalDir` extension. Spawning transition passes explicit `workingDir`. |
| `src/capabilities/create-plan.ts` | `validateGoal` | no change | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/evolve-plan.ts` | `validateAndFindNextStep` | no change | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/execute-task.ts` | `validateGoal`, `validateGoalWithStep` | no change | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/review-task.ts` | `validateGoal`, `validateGoalAuto` | no change | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/revise-plan.ts` | `validateGoal` | no change | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/finalize-goal.ts` | `validateFinalizeGoal` | no change | Fixed by `resolveGoalDir` extension. Tool/command path is top-level only (Dimension 7). |
| `src/capabilities/goal-from-issue.ts` | Tool handler | no change | Top-level only by design — issues are always top-level goals. |
| `src/capabilities/delete-goal.ts` | Tool handler | no change | Fixed by `resolveGoalDir` extension. Consider restricting to top-level goals. |
| `src/capabilities/execute-plan.ts` | `validateGoal` | no change | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/next-task.ts` | `readPendingTask`, `listPendingGoals` | no change | Works with hierarchical keys (Dimension 2). No code changes needed. |

### Cross-references to prior dimensions

- **Dimension 1 (Nesting structure):** `resolveGoalDir` extension (new logic) is the primary enabler for nested path resolution. The `parentStepDir` parameter approach matches Dimension 1's recommendation. `createGoalState` cwd derivation requires no change — confirmed in both Dimension 1 and this dimension. `deriveSessionName` formatting (new logic) matches Dimension 1's recommendation.

- **Dimension 2 (Queue keying):** `deriveQueueKey` helper (new logic in `queues.ts`) is the canonical key derivation mechanism. `enqueueTask`, `readPendingTask`, and `listPendingGoals` all require the hierarchical key changes proposed in Dimension 2. `GoalState.pendingTask()` must use `deriveQueueKey` to compute the correct queue path.

- **Dimension 3 (State machine):** `transitionEvolvePlan` must pass explicit `workingDir` for nested subgoals (new logic). This is the spawning transition identified in Dimension 3 — it constructs the nested path and passes it as a param. The `resolveGoalDir` call at line 77 (for `finalize-goal` routing) is unaffected for top-level goals.

- **Dimension 5 (File protection):** The `workingDir` assignment gap is resolved by the spawning transition passing explicit `params.workingDir`. `capability-config.ts` requires no changes — the explicit `params.workingDir` path already exists. `list-goals.ts` scanning gap is documented but low-priority (subgoals are managed via the state machine, not listed by the user).

- **Dimension 6 (Session hierarchy):** `deriveSessionName` formatting (new logic) replaces `__` with `/` for display. This is a cosmetic change — it does not affect queue keying or path resolution.

- **Dimension 7 (Completion propagation):** `pio_mark_complete` enqueueing fix (new logic in `session-capability.ts`) uses transition's `params.goalName` for `enqueueTask`. `writeLastTask` and `recordTransition` require no changes — they use the completing session's `workingDir`, which is correct for both flat and nested goals.

### Risks and edge cases

| Risk | Mitigation |
|------|-----------|
| **`resolveGoalDir` complexity:** Adding hierarchical name detection and `parentStepDir` support increases function complexity. | Keep the flat path as the default code path. Nested resolution is an opt-in extension. Thoroughly test backward compatibility. |
| **Hierarchical name reconstruction ambiguity:** If a goal name contains `__`, reconstruction could produce incorrect paths. | Enforce slug-only goal names (alphanumeric + hyphens). `pio_create_goal` validates the `name` parameter. Document the constraint. |
| **`list-goals` recursive scanning performance:** Walking the directory tree could be slow for large projects with many nested subgoals. | Option B (flag-based listing) avoids the performance cost. Default behavior remains flat listing. |
| **Tool handler compatibility:** Tool handlers (`pio_create_goal`, `pio_execute_task`, etc.) accept `name` as a flat string. Subgoals are managed by the state machine, not invoked directly by users. | Document that tool handlers are for top-level goals only. Subgoal lifecycle is managed automatically by the state machine. |
| **`goal-from-issue` top-level assumption:** Issues are always top-level — `goal-from-issue` creates top-level goals only. | Document this assumption explicitly. No nested resolution needed for this capability. |

[End of Dimension 8 analysis]

## Dimension 9: Planning awareness

### Problem statement

Currently, PLAN.md has no per-step metadata — only `totalSteps` in frontmatter (defined by `PLAN_FRONTMATTER_SCHEMA` in `src/frontmatter-schemas.ts`). There is no way to mark "Step 3 is a subgoal step." The planning and specification layers have no mechanism to distinguish subgoal-type steps from regular steps. This dimension designs the signaling mechanism: schema changes, prompt modifications, and behavior divergence across `create-plan` and `evolve-plan`.

### 9a. Step-level metadata in PLAN.md

`PLAN_FRONTMATTER_SCHEMA` (`src/frontmatter-schemas.ts`, line 33) currently contains only:

```typescript
export const PLAN_FRONTMATTER_SCHEMA = Type.Object({
  totalSteps: Type.Integer({ minimum: 1 }),
});
```

Four options for per-step subgoal metadata are evaluated:

#### Option A: Frontmatter-only approach (`subgoalSteps` array)

Add a `subgoalSteps` array to the frontmatter listing which step numbers are subgoals:

```yaml
---
totalSteps: 5
subgoalSteps: [2, 4]
---
```

**Pros:**
- **Simple to parse:** Frontmatter is already parsed via `state.planMetadata()` in `GoalState`. Adding an optional array field is a one-line schema change.
- **Machine-readable:** The state machine can read `subgoalSteps` from frontmatter and route accordingly. No body parsing needed.
- **Compact:** Minimal token overhead in PLAN.md.

**Cons:**
- **Fragile synchronization:** If the plan body changes (steps reordered, added, or removed), the frontmatter array can drift out of sync. `postValidateCreatePlan()` would need to verify that every number in `subgoalSteps` corresponds to an actual step heading.
- **No subgoal name:** The array contains step numbers but not subgoal names. The system must derive subgoal names from step titles (slugification). This adds a derivation step with edge cases (generic titles, special characters).
- **Limited metadata:** Cannot express per-subgoal properties (e.g., custom subgoal name, priority, dependencies).

**Required schema change:**
```typescript
export const PLAN_FRONTMATTER_SCHEMA = Type.Object({
  totalSteps: Type.Integer({ minimum: 1 }),
  subgoalSteps: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }))),
});
```

**Impact on `postValidateCreatePlan()`:** Must verify that every value in `subgoalSteps` is ≤ `totalSteps` and corresponds to an actual `## Step N:` heading. This is a **new logic** addition to the validation function.

**Categorization:** **new fields** (optional field in `PLAN_FRONTMATTER_SCHEMA`). **new logic** (validation in `postValidateCreatePlan`).

#### Option B: In-body annotations

Mark subgoal steps in the markdown body with a convention in the step heading:

```markdown
## Step 1: Setup project structure

Regular step content...

## Step 2: Implement OAuth flow [subgoal]

This step requires its own plan with sub-steps for provider integration,
token management, callback handling, etc.

## Step 3: Add rate limiting

Regular step content...
```

**Pros:**
- **Backward compatible:** Existing plans without `[subgoal]` markers parse identically — all steps are regular steps. No migration needed.
- **Human-readable:** Anyone reading PLAN.md can immediately see which steps are subgoals. The marker is visible in the body, not hidden in frontmatter.
- **Flexible metadata:** The annotation can carry additional info: `[subgoal: oauth-flow]` provides both the type and the subgoal name explicitly.
- **Co-located with step content:** The marker lives next to the step description — if the step is reordered, the marker moves with it. No synchronization risk.

**Cons:**
- **Requires body parsing:** The state machine or `evolve-plan` must parse step headings to detect `[subgoal]` markers. This is a new parsing step — currently, `## Step N:` headings are only counted (via `STEP_HEADING_RE`), not individually analyzed.
- **Convention-dependent:** The `[subgoal]` syntax is a convention, not a schema. Typos (`[subgoa]`, `[Subgoal]`) would be silently ignored.
- **Regex complexity:** The heading regex (`/^## Step \d+:/gm`) must be extended to capture the full heading line, including any trailing annotation. This changes the matching logic in `postValidateCreatePlan()` and in `transitionEvolvePlan`.

**Required parsing change:**
```typescript
// Extended regex to capture heading + optional annotation
const STEP_HEADING_WITH_ANNOTATION_RE = /^## Step (\d+): (.+?)(?:\s+\[(.+?)\])?\s*$/gm;

// Usage:
let match;
while ((match = STEP_HEADING_WITH_ANNOTATION_RE.exec(planContent)) !== null) {
  const stepNumber = parseInt(match[1], 10);
  const title = match[2];
  const annotation = match[3]; // "subgoal" or "subgoal: oauth-flow" or undefined
  if (annotation?.startsWith("subgoal")) {
    // This is a subgoal step
  }
}
```

**Impact on `postValidateCreatePlan()`:** The heading count logic (`STEP_HEADING_RE`) must be updated to use the extended regex. The count remains the same (one match per step), but the regex is more permissive. Validation should optionally verify that `[subgoal]` annotations reference valid step numbers.

**Categorization:** **new logic** (parsing in `transitionEvolvePlan` and `postValidateCreatePlan`). No schema changes — `PLAN_FRONTMATTER_SCHEMA` is unaffected.

#### Option C: Steps array in frontmatter

Replace simple `totalSteps` with a full steps array:

```yaml
---
steps:
  - number: 1
    type: regular
    title: Setup project structure
  - number: 2
    type: subgoal
    subgoalName: oauth-flow
    title: Implement OAuth flow
  - number: 3
    type: regular
    title: Add rate limiting
---
```

**Pros:**
- **Most expressive:** Full per-step metadata including type, name, title, and future extensibility (dependencies, priority, etc.).
- **Machine-readable:** Directly parseable — no body parsing needed.
- **Explicit subgoal names:** No derivation needed — the subgoal name is stated explicitly.

**Cons:**
- **Breaking change:** Changes the fundamental PLAN.md format. Existing plans use `totalSteps` — they would need migration or the schema must accept both formats.
- **Redundant with body:** The step titles are already in the markdown body. Duplicating them in frontmatter creates a synchronization burden.
- **High token overhead:** Every step's metadata is in frontmatter. For a plan with 8 steps, this adds significant YAML content.
- **Complex schema:** `PLAN_FRONTMATTER_SCHEMA` becomes a nested object with array of objects. Validation logic grows substantially.

**Required schema change:**
```typescript
const StepEntry = Type.Object({
  number: Type.Integer({ minimum: 1 }),
  type: Type.Union([Type.Literal("regular"), Type.Literal("subgoal")]),
  title: Type.Optional(Type.String()),
  subgoalName: Type.Optional(Type.String()),
});

export const PLAN_FRONTMATTER_SCHEMA = Type.Union([
  // Legacy format (backward compatible)
  Type.Object({ totalSteps: Type.Integer({ minimum: 1 }) }),
  // New format with steps array
  Type.Object({
    steps: Type.Array(StepEntry),
  }),
]);
```

**Impact on `postValidateCreatePlan()`:** Must handle two formats — legacy `totalSteps` and new `steps` array. For the new format, validate that step numbers are sequential, types are valid, and subgoal names are non-empty for subgoal-type steps.

**Categorization:** **breaking change** (schema format change). **new fields** (entirely new schema structure). **new logic** (dual-format validation).

#### Option D: Post-declaration at evolve-plan time

No metadata at plan time. When `evolve-plan` encounters a step, the specification writer decides based on heuristics (content analysis using leaf-node criteria from Dimension 4) whether to spawn a subgoal.

**Pros:**
- **Maximum flexibility:** The spec writer has access to the actual codebase, previous step outputs, and current context. Can make an informed decision.
- **No PLAN.md changes:** Plan format remains unchanged. No schema evolution, no parsing changes.
- **Runtime intelligence:** The decision uses concrete information (file counts, codebase complexity) rather than planning-time estimates.

**Cons:**
- **Least deterministic:** Different spec writer invocations might make different decisions for the same step. The plan does not document the intended decomposition.
- **Late discovery:** If the planning agent intended a step to be a subgoal but the spec writer doesn't detect it, decomposition happens later than optimal. Wasted specification effort.
- **Requires runtime marker:** Falls back to Mechanism B from Dimension 4 (runtime marker file). This requires new `GoalState` methods, write allowlist changes, and validation modifications.
- **No audit trail in PLAN.md:** The decomposition decision is not visible in the plan. Anyone reading PLAN.md cannot see which steps are subgoals.

**Categorization:** **new logic** (runtime detection in `evolve-plan`). No schema changes. However, requires infrastructure from Dimension 4 Mechanism B (marker file).

#### Recommendation: Option B (In-body annotations)

**Justification:**

1. **Backward compatible by design:** Existing plans without `[subgoal]` markers function identically. The marker is opt-in — missing markers mean all steps are regular. This satisfies the backward compatibility requirement from Dimension 8.

2. **Co-located with step content:** The marker lives in the step heading — if steps are reordered, added, or removed, the marker moves with the step. No synchronization risk between frontmatter and body. This eliminates the fragility of Option A.

3. **Human-readable and auditable:** Anyone reading PLAN.md can immediately see which steps are subgoals. The plan documents the intended decomposition hierarchy. This satisfies the "declarative and auditable" requirement from Dimension 4 (Mechanism A).

4. **Extensible metadata:** The annotation syntax `[subgoal: name]` allows explicit subgoal names. The annotation can be extended in the future: `[subgoal: name, priority: high]`.

5. **Minimal schema impact:** `PLAN_FRONTMATTER_SCHEMA` requires no changes. The frontmatter remains `{ totalSteps: N }`. All subgoal metadata is in the body. This avoids the breaking change risk of Option C.

6. **Aligns with Dimension 4 decisions:** Dimension 4 recommends `create-plan` as the primary initiation point (Mechanism A — PLAN.md metadata). Option B implements Mechanism A with in-body annotations. The spec writer can still correct planning errors via Mechanism B (runtime marker) as a fallback.

7. **Parsing is straightforward:** The extended regex (`STEP_HEADING_WITH_ANNOTATION_RE`) captures the annotation as an optional group. Non-subgoal steps have `undefined` for the annotation group — no special handling needed.

**Cross-reference:** Dimension 4 Mechanism A (PLAN.md metadata) is the preferred signaling mechanism. Option B implements Mechanism A with in-body annotations instead of frontmatter arrays. The `evolve-plan` behavior divergence (Section 9c) must account for body parsing instead of frontmatter reading.

### 9b. create-plan prompt changes

`src/prompts/create-plan.md` currently instructs the Planning Agent to produce numbered steps without any concept of subgoals. The prompt references the `pio-planning` skill for step design rules but does not mention subgoal decomposition.

#### Required changes

**1. Add subgoal decomposition instructions to the prompt:**

The prompt must instruct the Planning Agent to evaluate each step against leaf-node criteria and flag composite steps as subgoals. This is a **new logic** change to `src/prompts/create-plan.md`:

```markdown
### Subgoal decomposition

Before finalizing your plan, evaluate each step against the leaf-node criteria from the `pio-planning` skill:

- **I/O contract test:** Can you state the output of this step without listing internal sub-outputs? If yes → leaf step. If no → mark as `[subgoal]`.
- **Encapsulation rule:** Does the parent plan need to know *how* this deliverable is built? If no → subgoal. If yes → keep as a regular step.

Mark composite steps in the heading with the `[subgoal]` annotation:
```
## Step 3: Implement OAuth flow [subgoal]
```

If the subgoal needs a specific name (different from the slugified step title), include it:
```
## Step 3: Implement OAuth flow [subgoal: oauth-flow]
```
```

**2. Step count guard:**

The `totalSteps > 8` guard from Dimension 4 should be encoded as a prompt instruction:

```markdown
### Step count guard

If your plan exceeds 8 steps, you must decompose some steps into subgoals. A plan with more than 8 flat steps indicates that some steps are composite and warrant their own subgoal. Use the leaf-node criteria to identify which steps to decompose.

You may override this guard with explicit justification if all steps are genuinely small and independent (e.g., 10 small bug fixes).
```

**3. Reference the `pio-planning` skill:**

The prompt already references `pio-planning` for step design rules. The skill must be updated to include the leaf-node criteria and decomposition guards (Dimension 4, Part A). The prompt change is a reference — the detailed methodology lives in the skill:

```markdown
## Skill References

This prompt references the `pio-planning` skill for detailed methodology. When designing steps and writing PLAN.md, follow the conventions documented in the `pio-planning` skill (`src/skills/pio-planning/SKILL.md`) for:
- ...
- Subgoal decomposition criteria (leaf-node test, encapsulation rule, step count guard)
```

**4. How the Planning Agent communicates subgoal designations:**

With Option B (in-body annotations), the Planning Agent communicates subgoal designations solely via PLAN.md annotations. No separate GOAL.md comments or sidecar files are needed. The `[subgoal]` marker in the step heading is the single source of truth.

**Is this sufficient?** Yes — the state machine reads PLAN.md to detect subgoal steps (Section 9c). The `[subgoal]` annotation is the signal. No additional communication channel is needed.

#### Hard rule vs. soft guidance

**Question:** Is `totalSteps > 8` a hard rule or soft guidance?

**Recommendation: Soft guidance in the prompt, hard guard in `postValidateCreatePlan` (future enhancement).**

For the initial implementation, the step count guard is a prompt instruction (soft guidance). The Planning Agent is instructed to decompose plans exceeding 8 steps. This is sufficient — the planning agent follows prompt instructions.

A future enhancement could add programmatic validation: `postValidateCreatePlan()` rejects plans with `totalSteps > 8` that have zero subgoal annotations. This would be a **new logic** change to `create-plan.ts`. For the initial implementation, soft guidance is sufficient.

**Categorization:** **new logic** in `src/prompts/create-plan.md` (prompt-level instructions). **new logic** in `src/skills/pio-planning/SKILL.md` (leaf-node criteria and decomposition rules). No code changes to `create-plan.ts` for the initial implementation.

### 9c. evolve-plan behavior divergence

`src/capabilities/evolve-plan.ts` currently produces TASK.md + TEST.md for every step. When a step is flagged as a subgoal (via `[subgoal]` annotation in PLAN.md), the behavior must diverge.

#### Current code analysis

**`validateAndFindNextStep()`** (line 82): Scans for the next incomplete step via `state.currentStepNumber()`. No concept of subgoal-type steps. Returns `stepNumber` for the next step to evolve.

**`CAPABILITY_CONFIG`** (line 44): Defines expected outputs: `${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`. Write allowlist includes `COMPLETED`, `TASK.md`, `TEST.md`, `DECISIONS.md`, and `REVISE_PLAN_NEEDED`.

**`handleEvolvePlan()`** (command handler, line 157): Calls `validateAndFindNextStep()`, creates the step directory, resolves capability config, and launches the session.

**`transitionEvolvePlan()`** (in `src/state-machine.ts`, line 47): Routes to `execute-task` for the next step. This is where subgoal detection and routing must occur (per Dimension 3, Approach 1).

Three approaches for evolve-plan divergence are evaluated:

#### Option 1: Skip spec generation, spawn create-goal directly

`transitionEvolvePlan()` detects the subgoal-type step (via PLAN.md body parsing) and routes to `create-goal` with parent context instead of routing to `execute-task`.

**How it works:**

```typescript
// In src/state-machine.ts, transitionEvolvePlan():
function transitionEvolvePlan(state: GoalState, params?: Record<string, unknown>): TransitionResult | undefined {
  // ... existing logic for plan completion, revision, etc. ...

  const stepNumber = /* current or explicit step number */;

  // NEW: Check if this step is a subgoal
  const stepAnnotation = getStepAnnotation(state, stepNumber);
  if (stepAnnotation?.type === "subgoal") {
    // Route to create-goal for the subgoal
    const subgoalName = stepAnnotation.name || slugifyStepTitle(stepAnnotation.title);
    return {
      capability: "create-goal",
      params: {
        goalName: subgoalName,
        parentGoalName: state.goalName,
        parentStepNumber: stepNumber,
        subgoalType: true,
        // Explicit workingDir per Dimension 5
        workingDir: path.join(state.goalDir, `S${String(stepNumber).padStart(2, "0")}`, "subgoals", subgoalName),
      },
    };
  }

  // Existing: route to execute-task for regular steps
  return {
    capability: "execute-task",
    params: { goalName: state.goalName, stepNumber },
  };
}
```

**Helper function `getStepAnnotation()`:**
```typescript
function getStepAnnotation(state: GoalState, stepNumber: number): { type: string; name?: string; title: string } | null {
  const planPath = path.join(state.goalDir, "PLAN.md");
  if (!fs.existsSync(planPath)) return null;

  const content = fs.readFileSync(planPath, "utf-8");
  const regex = new RegExp(`^## Step ${stepNumber}: (.+?)(?:\\s+\\[(.+?)\\])?\\s*$`, "m");
  const match = content.match(regex);

  if (!match) return null;

  const title = match[1].trim();
  const annotation = match[2]?.trim();

  if (!annotation) return { type: "regular", title };

  if (annotation.startsWith("subgoal")) {
    const name = annotation.split(":")[1]?.trim();
    return { type: "subgoal", name, title };
  }

  return { type: "regular", title };
}
```

**Pros:**
- **Clean separation:** `evolve-plan` produces specs for regular steps. Subgoal steps spawn `create-goal` directly. No indirection.
- **State machine owns the logic:** Consistent with Dimension 3 Approach 1 (state machine handles spawning).
- **No TASK.md/TEST.md for subgoal steps:** The subgoal has its own specification lifecycle. No wrapper specs needed.
- **Explicit in transitions.json:** `evolve-plan → create-goal` with `subgoalType: true` is clearly auditable.

**Cons:**
- **Changes `evolve-plan` expected outputs:** `CAPABILITY_CONFIG` expects `TASK.md` + `TEST.md`. When `transitionEvolvePlan` routes to `create-goal`, the `evolve-plan` session doesn't produce TASK.md/TEST.md. The validation (`pio_mark_complete`) would fail — it expects files that weren't created.
- **`evolve-plan` session vs. state machine routing:** There's a distinction between the `evolve-plan` session (the spec writer agent) and `transitionEvolvePlan` (the state machine function). The state machine routes AFTER `evolve-plan` completes. If `evolve-plan` is supposed to produce TASK.md/TEST.md but the step is a subgoal, the session would fail validation.
- **Resolution:** The state machine must detect subgoal steps BEFORE launching the `evolve-plan` session. This means `handleEvolvePlan()` (the command handler) or `validateAndFindNextStep()` must detect subgoal steps and either: (a) skip the `evolve-plan` session and directly launch `create-goal`, or (b) route through the state machine with subgoal awareness.

**Required changes:**
- `src/state-machine.ts`: `transitionEvolvePlan()` — **new logic** (subgoal detection and routing). New helper `getStepAnnotation()`.
- `src/capabilities/evolve-plan.ts`: `validateAndFindNextStep()` — **new logic** (detect subgoal steps, return subgoal metadata). `handleEvolvePlan()` — **new logic** (route to `create-goal` for subgoal steps instead of launching `evolve-plan` session).
- `src/capabilities/session-capability.ts`: `pio_mark_complete` — **new logic** (handle subgoal routing).

**Categorization:** **new logic** across state machine, evolve-plan capability, and session capability.

#### Option 2: Produce wrapper specs that delegate

Generate minimal TASK.md + TEST.md that describes the subgoal delegation contract. The `execute-task` agent then spawns the subgoal.

**How it works:**

```markdown
# Task: Step 3 — Implement OAuth flow (subgoal)

This step requires subgoal decomposition. Spawn a subgoal named "oauth-flow"
at `S03/subgoals/oauth-flow/` and run it through the full pio lifecycle.

## Acceptance Criteria

- Subgoal "oauth-flow" completes successfully (COMPLETED marker present)
- OAuth flow is functional (tested by subgoal's own tests)
```

**Pros:**
- **Uniform `evolve-plan` behavior:** `evolve-plan` always produces TASK.md + TEST.md. No branching logic in `evolve-plan` or its `CAPABILITY_CONFIG`.
- **Existing validation works:** `CAPABILITY_CONFIG` expects TASK.md + TEST.md — they exist. `pio_mark_complete` validates normally.
- **Implementer handles spawning:** The `execute-task` agent reads the wrapper spec and spawns the subgoal. This keeps `evolve-plan` simple.

**Cons:**
- **Adds indirection:** Two layers of specification (wrapper + subgoal). The wrapper spec is thin — it delegates to the subgoal.
- **Implementer complexity:** `execute-task` must detect subgoal delegation specs and spawn subgoals. This adds complexity to the implementer agent.
- **Wasted specification step:** The wrapper TASK.md/TEST.md adds no value — it just says "spawn a subgoal." This is a mechanical step with no real specification content.
- **`execute-task` prompt changes:** The implementer prompt must handle subgoal delegation — a significant behavioral change for `execute-task`.

**Required changes:**
- `src/prompts/evolve-plan.md`: **new logic** — instructions for generating wrapper specs for subgoal steps.
- `src/prompts/execute-task.md`: **new logic** — instructions for detecting and executing subgoal delegation specs.
- `src/capabilities/execute-task.ts`: **new logic** — subgoal spawning from wrapper specs.

**Categorization:** **new logic** across evolve-plan prompt, execute-task prompt, and execute-task capability.

#### Option 3: New capability or branching logic

Introduce `evolve-subgoal` as a separate capability, or add conditional branching inside `transitionEvolvePlan()`.

**Option 3a: `evolve-subgoal` capability**

A new capability that handles subgoal-step evolution. `transitionEvolvePlan` routes to `evolve-subgoal` for subgoal steps, which then spawns `create-goal`.

**Pros:** Clean separation of concerns. `evolve-plan` handles regular steps, `evolve-subgoal` handles subgoal steps.

**Cons:** New capability = new tool, new command, new prompt, new config. Significant infrastructure for a narrow use case. `evolve-subgoal` would be a thin wrapper around `create-goal` spawning — most of its logic is just detecting the step and routing.

**Option 3b: Conditional branching in `transitionEvolvePlan`**

This is Option 1 implemented via state machine branching. The state machine detects subgoal steps and routes to `create-goal`. This is the recommended approach (see Option 1 analysis above).

#### Recommendation: Option 1 (Skip spec generation, spawn create-goal directly)

**Justification:**

1. **Clean separation:** `evolve-plan` produces specs for regular steps. Subgoal steps bypass spec generation and go directly to `create-goal`. No indirection, no wrapper specs.

2. **Consistent with Dimension 3:** Dimension 3 recommends Approach 1 (state machine spawning). `transitionEvolvePlan` detects subgoal steps and routes to `create-goal`. This is the canonical spawning mechanism.

3. **No wasted specification:** Subgoal steps don't produce empty TASK.md/TEST.md. The subgoal has its own specification lifecycle (`create-plan → evolve-plan → ...`).

4. **State machine owns the logic:** The routing decision is centralized in `transitionEvolvePlan`. Consistent with the pio design philosophy (state machine is the single source of truth for transitions).

5. **Cross-references Dimension 4:** Dimension 4 recommends `create-plan` as the primary initiation point. Option 1 implements this — the Planning Agent marks subgoal steps in PLAN.md, and `transitionEvolvePlan` reads the markings and routes accordingly.

**Resolution of the validation gap:** The `evolve-plan` session should NOT be launched for subgoal steps. Instead, `validateAndFindNextStep()` detects the subgoal annotation and returns metadata indicating it's a subgoal step. `handleEvolvePlan()` (or the state machine) then routes to `create-goal` directly — bypassing the `evolve-plan` session entirely. The `evolve-plan` session only runs for regular steps.

**Required code changes:**

| File | Change Type | Description |
|------|-------------|-------------|
| `src/state-machine.ts` | **new logic** | `transitionEvolvePlan()`: detect subgoal steps via PLAN.md body parsing. Route to `create-goal` with parent context. New helper `getStepAnnotation()`. |
| `src/capabilities/evolve-plan.ts` | **new logic** | `validateAndFindNextStep()`: detect subgoal steps, return subgoal metadata alongside step number. `handleEvolvePlan()`: route to `create-goal` for subgoal steps. |
| `src/capabilities/session-capability.ts` | **new logic** | `pio_mark_complete`: handle subgoal routing (already covered in Dimension 7). |

**No breaking changes.** All modifications are additive — new detection logic, new routing paths. Regular steps continue to flow through `evolve-plan` normally.

### 9d. Frontmatter schema evolution

With Option B (in-body annotations) as the recommended approach, `PLAN_FRONTMATTER_SCHEMA` requires minimal changes. The frontmatter continues to carry only `totalSteps`. Subgoal metadata lives in the body.

#### Proposed schema (backward compatible)

```typescript
export const PLAN_FRONTMATTER_SCHEMA = Type.Object({
  totalSteps: Type.Integer({ minimum: 1 }),
  // Optional: explicit subgoal step declarations (complements in-body annotations).
  // Not required — in-body annotations are the primary mechanism.
  // This field is a convenience for tools that need machine-readable subgoal lists
  // without parsing the markdown body.
  subgoalSteps: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Integer({ minimum: 1 }), // Simple: step number only
        Type.Object({
          step: Type.Integer({ minimum: 1 }),
          name: Type.Optional(Type.String()), // Explicit subgoal name
        }),
      ])
    )
  ),
});
```

**Rationale for the optional `subgoalSteps` field:**

1. **Machine-readable convenience:** Tools that need to quickly determine which steps are subgoals (e.g., `list-goals`, progress tracking) can read the frontmatter array without parsing the markdown body. This is optional — if absent, body parsing is used as the source of truth.

2. **Not required for functionality:** In-body annotations are the primary mechanism. The frontmatter array is a convenience optimization. If present, it must match the body annotations (validated by `postValidateCreatePlan`).

3. **Backward compatible:** The field is `Type.Optional()`. Existing plans without `subgoalSteps` parse identically. The schema accepts both old and new formats.

4. **Future extensibility:** The array can carry per-subgoal metadata (name, priority) without changing the body format. The in-body annotation `[subgoal: name]` and the frontmatter entry `{ step: 3, name: "oauth-flow" }` are complementary — the body annotation is the source of truth, the frontmatter is a convenience index.

#### Impact on `postValidateCreatePlan()`

`postValidateCreatePlan()` in `src/capabilities/create-plan.ts` must be updated:

**Current validation:**
1. Validate frontmatter via `state.planMetadata()` — checks `totalSteps` exists and is valid.
2. Count `## Step N:` headings — verifies heading count matches `totalSteps`.

**Additional validation (new logic):**
3. If `subgoalSteps` is present in frontmatter:
   - Verify every entry corresponds to an actual step heading.
   - Verify the step heading has a `[subgoal]` annotation.
   - If `subgoalSteps` contains objects with `name`, verify the annotation includes the same name.
4. Parse step headings for `[subgoal]` annotations:
   - Verify annotation syntax is valid (`[subgoal]` or `[subgoal: name]`).
   - Count subgoal steps for informational purposes (e.g., warn if all steps are subgoals).

**Code sketch:**
```typescript
function postValidateCreatePlan(goalDir: string): { success: boolean; message?: string } {
  // ... existing frontmatter and heading count validation ...

  // NEW: Parse step annotations
  const planContent = fs.readFileSync(`${goalDir}/PLAN.md`, "utf-8");
  const annotationRegex = /^## Step (\d+): (.+?)(?:\s+\[(.+?)\])?\s*$/gm;
  const annotations: Record<number, { type: string; name?: string }> = {};

  let match;
  while ((match = annotationRegex.exec(planContent)) !== null) {
    const stepNum = parseInt(match[1], 10);
    const annotation = match[3]?.trim();
    if (annotation?.startsWith("subgoal")) {
      const name = annotation.split(":")[1]?.trim();
      annotations[stepNum] = { type: "subgoal", name };
    }
  }

  // NEW: Validate subgoalSteps frontmatter against body annotations
  const metadata = state.planMetadata() as PlanFrontmatter | null;
  if (metadata?.subgoalSteps) {
    for (const entry of metadata.subgoalSteps) {
      const stepNum = typeof entry === "number" ? entry : entry.step;
      if (!annotations[stepNum]) {
        return {
          success: false,
          message: `subgoalSteps lists step ${stepNum} but the step heading lacks a [subgoal] annotation.`,
        };
      }
      if (typeof entry !== "number" && entry.name && annotations[stepNum]?.name !== entry.name) {
        return {
          success: false,
          message: `subgoalSteps name for step ${stepNum} ("${entry.name}") doesn't match body annotation ("${annotations[stepNum].name}").`,
        };
      }
    }
  }

  return { success: true };
}
```

**Categorization:** **new fields** (optional `subgoalSteps` in `PLAN_FRONTMATTER_SCHEMA`). **new logic** (annotation parsing and cross-validation in `postValidateCreatePlan`).

#### Backward compatibility guarantee

Existing plans without subgoal metadata:
- `PLAN_FRONTMATTER_SCHEMA` accepts `{ totalSteps: N }` — unchanged.
- `postValidateCreatePlan()` validates heading count — unchanged.
- No `[subgoal]` annotations in body — all steps are regular steps.
- `transitionEvolvePlan()` routes all steps to `execute-task` — unchanged.

**No existing plan is broken by these changes.** The schema is strictly additive (optional fields). The parsing logic is strictly additive (new regex, new validation paths). The routing logic is strictly additive (new conditional branch).

### Summary of changes (Dimension 9)

| File | Function/Area | Change Type | Description |
|------|--------------|-------------|-------------|
| `src/frontmatter-schemas.ts` | `PLAN_FRONTMATTER_SCHEMA` | **new fields** | Add optional `subgoalSteps` array. Backward compatible — existing plans parse identically. |
| `src/capabilities/create-plan.ts` | `postValidateCreatePlan()` | **new logic** | Parse step annotations, validate `subgoalSteps` against body. Extended heading regex. |
| `src/prompts/create-plan.md` | Prompt instructions | **new logic** | Add subgoal decomposition instructions: leaf-node criteria, encapsulation rule, step count guard, annotation syntax. |
| `src/skills/pio-planning/SKILL.md` | Skill instructions | **new logic** | Add leaf-node criteria (I/O contract test, encapsulation rule) and decomposition guards (step count limit, abstraction distance). |
| `src/state-machine.ts` | `transitionEvolvePlan()` | **new logic** | Detect subgoal steps via PLAN.md body parsing. Route to `create-goal` with parent context. New helper `getStepAnnotation()`. |
| `src/capabilities/evolve-plan.ts` | `validateAndFindNextStep()` | **new logic** | Detect subgoal steps, return subgoal metadata. |
| `src/capabilities/evolve-plan.ts` | `handleEvolvePlan()` | **new logic** | Route to `create-goal` for subgoal steps instead of launching `evolve-plan` session. |
| `src/capabilities/session-capability.ts` | `pio_mark_complete` | **new logic** | Handle subgoal routing (covered in Dimension 7). |
| `src/prompts/evolve-plan.md` | Prompt instructions | **new logic** | Instructions for detecting subgoal-marked steps (fallback path). |

**No breaking changes identified.** All modifications are additive:
- `PLAN_FRONTMATTER_SCHEMA` gains an optional field — existing plans parse identically.
- `postValidateCreatePlan()` gains new validation paths — existing plans pass unchanged.
- `transitionEvolvePlan()` gains a new routing branch — regular steps route identically.
- Prompt and skill changes are instructional — they guide the agent but do not change code behavior.

[End of Dimension 9 analysis]

## Synthesis

### Recommended approach summary

The feasibility study concludes that nested subgoals are **architecturally viable** with primarily additive, non-breaking changes across the pio codebase. The recommended approach synthesizes decisions from all 9 dimensions:

| Dimension | Decision | Change Category |
|-----------|----------|-----------------|
| **D1: Nesting structure** | `S{NN}/subgoals/<name>/` — subgoals live inside parent step directories under the `subgoals/` marker | new logic (`resolveGoalDir` extension) |
| **D2: Queue keying** | Hierarchical keys with `__` delimiters: `task-parent__S03__nested.json`. New `deriveQueueKey()` helper | new logic (`queues.ts`) |
| **D3: State machine** | Additive transitions: `transitionEvolvePlan` routes to `create-goal` for subgoal steps. `transitionFinalizeGoal` routes back to parent's `evolve-plan`. Parent implicitly pauses | new logic (`state-machine.ts`) |
| **D4: Trigger mechanism** | `create-plan` is the primary initiation point. Planning agent evaluates leaf-node criteria (I/O contract test, encapsulation rule) and marks composite steps. `evolve-plan` is a correction fallback | new logic (prompts, skills) |
| **D5: File protection** | No changes to `validation.ts`. Default-deny check is correct for nested paths. Spawning transition passes explicit `params.workingDir` | new logic (`state-machine.ts` — spawning transition) |
| **D6: Session hierarchy** | Pi `parentSession` supports arbitrary depth. `/pio-parent` single-hop is acceptable. `deriveSessionName` formats qualified names (`__` → `/`) | new logic (cosmetic, `fs-utils.ts`) |
| **D7: Completion propagation** | Subgoal `COMPLETED` marker is authoritative. `finalize-goal` routes to parent's `evolve-plan`. `pio_mark_complete` uses transition's `params.goalName` for enqueuing | new logic (`state-machine.ts`, `session-capability.ts`) |
| **D8: Path resolution** | Centralized `resolveGoalDir` extension (optional `parentStepDir` param + hierarchical name detection). 17 function groups audited — 6 require changes | new logic (`fs-utils.ts`, `queues.ts`, `goal-state.ts`) |
| **D9: Planning awareness** | In-body annotations (`[subgoal]` in step headings) as primary signaling mechanism. Optional `subgoalSteps` in frontmatter for machine-readable convenience. `transitionEvolvePlan` parses body and routes to `create-goal` | new fields (`frontmatter-schemas.ts`), new logic (state machine, evolve-plan, prompts) |

### Cross-dimension dependencies

Several dimensions share changes that must be implemented in lockstep:

- **Path resolution (D1, D5, D8):** `resolveGoalDir` extension is the foundational change. It enables nested path resolution for queue keying (D2), file protection (D5), and state machine transitions (D3). All downstream dimensions depend on this single function.
- **State machine transitions (D3, D7, D9):** `transitionEvolvePlan` handles both spawning (D3) and subgoal detection (D9). `transitionFinalizeGoal` handles completion propagation (D7). These three functions form the complete subgoal lifecycle in the state machine.
- **Queue mechanics (D2, D3, D7):** `deriveQueueKey` (D2) produces hierarchical keys. `pio_mark_complete` (D7) uses transition's `params.goalName` for enqueuing. The spawning transition (D3) enqueues the subgoal's first task. These three changes must coordinate to ensure correct queue slot management across the subgoal lifecycle.
- **Planning awareness (D4, D9):** D4 defines the leaf-node criteria and recommends `create-plan` as the primary initiation point. D9 implements the signaling mechanism (in-body annotations) and the detection logic (`transitionEvolvePlan`). These dimensions are tightly coupled — D9's implementation must match D4's decision model.
- **Session management (D3, D5, D6):** The spawning transition (D3) passes `params.workingDir` for file protection (D5). Session naming (D6) formats the qualified name for display. These changes ensure the subgoal session operates on the correct directory with the correct display name.

### Complete file modification inventory

The following table consolidates all required changes across all 9 dimensions. Each file appears exactly once, with all relevant dimensions listed.

| File | Change Category | Dimensions | Summary of Required Changes |
|------|----------------|------------|----------------------------|
| `src/fs-utils.ts` | **new logic** | D1, D6, D8 | `resolveGoalDir`: optional `parentStepDir` param + hierarchical name detection. `deriveSessionName`: format qualified names (`__` → `/`). |
| `src/goal-state.ts` | **new fields**, **new logic** | D1, D2, D8 | `createGoalState`: accept optional `qualifiedName` param. `pendingTask()`: use `deriveQueueKey` for hierarchical queue paths. |
| `src/queues.ts` | **new logic** | D2, D8 | `enqueueTask`/`readPendingTask`: accept qualified names. `listPendingGoals`: return qualified names. New `deriveQueueKey()` helper. |
| `src/state-machine.ts` | **new logic** | D3, D5, D7, D9 | `transitionEvolvePlan`: subgoal detection via PLAN.md body parsing, route to `create-goal` with parent context and explicit `workingDir`. `transitionFinalizeGoal`: new function — route to parent's `evolve-plan` for subgoals. `resolveTransition`: call `transitionFinalizeGoal` instead of inline `undefined`. New helpers: `getStepAnnotation()`, `extractParentGoalName()`, `extractParentStepNumber()`. |
| `src/capabilities/evolve-plan.ts` | **new logic** | D4, D9 | `validateAndFindNextStep()`: detect subgoal steps, return subgoal metadata. `handleEvolvePlan()`: route to `create-goal` for subgoal steps. |
| `src/capabilities/session-capability.ts` | **new logic** | D3, D7 | `pio_mark_complete`: use transition's `params.goalName` for `enqueueTask` when it differs from `state.goalName`. Enables parent queue slot restoration on subgoal completion. |
| `src/capabilities/create-plan.ts` | **new logic** | D9 | `postValidateCreatePlan()`: parse step annotations, validate `subgoalSteps` frontmatter against body annotations. Extended heading regex. |
| `src/capabilities/list-goals.ts` | **new logic** | D8 | Recursive scan or flag-based listing to discover nested subgoals. |
| `src/capabilities/finalize-goal.ts` | no change | D7 | `validateFinalizeGoal` works for nested paths if `goalDir` is resolved correctly. Tool/command path is top-level only. |
| `src/capabilities/create-goal.ts` | no change | D5, D8 | Fixed by `resolveGoalDir` extension. Spawning transition passes explicit `workingDir`. |
| `src/capabilities/execute-task.ts` | no change | D8 | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/review-task.ts` | no change | D8 | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/revise-plan.ts` | no change | D8 | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/execute-plan.ts` | no change | D8 | Fixed by `resolveGoalDir` extension or explicit `params.workingDir`. |
| `src/capabilities/goal-from-issue.ts` | no change | D8 | Top-level only by design. No nested resolution needed. |
| `src/capabilities/delete-goal.ts` | no change | D8 | Fixed by `resolveGoalDir` extension. Consider restricting to top-level goals. |
| `src/capabilities/next-task.ts` | no change | D2, D8 | Works with hierarchical keys. No code changes needed. |
| `src/capability-config.ts` | no change | D5 | Explicit `params.workingDir` already supported. Fix is in the spawning transition (D3, D5). |
| `src/guards/validation.ts` | no change | D5 | Default-deny check is correct for nested paths. No modifications needed. |
| `src/frontmatter-schemas.ts` | **new fields** | D9 | Add optional `subgoalSteps` array to `PLAN_FRONTMATTER_SCHEMA`. Backward compatible. |
| `src/prompts/create-plan.md` | **new logic** | D4, D9 | Add subgoal decomposition instructions: leaf-node criteria, encapsulation rule, step count guard, annotation syntax. |
| `src/prompts/create-goal.md` | **new logic** | D5 | Add instructions for subgoal sessions to read parent `GOAL.md` and `PLAN.md`. |
| `src/prompts/evolve-plan.md` | **new logic** | D4, D9 | Instructions for detecting subgoal-marked steps (fallback path). |
| `src/prompts/finalize-goal.md` | **new logic** | D7 | Handle subgoal steps — read summaries from subgoal workspace. |
| `src/skills/pio-planning/SKILL.md` | **new logic** | D4 | Add leaf-node criteria (I/O contract test, encapsulation rule) and decomposition guards (step count limit, abstraction distance). |

### Identified risks or blockers

#### Risk 1: Coordination complexity (Medium)

**Description:** Multiple files must change in lockstep for the subgoal lifecycle to work correctly. `resolveGoalDir` (D8) must be extended before state machine transitions (D3, D7) can use nested paths. Queue keying (D2) must coordinate with `pio_mark_complete` (D7) for correct enqueuing. Planning awareness (D9) must align with trigger mechanism (D4).

**Impact:** If changes are implemented incrementally without coordination, intermediate states may break existing functionality (e.g., `resolveGoalDir` extension without corresponding state machine changes produces incorrect paths).

**Mitigation:** Implement in phases: (1) path resolution infrastructure (`resolveGoalDir`, `deriveQueueKey`), (2) state machine transitions (spawning + completion), (3) planning awareness (annotations + detection), (4) prompt/skill updates. Each phase should be independently testable.

#### Risk 2: `evolve-plan` validation gap (Low-Medium)

**Description:** When `transitionEvolvePlan` routes to `create-goal` for a subgoal step, the `evolve-plan` session doesn't produce TASK.md/TEST.md. The `CAPABILITY_CONFIG` expected outputs validation would fail if the `evolve-plan` session is launched for subgoal steps.

**Impact:** The `evolve-plan` session must NOT be launched for subgoal steps. The detection and routing must happen at the command handler level (`handleEvolvePlan`) or in `validateAndFindNextStep`, before the session is created.

**Mitigation:** `validateAndFindNextStep()` must detect subgoal steps and return metadata. `handleEvolvePlan()` routes to `create-goal` directly for subgoal steps, bypassing the `evolve-plan` session. The `evolve-plan` session runs only for regular steps.

#### Risk 3: Param pollution (Low)

**Description:** `parentGoalName` and `parentStepNumber` could leak into downstream transitions via `_sessionContext` propagation in `pio_mark_complete`.

**Impact:** A top-level goal's `finalize-goal` might incorrectly detect parent context and attempt to route to a non-existent parent.

**Mitigation:** `transitionFinalizeGoal` checks `params?.parentGoalName` as a top-level param only — it does not recurse into `_sessionContext`. The transition params from `transitionFinalizeGoal` do NOT include `parentGoalName` or `parentStepNumber`. This prevents the parent from being treated as a subgoal of its own parent.

#### Risk 4: Test coverage gaps (Medium)

**Description:** New behavior (subgoal spawning, completion propagation, path resolution) has no existing test infrastructure. The state machine transitions are pure functions — unit-testable — but the integration between state machine, queue mechanics, and session management requires integration tests.

**Impact:** Bugs in the subgoal lifecycle may not be caught until runtime. The coordination between multiple modules increases the risk of integration failures.

**Mitigation:** Prioritize unit tests for pure functions (`transitionEvolvePlan`, `transitionFinalizeGoal`, `getStepAnnotation`, `deriveQueueKey`, `resolveGoalDir` with nested paths). Add integration tests for the complete subgoal lifecycle (spawn → execute → complete → propagate).

#### Risk 5: Plan format evolution (Low)

**Description:** Adding in-body annotations and optional frontmatter fields changes the PLAN.md format. Tools that parse PLAN.md (e.g., external integrations, CI checks) may not handle the new format.

**Impact:** External tools that expect the current PLAN.md format may break or produce incorrect results.

**Mitigation:** In-body annotations are backward compatible — missing annotations mean all steps are regular. The optional `subgoalSteps` frontmatter field is strictly additive. Existing plans parse identically. Document the new format in the `pio-planning` skill.

### Go/No-Go recommendation

**Recommendation: GO**

**Justification:**

1. **All changes are non-breaking.** Every dimension's recommended changes are additive: new optional fields, new helper functions, new routing branches, new prompt instructions. No existing behavior is modified for plans without subgoal metadata. This is confirmed across all 9 dimensions:
   - D1: `resolveGoalDir` extension is backward compatible (flat names unchanged).
   - D2: Hierarchical keys are backward compatible (flat goals produce identical filenames).
   - D3: State machine transitions are additive (new optional params, new helper functions).
   - D5: File protection requires no changes to `validation.ts`.
   - D7: `transitionFinalizeGoal` returns `undefined` for top-level goals (unchanged).
   - D8: `resolveGoalDir` extension preserves flat path behavior.
   - D9: `PLAN_FRONTMATTER_SCHEMA` gains an optional field. In-body annotations are opt-in.

2. **Changes are primarily concentrated in core infrastructure.** The bulk of changes affect `src/state-machine.ts`, `src/fs-utils.ts`, `src/queues.ts`, and `src/goal-state.ts` — core modules that are well-understood and tested. Capability files require minimal changes (most are fixed by the `resolveGoalDir` extension). Prompt and skill changes are instructional — they guide agent behavior without code modifications.

3. **No fundamental architectural conflicts.** The nesting structure (`S{NN}/subgoals/<name>/`) is compatible with existing path resolution (D1, D8). The queue keying strategy (D2) prevents collisions without breaking existing queues. The state machine extension (D3, D7) preserves the existing lifecycle for top-level goals. File protection (D5) works correctly for nested paths without modification.

4. **Implementation complexity is manageable.** The changes decompose into independent phases:
   - Phase 1: Path resolution infrastructure (`resolveGoalDir`, `deriveQueueKey`) — affects D1, D2, D8.
   - Phase 2: State machine transitions (spawning, completion propagation) — affects D3, D5, D7.
   - Phase 3: Planning awareness (annotations, detection, prompts) — affects D4, D9.
   - Phase 4: Prompt and skill updates — affects D4, D5, D7, D9.

   Each phase can be developed and tested independently. The phases have clear dependencies (Phase 1 before Phase 2, Phase 2 before Phase 3) but no circular dependencies.

5. **Risks are identifiable and mitigable.** The five identified risks (coordination complexity, validation gap, param pollution, test coverage, format evolution) are all medium or low severity. Each has a specific mitigation strategy. No blocker-level risks were identified.

**Next steps:** Create a separate implementation goal with phased rollout. The goal should decompose the 12 files requiring changes into implementable steps, following the phase ordering above. Each step should include unit tests for the new pure functions and integration tests for the complete subgoal lifecycle.
