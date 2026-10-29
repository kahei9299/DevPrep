# SQLite Backup and Restore

**Date:** 2026-10-29

---

## Important: WAL Mode

DevPrep's SQLite database uses WAL (Write-Ahead Logging) mode. A raw file copy of the live `.sqlite` file may be **inconsistent** if the server is running, because committed data can reside in the `-wal` sidecar file rather than the main database.

**Always use the backup API or stop the server before copying the database file.**

---

## Development

### Create a backup

```bash
node -e "
  const Database = require('better-sqlite3');
  const db = new Database('data/devprep.sqlite');
  db.backup('data/backup.sqlite').then(() => { db.close(); console.log('Backup complete'); });
"
```

This produces a self-contained `.sqlite` file with all WAL changes flushed.

### Restore from a backup

Stop the dev server first, then:

```bash
cp data/devprep.sqlite data/devprep.sqlite.previous
cp data/backup.sqlite data/devprep.sqlite
rm -f data/devprep.sqlite-wal data/devprep.sqlite-shm
```

Restart the server. The `.previous` file is a safety net — delete it after confirming the restore succeeded.

---

## Docker

### Create a backup

**Option A — API backup (preferred, server running):**

```bash
docker exec cojudge node -e "
  const Database = require('better-sqlite3');
  const db = new Database('data/devprep.sqlite');
  db.backup('data/backup.sqlite').then(() => { db.close(); console.log('done'); });
"
docker cp cojudge:/usr/src/app/data/backup.sqlite ./backup.sqlite
```

**Option B — Direct copy (server stopped):**

```bash
docker stop cojudge
docker cp cojudge:/usr/src/app/data/devprep.sqlite ./backup.sqlite
docker start cojudge
```

Option B is safe only when the server is stopped (no WAL activity).

### Restore from a backup

```bash
docker stop cojudge
docker cp ./backup.sqlite cojudge:/usr/src/app/data/devprep.sqlite
# Remove stale WAL/SHM files
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

To check a backup file's integrity:

```bash
node -e "
  const Database = require('better-sqlite3');
  const db = new Database('backup.sqlite', { readonly: true });
  console.log('integrity:', db.pragma('integrity_check', { simple: true }));
  console.log('version:', db.pragma('user_version', { simple: true }));
  db.close();
"
```

Expected output: `integrity: ok` and `version: 1` (or the current schema version).

---

## Recovery from corruption

If the database fails integrity checks on startup:

1. The existing `data/devprep.sqlite` should be preserved (rename to `.corrupt`).
2. Restore from the most recent backup.
3. If no backup exists, the browser's `localStorage` data is still available via the `/recovery` page — it was never deleted during M3 Phase 1.
