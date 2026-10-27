# ADR-0001: Extend Cojudge Rather Than Rewrite

**Status:** Accepted

**Date:** 2026-10-27

## Context

DevPrep requires a fully functional NeetCode 250 coding practice platform with Python, C++, and Java support, Docker-based execution, and offline operation. We evaluated three approaches during the Phase 0 feasibility assessment:

- **A. Fork Cojudge and extend it.** Keep the existing SvelteKit frontend, Docker-based judge, and problem content.
- **B. Reuse Cojudge's judge, build a new frontend.** Extract the runner/marker subsystem and build a new UI.
- **C. Use Cojudge as reference, build from scratch.** Study the design and reimplement in a different stack.

Cojudge (v0.8.8, MIT licensed) provides:

- 250/250 NeetCode 250 problems with complete metadata, statements, test cases (7,600+), starter code, validators, and solutions.
- A working 8-language judge with Docker-based execution.
- A functional offline-first SvelteKit UI with Monaco editor, progress tracking, and a code playground.
- 231 passing unit tests and 13 E2E test files.

## Decision

**Fork Cojudge and extend it (Option A).**

Retain:
- SvelteKit 2 / Svelte 5 frontend.
- Docker-based judge architecture (`ProgramRunner` → `compile()` → `run()` → `Marker.java`).
- Existing problem content and course definitions.
- Existing language runners (Python, C++, Java + 5 others).
- Browser `localStorage` for initial persistence (with approved future migration path).

Extend with:
- Solution history and submission tracking.
- Personal notes and reflections.
- Spaced repetition scheduling.
- Practice modes (structured, random, timed).
- Search and filtering improvements.
- Container security hardening.

## Alternatives Considered

### B. New frontend, reuse judge

Would discard a functional UI that already implements problem browsing, code editing, test execution, and progress tracking. Estimated 4-6 weeks to reach the same baseline. Not justified when the existing UI meets v1.0 requirements.

### C. Full rewrite

Would require reimplementing the judge, type system, harness generation, and content pipeline. Estimated 8-12 weeks. The 250-problem content library and its validators would need to be recreated or manually adapted.

## Consequences

**Positive:**
- Immediate access to 250 complete problems with validated test suites.
- Working judge for 8 languages, tested in production on cojudge.cloud.
- Time to v1.0 estimated at 1-2 weeks for verification, plus feature development.
- Upstream fixes can be selectively merged via the `upstream` remote.

**Negative:**
- Inherited technical debt: no container security hardening, localStorage-only persistence, Firebase dependency.
- SvelteKit is the frontend framework regardless of team familiarity.
- Cojudge's Svelte 5 / `+page.svelte` files are large (homepage is 154 KB) and may need refactoring for maintainability.

## Related

- Feasibility report: [docs/feasibility/implementation-recommendation.md](../feasibility/implementation-recommendation.md)
- Architecture audit: [docs/feasibility/architecture-audit.md](../feasibility/architecture-audit.md)
- Problem inventory: [docs/feasibility/problem-inventory.csv](../feasibility/problem-inventory.csv)
- Gap analysis: [docs/feasibility/neetcode250-gap-analysis.md](../feasibility/neetcode250-gap-analysis.md)
