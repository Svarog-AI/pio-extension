# Simplify next-task to single immediate task

The `next-task` command currently operates with a queue of tasks (FIFO from `.pio/session-queue/`). This is unnecessarily complex — most of the time there's only one pending task at a time. The system should store a single task that gets overwritten on each enqueue, rather than accumulating a queue.

Changes needed:
- `enqueueTask` in `src/utils.ts`: write to a fixed filename (e.g., `task.json`) instead of a timestamped filename, overwriting any existing task
- `/pio-next-task`: still reads from `.pio/session-queue/`, but expects only one file (`task.json`) and processes it, then deletes it on success
- Rename conceptually from "session queue" to "task queue" where appropriate in comments/descriptions (no need to rename directories yet)

## Category

improvement

## Context

Current files: src/utils.ts (enqueueTask, queueDir), src/capabilities/next-task.ts
Directory: .pio/session-queue/ currently contains timestamped JSON files like 1746750000000-create-goal.json
