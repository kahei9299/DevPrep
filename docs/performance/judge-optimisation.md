# Judge Performance Optimisation Report

**Date:** 2026-10-28
**Branch:** `perf/judge-latency-and-product-alignment`
**Milestone:** M2.5

---

## Changes Implemented

### 1. Skip `ensureTimeInstalled()` for offline containers — HIGH IMPACT

**Files:** `src/lib/runners/ProgramRunner.ts`

**Problem:** Every compile call attempted to install `/usr/bin/time` via `apt-get`/`apk`. With `NetworkMode: 'none'` (all M1 execution containers), the package manager could not reach repositories. DNS/connect timeouts added 5-15 seconds of pure latency per compile.

**Fix:** `ensureTimeInstalled()` now:
1. Checks a `Set` of container IDs that have already been processed (skip on re-entry).
2. Inspects the container's `NetworkMode` — if `'none'`, skips the install entirely.
3. Only attempts the install for network-enabled containers (debug containers).

**Why this is safe:** `ProgramRunner.wrapWithMetrics()` already contains a fallback:
```sh
if command -v /usr/bin/time >/dev/null 2>&1; then
  /usr/bin/time -f "COJUDGE_METRICS:%e|%M" timeout 30 <cmd>
else
  timeout 30 <cmd>
fi
```
Execution time is still captured via internal `:::TIME:::` markers. Memory usage (the only metric lost) was never reliable on containers without `/usr/bin/time` anyway.

**Expected improvement:** 5-15 seconds removed per Run/Submit.

### 2. Adaptive frontend polling — MEDIUM IMPACT

**Files:** `src/lib/components/ExecutionPanel.svelte`

**Problem:** The UI polled for results with a fixed 600ms interval. After the server finished, users waited up to 600ms for the next poll to notice.

**Fix:** Replaced fixed `delay(600)` with adaptive polling:
- Starts at 150ms
- Multiplies by 1.5x each poll
- Caps at 1000ms
- Resets when a new job starts

This means fast jobs (< 1s) are detected within 150-225ms, while long jobs (> 5s) don't spam the server.

**Expected improvement:** 200-450ms reduction in perceived latency for typical runs.

### 3. Development-only performance instrumentation — DIAGNOSTIC

**Files:**
- `src/lib/server/perfTimer.ts` (new)
- `src/routes/api/run/+server.ts` (import + stage markers)
- `src/routes/api/submit/+server.ts` (import + stage markers)

Added `PerfTimer` class that logs per-stage timing when `COJUDGE_PERF=1` environment variable is set. Stages tracked: `loadMetadata`, `compile`, `execute`, `judge`.

Disabled by default. No production overhead when not enabled.

### 4. Benchmark tooling — DIAGNOSTIC

**Files:** `scripts/benchmark-judge.mjs` (new)

Automated benchmark script measuring:
- End-to-end Run and Submit latency
- 5 problems × 3 languages × 2 modes (Run/Submit)
- Configurable repetitions, warmup, and cold-start testing
- Median, min, max, p95 statistics
- JSON output for comparison

## Optimisation Summary

| Change | Impact | Risk |
|---|---|---|
| Skip `ensureTimeInstalled` for offline containers | High (5-15s per run) | Low — fallback already exists |
| Adaptive polling (150ms → 1s) | Medium (200-450ms) | None — UI-only change |
| Performance instrumentation | Diagnostic only | None — disabled by default |

## Post-Optimisation Measurements

To be populated after running the benchmark suite with optimisations applied.

Run: `node scripts/benchmark-judge.mjs --json docs/performance/optimised-results.json`

## What Was Not Changed

- **Container resource limits (512MB, 1 CPU):** Not loosened. No evidence they are a meaningful bottleneck for typical problems.
- **Marker validation architecture:** The separate Java Marker container for Python/C++ remains. Changing this would require significant architectural work (merging markers into runner containers or pre-compiling markers). Documented as a future optimisation opportunity.
- **Container pool size:** MAX_IDLE remains at 2 per image. Increasing it would trade memory for reduced cold-start frequency but was not identified as a primary bottleneck.
- **Test batching:** Submit already batches non-large tests in a single execution. No inefficiency found in the current approach.
- **Server-Sent Events / WebSocket:** Not introduced. Adaptive polling is sufficient for the single-user use case and avoids infrastructure complexity.

## Known Remaining Latency Contributors

1. **Cold container creation:** 500-2000ms on first run when pool is empty. Prewarming would help but adds resource usage.
2. **Marker container lifecycle:** Adds a full container exec cycle for Python/C++ validation. Potential future optimisation: pre-compile Marker.java once and reuse the class files.
3. **C++ compilation:** `g++ -std=c++17 -O2` takes 1-3 seconds depending on problem complexity. Inherent to the language.
4. **Java JVM startup:** `java Main` incurs JVM bootstrap overhead (~500ms). Inherent to the language.
5. **Container cleanup between reuses:** 100-300ms for file removal. Necessary for isolation.
