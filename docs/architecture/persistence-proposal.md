# DevPrep — Persistence Architecture Proposal

**Date:** 2026-10-28
**Status:** Proposed (design only — no implementation)

---

## 1. Current localStorage Architecture

All user state lives in browser `localStorage`. There is no server-side database.

### Store Inventory

| Store File | localStorage Key | Shape | Purpose |
|---|---|---|---|
| `codeStore.ts` | `solutions` | `Record<string, string>` — problem ID → code | Last-edited code per problem (single language; key is `problemId` alone) |
| `userStore.ts` | `user-checkboxes` | `Record<string, boolean>` — problem ID → solved | Problem completion progress |
| `userSettingsStorage.ts` | `user-settings` | `UserSettings` object (language, theme, font, vim, indentation, sidebar, panel) | Editor and UI preferences |
| `testCaseStore.ts` | `testcases` | `Record<string, any[]>` — problem ID → custom test cases | User-modified sample test cases |
| `bookmarkStore.ts` | `user-bookmarks` | `Record<string, boolean>` — problem ID → bookmarked | Bookmarked problems |
| `fileStore.ts` | `files` | `Record<string, string>` — slug → JSON of `FileEntry[]` | Playground file entries (editor tabs, content, language, share metadata) |
| `gameResultsStore.ts` | `game-results` | `Record<string, GameResult[]>` — problem ID → scored attempts | Timed game mode history (code, language, score, rank, timestamp) |
| `layoutStore.ts` | `pane-width`, `exec-pane-height` | number | UI panel dimensions |

Additional localStorage keys managed outside stores:
- `banner-dismissed`, `open-groups`, `group-sort` — UI state.
- `cojudge-whiteboard-v1`, `cojudge-whiteboard-v1:share:*` — Whiteboard data.
- `cojudge.playground.stdin.*` — Playground stdin per workspace.

### Cross-Tab Sync

`codeStore`, `bookmarkStore`, and `fileStore` use `crossTabSync.ts` to detect `storage` events from other tabs and update the local Svelte store, preventing stale-tab overwrites.

### Backup and Recovery

`progressBackup.ts` provides:
- `collectProgressData(storage)` — collects all non-excluded localStorage keys into a JSON object.
- `serializeProgressData(data)` / `hashProgress(serialized)` — deterministic serialization and SHA-256 hashing.
- `encodeProgressParts` / `decodeProgressParts` — chunked base64 encoding for cloud transfer.
- `writeProgressStorageItem` — write guard that defers writes during cloud restore.
- Cloud sync keys (`CLOUD_KEYS`) selectively include: `files`, `game-results`, `solutions`, `testcases`, `user-bookmarks`, `user-checkboxes`, `cojudge-whiteboard-v1`.

The `/recovery` page is a safe-mode inspector that reads localStorage directly, shows per-key sizes, and allows manual export/import. It deliberately avoids heavy dependencies (no Monaco, no execution panels).

---

## 2. Risks of Current Approach

| Risk | Severity | Detail |
|---|---|---|
| Browser data clearing | **Critical** | Clearing browser data, switching browsers, or reinstalling Docker loses all progress and code |
| No submission history | **High** | Only the last-edited code is retained; previous submissions, verdicts, timestamps are lost |
| No structured reflections | **High** | No notes, approach descriptions, mistake logs, or complexity analysis per problem |
| No spaced repetition data | **High** | Cannot schedule review intervals — only binary solved/unsolved exists |
| Storage limits | **Medium** | localStorage is typically 5–10 MB; large playground workspaces can approach this. `persistLimits.ts` already manages this. |
| Single-browser binding | **Medium** | Data is browser-specific; switching from Chrome to Firefox loses everything |
| No per-language code | **Low** | `codeStore` maps `problemId → code` without language discrimination; switching language overwrites the previous draft |
| No crash recovery | **Low** | localStorage writes are synchronous and atomic per key; crash risk is low but unrecoverable if data corrupts |

---

## 3. Proposed Requirements

DevPrep needs local persistence supporting:

