# DevPrep — Project Definition

## Overview

DevPrep is a personal, fully offline technical interview preparation platform. It is built by extending [Cojudge](https://github.com/cojudge/cojudge), an open-source offline-first code judge, into a comprehensive study tool covering coding problems, computer science fundamentals, system design, and programming language mastery.

The project is licensed under the [MIT License](LICENSE), inherited from Cojudge.

## Motivation

Existing interview preparation tools require internet access, impose usage limits, or do not provide a unified experience across coding practice, conceptual review, and spaced repetition. DevPrep consolidates these into a single, locally deployed application where progress, solutions, and learning history are entirely under the user's control.

## Target Users

- Software engineers preparing for technical interviews.
- Computer science students practising algorithmic problem-solving.
- Self-directed learners studying data structures, algorithms, and system design.

### Usage Assumptions

- Single-user, local deployment.
- Docker available on the host machine.
- Internet required only for initial setup (pulling Docker images and dependencies).
- All functionality works offline after setup.

## Product Principles

1. **Offline-first.** Every feature must work without an internet connection after initial setup.
2. **Preserve user data.** Code, progress, notes, and history must never be silently lost or corrupted.
3. **Incremental extension.** Build on top of Cojudge rather than rewriting it.
4. **Coding platform first.** The NeetCode 250 judge must be reliable before expanding to other learning modules.
5. **Evidence over claims.** Never report a feature as working unless it has been tested with actual execution.

## v1.0 Requirements — Coding Platform (Mandatory)

These requirements define the minimum acceptable release. All must be satisfied.

### Problem Library

- All 250 NeetCode 250 problems available and functional.
- Problem statements, examples, hints, and difficulty ratings displayed.
- Problems organised by topic and associated study lists (Blind 75, NeetCode 150, NeetCode 250).

### Code Execution

- Python 3, C++17, and Java 17 support for all 250 problems.
- Public test execution (sample tests visible to user).
- Hidden test submission (full test suite, results reported).
- Correct solutions accepted; incorrect solutions rejected.
- Timeout detection and error reporting.
- 750/750 language-problem combinations passing acceptance tests.

### Practice Modes

- Structured sequential practice within a topic or study list.
- Random problem selection with configurable filters.
- Timed practice sessions.

### Search and Navigation

- Problem search by title, slug, or keyword.
- Filter by difficulty, topic, study list, and completion status.
- Language-specific LeetCode syntax cheatsheets.

### Persistence and History

- Solution history: every submission recorded with timestamp and verdict.
- Personal notes and reflections per problem.
- Spaced repetition scheduling based on problem performance.
- Progress tracking that survives application restarts.
- Reliable backup and restore.

### Deployment

- Portable Docker-based deployment.
- Documented setup procedure.
- All dependencies available offline after initial setup.

## Secondary Requirements — Learning Platform (Post-v1.0)

These features are planned but must not block the v1.0 release.

### CS Fundamentals

- Short, interview-oriented lessons on core topics.
- MCQs and scenario-based assessments.

### System Design

- Structured learning modules.
- Diagram-based exercises.

### Programming Language Depth

- C++ fundamentals and advanced concepts.
- Java fundamentals, internals, and frameworks.
- Python fundamentals, internals, and frameworks.

### Adaptive Learning

- Rule-based proficiency tracking across coding and conceptual topics.
- Shared concept mastery influencing spaced repetition.
- Short mixed daily review sessions.
- Focused deep-dive sessions.
- Optional role-specific interview preparation plans.

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| Offline operation | Full functionality after initial setup |
| Startup time | Under 10 seconds to usable UI |
| Code execution latency | Under 15 seconds per run for typical problems |
| Data durability | No silent data loss on normal shutdown |
| Supported platforms | macOS, Linux (Docker required) |

## Explicit v1.0 Exclusions

- Cloud synchronisation or multi-device sync.
- Multi-user or collaborative features.
- AI-assisted hints, code generation, or automated explanations.
- Mobile or tablet-optimised UI.
- CS fundamentals, system design, or language-depth modules.
- Adaptive learning or interview plan features.

## Release Acceptance Criteria

The v1.0 release is accepted when:

1. All 250 NeetCode 250 problems pass automated tests in Python, C++, and Java (750/750).
2. Public test execution and hidden test submission work for all three languages.
3. Incorrect solutions are correctly rejected.
4. Timeout and error conditions are reported accurately.
5. Solution history records every submission with timestamp and verdict.
6. Notes and reflections can be created, edited, and persisted per problem.
7. Spaced repetition scheduling is functional.
8. At least three practice modes are usable (structured, random, timed).
9. Search and filter work across all problems.
10. Progress and history survive application restart.
11. Backup and restore produce a complete, restorable archive.
12. The application deploys with documented Docker commands and works offline.
13. All automated tests pass (`npm test`, build succeeds).

## Development Constraints

- **Timeline:** 6-8 weeks, 20+ hours/week of developer supervision.
- **Team:** Product Owner, ChatGPT (technical orchestrator), Claude Code (implementation engineer).
- **Architecture:** Extend Cojudge's SvelteKit + Docker architecture. See [ARCHITECTURE.md](ARCHITECTURE.md).
- **Governance:** Significant architectural changes require an ADR and review. See [docs/adr/](docs/adr/).

## Key Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Judge bugs in specific problems | Incorrect grading undermines trust | Systematic 750-problem verification |
| Docker unavailability | Cannot execute code | Document prerequisites; test on clean machines |
| localStorage data loss | Progress lost | Implement backup/restore; plan persistence migration |
| Scope creep into learning modules | v1.0 delayed | Learning features are explicitly post-v1.0 |
| Upstream Cojudge changes | Merge conflicts | Track upstream as remote; merge selectively |

## Definition of Done

A task is done when:

1. Implementation satisfies stated acceptance criteria.
2. Relevant automated tests pass.
3. No regressions in existing functionality.
4. Changes are committed on a feature branch with a clear description.
5. A task completion report documents what was done, what was tested, and what remains.
