# ADR-0005: SQLite Persistence for User Data

**Status:** Accepted

**Date:** 2026-10-28

## Context

DevPrep currently stores all user data in browser `localStorage`:

- **Editor code** (`solutions` key) — one code string per problem ID, no language discrimination.
- **Completion progress** (`user-checkboxes`) — boolean solved status per problem.
- **Settings** (`user-settings`) — theme, language, font size, vim mode.
- **Bookmarks** (`user-bookmarks`) — bookmarked problems.
- **Custom test cases** (`testcases`) — user-modified sample inputs.
- **Game results** (`game-results`) — timed practice scores and code.
- **Playground files** (`files`) — editor tabs and content.

This architecture has critical limitations:

1. **No submission history.** Only the last-edited code is retained. Previous submissions, verdicts, and execution results are lost.
2. **No structured reflections.** Users cannot record approaches, mistakes, or takeaways.
3. **No spaced repetition.** Only binary solved/unsolved exists; no scheduling data.
4. **Browser-bound.** Clearing browser data, switching browsers, or reinstalling Docker loses everything.
5. **No per-language drafts.** Switching language overwrites the previous draft.

These limitations block the DevPrep v1.0 requirements for submission history, notes, reflections, spaced repetition, and durable progress tracking.

## Decision

Migrate user data persistence from browser `localStorage` to a server-side SQLite database using `better-sqlite3`.

The database file (`data/devprep.sqlite`) lives on the server filesystem (Docker volume in containerised deployments). SvelteKit API routes provide CRUD access. The browser communicates via standard fetch calls to these endpoints.

### Key design choices:

1. **`better-sqlite3`** over async alternatives — synchronous API is simpler in SvelteKit server routes, avoids callback complexity, and provides sub-millisecond read performance.
2. **Single file** — one SQLite database contains all user data. Backup is copying one file.
3. **Problem slugs as stable identifiers** — the `problems` table references slugs from the filesystem without duplicating content.
4. **WAL mode** — `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` for crash resilience.
5. **Migration-on-first-access** — the browser sends its localStorage data to a server migration endpoint once.

### Schema summary:

| Table | Purpose |
|---|---|
| `problems` | Lightweight slug registry (auto-populated on first interaction) |
| `user_progress` | Solved status per (problem, language) with timestamps |
| `editor_drafts` | Code drafts per (problem, language) |
| `submissions` | Full submission history with code, verdict, timing |
| `notes` | Free-form Markdown notes per problem |
| `reflections` | Structured reflections with optional history |
| `review_schedules` | SM-2 spaced repetition state per problem |
| `study_plan_metadata` | Key-value store for future plan configuration |
| `settings` | Migrated user preferences and bookmarks |

Full schema and API design: [docs/architecture/persistence-proposal.md](../architecture/persistence-proposal.md).

## Alternatives Considered

### Alternative A: Enhanced localStorage with server-side backup

Keep data in localStorage; add a server endpoint that periodically receives a JSON backup blob written to the filesystem.

**Why not chosen:**
- Primary data remains browser-bound; backup may be stale.
- No structured queries for submission history, spaced repetition scheduling, or filtering.
- localStorage is synchronous and blocks the main thread for large JSON blobs.
- Cannot support the requirements for submission history at scale.

### Alternative B: Alternative embedded database (LevelDB / LMDB / DuckDB)

Same server-side architecture but with a non-SQL embedded store.

**Why not chosen:**
- Fewer prebuilt native binaries (especially ARM64 Alpine).
- No standard query language; application-level schema versioning required.
- Worse backup story (directory trees instead of single file).
- Smaller ecosystem and documentation for SvelteKit integration.
- No advantage over SQLite for this workload.

### Alternative C: IndexedDB (browser-side)

Use the browser's IndexedDB for structured storage, keeping all data client-side.

**Why not chosen:**
- Still browser-bound; data does not survive browser data clearing.
- No server-side access for recording submissions directly from the judge pipeline.
- More complex API than SQLite for the same schema.
- Docker volume persistence requires a separate sync mechanism.

## Consequences

### Positive

