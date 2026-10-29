/** Schema v1 SQL — embedded as a string so it works after SvelteKit bundles server code. */
export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS user_progress (
  slug       TEXT NOT NULL,
  language   TEXT NOT NULL,
  solved     INTEGER NOT NULL DEFAULT 0,
  solved_at  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, language)
);

CREATE TABLE IF NOT EXISTS editor_drafts (
  slug       TEXT NOT NULL,
  language   TEXT NOT NULL,
  code       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, language)
);

CREATE TABLE IF NOT EXISTS submissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  language    TEXT NOT NULL,
  code        TEXT NOT NULL,
  is_run      INTEGER NOT NULL DEFAULT 0,
  verdict     TEXT NOT NULL,
  total_tests INTEGER,
  passed_tests INTEGER,
  execution_ms REAL,
  memory_kb   REAL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_submissions_slug ON submissions(slug);
CREATE INDEX IF NOT EXISTS idx_submissions_slug_lang ON submissions(slug, language);

CREATE TABLE IF NOT EXISTS notes (
  slug       TEXT NOT NULL PRIMARY KEY,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reflections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  approach    TEXT,
  mistakes    TEXT,
  takeaways   TEXT,
  time_complexity TEXT,
  space_complexity TEXT,
  confidence  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reflections_slug ON reflections(slug);

CREATE TABLE IF NOT EXISTS review_schedule (
  slug        TEXT NOT NULL PRIMARY KEY,
  next_review TEXT,
  interval_days INTEGER NOT NULL DEFAULT 1,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  repetitions INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migration_meta (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);
`
