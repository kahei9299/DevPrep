/**
 * SQLite backup and restore with WAL-consistent snapshots.
 *
 * Uses better-sqlite3's backup() API to produce a self-contained copy
 * with all WAL changes flushed. Raw file copies of a WAL-mode database
 * may be inconsistent — always use these functions instead.
 */

import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { getDb, getDbPath, closeDb, initDb, _setDb, SCHEMA_VERSION } from './index'
import { REQUIRED_TABLES } from './schema'

const BACKUP_SUFFIX = '.backup'
const PREVIOUS_SUFFIX = '.previous'

/**
 * Create a consistent backup of the live database.
 * Returns the path to the backup file.
 */
export async function createBackup(destPath?: string): Promise<string> {
  const db = getDb()
  const target = destPath || getDbPath() + BACKUP_SUFFIX
  const dir = path.dirname(target)
  fs.mkdirSync(dir, { recursive: true })

  const tmpPath = target + '.tmp.' + Date.now()
  try {
    await db.backup(tmpPath)
    validateBackup(tmpPath)
    fs.renameSync(tmpPath, target)
    return target
  } catch (e) {
    try { fs.unlinkSync(tmpPath) } catch {}
    throw e
  }
}

/**
 * Validate that a SQLite file is a readable, intact DevPrep database
 * compatible with this application version.
 */
export function validateBackup(backupPath: string): void {
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file does not exist')
  }
  const stat = fs.statSync(backupPath)
  if (stat.size < 100) {
    throw new Error('Backup file is too small to be a valid SQLite database')
  }

  let testDb: Database.Database | null = null
  try {
    testDb = new Database(backupPath, { readonly: true })
    const result = testDb.pragma('integrity_check', { simple: true })
    if (result !== 'ok') {
      throw new Error(`Backup integrity check failed: ${result}`)
    }

    const version = testDb.pragma('user_version', { simple: true }) as number
    if (version < 1) {
      throw new Error('Backup does not contain a DevPrep schema (user_version = 0)')
    }
    if (version > SCHEMA_VERSION) {
      throw new Error(
        `Backup schema version ${version} is newer than supported version ${SCHEMA_VERSION}. ` +
        `Upgrade DevPrep before restoring this backup.`
      )
    }

    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
    const tableNames = new Set(tables.map(t => t.name))
    const missing = REQUIRED_TABLES.filter(t => !tableNames.has(t))
    if (missing.length > 0) {
      throw new Error(`Backup is missing required tables: ${missing.join(', ')}`)
    }
  } finally {
    testDb?.close()
  }
}

/**
 * Restore the database from a backup file.
 *
 * This is an offline maintenance operation. The caller must ensure no
 * concurrent database operations are in progress.
 *
 * Lifecycle:
 * 1. Validate the backup (integrity, version, tables).
 * 2. Close the current database connection.
 * 3. Checkpoint WAL into the main file, then remove sidecars.
 * 4. Rename current DB to .previous (atomic, same filesystem).
 * 5. Rename (or copy) backup to the live path.
 * 6. Reopen and verify.
 * 7. On failure, rename .previous back and reopen.
 */
export function restoreFromBackup(backupPath: string): void {
  validateBackup(backupPath)

  const dbPath = getDbPath()
  const previousPath = dbPath + PREVIOUS_SUFFIX
  const walPath = dbPath + '-wal'
  const shmPath = dbPath + '-shm'
  const stagePath = dbPath + '.staging'

  // Stage: copy backup to a file on the same filesystem as the live DB,
  // so the final rename is atomic.
  fs.copyFileSync(backupPath, stagePath)

  // Close active connection (flushes WAL on close)
  closeDb()

  // Checkpoint any remaining WAL data into the main DB file before we
  // rename it away, so .previous is self-contained.
  try {
    const tmp = new Database(dbPath)
    tmp.pragma('wal_checkpoint(TRUNCATE)')
    tmp.close()
  } catch {
    // DB may not exist yet on first run — that's fine
  }

  try {
    // Preserve current DB as recovery copy (atomic rename, same fs)
    if (fs.existsSync(dbPath)) {
      fs.renameSync(dbPath, previousPath)
    }
    // Clean up any leftover sidecars (should be gone after checkpoint, belt-and-suspenders)
    try { fs.unlinkSync(walPath) } catch {}
    try { fs.unlinkSync(shmPath) } catch {}

    // Atomic rename staged backup into live path
    fs.renameSync(stagePath, dbPath)

    // Reopen and verify
    const db = initDb(dbPath)
    const check = db.pragma('integrity_check', { simple: true })
    if (check !== 'ok') {
      db.close()
      throw new Error(`Restored database failed integrity check: ${check}`)
    }
    // Register as the singleton so getDb() works
    _setDb(db)
  } catch (e) {
    // Clean up failed staging file if it's still there
    try { fs.unlinkSync(stagePath) } catch {}
    // Restore from .previous
    try {
      if (fs.existsSync(previousPath)) {
        // Remove whatever is at dbPath (might be partial)
        try { fs.unlinkSync(dbPath) } catch {}
        try { fs.unlinkSync(walPath) } catch {}
        try { fs.unlinkSync(shmPath) } catch {}
        fs.renameSync(previousPath, dbPath)
        const recovered = initDb(dbPath)
        _setDb(recovered)
      }
    } catch {
      // Recovery also failed — .previous file still on disk for manual recovery
    }
    throw new Error(`Restore failed: ${e instanceof Error ? e.message : e}`)
  }
}
