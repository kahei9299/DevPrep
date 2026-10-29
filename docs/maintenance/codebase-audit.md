# Codebase Audit — Verification and Disposition

**Date:** 2026-10-29
**Branch:** `refactor/codebase-stabilisation`
**Source:** Ponytail audit (10 findings). Each finding verified against the codebase and classified as fix-now or defer.

---

## Summary

| # | Finding | Confirmed | Decision |
|---|---|---|---|
| 1 | Job maps grow forever | Yes | Fix now |
| 2 | vm.runInNewContext sandbox escape | Yes (mitigated) | Fix now |
| 3 | Path traversal in resolveProblemFile | Yes | Fix now |
| 4 | cleanContainer timeout race | Yes | Fix now |
| 5 | Marker fallback reuses dirty container | Yes | Fix now |
| 6 | No wrong-answer test on cache hit | Yes | Fix now |
| 7 | ~4,500 lines Firebase/cloud code | Yes (unused) | Defer |
| 8 | Tauri dependencies | Yes (unused) | Defer |
| 9 | Duplicate genId() and runner selection | Yes | Defer |
| 10 | resolveProblemFileSync empty validation | Yes | Fix now (with #3) |

---

### Finding 1: Job maps grow forever

- **Evidence:** `src/routes/api/run/+server.ts:41` and `src/routes/api/submit/+server.ts:41` each declare `const jobs: Map<string, Job> = new Map()`. Jobs are inserted via `jobs.set(id, job)` but `jobs.delete()` is never called anywhere in the codebase. Every Run and Submit accumulates a job entry containing the full results array (test outputs, correct answers, logs).
- **Reproducible:** Yes. Run `jobs.size` after N requests — the count only grows.
- **Impact:** Memory climbs during long practice sessions. Each job holds test output strings, so a session with hundreds of submissions accumulates megabytes of dead data. A server restart clears it.
- **Decision:** Fix now. Add TTL-based cleanup that removes completed jobs after a grace period. Do not delete on first GET — polling retries and repeated reads must remain safe. Active (pending/running) jobs must never be removed.
- **Regression tests:** Test that completed jobs are accessible for the grace period, that expired jobs return 404, and that active jobs survive cleanup sweeps.

### Finding 2: vm.runInNewContext sandbox escape

- **Evidence:** `src/routes/api/submit/+server.ts:98` calls `vm.runInNewContext(expr, {}, { timeout: 2000 })` on values from `official-tests.json` prefixed with `@javascript:`. Node's `vm` module is not a security sandbox: `this.constructor.constructor("return process")()` escapes to the host Node process. Confirmed by running the constructor trick — it leaks `process.env.HOME`.
- **Reproducible:** Yes. The escape works on Node v26.
- **Impact:** Mitigated in practice. All 124 problem files using `@javascript:` contain only pure data generators (`JSON.stringify(Array.from(...))`, `'x'.repeat(N)`). These are bundled trusted content. The user overlay directory (`~/cojudge/problems/`) is writable, but in single-user local deployment the user already has full host access. The risk is real only if DevPrep were network-accessible.
- **Decision:** Fix now. Replace `vm.runInNewContext` with a restricted evaluator that only exposes `JSON`, `Array`, `String`, `Math`, and `parseInt`/`parseFloat` — the functions actually used by existing expressions. Document the trust boundary. This eliminates the constructor escape without changing expression semantics.
- **Regression tests:** Test that all expression patterns found in the codebase (`Array.from`, `JSON.stringify`, `'x'.repeat`, `.fill`, `.map`) evaluate correctly. Test that `process`, `require`, `this.constructor.constructor` are blocked.

### Finding 3: Path traversal in resolveProblemFile

- **Evidence:** `src/lib/server/contentPaths.ts:105` — the async `resolveProblemFile(slug, ...rest)` builds `path.join(getProblemsDir(), slug, ...rest)` without calling `isSafeSegment(slug)`. A slug of `../../.ssh` would resolve outside the problems directory. The `resolveProblemDir` (line 68) and `resolveProblemDirSync` (line 57) functions also skip validation. The sync `resolveProblemFileSync` (line 83) has an `isSafeSegment` check but the `if` body is empty — it catches the condition and does nothing.
- **Reproducible:** Yes. `path.join('/base', '../../etc/passwd')` produces `/etc/passwd` on POSIX.
- **Impact:** A crafted `problemId` in a Run/Submit POST body could read arbitrary files the server process can access. In single-user local deployment the user already has this access, but the vulnerability would be critical in any network deployment.
- **Decision:** Fix now. Add `isSafeSegment` validation with `throw` to all four functions. The slug and every intermediate path segment must pass. The leaf filename (e.g. `metadata.json`) is always a hardcoded constant from the caller.
- **Regression tests:** Test that `../`, `..`, paths with `/`, `\`, and null bytes are rejected. Test that legitimate slugs like `two-sum`, `3sum`, `lru-cache` pass.

### Finding 4: cleanContainer timeout race

- **Evidence:** `src/lib/runners/ContainerPool.ts:157` — `setTimeout(resolve, 10000)` resolves the cleanup promise even if the Docker exec hasn't finished. The code then calls `exec.inspect()` on a possibly-still-running process and returns the container to the pool. The next user of the container may see stale files from the incomplete cleanup.
- **Reproducible:** Theoretically — requires the cleanup exec to take longer than 10 seconds, which is unlikely for a simple `rm` but possible under Docker I/O pressure or if the container is unresponsive.
- **Impact:** Stale files in a reused container could cause wrong verdicts or compilation errors on the next submission.
- **Decision:** Fix now. On timeout, destroy the container (remove it from the pool) instead of returning it. A slow-to-clean container is not safe to reuse.
- **Regression tests:** Mock-based test for the timeout path: verify that a timed-out cleanup causes the container to be destroyed rather than returned.

### Finding 5: Marker fallback reuses dirty container

- **Evidence:** `src/lib/markerRunner.ts:138-144` — when the cache-hit path fails at runtime, the code evicts the cache entry and calls `getMarkerResponsesLegacy()` with the same container. The container's `/app` still has `.class` files from the cache-hit upload. The fallback uploads `.java` sources and runs `javac *.java`, which should overwrite them — but if the stale classes conflict with the new sources, compilation could fail.
- **Reproducible:** Only on cache corruption — extremely rare. The `javac *.java` command normally overwrites all `.class` files.
- **Impact:** Low probability, but the fallback is the safety net and should not have its own contamination risk.
- **Decision:** Fix now. Add `rm -f /app/*.class /app/*.java /app/*.bin` before the fallback's `putArchive` call.
- **Regression tests:** The fix is a single cleanup command. The existing 78-test judge regression suite covers the fallback indirectly. A targeted test for wrong-answer on cache hit (Finding 6) provides additional coverage.

### Finding 6: No wrong-answer test on cache hit

- **Evidence:** The 78-test judge regression suite tests wrong solutions, but all wrong-solution tests use a generic wrong answer and do not specifically exercise the cache-hit path. The wrong-solution tests run against 5 problems, which may or may not have a populated Marker cache depending on test order.
- **Reproducible:** N/A — this is a test coverage gap, not a bug.
- **Impact:** A harness bug that always returns `isCorrect: true` could go undetected if wrong-solution tests fail for a different reason (crash, compile error).
- **Decision:** Fix now. Add a targeted integration test: (1) submit correct solution → cache populated, (2) submit wrong solution for same problem → must be rejected with `isCorrect: false`, (3) verify after container reuse.
- **Regression tests:** The test itself is the regression coverage.

### Finding 7: ~4,500 lines Firebase/cloud sync code

- **Evidence:** 9 files totalling 4,469 lines: `firebase.ts` (259), `firebaseSettings.ts` (118), `cloudSync.ts` (2,445), `cloudSyncPolicy.ts` (79), `cloudFileChange.ts` (637), `cloudAssets.ts` (265), `progressBackup.ts` (407), `progressBackupClient.ts` (208), `forkTransfer.ts` (51). The `firebase` npm package (1.8MB) is in `devDependencies`. DevPrep is offline-only and does not use Firebase.
- **Reproducible:** N/A — dead code.
- **Impact:** Maintenance burden, slower builds, confusing dependency list. No runtime impact (tree-shaken from server bundle; client bundle includes it but it's gated behind `isDesktopRuntime()` checks).
- **Decision:** Defer. Removal requires an ADR per CLAUDE.md governance. Document callers and impact in deferred-decisions section.
- **Regression tests:** None needed until removal.

### Finding 8: Tauri dependencies

- **Evidence:** `package.json` includes `@tauri-apps/api`, `@tauri-apps/cli`, `@tauri-apps/plugin-process`, `@tauri-apps/plugin-updater`. DevPrep v1.0 does not use the Tauri desktop app. The `src-tauri/` directory exists but is not part of the Docker deployment.
- **Reproducible:** N/A — unused dependencies.
- **Impact:** Slower `npm install`, confusing dependency list.
- **Decision:** Defer. Document for separate removal decision.
- **Regression tests:** None needed until removal.

### Finding 9: Duplicate genId() and runner selection

- **Evidence:** `genId()` is copied identically in `src/routes/api/run/+server.ts:43` and `src/routes/api/submit/+server.ts:43`. The 8-way `if/else if` runner selection block is near-identical in both files.
- **Reproducible:** N/A — duplication, not a bug.
- **Impact:** A fix to one file must be manually applied to the other. Low risk since these blocks change rarely.
- **Decision:** Defer. Low priority; does not block stability work. The Run/Submit consolidation is documented as a future cleanup opportunity.
- **Regression tests:** None needed.

### Finding 10: resolveProblemFileSync empty validation

- **Evidence:** `src/lib/server/contentPaths.ts:85-88` — the `isSafeSegment` check exists but the `if` block is empty (contains only a comment). The condition is detected and silently ignored.
- **Reproducible:** Yes. The function accepts `../` slugs.
- **Impact:** Same as Finding 3.
- **Decision:** Fix now, as part of Finding 3. Add `throw` to the validation block.
- **Regression tests:** Covered by Finding 3 tests.