1. **Problem progress** — solved status, per-language, with timestamps.
2. **Per-language editor drafts** — code drafts keyed by (problem, language) instead of problem alone.
3. **Submission history** — every Run/Submit recorded with code snapshot, language, verdict, test results, execution time, memory, timestamp.
4. **Personal notes** — free-form Markdown notes per problem.
5. **Structured reflections** — approach, mistakes, key takeaways, time complexity, space complexity, confidence level. Optional history of reflections.
6. **Spaced-repetition scheduling** — next review date, interval, ease factor, repetition count per problem.
7. **Future mastery tracking** — proficiency scores across topics and concepts.
8. **Import/export** — full backup to a single file, restorable on any instance.
9. **Migration** — existing localStorage data must be migrated without loss on first server-side access.

All requirements must work offline, in a single-user Docker deployment.

---

## 4. Options Evaluated

### Option 1: Server-Side SQLite via `better-sqlite3`

**Architecture:** SvelteKit API routes read/write a SQLite file on the server filesystem. The browser communicates via fetch. The SQLite file lives in a Docker volume.

| Criterion | Assessment |
|---|---|
| Architecture complexity | **Medium.** New API endpoints, schema migrations, and browser→server sync for stores currently client-only. |
| Data durability | **Excellent.** SQLite WAL mode survives crashes. Docker volume persists across container restarts. Independent of browser state. |
| Docker volume persistence | **Native.** `docker run -v devprep-data:/data` maps the SQLite file to a named volume. |
| Platform compatibility | **Good.** `better-sqlite3` publishes prebuilt binaries for linux-x64 and linux-arm64 (Alpine musl included). macOS x64/arm64 also covered. |
| Backup / restore | **Excellent.** Copy one `.sqlite` file, or use SQLite `.backup` API. JSON export/import via API endpoint. |
| Schema migrations | **Simple.** `user_version` pragma + migration scripts on server start. Single-user means no concurrent migration risk. |
| Crash recovery | **Good.** WAL mode + `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` gives durability without fsync overhead. |
| Performance | **Excellent.** `better-sqlite3` is synchronous C++; sub-millisecond reads. No event loop blocking for typical queries. |
| localStorage migration | **One-time.** Browser sends `collectProgressData()` to a server migration endpoint on first access. Server writes to SQLite, browser can clear migrated keys. |
| Browser/server sync | **Medium complexity.** Editor drafts need debounced saves. Progress updates on Run/Submit happen server-side already (the job endpoints could write history). Test case customizations and bookmarks need new endpoints. |
| Offline operation | **Full.** SQLite is a file; no network needed. |
| Testing | **Easy.** In-memory SQLite (`:memory:`) for unit tests. |

### Option 2: Alternative Embedded Database (LevelDB / LMDB / DuckDB)

| Criterion | Assessment |
|---|---|
| Architecture complexity | **Medium-High.** Same server-side pattern as SQLite but with less mature Node.js bindings and no standard SQL interface. |
| Data durability | **Variable.** LevelDB: good. LMDB: excellent. DuckDB: designed for analytics, not OLTP. |
| Platform compatibility | **Worse.** Fewer prebuilt native binaries, especially for ARM64 Alpine. |
| Backup / restore | **Harder.** No `.backup` equivalent; must copy directory trees or implement custom export. |
| Schema migrations | **Manual.** No schema language; key-value stores need application-level versioning. |
| Ecosystem | **Smaller.** Less documentation, fewer examples for SvelteKit integration. |
| Testing | **Harder.** No in-memory mode for most options. Temp directories required. |

No advantage over SQLite for this use case.

### Option 3: Enhanced localStorage with Server-Side Backup

**Architecture:** Keep all data in localStorage. Add a server-side JSON backup file that the browser periodically pushes to (like the existing cloud sync, but to the local server filesystem).

| Criterion | Assessment |
|---|---|
| Architecture complexity | **Low.** Minimal server changes; one endpoint to POST/GET a JSON blob. |
| Data durability | **Poor.** Primary data is still in localStorage. Backup file may be stale. |
| Docker volume persistence | **Partial.** Backup file in volume, but browser is the source of truth. |
| Structured queries | **None.** No way to query submission history, filter by date, sort by confidence, etc. without loading the entire blob. |
| Submission history | **Awkward.** Must grow the localStorage JSON indefinitely; no indexing. |
| Spaced repetition | **Difficult.** No server-side scheduling; everything is client-computed. |
| Schema migrations | **Fragile.** JSON blobs have no schema enforcement. |
| Performance | **Degrades.** localStorage is synchronous; large JSON serialization blocks the main thread. |
| Testing | **Easy.** Just JSON. |

