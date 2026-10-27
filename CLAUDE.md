# DevPrep — Claude Code Instructions

This file provides persistent working instructions for Claude Code sessions on the DevPrep project.

## Project Context

DevPrep is an offline-first technical interview preparation platform built by extending [Cojudge](https://github.com/cojudge/cojudge). See [PROJECT.md](PROJECT.md) for requirements and [ARCHITECTURE.md](ARCHITECTURE.md) for the technical design.

**Development roles:**
- **Product Owner:** Goals, priorities, and approvals.
- **ChatGPT:** Technical orchestrator and architectural reviewer.
- **Claude Code:** Implementation engineer.

Do not independently expand scope or make major architectural changes without review.

## Before Implementation

1. Read [PROJECT.md](PROJECT.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [TASKS.md](TASKS.md).
2. Review relevant [architecture decisions](docs/adr/).
3. Inspect existing code before modifying it.
4. Identify the active milestone and its acceptance criteria.
5. State assumptions and unresolved questions before proceeding.
6. Do not refactor, restructure, or expand scope beyond the stated task.

## During Implementation

1. **Preserve Cojudge functionality.** Existing features must keep working.
2. **Prefer incremental changes over rewrites.** Extend; do not replace.
3. **Follow existing conventions.** Match the code style in `src/` (TypeScript, Svelte 5 runes, 2-space indentation, no trailing semicolons).
4. **Keep the judge independent.** The runner/marker system must not depend on future learning modules.
5. **Maintain offline operation.** No feature may require network access after initial setup.
6. **No cloud dependencies.** Do not add or rely on Firebase, external APIs, or cloud services.
7. **Protect user data.** Never silently delete or corrupt code, progress, notes, or history.
8. **Add tests.** Every meaningful change needs test coverage.
9. **Never weaken correctness checks** to make tests pass.
10. **Never mark an unexecuted test as passed.**

## Architecture Governance

Before implementing changes to any of the following, create an ADR proposal in `docs/adr/` and request review:

- Frameworks or major dependencies.
- Database or persistence strategy.
- Code execution architecture.
- Docker security model.
- Problem/test content format.
- Public API interfaces.

Use the template at [docs/adr/0000-template.md](docs/adr/0000-template.md).

## Version Control

- Work on dedicated feature branches. Do not commit directly to `main`.
- Keep `main` stable and deployable.
- Write clear, focused commit messages.
- Do not force-push or rewrite shared history without explicit approval.
- Do not commit secrets, personal data, or generated build artifacts.
- Prefer reviewable pull requests for substantial changes.

## Testing and Verification

- Run `npm test` for unit tests.
- Run `npm run build` to verify the build.
- Run `npm run check` for Svelte/TypeScript type checking.
- Execute Docker judge tests when changing judge behaviour.
- Report exact commands and results. Clearly note any tests that could not run.
- Add regression tests for fixed bugs.
- Preserve evidence (logs, screenshots) supporting milestone completion.

## Content and Licensing

- Preserve upstream MIT licence and Cojudge attribution.
- Do not scrape LeetCode or restricted third-party content.
- Maintain provenance for imported content.
- Do not claim generated or AI-assisted content has been independently verified unless it has been.

## Task Completion

At the end of every implementation task, provide a report following the template in [docs/templates/task-completion-report.md](docs/templates/task-completion-report.md).

## Quick Reference

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server (localhost:5173) |
| `npm run build` | Production build |
| `npm test` | Run unit tests (Vitest) |
| `npm run check` | Svelte/TypeScript type checking |
| `npm run test:e2e` | Playwright end-to-end tests |

| File | Purpose |
|---|---|
| [PROJECT.md](PROJECT.md) | What and why |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the system is built |
| [TASKS.md](TASKS.md) | What is currently being worked on |
| [docs/adr/](docs/adr/) | Why decisions were made |
