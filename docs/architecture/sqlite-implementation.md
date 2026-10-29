# SQLite Implementation — M3 Phase 1

**Date:** 2026-10-29
**Branch:** `feat/sqlite-foundation`
**ADR:** [0005](../adr/0005-sqlite-persistence-proposal.md) (Accepted)

---

## Overview

Server-side SQLite database for durable user data persistence. Browser `localStorage` remains unchanged — migration is planned for M3 Phase 2.

## Database Location

| Environment | Path | Configuration |
|---|---|---|
| Development | `data/devprep.sqlite` | Default (`./data/` relative to project root) |
| Docker | `/usr/src/app/data/devprep.sqlite` | Named volume `cojudge-data` |
| Custom | Any writable path | `DEVPREP_DATA_DIR` environment variable |

The `data/` directory is gitignored. It is auto-created on first access. Never stored under `node_modules/`, `.svelte-kit/`, or `build/`.

## Driver

`better-sqlite3` — synchronous C++ addon for Node.js.

| Property | Value |
|---|---|
| API | Synchronous (no async overhead in SvelteKit server routes) |
| Read performance | Sub-millisecond |
| Node.js compatibility | Requires Node >= 22. Verified with Node 22.23.4 (Docker) and Node 26.0.0 (dev). |
| macOS ARM64 | Prebuilt binary available |
| Linux x86_64 (glibc) | Prebuilt binary available |
| Linux ARM64/x86_64 (musl/Alpine) | Build from source — `python3`, `make`, `g++` added to Dockerfile deps stage |

## Database Configuration

```
PRAGMA journal_mode = WAL
PRAGMA synchronous = NORMAL
PRAGMA foreign_keys = ON
PRAGMA busy_timeout = 5000
```

WAL mode provides crash resilience and allows concurrent reads during writes. NORMAL synchronous balances durability with performance for a single-user application.

## Schema (v1)

8 tables, version tracked via `PRAGMA user_version = 1`.

| Table | Primary Key | Purpose |
|---|---|---|
| `user_progress` | `(slug, language)` | Solved status with timestamps |
| `editor_drafts` | `(slug, language)` | Code drafts per problem/language |
| `submissions` | `id` (autoincrement) | Full submission history with code, verdict, timing |
| `notes` | `slug` | Free-form Markdown notes per problem |
| `reflections` | `id` (autoincrement) | Structured reflections (approach, mistakes, takeaways, complexity, confidence) |
| `review_schedule` | `slug` | SM-2 spaced repetition state |
| `settings` | `key` | Key-value store for user preferences |
| `migration_meta` | `key` | Tracks localStorage migration status |

Problem slugs from the filesystem are the stable identifiers. The schema does NOT duplicate problem content — the filesystem remains the source of truth.

## Migrations

- Schema version tracked via `PRAGMA user_version`.
- Initial schema applied transactionally on first access (version 0 → 1).
- `CREATE TABLE IF NOT EXISTS` makes schema creation idempotent.
- A database with a version newer than supported is rejected with a clear error.
- Future migrations: sequential version checks (`if currentVersion < 2 { ... }`).

## Initialization

Lazy singleton — the database is created on first call to `getDb()`, not at module load time. This avoids initialization during SvelteKit builds and test harnesses.

Entry point: `src/lib/server/db/index.ts`.

## Backup and Restore

- **Backup:** `better-sqlite3`'s `db.backup(destPath)` produces a WAL-consistent snapshot. All committed data is included regardless of WAL state.
- **Restore:** Offline maintenance operation. Validate backup → close live DB → checkpoint WAL → rename current to `.previous` → stage and rename backup to live path → reopen and verify. On failure, `.previous` is renamed back and reopened.
- **Validation:** Integrity check, minimum size, schema version (rejects `0` and versions newer than supported), required tables (all 8).

See [sqlite-backup-restore.md](../maintenance/sqlite-backup-restore.md) for operational procedures.

## Docker Persistence

```
docker run ... -v cojudge-data:/usr/src/app/data ...
```

The `docker.sh` deployment script mounts a named volume `cojudge-data` (configurable via `DATA_VOLUME` env var). The database survives container recreation.

The Dockerfile declares `VOLUME /usr/src/app/data` and creates the directory during build.

**Important:** This volume is separate from the Docker socket mount used for judge containers. The database is never exposed to untrusted code execution containers.

## What This PR Does NOT Change

- Browser `localStorage` stores remain active and unchanged.
- No automatic migration from localStorage to SQLite.
- No submission recording in the judge pipeline.
- No new UI for notes, reflections, or submission history.
- No changes to Run/Submit execution logic.
