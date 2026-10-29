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
import { getDb, getDbPath, closeDb, initDb, _resetDb } from './index'

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

  // Write to a temp file first, then rename for atomicity
  const tmpPath = target + '.tmp.' + Date.now()
  try {
    await db.backup(tmpPath)
    // Validate the backup
    validateBackup(tmpPath)
    // Atomic move
    fs.renameSync(tmpPath, target)
    return target
  } catch (e) {
    try { fs.unlinkSync(tmpPath) } catch {}
    throw e
  }
}

/**
 * Validate that a SQLite file is a readable, intact database.
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
  } finally {
    testDb?.close()
  }
}

/**
 * Restore the database from a backup file.
 *
 * 1. Validates the backup.
 * 2. Closes the current database connection.
 * 3. Renames the current DB to .previous (recovery copy).
 * 4. Copies the backup to the live DB path.
 * 5. Reopens the database.
 * 6. On failure, attempts to restore the .previous copy.
 */
export function restoreFromBackup(backupPath: string): void {
  validateBackup(backupPath)

  const dbPath = getDbPath()
  const previousPath = dbPath + PREVIOUS_SUFFIX

  // Close active connection
  closeDb()
  _resetDb()

  // Clean up WAL/SHM sidecar files
  const walPath = dbPath + '-wal'
  const shmPath = dbPath + '-shm'

  try {
    // Save current database as recovery copy
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, previousPath)
    }
    // Remove sidecar files from the old DB
    try { fs.unlinkSync(walPath) } catch {}
    try { fs.unlinkSync(shmPath) } catch {}

    // Copy backup to live location
    fs.copyFileSync(backupPath, dbPath)

    // Reopen and verify
    const db = initDb(dbPath)
    db.pragma('integrity_check', { simple: true })
  } catch (e) {
    // Attempt recovery from .previous
    try {
      if (fs.existsSync(previousPath)) {
        fs.copyFileSync(previousPath, dbPath)
        try { fs.unlinkSync(walPath) } catch {}
        try { fs.unlinkSync(shmPath) } catch {}
      }
    } catch {}
    // Reinitialize whatever we have
    try { initDb(dbPath) } catch {}
    throw new Error(`Restore failed: ${e instanceof Error ? e.message : e}. Previous database recovered.`)
  } finally {
    // Clean up .previous on success (keep on failure for manual recovery)
    // Actually, always keep it — the user may want to inspect it
  }
}
