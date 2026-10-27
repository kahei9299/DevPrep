# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the DevPrep project. ADRs document significant technical decisions, the context that motivated them, alternatives considered, and their consequences.

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| [0000](0000-template.md) | ADR Template | — | — |
| [0001](0001-extend-cojudge.md) | Extend Cojudge rather than rewrite | Accepted | 2026-10-27 |
| [0002](0002-retain-cojudge-runtime-versions.md) | Retain Cojudge's runtime versions for v1.0 | Accepted | 2026-10-27 |

## When to Create an ADR

Create an ADR before implementing changes to:

- Frameworks or major dependencies.
- Database or persistence strategy.
- Code execution or judging architecture.
- Docker security model.
- Problem/test content format.
- Public API interfaces.

## Process

1. Copy [0000-template.md](0000-template.md) to a new file with the next sequence number.
2. Fill in the context, decision, alternatives, and consequences.
3. Set status to **Proposed**.
4. Submit for review.
5. Update status to **Accepted** or **Rejected** after review.
