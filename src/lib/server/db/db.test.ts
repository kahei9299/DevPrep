import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3'
import { initDb, closeDb, _resetDb, getDataDir } from './index'
import { createBackup, validateBackup, restoreFromBackup } from './backup'

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devprep-db-test-'))
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('database initialization', () => {
  let dir: string
  beforeEach(() => { dir = tmpDir() })
  afterEach(() => { closeDb(); _resetDb(); cleanup(dir) })

  it('creates a fresh database with schema', () => {
    const dbPath = path.join(dir, 'test.sqlite')
    const db = initDb(dbPath)
    expect(fs.existsSync(dbPath)).toBe(true)
    const version = db.pragma('user_version', { simple: true })
    expect(version).toBe(1)
    // Check tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('user_progress')
    expect(names).toContain('editor_drafts')
    expect(names).toContain('submissions')
    expect(names).toContain('notes')
    expect(names).toContain('reflections')
    expect(names).toContain('review_schedule')
    expect(names).toContain('settings')
    expect(names).toContain('migration_meta')
    db.close()
  })

  it('creates the data directory if it does not exist', () => {
    const nested = path.join(dir, 'a', 'b', 'c')
    const dbPath = path.join(nested, 'test.sqlite')
    const db = initDb(dbPath)
    expect(fs.existsSync(nested)).toBe(true)
    db.close()
  })

  it('reopens an existing database without re-applying schema', () => {
    const dbPath = path.join(dir, 'test.sqlite')
    const db1 = initDb(dbPath)
    db1.prepare("INSERT INTO notes (slug, content) VALUES ('two-sum', 'my notes')").run()
    db1.close()

    const db2 = initDb(dbPath)
    const row = db2.prepare("SELECT content FROM notes WHERE slug = 'two-sum'").get() as any
    expect(row.content).toBe('my notes')
    db2.close()
  })

  it('enables WAL mode', () => {
    const dbPath = path.join(dir, 'test.sqlite')
    const db = initDb(dbPath)
    const mode = db.pragma('journal_mode', { simple: true })
    expect(mode).toBe('wal')
    db.close()
  })

  it('enables foreign keys', () => {
    const dbPath = path.join(dir, 'test.sqlite')
    const db = initDb(dbPath)
    const fk = db.pragma('foreign_keys', { simple: true })
    expect(fk).toBe(1)
    db.close()
  })

  it('rejects a database with a newer schema version', () => {
    const dbPath = path.join(dir, 'test.sqlite')
    const db = new Database(dbPath)
    db.pragma('user_version = 999')
    db.close()
    expect(() => initDb(dbPath)).toThrow('newer than supported')
  })

  it('schema creation is idempotent', () => {
    const dbPath = path.join(dir, 'test.sqlite')
    const db1 = initDb(dbPath)
    db1.close()
    // Re-init same file — should not error
    const db2 = initDb(dbPath)
    expect(db2.pragma('user_version', { simple: true })).toBe(1)
    db2.close()
  })
})

describe('schema operations', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = tmpDir()
    db = initDb(path.join(dir, 'test.sqlite'))
  })
  afterEach(() => { db.close(); cleanup(dir) })

  it('inserts and reads user progress', () => {
    db.prepare("INSERT INTO user_progress (slug, language, solved) VALUES ('two-sum', 'python', 1)").run()
    const row = db.prepare("SELECT * FROM user_progress WHERE slug = 'two-sum'").get() as any
    expect(row.language).toBe('python')
    expect(row.solved).toBe(1)
  })

  it('enforces primary key uniqueness', () => {
    db.prepare("INSERT INTO user_progress (slug, language) VALUES ('x', 'py')").run()
    expect(() => db.prepare("INSERT INTO user_progress (slug, language) VALUES ('x', 'py')").run())
      .toThrow()
  })

  it('supports submissions with autoincrement', () => {
    const r1 = db.prepare("INSERT INTO submissions (slug, language, code, verdict) VALUES ('two-sum', 'python', 'code1', 'accepted')").run()
    const r2 = db.prepare("INSERT INTO submissions (slug, language, code, verdict) VALUES ('two-sum', 'python', 'code2', 'wrong')").run()
    expect(r2.lastInsertRowid).toBeGreaterThan(r1.lastInsertRowid)
  })

  it('rolls back transactions on error', () => {
    db.prepare("INSERT INTO notes (slug, content) VALUES ('a', 'note')").run()
    try {
      const tx = db.transaction(() => {
        db.prepare("INSERT INTO notes (slug, content) VALUES ('b', 'note')").run()
        throw new Error('intentional')
      })
      tx()
    } catch {}
    // 'a' should exist, 'b' should not
    expect(db.prepare("SELECT count(*) as c FROM notes").get()).toEqual({ c: 1 })
  })
})

