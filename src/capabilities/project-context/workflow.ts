import type { WorkflowStep } from "../../capability-package";

export default [
  {
    id: "analyze",
    title: "Phase 1: Analysis",
    instructions: `Explore the project recursively from the root. Your goal is to understand what every subdirectory represents and identify the most important files in each one. Do not skim — actually read files that matter.

Work outward from the center:
- Start with \`README.md\` or equivalent entry points to get an initial sense of the project.
- Scan the top-level directory structure. Map out every notable folder and its purpose.
- Read dependency manifests (\`package.json\`, \`Cargo.toml\`, \`go.mod\`, \`Gemfile\`, \`pyproject.toml\`, etc.) — these reveal languages, frameworks, versions, and scripts.
- Read build and automation files (\`Makefile\`, \`justfile\`, \`Taskfile.yml\`, \`build.gradle\`, \`CMakeLists.txt\`, etc.).
- Read CI/CD configurations (\`.github/workflows/\`, \`.gitlab-ci.yml\`, Jenkinsfiles, etc.).
- Read infrastructure files (\`Dockerfile\`, \`docker-compose.*\`, Kubernetes manifests, Terraform, etc.).
- Read documentation (\`CONTRIBUTING.md\`, \`CHANGELOG.md\`, \`docs/\`).
- Read AI instruction files if they exist (\`AGENTS.md\`, \`CLAUDE.md\`, \`CURSOR.md\`, \`.github/copilot-instructions.md\`, \`.wolf/\`, \`.roo/\`).
- Read editor configs (\`.editorconfig\`, \`.prettierrc\`, \`tsconfig.json\`, etc.) — they encode project conventions.
- Dive into subdirectories recursively. Understand the source layout, test structure, and any nested services or packages in a monorepo.
- **Discover test placement conventions:** When tests exist, observe where they live relative to source files. Common patterns include: \`tests/\` mirroring \`src/\` (e.g., \`src/foo/bar.ts\` → \`tests/foo/test_bar.ts\`), colocated \`.test.ts\` alongside source files, dedicated \`__tests__/\` directories per module, or language-specific conventions like \`*_test.go\`, \`*_test.rb\`. Note the test runner and any configuration (\`jest.config.*\`, \`vitest.config.*\`, \`pytest.ini\`, etc.) that affects discovery.
- **Discover cross-service dependencies:** Identify external API integrations (HTTP clients, SDKs, gRPC stubs), third-party service connections (databases, message brokers, caches), and internal monorepo package relationships (workspace dependencies, inter-package imports). Look at \`package.json\` dependencies, import statements, configuration files, and infrastructure definitions.
- **Discover domain terminology:** While reading source code, documentation, and configuration, note recurring domain-specific terms, business concepts, acronyms, and jargon that a new contributor would need to understand.
- **Analyze git history (commit conventions):** If the project has a git repository (\`git rev-parse --git-dir\` succeeds), run the following commands to discover commit and release conventions:
  - \`git log --oneline -50\` — examine recent commit messages for patterns: Conventional Commits compliance (\`type(scope): description\`), custom prefixes or type vocabulary, message formatting conventions (imperative mood, line length limits), squash-merge vs. individual commit titles, sign-off lines (\`Signed-off-by:\`), and evidence of GPG-signed commits.
  - \`git tag -l\` — identify versioning schemes: semantic versioning (\`v1.2.3\`), calendar versioning (\`2026.05\`), release candidates, pre-release patterns, or any naming conventions in tag descriptions.
  - \`git branch -a\` — identify branching strategy: feature/fix prefix conventions (\`feature/\`, \`feat/\`, \`fix/\`), trunk-based development (single main/master), release branches, hotfix branches, and ticket/issue number embedding in branch names.
  - Check for commit signing evidence: look for GPG signature indicators and DCO-style sign-off lines in the commit history.
  - If the project is **not** a git repository, skip this step gracefully and note "no git repository found" in your findings.

For each file you read, extract only what's useful. Do not copy entire files.`,
  },
  {
    id: "summarize",
    title: "Phase 2: Summarization",
    instructions: `Organize your findings into the 7 PROJECT files. Use the \`pio-project-knowledge\` skill as the sole reference for:
- Canonical file paths
- Section headings and subsection structure
- Expected content for each section

The skill is the single source of truth for PROJECT file structure. Do not invent sections or headings not defined in the skill.`,
    skills: { mandatory: ["pio-project-knowledge"] },
  },
  {
    id: "clarify",
    title: "Phase 3: Clarification",
    instructions: `Review your answers from Phase 2. Are there any gaps, ambiguities, or areas where you are uncertain? List them all. Then use the \`ask_user\` tool to clarify them one by one — ask focused, specific questions. Do not ask filler questions like "anything else?". Only ask when there is a genuine gap that would make the output files incomplete or misleading.`,
  },
  {
    id: "write-files",
    title: "Phase 4: Write Output Files",
    instructions: `Once all gaps are resolved, write the 7 files under \`.pio/PROJECT/\`. Follow the section structure defined in the \`pio-project-knowledge\` skill — use its section headings, subsections, and content expectations as the exact template for each file.

### Guidance

- **Not all files are relevant to every project.** For example: skip \`GIT.md\` for non-git repos (write "No git repository found" instead), \`GLOSSARY.md\` may be minimal for simple projects, and \`DEPENDENCIES.md\` may have little content for single-service projects with no external integrations.
- **When a file has no relevant content**, write a brief note ("No significant findings in this category") rather than leaving the file empty. This distinguishes "analyzed and found nothing" from "not analyzed".
- **Write all files to \`.pio/PROJECT/\`** (the directory). Do not write the old single-file format.
- **Be concise.** Each file should target ~2000 tokens (~1500 words) maximum. Prioritize actionable information — commands, file paths, conventions — over narrative descriptions.

**Quality bar:** Every claim should be backed by a file you actually read or confirmed with the user. If something is uncertain, note it as such rather than guessing. The files should be dense with relevant information — not padded with boilerplate, not essays.`,
  },
  {
    id: "signal-completion",
    title: "Phase 5: Signal Completion",
    instructions: `After writing all output files to \`.pio/PROJECT/\`, call \`pio_mark_complete\` to signal that your work is done.`,
  },
] satisfies WorkflowStep[];
