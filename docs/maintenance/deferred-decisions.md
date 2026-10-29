# Deferred Decisions

**Date:** 2026-10-29
**Branch:** `refactor/codebase-stabilisation`

Items identified during the codebase audit that are intentionally deferred. Each requires a separate approved decision before implementation.

---

## 1. Firebase / Cloud Sync Code

**Finding:** ~4,469 lines across 9 files implementing optional Firebase cloud sync, backup, and asset management. DevPrep is offline-only and does not configure Firebase.

**Files:**

| File | Lines |
|---|---|
| `src/lib/cloudSync.ts` | 2,445 |
| `src/lib/cloudFileChange.ts` | 637 |
| `src/lib/progressBackup.ts` | 407 |
| `src/lib/cloudAssets.ts` | 265 |
| `src/lib/firebase.ts` | 259 |
| `src/lib/progressBackupClient.ts` | 208 |
| `src/lib/firebaseSettings.ts` | 118 |
| `src/lib/cloudSyncPolicy.ts` | 79 |
| `src/lib/forkTransfer.ts` | 51 |

**Current callers:** Imported in `+layout.svelte`, `+page.svelte`, `playground/+page.svelte`, `problems/[slug]/+page.svelte`, `recovery/+page.svelte`. All calls are guarded by `isDesktopRuntime()` checks — they are inert in DevPrep's web/Docker deployment.

**Features still accessible:** Cloud backup/sync is visible in the Cojudge desktop app UI when Firebase settings are configured. The `/recovery` page uses `progressBackupClient.ts` for localStorage export.

**Impact of removal on backup/recovery:** The `/recovery` page imports `progressBackupClient.ts` for localStorage export functionality. This must be preserved or replaced before removing cloud code.

**Impact of removal on desktop builds:** The `src-tauri/` directory and Tauri build pipeline reference these files. Removal would break Tauri desktop builds.

**Dependency savings:** Removing `firebase` from `devDependencies` saves ~1.8MB. The cloud code is tree-shaken from the server bundle but still bundled in the client.

**Recommendation:** Deprecate and remove in a separate PR with ADR approval. Extract the localStorage export functionality from `progressBackup` before removing. Low urgency — the code is inert in DevPrep's offline mode.

---

## 2. Tauri Desktop Packages

**Finding:** Four `@tauri-apps` packages in `package.json` for the desktop app build. DevPrep v1.0 targets Docker/web deployment only.

**Packages:** `@tauri-apps/api`, `@tauri-apps/cli`, `@tauri-apps/plugin-process`, `@tauri-apps/plugin-updater`

**Current callers:** `src/lib/appUpdate.ts`, `src/routes/+page.svelte`, `src/routes/+layout.svelte` — guarded by Tauri runtime detection.

**Features:** Desktop auto-update and process management. Not used in Docker/web deployment.

**Impact of removal on desktop builds:** Removing these packages would break the Tauri desktop build pipeline entirely.

**Dependency savings:** `@tauri-apps/cli` is the largest at ~50MB (dev-only). The other three are small. None affect the production Docker image.

**Recommendation:** Retain for now. The Tauri desktop app is a potential future deployment option inherited from Cojudge. The packages are dev-only and do not affect the production build. If a decision is made to permanently abandon the desktop build, remove in a separate PR.

---

## 3. Run/Submit Endpoint Consolidation

**Finding:** `src/routes/api/run/+server.ts` (340 lines) and `src/routes/api/submit/+server.ts` (324 lines) share duplicated logic: runner selection (8-way if/else if), result parsing, and error handling.

**Current state:** Partially addressed — `genJobId()` and `JobStore` are now shared via `src/lib/server/jobStore.ts`. The runner factory and result-parsing logic remain duplicated.

**Recommendation:** Defer. Full consolidation of the runner factory and result parsing would be a larger refactor, better done alongside the SQLite submission-recording integration (M3) where the submit path needs changes anyway. The remaining duplication is stable and well-tested by the 78-test judge regression suite.