This option cannot support submission history at scale, structured queries, or reliable spaced-repetition scheduling. It is a dead end for the requirements.

---

## 5. Recommendation: Option 1 — Server-Side SQLite via `better-sqlite3`

**Rationale:**

1. SQLite is the only option that provides durable, queryable persistence independent of the browser.
2. `better-sqlite3` is the most mature synchronous SQLite binding for Node.js, with prebuilt binaries for all target platforms.
3. The SvelteKit server already handles code execution, file resolution, and Docker management — adding a database is a natural extension.
4. Single-user, single-server: no need for connection pooling, replication, or ORM.
5. Backup is trivial: copy one file, or expose a download endpoint.
6. Schema migrations are simple with `user_version` pragma.
7. The existing `collectProgressData()` function provides a clean migration source.

**Trade-off acknowledged:** This adds a native dependency (`better-sqlite3`) and server-side state. The application is no longer purely client-rendered for data. This is acceptable because the server already runs (for code execution) and the requirements (submission history, spaced repetition) cannot be met by localStorage alone.

---

## 6. Proposed Schema

### Entity Relationship

```
problems (slug PK)
  ├── user_progress (slug FK, language)
  ├── editor_drafts (slug FK, language)
  ├── submissions (slug FK)
  ├── notes (slug FK)
  ├── reflections (slug FK)
  └── review_schedules (slug FK)
```

### Tables

#### `problems`

Lightweight reference table. Does not duplicate problem content from the filesystem.