describe('backup and restore', () => {
  let dir: string
  beforeEach(() => { dir = tmpDir() })
  afterEach(() => { closeDb(); _resetDb(); cleanup(dir) })

  it('creates a consistent backup', async () => {
    const dbPath = path.join(dir, 'live.sqlite')
    const db = initDb(dbPath)
    db.prepare("INSERT INTO notes (slug, content) VALUES ('test', 'hello')").run()

    const backupPath = path.join(dir, 'backup.sqlite')
    // Use db.backup directly since getDb() returns the singleton
    await db.backup(backupPath)

    // Verify backup contents
    const bdb = new Database(backupPath, { readonly: true })
    const row = bdb.prepare("SELECT content FROM notes WHERE slug = 'test'").get() as any
    expect(row.content).toBe('hello')
    bdb.close()
    db.close()
  })

  it('validates a valid backup', () => {
    const dbPath = path.join(dir, 'valid.sqlite')
    const db = initDb(dbPath)
    db.close()
    expect(() => validateBackup(dbPath)).not.toThrow()
  })

  it('rejects a nonexistent backup', () => {
    expect(() => validateBackup(path.join(dir, 'nope.sqlite'))).toThrow('does not exist')
  })

  it('rejects a truncated file', () => {
    const p = path.join(dir, 'tiny.sqlite')
    fs.writeFileSync(p, 'x')
    expect(() => validateBackup(p)).toThrow('too small')
  })

  it('rejects a corrupt file', () => {
    const p = path.join(dir, 'corrupt.sqlite')
    fs.writeFileSync(p, Buffer.alloc(200, 0x42))
    expect(() => validateBackup(p)).toThrow()
  })

  it('rejects a database without DevPrep schema', () => {
    const p = path.join(dir, 'empty.sqlite')
    const db = new Database(p)
    db.exec('CREATE TABLE foo (id INTEGER)')
    db.close()
    expect(() => validateBackup(p)).toThrow('user_version = 0')
  })

  it('restores from a valid backup', () => {
    // Create original with data
    const dbPath = path.join(dir, 'live.sqlite')
    process.env.DEVPREP_DATA_DIR = dir
    // Rename so getDbPath returns our test path
    const db = initDb(path.join(dir, 'devprep.sqlite'))
    db.prepare("INSERT INTO notes (slug, content) VALUES ('original', 'before')").run()
    db.close()
    _resetDb()

    // Create a backup with different data
    const backupPath = path.join(dir, 'backup.sqlite')
    const bdb = initDb(backupPath)
    bdb.prepare("INSERT INTO notes (slug, content) VALUES ('restored', 'after')").run()
    bdb.close()

    // Restore
    restoreFromBackup(backupPath)

    // Verify restored data
    const restored = initDb(path.join(dir, 'devprep.sqlite'))
    const row = restored.prepare("SELECT content FROM notes WHERE slug = 'restored'").get() as any
    expect(row.content).toBe('after')
    // Original data should be gone from the live DB
    const orig = restored.prepare("SELECT count(*) as c FROM notes WHERE slug = 'original'").get() as any
    expect(orig.c).toBe(0)
    restored.close()

    delete process.env.DEVPREP_DATA_DIR
  })

  it('keeps .previous copy after restore', () => {
    process.env.DEVPREP_DATA_DIR = dir
    const db = initDb(path.join(dir, 'devprep.sqlite'))
    db.prepare("INSERT INTO notes (slug, content) VALUES ('old', 'data')").run()
    db.close()
    _resetDb()

    const backupPath = path.join(dir, 'backup.sqlite')
    const bdb = initDb(backupPath)
    bdb.close()

    restoreFromBackup(backupPath)

    expect(fs.existsSync(path.join(dir, 'devprep.sqlite.previous'))).toBe(true)

    delete process.env.DEVPREP_DATA_DIR
  })
})