- **Durable persistence** independent of browser state. Data survives browser clearing, reinstalls, and Docker container recreation (via volumes).
- **Submission history** recorded server-side with zero additional round-trips (the judge already has the verdict).
- **Structured queries** for spaced repetition scheduling, submission filtering, and progress reporting.
- **Per-language drafts** via composite `(slug, language)` keys.
- **Simple backup** — download one `.sqlite` file or a JSON export.
- **Schema migrations** via `PRAGMA user_version` — safe for single-user, single-server.

### Negative

- **New native dependency** (`better-sqlite3`) — adds a compiled C++ addon. Prebuilt binaries cover most targets, but Alpine ARM64 may need verification.
- **Server state** — the application is no longer stateless on the server side. Server restarts preserve data (file-based), but this is a conceptual shift.
- **Migration complexity** — one-time localStorage → SQLite migration must handle edge cases (corrupted data, partial migration, re-migration).
- **Browser/server coordination** — stores currently write to localStorage synchronously; the transition to async server writes needs careful UX (debouncing, optimistic updates).
- **Dockerfile changes** — the database file needs a persistent volume mount. Existing `docker.sh` / `Dockerfile` must be updated.

### Risks

| Risk | Mitigation |
|---|---|
| `better-sqlite3` binary unavailable for target platform | Verify prebuilt binaries during Dockerfile build; fall back to `node:22-slim` (Debian) if Alpine musl fails. See proposal §10.2 |
| Migration data loss | `INSERT OR IGNORE` makes migration idempotent; original localStorage untouched until user confirms; `/recovery` page still works. See proposal §10.3 |
| Database corruption | WAL mode + `PRAGMA integrity_check` on startup; corrupt file renamed and fresh DB created; JSON export as secondary backup. See proposal §10.5 |
| Backup inconsistency under WAL | `database.backup()` API produces a self-contained snapshot; filesystem copies require `-wal`/`-shm` files or a checkpoint. See proposal §10.1 |
| Restore overwrites user data | Restore writes to temp file, renames atomically; previous DB backed up to `.bak`; migration never overwrites existing server-side data. See proposal §10.4 |
| Persistence write failure | Failures surfaced to user, not swallowed; localStorage write-through cache preserves data; disk-full and crash scenarios handled. See proposal §10.5 |

## Implementation Reconciliation (M3 Phase 1)

The following details were confirmed during implementation:

| Aspect | Proposed | Implemented |
|---|---|---|
| Database location | `data/devprep.sqlite` | Confirmed. Configurable via `DEVPREP_DATA_DIR`. |
| Driver | `better-sqlite3` | Confirmed. Works with Node 26.0.0. |
| Alpine musl compatibility | Needed verification | Build from source required — `python3`, `make`, `g++` added to Dockerfile deps stage. |
| Docker volume | Not specified | `cojudge-data` named volume mapped to `/usr/src/app/data` in `docker.sh`. |
| Schema | 9 tables proposed | 8 tables implemented (v1). `problems` table dropped — slugs used directly as foreign-key-free identifiers since problem content lives on the filesystem. |
| Migration mechanism | `PRAGMA user_version` | Confirmed. Transactional, idempotent. Rejects newer schema versions. |
| Backup | `database.backup()` API | Confirmed. WAL-consistent snapshots. Restore validates integrity before replacing. |
| localStorage migration | Proposed as migration-on-first-access | Deferred to M3 Phase 2. Browser stores unchanged in this phase. |

## Related

- **Full proposal:** [docs/architecture/persistence-proposal.md](../architecture/persistence-proposal.md)
- **Implementation:** [docs/architecture/sqlite-implementation.md](../architecture/sqlite-implementation.md)
- **Backup/restore:** [docs/maintenance/sqlite-backup-restore.md](../maintenance/sqlite-backup-restore.md)
- **Current stores:** `src/lib/stores/codeStore.ts`, `userStore.ts`, `userSettingsStorage.ts`, `testCaseStore.ts`, `bookmarkStore.ts`, `fileStore.ts`, `gameResultsStore.ts`
- **Backup system:** `src/lib/progressBackup.ts`
- **Recovery page:** `src/routes/recovery/+page.svelte`
- **ADR-0001:** Extend Cojudge rather than rewrite (this proposal extends, does not replace)