```sql
CREATE TABLE problems (
  slug TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Problems are auto-inserted on first interaction (submission, note, draft save). The filesystem remains the source of truth for content.

#### `user_progress`

```sql
CREATE TABLE user_progress (
  slug TEXT NOT NULL REFERENCES problems(slug),
  language TEXT NOT NULL,
  solved INTEGER NOT NULL DEFAULT 0,
  solved_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, language)
);
```

#### `editor_drafts`

```sql
CREATE TABLE editor_drafts (
  slug TEXT NOT NULL REFERENCES problems(slug),
  language TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, language)
);
```

#### `submissions`

```sql
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL REFERENCES problems(slug),
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  verdict TEXT NOT NULL,  -- 'accepted', 'wrong_answer', 'tle', 'runtime_error', 'compilation_error'
  passed_tests INTEGER,
  total_tests INTEGER,
  execution_time_ms REAL,
  memory_kb INTEGER,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_run INTEGER NOT NULL DEFAULT 0  -- 1 = sample run, 0 = full submit
);
CREATE INDEX idx_submissions_slug ON submissions(slug, submitted_at);
```

#### `notes`

```sql
CREATE TABLE notes (
  slug TEXT PRIMARY KEY REFERENCES problems(slug),
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### `reflections`

```sql
CREATE TABLE reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL REFERENCES problems(slug),
  approach TEXT,
  mistakes TEXT,
  takeaways TEXT,
  time_complexity TEXT,
  space_complexity TEXT,
  confidence INTEGER,  -- 1-5
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reflections_slug ON reflections(slug, created_at);
```

Multiple reflections per problem are allowed (reflection history). The latest reflection is the active one.

#### `review_schedules`

```sql
CREATE TABLE review_schedules (
  slug TEXT PRIMARY KEY REFERENCES problems(slug),
  next_review_at TEXT NOT NULL,
  interval_days REAL NOT NULL DEFAULT 1.0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  repetition_count INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TEXT,
  last_quality INTEGER  -- 0-5 (SM-2 scale)
);
```

#### `study_plan_metadata`

```sql
CREATE TABLE study_plan_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Generic key-value table for future study plan configuration (active plan, daily targets, topic weights). Avoids premature schema design.

#### `settings`

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Stores migrated user settings, bookmarks, and UI preferences as JSON blobs keyed by their original localStorage key names.

---

## 7. API Endpoints

All endpoints are SvelteKit server routes under `/api/`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/progress` | All progress data (for page load hydration) |
| PUT | `/api/progress/[slug]/solved` | Mark problem solved for a language |
| GET/PUT | `/api/drafts/[slug]/[language]` | Read/write editor draft |
| POST | `/api/submissions` | Record a submission (called from existing Run/Submit handlers) |
| GET | `/api/submissions/[slug]` | Submission history for a problem |
| GET/PUT | `/api/notes/[slug]` | Read/write notes |
| GET/POST | `/api/reflections/[slug]` | Read history / add reflection |
| GET/PUT | `/api/review/[slug]` | Read/update spaced repetition schedule |
| GET | `/api/review/due` | List problems due for review |
| GET | `/api/backup` | Download full SQLite database file |
| POST | `/api/backup/restore` | Upload and replace database file |
| POST | `/api/migrate` | One-time localStorage → SQLite migration |

Submission recording integrates directly into the existing `executeRun` / `executeSubmit` functions — the server already has the verdict, so no extra round-trip is needed.

---

## 8. Migration Strategy

### Phase 1: Database Initialization

On server start, if `data/devprep.sqlite` does not exist:
1. Create the database and run the schema.
2. Set `PRAGMA user_version = 1`.

### Phase 2: localStorage Migration

On first browser load after the database is available:
1. The browser calls `GET /api/progress`. If it returns empty/new-database indicator:
2. The browser calls `POST /api/migrate` with `collectProgressData(localStorage)`.
3. The server parses the JSON and populates:
   - `solutions` → `editor_drafts` (mapping `problemId → code` to `(slug, language, code)` using the user's preferred language from settings).
   - `user-checkboxes` → `user_progress` (mapping `problemId → true` to `(slug, language, solved=1)`).
   - `user-settings` → `settings` key.
   - `user-bookmarks` → `settings` key.
   - `testcases` → `settings` key.
   - `game-results` → `settings` key (preserved but not decomposed).
4. The browser stores a `devprep-migrated` flag in localStorage to avoid re-migration.
5. The browser does NOT clear original localStorage keys immediately — they serve as a fallback until the user confirms the migration succeeded.

### Phase 3: Gradual Transition

Stores are migrated one at a time:
1. **Submissions** — new submissions write to SQLite immediately (server-side). No localStorage equivalent exists, so no migration needed.
2. **Editor drafts** — the code store switches to server-backed with debounced PUT. localStorage becomes write-through cache for offline resilience.
3. **Progress** — solved status writes to SQLite. localStorage remains as read cache.
4. **Notes and reflections** — new features, no migration.
5. **Spaced repetition** — new feature, no migration.

### Rollback

If migration fails or the user wants to revert:
- The original localStorage data is untouched.
- Deleting `data/devprep.sqlite` returns to pure-localStorage operation.
- The `/recovery` page continues to work against localStorage regardless.

---

## 9. Data Ownership and Backup

### Ownership

- **Problem content** (statements, tests, markers) → filesystem, read-only, managed by the application.
- **User data** (progress, drafts, submissions, notes, reflections, schedules) → SQLite, read-write, fully owned by the user.

### Backup

- **Quick:** `GET /api/backup` downloads the raw `.sqlite` file. Restorable via `POST /api/backup/restore`.
- **Portable:** `GET /api/backup?format=json` exports all user data as a JSON file (independent of SQLite). Restorable on any DevPrep instance.
- **Docker volume:** `docker cp` or volume backup captures the database file directly.

### Restore

- Upload restores replace the database file atomically (write to temp file, rename).
- JSON restore creates a fresh database from the exported data.
- The existing `/recovery` page is preserved for localStorage emergencies.

---

## 10. Open Questions

1. **Should editor drafts be debounced or saved on blur/navigation?** Debounced writes (e.g., 2 seconds after last keystroke) balance responsiveness and write frequency. Needs UX validation.
2. **Should Run results also be recorded in submission history, or only Submit?** The spec says "every submission," but recording every sample Run could generate noise. Recommend: record both, with `is_run` flag, and let the UI filter.
3. **What is the maximum submission history retention?** Unlimited for single-user? Or prune after N submissions per problem? Recommend: unlimited until the database exceeds a configurable size.
4. **Should the browser remain a write-through cache for offline resilience?** If the server is always local, the browser and server cannot disagree. But keeping localStorage as a read cache during transition reduces migration risk.
5. **What SQLite library for ARM64 Alpine?** `better-sqlite3` has prebuilt binaries for most targets, but the Dockerfile uses `node:22-alpine` — verify the prebuilt binary works or add a build step. `node:22-slim` (Debian) is a safer fallback.
