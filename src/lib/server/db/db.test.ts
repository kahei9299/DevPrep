import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3'
import { initDb, closeDb, _resetDb, _setDb, getDb, getDbPath, SCHEMA_VERSION } from './index'
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

  it('closes the connection when migration fails', () => {
    const dbPath = path.join(dir, 'test.sqlite')
    const db = new Database(dbPath)
    db.pragma('user_version = 999')
    db.close()
    // initDb should throw but not leak a connection
    expect(() => initDb(dbPath)).toThrow()
    // The file should still be openable (no SQLITE_BUSY from leaked handle)
    const db2 = new Database(dbPath)
    db2.close()
  })

  it('schema creation is idempotent', () => {
    const dbPath = path.join(dir, 'test.sqlite')
    const db1 = initDb(dbPath)
    db1.close()
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
    expect(db.prepare("SELECT count(*) as c FROM notes").get()).toEqual({ c: 1 })
  })
})

describe('backup validation', () => {
  let dir: string
  beforeEach(() => { dir = tmpDir() })
  afterEach(() => { closeDb(); _resetDb(); cleanup(dir) })

  it('accepts a valid DevPrep database', () => {
    const dbPath = path.join(dir, 'valid.sqlite')
    const db = initDb(dbPath)
    db.close()
    expect(() => validateBackup(dbPath)).not.toThrow()
  })

  it('rejects a nonexistent file', () => {
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

  it('rejects a database with a newer schema version', () => {
    const p = path.join(dir, 'future.sqlite')
    const db = initDb(p)
    db.close()
    // Bump version beyond what we support
    const db2 = new Database(p)
    db2.pragma(`user_version = ${SCHEMA_VERSION + 1}`)
    db2.close()
    expect(() => validateBackup(p)).toThrow('newer than supported')
  })

  it('rejects a database missing required tables', () => {
    const p = path.join(dir, 'partial.sqlite')
    const db = new Database(p)
    db.pragma('user_version = 1')
    db.exec('CREATE TABLE user_progress (slug TEXT PRIMARY KEY)')
    db.close()
    expect(() => validateBackup(p)).toThrow('missing required tables')
  })
})

describe('backup and restore integration', () => {
  let dir: string
  const origEnv = process.env.DEVPREP_DATA_DIR

  beforeEach(() => {
    dir = tmpDir()
    process.env.DEVPREP_DATA_DIR = dir
  })
  afterEach(() => {
    closeDb()
    _resetDb()
    process.env.DEVPREP_DATA_DIR = origEnv
    cleanup(dir)
  })

  it('createBackup produces a valid backup with WAL data', async () => {
    const db = getDb()
    db.prepare("INSERT INTO notes (slug, content) VALUES ('test', 'hello')").run()

    const backupPath = path.join(dir, 'backup.sqlite')
    const result = await createBackup(backupPath)
    expect(result).toBe(backupPath)

    // Verify backup is self-contained (readable without WAL)
    const bdb = new Database(backupPath, { readonly: true })
    const row = bdb.prepare("SELECT content FROM notes WHERE slug = 'test'").get() as any
    expect(row.content).toBe('hello')
    // Backup is readable and passes validation
    expect(() => validateBackup(backupPath)).not.toThrow()
    bdb.close()
  })

  it('restores successfully and getDb() returns the restored database', () => {
    // Create original with data
    const db = getDb()
    db.prepare("INSERT INTO notes (slug, content) VALUES ('original', 'before')").run()

    // Create a separate backup database with different data
    const backupPath = path.join(dir, 'backup.sqlite')
    const bdb = initDb(backupPath)
    bdb.prepare("INSERT INTO notes (slug, content) VALUES ('restored', 'after')").run()
    bdb.close()

    // Restore
    restoreFromBackup(backupPath)

    // getDb() must return the restored database
    const restored = getDb()
    const row = restored.prepare("SELECT content FROM notes WHERE slug = 'restored'").get() as any
    expect(row.content).toBe('after')
    const orig = restored.prepare("SELECT count(*) as c FROM notes WHERE slug = 'original'").get() as any
    expect(orig.c).toBe(0)
  })

  it('preserves .previous copy after successful restore', () => {
    const db = getDb()
    db.prepare("INSERT INTO notes (slug, content) VALUES ('old', 'data')").run()

    const backupPath = path.join(dir, 'backup.sqlite')
    const bdb = initDb(backupPath)
    bdb.close()

    restoreFromBackup(backupPath)

    const prevPath = path.join(dir, 'devprep.sqlite.previous')
    expect(fs.existsSync(prevPath)).toBe(true)

    // .previous should contain the original data
    const prevDb = new Database(prevPath, { readonly: true })
    const row = prevDb.prepare("SELECT content FROM notes WHERE slug = 'old'").get() as any
    expect(row.content).toBe('data')
    prevDb.close()
  })

  it('preserves original database when restore fails (corrupt backup)', () => {
    const db = getDb()
    db.prepare("INSERT INTO notes (slug, content) VALUES ('precious', 'keep me')").run()

    const corruptPath = path.join(dir, 'corrupt.sqlite')
    fs.writeFileSync(corruptPath, Buffer.alloc(200, 0x42))

    expect(() => restoreFromBackup(corruptPath)).toThrow()

    // Original data must survive — reopen via getDb()
    const recovered = getDb()
    const row = recovered.prepare("SELECT content FROM notes WHERE slug = 'precious'").get() as any
    expect(row.content).toBe('keep me')
  })

  it('preserves original database when restore fails (future schema version)', () => {
    const db = getDb()
    db.prepare("INSERT INTO notes (slug, content) VALUES ('safe', 'still here')").run()

    const futurePath = path.join(dir, 'future.sqlite')
    const fdb = initDb(futurePath)
    fdb.close()
    const fdb2 = new Database(futurePath)
    fdb2.pragma(`user_version = ${SCHEMA_VERSION + 1}`)
    fdb2.close()

    expect(() => restoreFromBackup(futurePath)).toThrow('newer than supported')

    const recovered = getDb()
    const row = recovered.prepare("SELECT content FROM notes WHERE slug = 'safe'").get() as any
    expect(row.content).toBe('still here')
  })

  it('preserves original database when restore fails (missing tables)', () => {
    const db = getDb()
    db.prepare("INSERT INTO notes (slug, content) VALUES ('safe', 'here')").run()

    const badPath = path.join(dir, 'bad-schema.sqlite')
    const bdb = new Database(badPath)
    bdb.pragma('user_version = 1')
    bdb.exec('CREATE TABLE user_progress (slug TEXT PRIMARY KEY)')
    bdb.close()

    expect(() => restoreFromBackup(badPath)).toThrow('missing required tables')

    const recovered = getDb()
    const row = recovered.prepare("SELECT content FROM notes WHERE slug = 'safe'").get() as any
    expect(row.content).toBe('here')
  })

  it('backup includes data committed in WAL mode', async () => {
    const db = getDb()
    // WAL mode is enabled by initDb — write data that may reside in WAL
    for (let i = 0; i < 50; i++) {
      db.prepare("INSERT INTO submissions (slug, language, code, verdict) VALUES (?, 'py', ?, 'accepted')")
        .run(`prob-${i}`, `code-${i}`)
    }

    const backupPath = path.join(dir, 'wal-backup.sqlite')
    await createBackup(backupPath)

    const bdb = new Database(backupPath, { readonly: true })
    const count = bdb.prepare("SELECT count(*) as c FROM submissions").get() as any
    expect(count.c).toBe(50)
    bdb.close()
  })
})
