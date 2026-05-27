# Replace TDD Skill with Matt Pocock's Skill

Copy Matt Pocock's TDD skill from the local clone (`~/git/skills/skills/engineering/tdd/`) into `src/skills/tdd/`, review it against our needs, make minimal adaptations for the pio workflow, then delete the existing `src/skills/test-driven-development/` skill.

## Current State

Two TDD-related skills exist:

- **`src/skills/test-driven-development/SKILL.md`** — our current TDD skill. Covers RED-GREEN-REFACTOR, Prove-It Pattern, test pyramid, DAMP over DRY, state-based assertions, Arrange-Act-Assert, mock preference order, browser testing with security boundaries, anti-patterns, verification checklists. References `.pio/PROJECT/DEVELOPMENT.md` and `.pio/PROJECT/CONVENTIONS.md`. Has YAML frontmatter with `name: test-driven-development` for pi's `<available_skills>` discovery. Referenced by name in `src/prompts/execute-task.md`: "Apply TDD methodology: Follow the `test-driven-development` skill..."

- **`~/git/skills/skills/engineering/tdd/`** — Matt Pocock's TDD skill (local clone of github.com/mattpocock/skills). Contains multiple files:
  - `SKILL.md` — main doc covering philosophy (tests through public interfaces), anti-pattern of horizontal slices vs vertical tracer bullets, workflow (planning → tracer bullet → incremental loop → refactor), per-cycle checklist
  - `tests.md` — good vs bad test examples (TypeScript)
  - `mocking.md` — mock at system boundaries only, dependency injection, SDK-style interfaces
  - `interface-design.md` — accept dependencies, return results, small surface area
  - `deep-modules.md` — deep vs shallow modules from "A Philosophy of Software Design"
  - `refactoring.md` — refactor candidates (duplication, long methods, shallow modules, feature envy, primitive obsession)

## To-Be State

1. **Copy** the entire `~/git/skills/skills/engineering/tdd/` directory to `src/skills/tdd/`. Name is `tdd` (matching Pocock's frontmatter). Preserve all files as-is: `SKILL.md`, `tests.md`, `mocking.md`, `interface-design.md`, `deep-modules.md`, `refactoring.md`.

2. **Review** the copied skill in its new home alongside our existing `test-driven-development/` skill. Read both side by side to understand what the new one covers differently and what (if anything) from the old one is missing that we need for pio's workflow context.

3. After review, decide: does it work as-is? Do we need Pio-specific additions (browser security boundaries, TEST.md convention references, `.pio/PROJECT/` file references)? Or do we merge concepts?

4. **Delete** `src/skills/test-driven-development/` once the `tdd` skill is ready to replace it.

5. **Update references** — ensure `src/prompts/execute-task.md` (and any other files) reference the correct skill name so pi's `<available_skills>` discovery works.

## Open Assumptions

- The multi-file structure (SKILL.md + reference `.md` files) is compatible with pi's skill loading — skills are discovered via `SKILL.md` and progressive disclosure links (`[link](file.md)`) resolve relative to the skill directory.
- No code in the extension explicitly imports or parses the TDD skill — it's purely a documentation skill loaded by agents at runtime.
