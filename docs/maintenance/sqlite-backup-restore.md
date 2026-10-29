# SQLite Backup and Restore

**Date:** 2026-10-29

---

## Important: WAL Mode

DevPrep's SQLite database uses WAL (Write-Ahead Logging) mode. A raw file copy of the live `.sqlite` file may be **inconsistent** if the server is running, because committed data can reside in the `-wal` sidecar file rather than the main database.

**Always use the backup API or stop the server before copying the database file.**

---

## Creating a Backup

### Development

```bash
node -e "
  const Database = require('better-sqlite3');
  const db = new Database('data/devprep.sqlite');
  db.backup('data/backup.sqlite').then(() => { db.close(); console.log('Backup complete'); });
"
```

This produces a self-contained `.sqlite` file with all WAL changes flushed.

### Docker (server running)

```bash
docker exec cojudge node -e "
  const Database = require('better-sqlite3');
  const db = new Database('data/devprep.sqlite');
  db.backup('data/backup.sqlite').then(() => { db.close(); console.log('done'); });
"
docker cp cojudge:/usr/src/app/data/backup.sqlite ./backup.sqlite
```

### Docker (server stopped — for raw file copy only)

```bash
docker stop cojudge
docker cp cojudge:/usr/src/app/data/devprep.sqlite ./backup.sqlite
docker start cojudge
```

Safe only when the server is stopped (no WAL activity).

---

## Restoring from a Backup

Restore is an **offline maintenance operation**. Stop the server first.

### Development

```bash
# Stop the dev server, then:
cp data/devprep.sqlite data/devprep.sqlite.previous
rm -f data/devprep.sqlite-wal data/devprep.sqlite-shm
cp backup.sqlite data/devprep.sqlite
```

Restart the server. The `.previous` file is a safety net — delete it after confirming the restore succeeded.

### Docker

```bash
docker stop cojudge
docker cp ./backup.sqlite cojudge:/usr/src/app/data/devprep.sqlite
docker exec cojudge rm -f data/devprep.sqlite-wal data/devprep.sqlite-shm 2>/dev/null || true
docker start cojudge
```

### Volume backup

The entire data directory is on the `cojudge-data` named volume:

```bash
# Full volume backup
docker run --rm -v cojudge-data:/data -v $(pwd):/backup alpine tar czf /backup/devprep-data.tar.gz /data

# Restore
docker run --rm -v cojudge-data:/data -v $(pwd):/backup alpine sh -c "rm -rf /data/*; tar xzf /backup/devprep-data.tar.gz -C /"
```

---

## Validation

The application validates backups before restore:

1. **SQLite integrity** — `PRAGMA integrity_check`
2. **Schema version** — rejects `user_version = 0` (no schema) and versions newer than the application supports
3. **Required tables** — all 8 DevPrep tables must be present

To check a backup file manually:

```bash
node -e "
  const Database = require('better-sqlite3');
  const db = new Database('backup.sqlite', { readonly: true });
  console.log('integrity:', db.pragma('integrity_check', { simple: true }));
  console.log('version:', db.pragma('user_version', { simple: true }));
  const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all();
  console.log('tables:', tables.map(t => t.name).join(', '));
  db.close();
"
```

Expected: `integrity: ok`, `version: 1`, and all 8 tables present.

---

## Recovery from Corruption

If the database fails integrity checks on startup:

1. The existing `data/devprep.sqlite` should be preserved (rename to `.corrupt`).
2. Restore from the most recent backup.
3. If no backup exists, the browser's `localStorage` data is still available via the `/recovery` page — it was never deleted during M3 Phase 1.
4. After a failed restore, a `.previous` file may exist containing the pre-restore database.
