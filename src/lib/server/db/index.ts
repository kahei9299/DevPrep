/**
 * DevPrep SQLite database singleton.
 *
 * Lazy initialization — the database is created on first access, not at
 * module load time. This avoids initialization during SvelteKit builds
 * and test harnesses that don't need the database.
 *
 * Data location: DEVPREP_DATA_DIR env var, defaulting to ./data/ in the
 * project root. The directory is created automatically. The database file
 * is never stored under node_modules, .svelte-kit, or build/.
 */

import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const SCHEMA_VERSION = 1

let _db: Database.Database | null = null

export function getDataDir(): string {
  return path.resolve(process.env.DEVPREP_DATA_DIR || 'data')
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'devprep.sqlite')
}

export function getDb(): Database.Database {
  if (_db) return _db
  _db = initDb(getDbPath())
  return _db
}

export function initDb(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath)
  fs.mkdirSync(dir, { recursive: true })

  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  applyMigrations(db)

  return db
}

function applyMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${SCHEMA_VERSION}. ` +
      `Upgrade DevPrep or restore from a compatible backup.`
    )
  }

  if (currentVersion < 1) {
    const schemaPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'schema.sql')
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8')
    db.exec('BEGIN')
    try {
      db.exec(schemaSql)
      db.pragma(`user_version = ${SCHEMA_VERSION}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  // Future migrations: if (currentVersion < 2) { ... migrate v1→v2 ... }
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

/** Reset singleton — for tests only. */
export function _resetDb(): void {
  _db = null
}
