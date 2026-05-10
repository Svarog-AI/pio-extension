---
name: project-context
description: Analyze the project and produce a dense PROJECT.md knowledge file
---
Launches a Project Context Analyzer session that deeply explores the project structure, reads configuration files, documentation, and source code, then produces a comprehensive `.pio/PROJECT.md` knowledge file.

**Usage:** `/pio-project-context` or call `pio_create_project_context` tool.

**Output:** `.pio/PROJECT.md` — injected into every agent session as background context, covering tech stack, structure, build/test/deploy, conventions, and important notes.
